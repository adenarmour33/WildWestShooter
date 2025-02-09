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
        self.countdown_started = False
        self.min_players = 2
        self.max_players = 10
        self.bot_names = [
            "Desperado", "Gunslinger", "Ranger", "Sheriff", "Bounty Hunter",
            "Marshal", "Outlaw", "Bandit", "Renegade", "Maverick"
        ]
        self.started = False
        self.countdown_time = 30
        self.game_starting = False
        self.spawn_points = [
            {'x': 100, 'y': 100}, {'x': 900, 'y': 100},
            {'x': 100, 'y': 900}, {'x': 900, 'y': 900},
            {'x': 500, 'y': 500}, {'x': 300, 'y': 700},
            {'x': 700, 'y': 300}, {'x': 200, 'y': 500},
            {'x': 500, 'y': 200}, {'x': 800, 'y': 800}
        ]

    def get_random_spawn(self):
        if not self.spawn_points:
            return {'x': random.randint(100, 900), 'y': random.randint(100, 900)}
        return random.choice(self.spawn_points)

    def add_bot(self):
        if len(self.players) >= self.max_players:
            return False

        bot_id = f"bot_{len([p for p in self.players.values() if p.get('is_bot', False)])}"
        bot_name = self.bot_names[len([p for p in self.players.values() if p.get('is_bot', False)]) % len(self.bot_names)]

        self.players[bot_id] = {
            'username': bot_name,
            'x': random.randint(100, 900),
            'y': random.randint(100, 900),
            'rotation': 0,
            'health': 100,
            'weapon': 'pistol',
            'is_bot': True
        }
        return True

    def should_start_countdown(self):
        return len(self.players) >= self.min_players and not self.countdown_started

    def should_add_bots(self):
        return len(self.players) < self.min_players

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

    # Create initial player stats
    stats = PlayerStats(user=user)
    db.session.add(stats)

    db.session.commit()
    flash('Registration successful')
    return redirect(url_for('login'))

@app.route('/lobby')
def lobby():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('lobby.html')

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

    # Get random spawn point
    spawn = game_rooms[room].get_random_spawn()

    # Initialize player state
    player_states[request.sid] = {
        'user_id': session['user_id'],
        'username': session['username'],
        'x': spawn['x'],
        'y': spawn['y'],
        'rotation': 0,
        'health': 100,
        'score': 0,
        'weapon': 'pistol',
        'room': room,
        'is_bot': False
    }

    # Add player to game room
    game_rooms[room].players[request.sid] = {
        'username': session['username'],
        'x': spawn['x'],
        'y': spawn['y'],
        'rotation': 0,
        'health': 100,
        'weapon': 'pistol',
        'is_bot': False
    }

    # Check if we should start countdown
    if game_rooms[room].should_start_countdown() and not game_rooms[room].game_starting:
        game_rooms[room].countdown_started = True
        game_rooms[room].game_starting = True

        def start_game_countdown():
            countdown = game_rooms[room].countdown_time
            while countdown > 0 and room in game_rooms:
                emit('lobby_update', {
                    'players': [{'username': p['username'], 'isBot': p.get('is_bot', False)}
                               for p in game_rooms[room].players.values()],
                    'countdown_started': True,
                    'countdown': countdown
                }, room=room)
                socketio.sleep(1)
                countdown -= 1

            if room in game_rooms and len(game_rooms[room].players) >= game_rooms[room].min_players:
                game_rooms[room].started = True
                emit('game_starting', room=room)

        socketio.start_background_task(start_game_countdown)
    else:
        # Add bots if needed
        while game_rooms[room].should_add_bots():
            if game_rooms[room].add_bot():
                spawn = game_rooms[room].get_random_spawn()
                bot_id = f"bot_{len([p for p in game_rooms[room].players.values() if p.get('is_bot', False)])}"
                bot_name = game_rooms[room].bot_names[len([p for p in game_rooms[room].players.values() if p.get('is_bot', False)]) % len(game_rooms[room].bot_names)]

                game_rooms[room].players[bot_id] = {
                    'username': bot_name,
                    'x': spawn['x'],
                    'y': spawn['y'],
                    'rotation': 0,
                    'health': 100,
                    'weapon': 'pistol',
                    'is_bot': True
                }

                emit('bot_added', {
                    'players': [{'username': p['username'], 'isBot': p.get('is_bot', False)}
                               for p in game_rooms[room].players.values()]
                }, room=room)
            socketio.sleep(1)

    # Emit initial lobby state
    emit('lobby_update', {
        'players': [{'username': p['username'], 'isBot': p.get('is_bot', False)}
                   for p in game_rooms[room].players.values()],
        'countdown_started': game_rooms[room].countdown_started,
        'countdown': game_rooms[room].countdown_time if game_rooms[room].countdown_started else None
    }, room=room)

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        if room in game_rooms:
            if request.sid in game_rooms[room].players:
                del game_rooms[room].players[request.sid]
            emit('game_state', {'players': game_rooms[room].players, 'bullets': game_rooms[room].bullets}, room=room)
            emit('player_left', {'username': player_states[request.sid]['username']}, room=room)
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
                'weapon': data['weapon'],
                'username': player_states[request.sid]['username']
            })
            emit('game_state', {
                'players': game_rooms[room].players,
                'bullets': game_rooms[room].bullets
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
                'shooter': request.sid
            }
            game_rooms[room].bullets.append(bullet)
            emit('game_state', {
                'players': game_rooms[room].players,
                'bullets': game_rooms[room].bullets
            }, room=room)

@socketio.on('player_melee')
def handle_player_melee(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        attacker_pos = (data['x'], data['y'])

        # Check for hits on other players
        for player_id, player in game_rooms[room].players.items():
            if player_id != request.sid:
                target_pos = (player['x'], player['y'])
                distance = math.hypot(target_pos[0] - attacker_pos[0],
                                      target_pos[1] - attacker_pos[1])

                if distance <= data['range']:
                    # Check if target is in front of attacker
                    angle_to_target = math.atan2(target_pos[1] - attacker_pos[1],
                                                target_pos[0] - attacker_pos[0])
                    angle_diff = abs(angle_to_target - data['rotation'])
                    if angle_diff <= math.pi / 4:  # 45-degree arc
                        emit('player_hit', {
                            'damage': data['damage'],
                            'attacker': player_states[request.sid]['username']
                        }, room=player_id)

@socketio.on('player_died')
def handle_player_died():
    if request.sid in player_states:
        room = player_states[request.sid]['room']

        # Update stats
        user = User.query.get(session['user_id'])
        if user:
            game_session = GameSession.query.filter_by(
                user_id=user.id,
                is_active=True
            ).first()

            if game_session:
                game_session.ended_at = datetime.utcnow()
                game_session.score = player_states[request.sid]['score']
                game_session.is_active = False
                db.session.commit()

        # Remove player from game
        if room in game_rooms:
            if request.sid in game_rooms[room].players:
                del game_rooms[room].players[request.sid]

        emit('game_state', {'players': game_rooms[room].players, 'bullets': game_rooms[room].bullets}, room=room)

with app.app_context():
    db.create_all()