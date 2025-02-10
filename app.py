import os
import math
import random
import string
from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import logging
import json
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or "wild_west_secret"

# PostgreSQL database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}

db = SQLAlchemy(app)
socketio = SocketIO(app)

# Import models after db initialization
from models import User, GameSession, PlayerStats

# Game state
class GameRoom:
    def __init__(self):
        self.players = {}
        self.bullets = []
        self.spawn_points = [
            {'x': 100, 'y': 100}, {'x': 900, 'y': 100},
            {'x': 100, 'y': 900}, {'x': 900, 'y': 900},
            {'x': 500, 'y': 500}, {'x': 300, 'y': 700},
            {'x': 700, 'y': 300}, {'x': 200, 'y': 500},
            {'x': 500, 'y': 200}, {'x': 800, 'y': 800}
        ]
        self.scores = {}
        self.chat_messages = []
        self.bot_names = [
            "Desperado", "Gunslinger", "Ranger", "Sheriff", "Bounty Hunter",
            "Marshal", "Outlaw", "Bandit", "Renegade", "Maverick"
        ]
        self.bot_update_interval = 0.1
        self.last_bot_update = datetime.now()

    def get_random_spawn(self):
        return random.choice(self.spawn_points)

    def add_player(self, player_id, username):
        spawn = self.get_random_spawn()
        self.players[player_id] = {
            'username': username,
            'x': spawn['x'],
            'y': spawn['y'],
            'rotation': 0,
            'health': 100,
            'weapon': 'pistol',
            'score': 0,
            'kills': 0,
            'deaths': 0,
            'is_bot': False
        }
        self.scores[player_id] = 0
        return spawn

    def add_bot(self):
        bot_count = len([p for p in self.players.values() if p.get('is_bot', False)])
        bot_id = f"bot_{bot_count}"
        bot_name = self.bot_names[bot_count % len(self.bot_names)]
        spawn = self.get_random_spawn()

        self.players[bot_id] = {
            'username': bot_name,
            'x': spawn['x'],
            'y': spawn['y'],
            'rotation': random.random() * 2 * math.pi,
            'health': 100,
            'weapon': 'pistol',
            'score': 0,
            'kills': 0,
            'deaths': 0,
            'is_bot': True,
            'move_timer': 0,
            'move_direction': random.random() * 2 * math.pi
        }
        self.scores[bot_id] = 0
        return bot_id

    def respawn_player(self, player_id):
        if player_id in self.players:
            spawn = self.get_random_spawn()
            self.players[player_id].update({
                'x': spawn['x'],
                'y': spawn['y'],
                'health': 100,
                'deaths': self.players[player_id].get('deaths', 0) + 1
            })
            return spawn
        return None

    def update_bots(self):
        now = datetime.now()
        if (now - self.last_bot_update).total_seconds() < self.bot_update_interval:
            return

        self.last_bot_update = now

        for bot_id, bot in list(self.players.items()):
            if not bot.get('is_bot', False):
                continue

            bot['move_timer'] = bot.get('move_timer', 0) + self.bot_update_interval
            if bot['move_timer'] >= 3:
                bot['move_direction'] = random.random() * 2 * math.pi
                bot['move_timer'] = 0

            speed = 3
            bot['x'] += math.cos(bot['move_direction']) * speed
            bot['y'] += math.sin(bot['move_direction']) * speed

            bot['x'] = max(0, min(bot['x'], 1000))
            bot['y'] = max(0, min(bot['y'], 1000))

            bot['rotation'] = bot['move_direction']

            for other_id, other in self.players.items():
                if other_id != bot_id and other.get('health', 0) > 0:
                    dx = other['x'] - bot['x']
                    dy = other['y'] - bot['y']
                    distance = math.sqrt(dx * dx + dy * dy)
                    if distance < 100:
                        bot['move_direction'] = (bot['move_direction'] + math.pi) % (2 * math.pi)

        current_time = now.timestamp()
        self.bullets = [b for b in self.bullets if (current_time - b.get('created_at', current_time)) < 2]

    def add_chat_message(self, username, message, is_admin=False, is_moderator=False):
        display_name = username
        if is_admin:
            display_name += " *"
        elif is_moderator:
            display_name += " ^"
        self.chat_messages.append({
            'username': display_name,
            'message': message,
            'timestamp': datetime.now().strftime('%H:%M:%S')
        })
        if len(self.chat_messages) > 50:
            self.chat_messages.pop(0)

    def add_help_message(self, player_id):
        """Add help message showing available commands"""
        if player_id in player_states:
            user_id = player_states[player_id]['user_id']
            if not isinstance(user_id, str) or not user_id.startswith('guest_'):
                user = User.query.get(user_id)
                if user:
                    commands = []
                    if user.is_admin:
                        commands.extend([
                            "/god [username] - Toggle god mode",
                            "/kill [username] - Instant kill player",
                            "/mod [username] - Make player a moderator"
                        ])
                    if user.is_admin or user.is_moderator:
                        commands.extend([
                            "/kick [username] [reason] - Kick player",
                            "/mute [username] [duration] - Mute player for duration (minutes)"
                        ])

                    if commands:
                        self.add_chat_message("SYSTEM", "Available commands:", is_admin=True)
                        for cmd in commands:
                            self.add_chat_message("SYSTEM", cmd, is_admin=True)


game_rooms = {}
player_states = {}

@app.route('/')
def index():
    if 'user_id' in session:
        return render_template('index.html')
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        email = request.form.get('email', '')  # Add default value

        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            if user.is_banned:
                flash('Your account has been banned: ' + (user.ban_reason or 'No reason provided'))
                return redirect(url_for('login'))

            # Clear guest flag if exists
            session.pop('is_guest', None)

            # Special case for admin - check BEFORE setting session
            if email == 'adeniscool23@outlook.com':
                user.is_admin = True
                db.session.commit()
                logging.debug(f"Admin login detected for user {username}")

            session['user_id'] = user.id
            session['username'] = user.username
            session['is_admin'] = user.is_admin
            session['email'] = email

            logging.debug(f"Login successful for {username}, admin status: {user.is_admin}")

            if user.is_admin:
                flash('Welcome Administrator! You have full access to all game controls.')

            return redirect(url_for('index'))
        flash('Invalid username or password')
    return render_template('login.html')

@app.route('/guest_login')
def guest_login():
    guest_id = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    guest_username = f"Guest_{guest_id}"

    # Clear any existing session
    session.clear()

    session['user_id'] = f"guest_{guest_id}"
    session['username'] = guest_username
    session['is_guest'] = True
    session['is_admin'] = False  # Explicitly set guest as non-admin

    logging.debug(f"Guest login created: {guest_username}")

    return redirect(url_for('index'))

@app.route('/register', methods=['POST'])
def register():
    username = request.form.get('username')
    password = request.form.get('password')

    if User.query.filter_by(username=username).first():
        flash('Username already exists')
        return redirect(url_for('login'))

    user = User(username=username, password_hash=generate_password_hash(password))
    db.session.add(user)
    stats = PlayerStats(user=user)
    db.session.add(stats)
    db.session.commit()

    flash('Registration successful')
    return redirect(url_for('login'))

@app.route('/game')
def game():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('game.html')

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    return redirect(url_for('login'))

# Socket.IO events
@socketio.on('connect')
def handle_connect():
    if 'user_id' not in session:
        return False

    if not session.get('is_guest'):
        user = User.query.get(session['user_id'])
        if user and user.is_banned:
            return False

    room = 'main'
    join_room(room)

    if room not in game_rooms:
        game_rooms[room] = GameRoom()
        for _ in range(5):
            game_rooms[room].add_bot()

    spawn = game_rooms[room].add_player(request.sid, session['username'])

    is_admin = session.get('is_admin', False) and not session.get('is_guest', False)
    logging.debug(f"Socket connection for {session['username']}, admin status: {is_admin}, guest status: {session.get('is_guest', False)}")

    player_states[request.sid] = {
        'user_id': session['user_id'],
        'username': session['username'],
        'room': room,
        'spawn': spawn,
        'is_guest': session.get('is_guest', False),
        'is_admin': is_admin,
        'is_moderator': session.get('is_moderator', False)
    }

    # Show help message with available commands
    if room in game_rooms:
        game_rooms[room].add_help_message(request.sid)

    emit('game_state', {
        'players': game_rooms[room].players,
        'bullets': game_rooms[room].bullets,
        'scores': game_rooms[room].scores,
        'chat_messages': game_rooms[room].chat_messages,
        'is_admin': is_admin,
        'is_moderator': session.get('is_moderator', False)
    }, room=request.sid)

@socketio.on('authenticate')
def handle_authenticate():
    """Handle authentication request and send back user info"""
    if request.sid in player_states:
        user_data = {
            'user_id': player_states[request.sid]['user_id'],
            'is_admin': player_states[request.sid]['is_admin'],
            'is_moderator': player_states[request.sid]['is_moderator']
        }
        emit('authentication_response', user_data)
        logging.debug(f"Authentication response sent: {user_data}")

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if room in game_rooms:
            if request.sid in game_rooms[room].players:
                del game_rooms[room].players[request.sid]
                del game_rooms[room].scores[request.sid]
            emit('game_state', {
                'players': game_rooms[room].players,
                'bullets': game_rooms[room].bullets,
                'scores': game_rooms[room].scores,
                'chat_messages': game_rooms[room].chat_messages
            }, room=room)
        del player_states[request.sid]

@socketio.on('player_update')
def handle_player_update(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if room in game_rooms:
            game_rooms[room].players[request.sid].update({
                'x': data['x'],
                'y': data['y'],
                'rotation': data['rotation'],
                'health': data['health'],
                'weapon': data['weapon']
            })

            game_rooms[room].update_bots()

            emit('game_state', {
                'players': game_rooms[room].players,
                'bullets': game_rooms[room].bullets,
                'scores': game_rooms[room].scores,
                'chat_messages': game_rooms[room].chat_messages
            }, room=room)

@socketio.on('player_shoot')
def handle_player_shoot(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if room in game_rooms:
            bullet = {
                'x': data['x'],
                'y': data['y'],
                'angle': data['angle'],
                'damage': data['damage'],
                'weapon': data['weapon'],
                'shooter': request.sid,
                'created_at': datetime.now().timestamp()
            }
            game_rooms[room].bullets.append(bullet)
            emit('game_state', {
                'players': game_rooms[room].players,
                'bullets': game_rooms[room].bullets,
                'scores': game_rooms[room].scores,
                'chat_messages': game_rooms[room].chat_messages
            }, room=room)

def find_player_by_username(room, username):
    """Helper function to find a player by username in a room"""
    for player_id, player in game_rooms[room].players.items():
        if player['username'].lower() == username.lower():
            return player_id, player
    return None, None

@socketio.on('chat_message')
def handle_chat_message(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if room in game_rooms:
            user_id = str(player_states[request.sid]['user_id'])
            message = data['message'].strip()

            # Check if this is a command
            if message.startswith('/') and (not isinstance(user_id, str) or not user_id.startswith('guest_')):
                user = User.query.get(player_states[request.sid]['user_id'])
                if user and (user.is_admin or user.is_moderator):
                    parts = message[1:].split()
                    if not parts:
                        return

                    command = parts[0].lower()
                    # Commands that require a target username
                    if len(parts) >= 2:
                        target_username = parts[1]
                        target_id, target_player = find_player_by_username(room, target_username)

                        if target_id:
                            # Admin-only commands
                            if user.is_admin:
                                if command == 'god':
                                    socketio.emit('admin_command', {
                                        'command': 'god_mode',
                                        'target_id': target_id
                                    })
                                    return
                                elif command == 'kill':
                                    socketio.emit('admin_command', {
                                        'command': 'kill',
                                        'target_id': target_id
                                    })
                                    return
                                elif command == 'mod':
                                    socketio.emit('admin_command', {
                                        'command': 'make_moderator',
                                        'target_id': target_id
                                    })
                                    return

                            # Moderator commands (available to both moderators and admins)
                            if command == 'kick' and len(parts) >= 3:
                                reason = ' '.join(parts[2:])
                                socketio.emit('admin_command', {
                                    'command': 'kick',
                                    'target_id': target_id,
                                    'reason': reason
                                })
                                return
                            elif command == 'mute' and len(parts) >= 3:
                                try:
                                    duration = int(parts[2])
                                    socketio.emit('admin_command', {
                                        'command': 'mute',
                                        'target_id': target_id,
                                        'duration': duration
                                    })
                                    return
                                except ValueError:
                                    pass

            # Process regular chat message for both registered users and guests
            if user_id.startswith('guest_'):
                # Handle guest messages
                game_rooms[room].add_chat_message(
                    player_states[request.sid]['username'],
                    message
                )
                emit('chat_update', {
                    'messages': game_rooms[room].chat_messages
                }, room=room)
            else:
                # Handle registered user messages
                user = User.query.get(player_states[request.sid]['user_id'])
                if user and not user.is_muted:
                    is_admin = session.get('is_admin', False)
                    is_moderator = getattr(user, 'is_moderator', False)
                    game_rooms[room].add_chat_message(
                        session['username'],
                        message,
                        is_admin=is_admin,
                        is_moderator=is_moderator
                    )
                    emit('chat_update', {
                        'messages': game_rooms[room].chat_messages
                    }, room=room)

@socketio.on('player_hit')
def handle_player_hit(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if room in game_rooms:
            target_id = data.get('target_id')
            if target_id and target_id in game_rooms[room].players:
                target = game_rooms[room].players[target_id]

                # Handle bot damage
                if target_id.startswith('bot_'):
                    damage = data.get('damage', 15)
                    target['health'] = max(0, target['health'] - damage)
                else:
                    # Handle player damage
                    if target_id in player_states:
                        target_user_id = player_states[target_id]['user_id']

                        # Convert integer user_id to string for checking
                        target_user_id = str(target_user_id) if isinstance(target_user_id, int) else target_user_id

                        # Check for god mode only for registered users
                        if not target_user_id.startswith('guest_'):
                            user = User.query.get(int(target_user_id))
                            if user and user.god_mode:
                                return

                        damage = data.get('damage', 15)
                        target['health'] = max(0, target['health'] - damage)
                        emit('player_hit', {'damage': damage}, room=target_id)

                # Handle player death
                if target['health'] <= 0:
                    shooter = data.get('shooter')
                    if shooter and shooter in game_rooms[room].players:
                        game_rooms[room].players[shooter]['score'] += 10
                        game_rooms[room].players[shooter]['kills'] += 1
                        game_rooms[room].scores[shooter] = game_rooms[room].players[shooter]['score']
                        emit('player_kill', {}, room=shooter)

                    spawn = game_rooms[room].respawn_player(target_id)
                    if spawn and not target_id.startswith('bot_'):
                        emit('player_respawn', {
                            'x': spawn['x'],
                            'y': spawn['y']
                        }, room=target_id)

                # Update game state for all players
                emit('game_state', {
                    'players': game_rooms[room].players,
                    'bullets': game_rooms[room].bullets,
                    'scores': game_rooms[room].scores,
                    'chat_messages': game_rooms[room].chat_messages
                }, room=room)

@socketio.on('admin_command')
def handle_admin_command(data):
    logging.debug(f"Received admin command: {data}")
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        command = data.get('command')
        target_id = data.get('target_id')
        logging.debug(f"Processing command {command} for target {target_id}")

        # Log authentication status
        is_admin = session.get('is_admin', False)
        is_moderator = session.get('is_moderator', False)
        logging.debug(f"User authentication - Admin: {is_admin}, Moderator: {is_moderator}")

        if not is_admin and not is_moderator:
            logging.debug("Command rejected - User lacks required permissions")
            emit('admin_command_result', {
                'success': False,
                'error': 'Insufficient permissions'
            }, room=request.sid)
            return

        if target_id not in game_rooms[room].players:
            logging.debug(f"Command failed - Target {target_id} not found")
            emit('admin_command_result', {
                'success': False,
                'error': 'Target player not found'
            }, room=request.sid)
            return

        if command == 'kill':
            if not is_admin:
                emit('admin_command_result', {
                    'success': False,
                    'error': 'Kill command requires admin privileges'
                }, room=request.sid)
                return

            logging.debug(f"Executing kill command on {target_id}")
            # Update bot or player health
            game_rooms[room].players[target_id]['health'] = 0

            # Send game state update to all players
            emit('game_state', {
                'players': game_rooms[room].players,
                'bullets': game_rooms[room].bullets,
                'scores': game_rooms[room].scores,
                'chat_messages': game_rooms[room].chat_messages
            }, room=room)

            # Send kill confirmation to client
            emit('admin_command_result', {
                'success': True,
                'command': 'kill',
                'target_id': target_id,
                'message': f'Successfully killed player {target_id}'
            }, room=request.sid)

            # Notify target
            emit('player_died', {'killer': request.sid}, room=target_id)
            logging.debug(f"Kill command executed successfully on {target_id}")

        elif command == 'kick' and not target_id.startswith('bot_'):
            if target_id in player_states:
                target_user_id = player_states[target_id]['user_id']
                if not target_user_id.startswith('guest_'):
                    user = User.query.get(target_user_id)
                    if user:
                        reason = data.get('reason', 'Kicked by moderator')
                        emit('kicked', {'reason': reason}, room=target_id)
                        disconnect(target_id)
                        emit('admin_command_result', {
                            'success': True,
                            'message': f'Successfully kicked player {user.username}'
                        }, room=request.sid)
                        return
            emit('admin_command_result', {
                'success': False,
                'error': 'Could not kick player'
            }, room=request.sid)

        elif command == 'mute' and not target_id.startswith('bot_'):
            if target_id in player_states:
                target_user_id = player_states[target_id]['user_id']
                if not target_user_id.startswith('guest_'):
                    user = User.query.get(target_user_id)
                    if user:
                        duration = int(data.get('duration', 5))
                        user.is_muted = True
                        user.mute_end_time = datetime.now() + timedelta(minutes=duration)
                        db.session.commit()
                        emit('muted', {'duration': duration}, room=target_id)
                        emit('admin_command_result', {
                            'success': True,
                            'message': f'Successfully muted player {user.username} for {duration} minutes'
                        }, room=request.sid)
                        return
            emit('admin_command_result', {
                'success': False,
                'error': 'Could not mute player'
            }, room=request.sid)

        elif command == 'god_mode' and is_admin and not target_id.startswith('bot_'):
            if target_id in player_states:
                target_user_id = player_states[target_id]['user_id']
                if not target_user_id.startswith('guest_'):
                    user = User.query.get(target_user_id)
                    if user:
                        user.god_mode = not user.god_mode
                        db.session.commit()
                        if target_id in game_rooms[room].players:
                            game_rooms[room].players[target_id]['godMode'] = user.god_mode
                            emit('god_mode_update', {'enabled': user.god_mode}, room=target_id)
                            emit('admin_command_result', {
                                'success': True,
                                'message': f'God mode {"enabled" if user.god_mode else "disabled"} for {user.username}'
                            }, room=request.sid)
                            return
            emit('admin_command_result', {
                'success': False,
                'error': 'Could not toggle god mode'
            }, room=request.sid)

        elif command == 'mod' and is_admin and not target_id.startswith('bot_'):
            if target_id in player_states:
                target_user_id = player_states[target_id]['user_id']
                if not target_user_id.startswith('guest_'):
                    user = User.query.get(target_user_id)
                    if user:
                        user.is_moderator = not user.is_moderator
                        db.session.commit()
                        emit('admin_command_result', {
                            'success': True,
                            'message': f'Moderator status {"enabled" if user.is_moderator else "disabled"} for {user.username}'
                        }, room=request.sid)
                        return
            emit('admin_command_result', {
                'success': False,
                'error': 'Could not toggle moderator status'
            }, room=request.sid)

@socketio.on('get_player_info')
def handle_get_player_info():
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if session.get('is_admin'):
            player_info = []
            for pid, player in game_rooms[room].players.items():
                player_info.append({
                    'id': pid,
                    'username': player['username'],
                    'health': player['health'],
                    'score': player['score'],
                    'is_guest': player_states[pid]['is_guest'] if pid in player_states else True
                })
            emit('player_info', {'players': player_info})

with app.app_context():
    db.create_all()