import os
from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import logging
import json

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
    player_states[request.sid] = {
        'user_id': session['user_id'],
        'username': session['username'],
        'x': 100,
        'y': 100,
        'health': 100,
        'score': 0
    }
    emit('player_list', list(player_states.values()))

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in player_states:
        # Update player stats before disconnecting
        user = User.query.get(session['user_id'])
        if user:
            stats = user.stats
            stats.games_played += 1
            stats.total_score += player_states[request.sid]['score']
            db.session.commit()

        del player_states[request.sid]
    emit('player_list', list(player_states.values()), broadcast=True)

@socketio.on('player_move')
def handle_player_move(data):
    if request.sid in player_states:
        player_states[request.sid].update({
            'x': data['x'],
            'y': data['y']
        })
        emit('game_state', player_states, broadcast=True)

@socketio.on('player_shoot')
def handle_player_shoot(data):
    if request.sid in player_states:
        emit('bullet_fired', {
            'x': data['x'],
            'y': data['y'],
            'angle': data['angle'],
            'shooter': player_states[request.sid]['username']
        }, broadcast=True)

with app.app_context():
    db.create_all()