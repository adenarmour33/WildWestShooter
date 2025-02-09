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
    isModerator: false,
    chatMessages: []
};

// Camera setup
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

// Admin panel functionality
function toggleAdminPanel() {
    const adminPanel = document.querySelector('.admin-panel');
    if (adminPanel) {
        adminPanel.classList.toggle('active');
    }
}

function executeAdminCommand(command) {
    const playerList = document.getElementById('playerList');
    const selectedTarget = playerList ? playerList.value : null;

    if (!selectedTarget) {
        alert('Please select a player first');
        return;
    }

    let data = {
        command: command,
        target_id: selectedTarget
    };

    if (command === 'ban' || command === 'kick') {
        const reason = prompt('Enter reason:');
        if (!reason) return;
        data.reason = reason;
    } else if (command === 'mute') {
        const duration = prompt('Enter mute duration (minutes):', '5');
        if (!duration) return;
        data.duration = parseInt(duration);
    }

    socket.emit('admin_command', data);
}

function createAdminPanel() {
    const adminPanel = document.querySelector('.admin-panel');
    if (!adminPanel || (!gameState.isAdmin && !gameState.isModerator)) return;

    setInterval(() => {
        socket.emit('get_player_info');
    }, 1000);

    const playerList = document.createElement('select');
    playerList.id = 'playerList';
    playerList.className = 'form-select mb-2';

    if (gameState.isAdmin) {
        const adminButtons = [
            { text: 'Instant Kill', class: 'btn-danger', command: 'kill' },
            { text: 'Toggle God Mode', class: 'btn-warning', command: 'god' },
            { text: 'Toggle Moderator', class: 'btn-info', command: 'mod' },
            { text: 'Ban Player', class: 'btn-danger', command: 'ban' }
        ];

        adminButtons.forEach(btn => {
            const button = document.createElement('button');
            button.textContent = btn.text;
            button.className = `btn ${btn.class} mb-2 w-100`;
            button.onclick = () => executeAdminCommand(btn.command);
            adminPanel.appendChild(button);
        });
    }

    // Buttons for both admins and moderators
    const moderatorButtons = [
        { text: 'Kick Player', class: 'btn-warning', command: 'kick' },
        { text: 'Mute Player', class: 'btn-secondary', command: 'mute' }
    ];

    moderatorButtons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.className = `btn ${btn.class} mb-2 w-100`;
        button.onclick = () => executeAdminCommand(btn.command);
        adminPanel.appendChild(button);
    });

    adminPanel.insertBefore(playerList, adminPanel.firstChild);

    socket.on('player_info', (data) => {
        const playerList = document.getElementById('playerList');
        if (!playerList) return;

        playerList.innerHTML = '<option value="">Select Player</option>';
        data.players.forEach(player => {
            if (player.id !== socket.id) { // Don't include self
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = `${player.username} (HP: ${player.health})`;
                playerList.appendChild(option);
            }
        });
    });
}

// Initialize game after DOM is loaded
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

    // Socket event handlers
    socket.on('moderator_status', (data) => {
        gameState.isModerator = data.is_moderator;
        if (data.is_moderator) {
            createAdminPanel();
        }
    });

    socket.on('god_mode_update', (data) => {
        alert(data.enabled ? 'God mode enabled' : 'God mode disabled');
    });

    socket.on('game_state', (state) => {
        gameState.players = state.players;
        gameState.scores = state.scores;
        gameState.isAdmin = state.is_admin;
        gameState.isModerator = state.is_moderator;

        if ((state.is_admin || state.is_moderator) && !document.querySelector('.admin-panel.active')) {
            createAdminPanel();
        }
        updateUI();
        gameState.bullets = state.bullets.map(b => new Bullet(
            b.x, b.y, b.angle, BULLET_SPEED, b.damage, b.weapon, b.shooter
        ));
    });

    // Game loop
    function gameLoop(timestamp) {
        if (!lastUpdate) lastUpdate = timestamp;
        const delta = timestamp - lastUpdate;

        if (delta >= UPDATE_INTERVAL) {
            lastUpdate = timestamp;
        }

        if (timestamp - lastNetworkUpdate >= NETWORK_UPDATE_INTERVAL) {
            lastNetworkUpdate = timestamp;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(gameLoop);
    }

    // Start game loop
    requestAnimationFrame(gameLoop);

    // Add chat UI
    function createChatUI() {
        const chatContainer = document.createElement('div');
        chatContainer.className = 'chat-container';
        chatContainer.innerHTML = `
            <div class="chat-messages"></div>
            <div class="chat-input-container">
                <input type="text" class="chat-input" placeholder="Press Enter to chat...">
            </div>
        `;
        document.body.appendChild(chatContainer);

        const chatInput = chatContainer.querySelector('.chat-input');
        const chatMessages = chatContainer.querySelector('.chat-messages');

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && chatInput.value.trim()) {
                socket.emit('chat_message', { message: chatInput.value.trim() });
                chatInput.value = '';
            }
        });

        return { chatMessages };
    }

    const chatUI = createChatUI();

    socket.on('chat_update', (data) => {
        chatUI.chatMessages.innerHTML = data.messages.map(msg => `
            <div class="chat-message">
                <span class="chat-timestamp">[${msg.timestamp}]</span>
                <span class="chat-username">${msg.username}:</span>
                <span class="chat-text">${msg.message}</span>
            </div>
        `).join('');
        chatUI.chatMessages.scrollTop = chatUI.chatMessages.scrollHeight;
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
        player.score += 100; // Award points for a kill
        updateUI(); // Update UI to show new score
    });

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