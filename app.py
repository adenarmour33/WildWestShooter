import os
import math
import random
from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import logging
import json
from datetime import datetime

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
        self.scores = {}  # Keep track of player scores
        self.bot_names = [
            "Desperado", "Gunslinger", "Ranger", "Sheriff", "Bounty Hunter",
            "Marshal", "Outlaw", "Bandit", "Renegade", "Maverick"
        ]
        self.bot_update_interval = 0.1  # Faster bot updates
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
            'rotation': random.random() * 2 * math.pi,  # Random initial direction
            'health': 100,
            'weapon': 'pistol',
            'score': 0,
            'kills': 0,
            'deaths': 0,
            'is_bot': True,
            'move_timer': 0,
            'move_direction': random.random() * 2 * math.pi  # Random movement direction
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

        # Update each bot's behavior
        for bot_id, bot in list(self.players.items()):
            if not bot.get('is_bot', False):
                continue

            # Change direction randomly
            bot['move_timer'] = bot.get('move_timer', 0) + self.bot_update_interval
            if bot['move_timer'] >= 3:  # Change direction every 3 seconds
                bot['move_direction'] = random.random() * 2 * math.pi
                bot['move_timer'] = 0

            # Move bot
            speed = 3
            bot['x'] += math.cos(bot['move_direction']) * speed
            bot['y'] += math.sin(bot['move_direction']) * speed

            # Keep bots within map bounds (assuming 1000x1000 map)
            bot['x'] = max(0, min(bot['x'], 1000))
            bot['y'] = max(0, min(bot['y'], 1000))

            # Update bot's rotation to match movement direction
            bot['rotation'] = bot['move_direction']

            # Avoid obstacles (simple collision avoidance)
            for other_id, other in self.players.items():
                if other_id != bot_id and other.get('health', 0) > 0:
                    dx = other['x'] - bot['x']
                    dy = other['y'] - bot['y']
                    distance = math.sqrt(dx * dx + dy * dy)
                    if distance < 100:  # If too close to another player
                        bot['move_direction'] = (bot['move_direction'] + math.pi) % (2 * math.pi)  # Turn around

        # Clean up old bullets and handle collisions
        current_time = now.timestamp()
        self.bullets = [b for b in self.bullets if (current_time - b.get('created_at', current_time)) < 2]

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

        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            session['user_id'] = user.id
            session['username'] = user.username
            return redirect(url_for('index'))
        flash('Invalid username or password')
    return render_template('login.html')

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

    room = 'main'
    join_room(room)

    if room not in game_rooms:
        game_rooms[room] = GameRoom()
        # Add initial bots
        for _ in range(5):  # Start with 5 bots
            game_rooms[room].add_bot()

    # Add player to game room
    spawn = game_rooms[room].add_player(request.sid, session['username'])

    # Initialize player state
    player_states[request.sid] = {
        'user_id': session['user_id'],
        'username': session['username'],
        'room': room,
        'spawn': spawn
    }

    # Emit initial game state
    emit('game_state', {
        'players': game_rooms[room].players,
        'bullets': game_rooms[room].bullets,
        'scores': game_rooms[room].scores
    }, room=room)

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
                'scores': game_rooms[room].scores
            }, room=room)
        del player_states[request.sid]

@socketio.on('player_update')
def handle_player_update(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if room in game_rooms:
            # Update player state
            game_rooms[room].players[request.sid].update({
                'x': data['x'],
                'y': data['y'],
                'rotation': data['rotation'],
                'health': data['health'],
                'weapon': data['weapon']
            })

            # Update bots
            game_rooms[room].update_bots()

            # Send updated game state
            emit('game_state', {
                'players': game_rooms[room].players,
                'bullets': game_rooms[room].bullets,
                'scores': game_rooms[room].scores
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
                'created_at': datetime.now().timestamp()  # Add creation timestamp
            }
            game_rooms[room].bullets.append(bullet)
            emit('game_state', {
                'players': game_rooms[room].players,
                'bullets': game_rooms[room].bullets,
                'scores': game_rooms[room].scores
            }, room=room)

@socketio.on('player_hit')
def handle_player_hit(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if room in game_rooms:
            target_id = data.get('target_id')
            if target_id and target_id in game_rooms[room].players:
                target = game_rooms[room].players[target_id]
                damage = data.get('damage', 15)  # Default damage if not specified

                # Apply damage to target
                target['health'] = max(0, target['health'] - damage)

                # Notify target of damage
                emit('player_hit', {'damage': damage}, room=target_id)

                if target['health'] <= 0:
                    # Handle player/bot death
                    shooter = data.get('shooter')
                    if shooter and shooter in game_rooms[room].players:
                        # Update killer's score and kills
                        game_rooms[room].players[shooter]['score'] += 10
                        game_rooms[room].players[shooter]['kills'] += 1
                        game_rooms[room].scores[shooter] = game_rooms[room].players[shooter]['score']

                        # Notify killer
                        emit('player_kill', {}, room=shooter)

                    # Respawn player/bot
                    spawn = game_rooms[room].respawn_player(target_id)
                    if spawn and not target.get('is_bot', False):
                        emit('player_respawn', {
                            'x': spawn['x'],
                            'y': spawn['y']
                        }, room=target_id)

                # Emit updated game state to all players
                emit('game_state', {
                    'players': game_rooms[room].players,
                    'bullets': game_rooms[room].bullets,
                    'scores': game_rooms[room].scores
                }, room=room)

with app.app_context():
    db.create_all()