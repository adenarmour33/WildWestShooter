const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Game constants
const PLAYER_SIZE = 32;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 15;
const ZONE_SHRINK_RATE = 0.2;
const WEAPONS = {
    pistol: { damage: 15, fireRate: 400, spread: 0.1 },
    shotgun: { damage: 8, fireRate: 800, spread: 0.3, pellets: 5 },
    smg: { damage: 10, fireRate: 150, spread: 0.15 },
    knife: { damage: 35, fireRate: 500, range: 50 }
};

// Game state
let player = {
    x: Math.random() * (canvas.width - PLAYER_SIZE),
    y: Math.random() * (canvas.height - PLAYER_SIZE),
    velX: 0,
    velY: 0,
    rotation: 0,
    health: 100,
    score: 0,
    currentWeapon: 'pistol',
    lastShot: 0
};

let gameState = {
    zone: {
        x: canvas.width / 2,
        y: canvas.height / 2,
        radius: Math.min(canvas.width, canvas.height) / 2,
        targetRadius: Math.min(canvas.width, canvas.height) / 4,
        damage: 1
    },
    items: [],
    players: {},
    bullets: []
};

// Set canvas size
function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    gameState.zone.x = canvas.width / 2;
    gameState.zone.y = canvas.height / 2;
    gameState.zone.radius = Math.min(canvas.width, canvas.height) / 2;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Input handling
const keys = {};
let mouseX = 0;
let mouseY = 0;

document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    // Weapon switching
    if(['1', '2', '3', '4'].includes(e.key)) {
        const weapons = ['pistol', 'shotgun', 'smg', 'knife'];
        player.currentWeapon = weapons[parseInt(e.key) - 1];
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    player.rotation = Math.atan2(mouseY - player.y, mouseX - player.x);
});

canvas.addEventListener('mousedown', (e) => {
    shoot();
});

function shoot() {
    const now = Date.now();
    const weapon = WEAPONS[player.currentWeapon];

    if (now - player.lastShot < weapon.fireRate) return;
    player.lastShot = now;

    if (player.currentWeapon === 'knife') {
        // Melee attack
        socket.emit('player_melee', {
            x: player.x,
            y: player.y,
            rotation: player.rotation,
            range: weapon.range,
            damage: weapon.damage
        });
    } else {
        // Ranged attack
        const pellets = weapon.pellets || 1;
        for (let i = 0; i < pellets; i++) {
            const spread = (Math.random() - 0.5) * weapon.spread;
            const angle = player.rotation + spread;
            socket.emit('player_shoot', {
                x: player.x + Math.cos(angle) * PLAYER_SIZE,
                y: player.y + Math.sin(angle) * PLAYER_SIZE,
                angle: angle,
                damage: weapon.damage,
                weapon: player.currentWeapon
            });
        }
    }
}

function update() {
    // Player movement - top down WASD
    const moveSpeed = keys['shift'] ? PLAYER_SPEED * 1.5 : PLAYER_SPEED;

    if (keys['w']) player.velY = -moveSpeed;
    else if (keys['s']) player.velY = moveSpeed;
    else player.velY = 0;

    if (keys['a']) player.velX = -moveSpeed;
    else if (keys['d']) player.velX = moveSpeed;
    else player.velX = 0;

    // Diagonal movement normalization
    if (player.velX !== 0 && player.velY !== 0) {
        player.velX *= 0.707;
        player.velY *= 0.707;
    }

    player.x += player.velX;
    player.y += player.velY;

    // Zone collision
    const distToCenter = Math.hypot(player.x - gameState.zone.x, player.y - gameState.zone.y);
    if (distToCenter > gameState.zone.radius) {
        player.health -= gameState.zone.damage;
        if (player.health <= 0) {
            socket.emit('player_died');
        }
    }

    // Boundary collision
    player.x = Math.max(0, Math.min(canvas.width - PLAYER_SIZE, player.x));
    player.y = Math.max(0, Math.min(canvas.height - PLAYER_SIZE, player.y));

    // Update zone
    if (gameState.zone.radius > gameState.zone.targetRadius) {
        gameState.zone.radius -= ZONE_SHRINK_RATE;
    }

    // Emit player state
    socket.emit('player_update', {
        x: player.x,
        y: player.y,
        rotation: player.rotation,
        health: player.health,
        weapon: player.currentWeapon
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw zone
    ctx.beginPath();
    ctx.arc(gameState.zone.x, gameState.zone.y, gameState.zone.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw safe zone target
    ctx.beginPath();
    ctx.arc(gameState.zone.x, gameState.zone.y, gameState.zone.targetRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw other players
    Object.values(gameState.players).forEach(p => {
        ctx.save();
        ctx.translate(p.x + PLAYER_SIZE/2, p.y + PLAYER_SIZE/2);
        ctx.rotate(p.rotation);
        ctx.fillStyle = '#3498db';
        ctx.fillRect(-PLAYER_SIZE/2, -PLAYER_SIZE/2, PLAYER_SIZE, PLAYER_SIZE);
        // Draw weapon
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(0, -2, PLAYER_SIZE/2, 4);
        ctx.restore();
    });

    // Draw player
    ctx.save();
    ctx.translate(player.x + PLAYER_SIZE/2, player.y + PLAYER_SIZE/2);
    ctx.rotate(player.rotation);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-PLAYER_SIZE/2, -PLAYER_SIZE/2, PLAYER_SIZE, PLAYER_SIZE);
    // Draw weapon
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(0, -2, PLAYER_SIZE/2, 4);
    ctx.restore();

    // Draw bullets
    gameState.bullets.forEach(bullet => {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw UI
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.fillText(`Health: ${player.health}`, 20, 30);
    ctx.fillText(`Weapon: ${player.currentWeapon}`, 20, 60);
    ctx.fillText(`Players Alive: ${Object.keys(gameState.players).length + 1}`, 20, 90);
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Socket events
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('game_state', (state) => {
    gameState.players = state.players;
    gameState.bullets = state.bullets;
    gameState.items = state.items;
});

socket.on('player_hit', (data) => {
    player.health -= data.damage;
    if (player.health <= 0) {
        socket.emit('player_died');
    }
});

// Start game
gameLoop();