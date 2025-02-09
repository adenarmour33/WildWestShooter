import os
import math
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
        self.items = []
        self.zone = {
            'radius': 1000,
            'target_radius': 500,
            'shrink_rate': 0.2,
            'damage': 1
        }
        self.started_at = datetime.utcnow()

game_rooms = {'main': GameRoom()}
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

    player_states[request.sid] = {
        'user_id': session['user_id'],
        'username': session['username'],
        'x': 100,
        'y': 100,
        'rotation': 0,
        'health': 100,
        'score': 0,
        'weapon': 'pistol',
        'room': room
    }

    # Create new game session
    game_session = GameSession(
        user_id=session['user_id'],
        room_id=room,
        started_at=datetime.utcnow()
    )
    db.session.add(game_session)
    db.session.commit()

    emit('game_state', {
        'players': game_rooms[room].players,
        'bullets': game_rooms[room].bullets,
        'items': game_rooms[room].items,
        'zone': game_rooms[room].zone
    })

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in player_states:
        room = player_states[request.sid]['room']

        # Update player stats
        user = User.query.get(session['user_id'])
        if user:
            stats = user.stats
            stats.games_played += 1
            stats.total_score += player_states[request.sid]['score']

            # Update game session
            game_session = GameSession.query.filter_by(
                user_id=user.id,
                is_active=True
            ).first()

            if game_session:
                game_session.ended_at = datetime.utcnow()
                game_session.score = player_states[request.sid]['score']
                game_session.is_active = False
                db.session.commit()

        # Remove player from game state
        if room in game_rooms:
            if request.sid in game_rooms[room].players:
                del game_rooms[room].players[request.sid]

        leave_room(room)
        del player_states[request.sid]

        emit('game_state', {
            'players': game_rooms[room].players,
            'bullets': game_rooms[room].bullets,
            'items': game_rooms[room].items,
            'zone': game_rooms[room].zone
        }, room=room)

@socketio.on('player_update')
def handle_player_update(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        game_rooms[room].players[request.sid] = {
            'x': data['x'],
            'y': data['y'],
            'rotation': data['rotation'],
            'health': data['health'],
            'weapon': data['weapon'],
            'username': player_states[request.sid]['username']
        }
        emit('game_state', {
            'players': game_rooms[room].players,
            'bullets': game_rooms[room].bullets,
            'items': game_rooms[room].items,
            'zone': game_rooms[room].zone
        }, room=room)

@socketio.on('player_shoot')
def handle_player_shoot(data):
    if request.sid in player_states:
        room = player_states[request.sid]['room']
        game_rooms[room].bullets.append({
            'x': data['x'],
            'y': data['y'],
            'angle': data['angle'],
            'damage': data['damage'],
            'weapon': data['weapon'],
            'shooter': request.sid
        })
        emit('game_state', {
            'players': game_rooms[room].players,
            'bullets': game_rooms[room].bullets,
            'items': game_rooms[room].items,
            'zone': game_rooms[room].zone
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

        emit('game_state', {
            'players': game_rooms[room].players,
            'bullets': game_rooms[room].bullets,
            'items': game_rooms[room].items,
            'zone': game_rooms[room].zone
        }, room=room)

with app.app_context():
    db.create_all()