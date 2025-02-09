from app import db
from flask_login import UserMixin
from datetime import datetime

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    stats = db.relationship('PlayerStats', backref='user', uselist=False)
    game_sessions = db.relationship('GameSession', backref='user')

class PlayerStats(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    games_played = db.Column(db.Integer, default=0)
    wins = db.Column(db.Integer, default=0)
    total_score = db.Column(db.Integer, default=0)
    highest_score = db.Column(db.Integer, default=0)
    total_kills = db.Column(db.Integer, default=0)
    favorite_weapon = db.Column(db.String(32), default='pistol')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class GameSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    room_id = db.Column(db.String(64), nullable=False)
    score = db.Column(db.Integer, default=0)
    kills = db.Column(db.Integer, default=0)
    weapon_used = db.Column(db.String(32))
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)