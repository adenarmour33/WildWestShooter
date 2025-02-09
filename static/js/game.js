const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Game constants
const PLAYER_SIZE = 32;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 15;
const ZONE_SHRINK_RATE = 0.2;
const WEAPONS = {
    pistol: { damage: 15, fireRate: 400, spread: 0.1, ammo: 30, maxAmmo: 30 },
    shotgun: { damage: 8, fireRate: 800, spread: 0.3, pellets: 5, ammo: 10, maxAmmo: 10 },
    smg: { damage: 10, fireRate: 150, spread: 0.15, ammo: 45, maxAmmo: 45 },
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

// Mobile controls state
let joystick = {
    active: false,
    startX: 0,
    startY: 0,
    moveX: 0,
    moveY: 0,
    knob: document.querySelector('.joystick-knob')
};

// UI elements
const healthFill = document.getElementById('healthFill');
const healthText = document.getElementById('health');
const ammoCounter = document.getElementById('ammoCounter');
const minimapCtx = document.getElementById('minimap').getContext('2d');
const joystickArea = document.getElementById('joystickArea');
const shootButton = document.getElementById('shootButton');
const reloadButton = document.getElementById('reloadButton');

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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

// Keyboard controls
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if(['1', '2', '3', '4'].includes(e.key)) {
        const weapons = ['pistol', 'shotgun', 'smg', 'knife'];
        switchWeapon(weapons[parseInt(e.key) - 1]);
    }
    if(e.key.toLowerCase() === 'r') {
        reload();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Mouse controls
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    updateRotation();
});

canvas.addEventListener('mousedown', (e) => {
    shoot();
});

// Touch controls
joystickArea.addEventListener('touchstart', handleJoystickStart);
joystickArea.addEventListener('touchmove', handleJoystickMove);
joystickArea.addEventListener('touchend', handleJoystickEnd);
shootButton.addEventListener('touchstart', shoot);
reloadButton.addEventListener('click', reload);

function handleJoystickStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = joystickArea.getBoundingClientRect();
    joystick.active = true;
    joystick.startX = touch.clientX - rect.left;
    joystick.startY = touch.clientY - rect.top;
}

function handleJoystickMove(e) {
    e.preventDefault();
    if (!joystick.active) return;

    const touch = e.touches[0];
    const rect = joystickArea.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const deltaX = x - joystick.startX;
    const deltaY = y - joystick.startY;
    const distance = Math.min(50, Math.hypot(deltaX, deltaY));
    const angle = Math.atan2(deltaY, deltaX);

    joystick.moveX = Math.cos(angle) * distance;
    joystick.moveY = Math.sin(angle) * distance;

    if (joystick.knob) {
        joystick.knob.style.transform = `translate(${joystick.moveX}px, ${joystick.moveY}px)`;
    }
}

function handleJoystickEnd() {
    joystick.active = false;
    joystick.moveX = 0;
    joystick.moveY = 0;
    if (joystick.knob) {
        joystick.knob.style.transform = 'translate(0px, 0px)';
    }
}

function updateRotation() {
    player.rotation = Math.atan2(mouseY - player.y, mouseX - player.x);
}

function switchWeapon(weapon) {
    if (WEAPONS[weapon]) {
        player.currentWeapon = weapon;
        updateUI();
    }
}

function reload() {
    const weapon = WEAPONS[player.currentWeapon];
    if (weapon && weapon.ammo < weapon.maxAmmo) {
        weapon.ammo = weapon.maxAmmo;
        updateUI();
    }
}

function shoot() {
    const now = Date.now();
    const weapon = WEAPONS[player.currentWeapon];

    if (now - player.lastShot < weapon.fireRate || weapon.ammo <= 0) return;
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
        weapon.ammo--;

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
        updateUI();
    }
}

function updateUI() {
    // Update health bar
    healthFill.style.width = `${player.health}%`;
    healthText.textContent = Math.max(0, Math.floor(player.health));

    // Update ammo counter
    const weapon = WEAPONS[player.currentWeapon];
    if (weapon && weapon.ammo !== undefined) {
        ammoCounter.textContent = `${weapon.ammo}/${weapon.maxAmmo}`;
    } else {
        ammoCounter.textContent = '∞';
    }

    // Update weapon slots
    document.querySelectorAll('.weapon-slot').forEach(slot => {
        slot.classList.remove('active');
    });
    const activeSlot = document.querySelector(`.weapon-slot[data-slot="${['pistol', 'shotgun', 'smg', 'knife'].indexOf(player.currentWeapon) + 1}"]`);
    if (activeSlot) activeSlot.classList.add('active');
}

function updateMinimap() {
    minimapCtx.clearRect(0, 0, 150, 150);
    minimapCtx.fillStyle = 'rgba(0, 255, 0, 0.2)';
    minimapCtx.beginPath();
    minimapCtx.arc(75, 75, 70, 0, Math.PI * 2);
    minimapCtx.fill();

    // Draw player
    minimapCtx.fillStyle = '#e74c3c';
    minimapCtx.fillRect(72, 72, 6, 6);

    // Draw other players
    minimapCtx.fillStyle = '#3498db';
    Object.values(gameState.players).forEach(p => {
        const minimapX = (p.x / canvas.width) * 150;
        const minimapY = (p.y / canvas.height) * 150;
        minimapCtx.fillRect(minimapX - 2, minimapY - 2, 4, 4);
    });
}

function update() {
    // Movement from keyboard or joystick
    const moveSpeed = keys['shift'] ? PLAYER_SPEED * 1.5 : PLAYER_SPEED;

    if (joystick.active) {
        const magnitude = Math.hypot(joystick.moveX, joystick.moveY);
        const normalizedSpeed = moveSpeed * (magnitude / 50);
        player.velX = (joystick.moveX / magnitude) * normalizedSpeed;
        player.velY = (joystick.moveY / magnitude) * normalizedSpeed;
    } else {
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
    }

    player.x += player.velX;
    player.y += player.velY;

    // Zone collision
    const distToCenter = Math.hypot(player.x - gameState.zone.x, player.y - gameState.zone.y);
    if (distToCenter > gameState.zone.radius) {
        player.health -= gameState.zone.damage;
        updateUI();
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

    // Update minimap
    updateMinimap();

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
    updateUI();
    if (player.health <= 0) {
        socket.emit('player_died');
    }
});

// Initialize UI
updateUI();

// Start game
gameLoop();