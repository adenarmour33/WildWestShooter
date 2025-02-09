const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Game constants
const PLAYER_SIZE = 32;
const PLAYER_SPEED = 5;
const GRAVITY = 0.5;
const JUMP_FORCE = -10;
const BULLET_SPEED = 10;

// Game state
let player = {
    x: 100,
    y: 100,
    velX: 0,
    velY: 0,
    health: 100,
    score: 0,
    isJumping: false
};

let otherPlayers = {};
let bullets = [];
let keys = {};

// Set canvas size
function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Input handling
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const angle = Math.atan2(y - player.y, x - player.x);
    socket.emit('player_shoot', {
        x: player.x,
        y: player.y,
        angle: angle
    });
});

// Game loop
function update() {
    // Player movement
    if (keys['a']) player.velX = -PLAYER_SPEED;
    else if (keys['d']) player.velX = PLAYER_SPEED;
    else player.velX = 0;

    if (keys[' '] && !player.isJumping) {
        player.velY = JUMP_FORCE;
        player.isJumping = true;
    }

    // Apply physics
    player.velY += GRAVITY;
    player.x += player.velX;
    player.y += player.velY;

    // Ground collision
    if (player.y > canvas.height - PLAYER_SIZE) {
        player.y = canvas.height - PLAYER_SIZE;
        player.velY = 0;
        player.isJumping = false;
    }

    // Wall collision
    if (player.x < 0) player.x = 0;
    if (player.x > canvas.width - PLAYER_SIZE) player.x = canvas.width - PLAYER_SIZE;

    // Update bullets
    bullets = bullets.filter(bullet => {
        bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
        bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;
        return (
            bullet.x >= 0 && 
            bullet.x <= canvas.width && 
            bullet.y >= 0 && 
            bullet.y <= canvas.height
        );
    });

    // Emit player position
    socket.emit('player_move', {
        x: player.x,
        y: player.y
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw player
    ctx.fillStyle = 'red';
    ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);

    // Draw other players
    Object.values(otherPlayers).forEach(p => {
        ctx.fillStyle = 'blue';
        ctx.fillRect(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE);
    });

    // Draw bullets
    ctx.fillStyle = 'yellow';
    bullets.forEach(bullet => {
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

socket.on('game_state', (states) => {
    otherPlayers = states;
});

socket.on('bullet_fired', (data) => {
    bullets.push({
        x: data.x,
        y: data.y,
        angle: data.angle
    });
});

// Start game
gameLoop();
