let canvas, ctx, socket;
let tileSize = 32;
let lastUpdate = 0;
const UPDATE_INTERVAL = 1000 / 60; // 60fps target
const NETWORK_UPDATE_INTERVAL = 50; // Send updates every 50ms
const BULLET_SPEED = 10;
let lastNetworkUpdate = 0;

// Game state
let gameState = {
    players: {},
    bullets: [],
    scores: {},
    isAdmin: false,
    isModerator: false
};

// Camera setup with initial values
let camera = {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight
};

// Player setup
let player = {
    x: 0,
    y: 0,
    health: 100,
    kills: 0,
    deaths: 0,
    score: 0,
    velX: 0,
    velY: 0
};

// Assets
let assets = {
    tiles: {
        grass: new Image(),
        sand: new Image(),
        tree: new Image()
    },
    player: new Image(),
    weapons: {
        pistol: new Image(),
        shotgun: new Image(),
        smg: new Image(),
        knife: new Image()
    }
};

// Load assets
assets.tiles.grass.src = '/static/assets/tiles/grass.svg';
assets.tiles.sand.src = '/static/assets/tiles/sand.svg';
assets.tiles.tree.src = '/static/assets/tiles/tree.svg';
assets.player.src = '/static/assets/player.svg';
assets.weapons.pistol.src = '/static/assets/weapons/pistol.svg';
assets.weapons.shotgun.src = '/static/assets/weapons/shotgun.svg';
assets.weapons.smg.src = '/static/assets/weapons/smg.svg';
assets.weapons.knife.src = '/static/assets/weapons/knife.svg';

// Bullet class
class Bullet {
    constructor(x, y, angle, speed, damage, weapon, shooter) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.weapon = weapon;
        this.shooter = shooter;
    }
}

// Command system
function handleCommand(command) {
    const args = command.trim().split(' ');
    const cmd = args[0].toLowerCase();

    if (cmd === '/help') {
        alert(`Available Commands:
/kill [player] - Instantly kill a player
/god [player] - Toggle god mode for a player
/kick [player] [reason] - Kick a player
/ban [player] [reason] - Ban a player
/mute [player] [duration] - Mute a player
/mod [player] - Toggle moderator status
/tp [player] - Teleport to player`);
        return;
    }

    switch(cmd) {
        case '/kill':
            if (!args[1]) return alert('Usage: /kill [player]');
            socket.emit('admin_command', { command: 'kill', target: args[1] });
            break;
        case '/god':
            if (!args[1]) return alert('Usage: /god [player]');
            socket.emit('admin_command', { command: 'god', target: args[1] });
            break;
        case '/kick':
            if (!args[1]) return alert('Usage: /kick [player] [reason]');
            socket.emit('admin_command', {
                command: 'kick',
                target: args[1],
                reason: args.slice(2).join(' ') || 'No reason provided'
            });
            break;
        case '/ban':
            if (!args[1]) return alert('Usage: /ban [player] [reason]');
            socket.emit('admin_command', {
                command: 'ban',
                target: args[1],
                reason: args.slice(2).join(' ') || 'No reason provided'
            });
            break;
        case '/mute':
            if (!args[1] || !args[2]) return alert('Usage: /mute [player] [duration]');
            socket.emit('admin_command', {
                command: 'mute',
                target: args[1],
                duration: parseInt(args[2])
            });
            break;
        case '/mod':
            if (!args[1]) return alert('Usage: /mod [player]');
            socket.emit('admin_command', { command: 'mod', target: args[1] });
            break;
        case '/tp':
            if (!args[1]) return alert('Usage: /tp [player]');
            socket.emit('admin_command', { command: 'teleport', target: args[1] });
            break;
        default:
            alert('Unknown command. Type /help for available commands.');
    }
}

// Game rendering functions
function drawBackground() {
    // Fill the visible area with grass tiles
    const startX = Math.floor(camera.x / tileSize) * tileSize;
    const startY = Math.floor(camera.y / tileSize) * tileSize;
    const endX = startX + camera.width + tileSize;
    const endY = startY + camera.height + tileSize;

    for (let x = startX; x < endX; x += tileSize) {
        for (let y = startY; y < endY; y += tileSize) {
            ctx.drawImage(assets.tiles.grass, x - camera.x, y - camera.y, tileSize, tileSize);
        }
    }
}

function drawPlayers() {
    Object.values(gameState.players).forEach(p => {
        ctx.save();
        ctx.translate(p.x - camera.x, p.y - camera.y);
        ctx.drawImage(assets.player, -tileSize/2, -tileSize/2, tileSize, tileSize);
        ctx.restore();
    });
}

function drawBullets() {
    gameState.bullets.forEach(bullet => {
        ctx.save();
        ctx.translate(bullet.x - camera.x, bullet.y - camera.y);
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// Initialize game
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    ctx = canvas.getContext('2d');
    socket = io();

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        camera.width = canvas.width;
        camera.height = canvas.height;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Admin command input handler
    document.addEventListener('keypress', (e) => {
        if (e.key === "'" && (gameState.isAdmin || gameState.isModerator)) {
            const command = prompt('Enter command (/help for commands):');
            if (command) handleCommand(command);
        }
    });

    // Socket event handlers
    socket.on('game_state', (state) => {
        gameState.players = state.players;
        gameState.scores = state.scores;
        gameState.isAdmin = state.is_admin;
        gameState.isModerator = state.is_moderator;
        gameState.bullets = state.bullets.map(b => new Bullet(
            b.x, b.y, b.angle, BULLET_SPEED, b.damage, b.weapon, b.shooter
        ));
        updateUI();
    });

    socket.on('command_response', (data) => {
        alert(data.message);
    });

    socket.on('banned', (data) => {
        alert(`You have been banned: ${data.reason}`);
        window.location.href = '/logout';
    });

    socket.on('kicked', (data) => {
        alert(`You have been kicked: ${data.reason}`);
        window.location.href = '/';
    });

    socket.on('muted', (data) => {
        alert(`You have been muted for ${data.duration} minutes`);
    });

    socket.on('player_hit', (data) => {
        player.health -= data.damage;
        updateUI();
        if (player.health <= 0) {
            player.deaths++;
            socket.emit('player_died', { shooter: data.shooter });
        }
    });

    socket.on('player_respawn', (data) => {
        player.x = data.x;
        player.y = data.y;
        player.health = 100;
        player.velX = 0;
        player.velY = 0;
        updateUI();
    });

    socket.on('player_kill', (data) => {
        player.kills++;
        player.score += 100;
        updateUI();
    });

    // Game loop
    function gameLoop(timestamp) {
        if (!lastUpdate) lastUpdate = timestamp;
        const delta = timestamp - lastUpdate;

        if (delta >= UPDATE_INTERVAL) {
            lastUpdate = timestamp;
            // Update game state here
        }

        if (timestamp - lastNetworkUpdate >= NETWORK_UPDATE_INTERVAL) {
            lastNetworkUpdate = timestamp;
            // Send updates to server here
        }

        // Clear and render
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        drawPlayers();
        drawBullets();

        requestAnimationFrame(gameLoop);
    }

    updateUI();
    requestAnimationFrame(gameLoop);
});

// Global event handlers and UI updates
function updateUI() {
    // Update health bar
    const healthFill = document.getElementById('healthFill');
    if (healthFill) {
        healthFill.style.width = `${player.health}%`;
    }

    // Update ammo counter
    const ammoCounter = document.getElementById('ammoCounter');
    if (ammoCounter) {
        ammoCounter.textContent = '30/30'; // Replace with actual ammo count
    }
}

let joystick = {
    base: document.getElementById('joystickBase'),
    stick: document.getElementById('joystickStick'),
    active: false,
    baseX: 0,
    baseY: 0,
    deltaX: 0,
    deltaY: 0
};