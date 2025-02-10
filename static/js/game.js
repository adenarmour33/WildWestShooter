// Game setup and global variables
let canvas, ctx, socket;
let tileSize = 32;
let lastUpdate = 0;
const UPDATE_INTERVAL = 1000 / 60; // 60fps target
const NETWORK_UPDATE_INTERVAL = 50; // Send updates every 50ms
let lastNetworkUpdate = 0;
let camera = null; // Initialize as null first

// Update weapon damage values to be less powerful
const WEAPONS = {
    pistol: { damage: 10, fireRate: 400, spread: 0.1, ammo: 30, maxAmmo: 30 },
    shotgun: { damage: 10, fireRate: 800, spread: 0.3, pellets: 5, ammo: 10, maxAmmo: 10 },
    smg: { damage: 10, fireRate: 150, spread: 0.15, ammo: 45, maxAmmo: 45 },
    knife: { damage: 10, fireRate: 500, range: 50 }
};

// Add after the WEAPONS constant
const POWERUPS = {
    speed: { duration: 10000, multiplier: 1.5, respawnTime: 30000 },
    shield: { duration: 8000, respawnTime: 45000 },
    damage: { duration: 15000, multiplier: 2, respawnTime: 60000 }
};

// Update gameState object to include powerups
let gameState = {
    players: {},
    bullets: [],
    localBullets: [],
    scores: {},
    isAdmin: false,
    isModerator: false,
    chatMessages: [],
    userId: null,
    adminIds: new Set(),
    powerups: [], // Add powerups array to track spawned powerups
    activePowerups: {} // Track active powerups for the local player
};

// Game constants
const PLAYER_SIZE = 32;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 15;

// Map configuration - single declaration
const map = {
    width: 50,
    height: 50,
    tiles: [],
    generateTiles: function() {
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                let noise = Math.random();
                if (noise < 0.7) {
                    this.tiles[y][x] = 'grass';
                } else if (noise < 0.85) {
                    this.tiles[y][x] = 'sand';
                } else {
                    this.tiles[y][x] = 'tree';
                }
            }
        }
    }
};

// Initialize map
map.generateTiles();

// Asset loading
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

// Load assets with SVG paths
assets.tiles.grass.src = '/static/assets/tiles/grass.svg';
assets.tiles.sand.src = '/static/assets/tiles/sand.svg';
assets.tiles.tree.src = '/static/assets/tiles/tree.svg';
assets.player.src = '/static/assets/player.svg';
assets.weapons.pistol.src = '/static/assets/weapons/pistol.svg';
assets.weapons.shotgun.src = '/static/assets/weapons/shotgun.svg';
assets.weapons.smg.src = '/static/assets/weapons/smg.svg';
assets.weapons.knife.src = '/static/assets/weapons/knife.svg';


// Add after assets loading section
assets.powerups = {
    speed: new Image(),
    shield: new Image(),
    damage: new Image()
};

// Add powerup asset loading
assets.powerups.speed.src = '/static/assets/powerups/speed.svg';
assets.powerups.shield.src = '/static/assets/powerups/shield.svg';
assets.powerups.damage.src = '/static/assets/powerups/damage.svg';

function resizeCanvas() {
    if (!canvas || !camera) return; // Add null check
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.width = canvas.width;
    camera.height = canvas.height;
}

// Initialize game after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');

    // Get canvas element first
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    ctx = canvas.getContext('2d');

    // Initialize camera
    camera = {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        followTarget: function(target, smooth = 0.1) {
            const targetX = target.x - this.width / 2;
            const targetY = target.y - this.height / 2;
            this.x += (targetX - this.x) * smooth;
            this.y += (targetY - this.y) * smooth;
            this.x = Math.max(0, Math.min(this.x, map.width * tileSize - this.width));
            this.y = Math.max(0, Math.min(this.y, map.height * tileSize - this.height));
        }
    };

    // Now that both canvas and camera are initialized, we can setup resize handler
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial resize

    // Initialize socket
    socket = io();
    // Setup socket event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('authenticate');
    });

    socket.on('authentication_response', (data) => {
        console.log('Authentication response:', data);
        gameState.isAdmin = data.is_admin;
        gameState.isModerator = data.is_moderator;
        gameState.userId = data.user_id;

        // Initialize admin panel after authentication
        if (gameState.isAdmin) {
            setupAdminPanel();
        }
    });

    // Admin Panel Setup
    function setupAdminPanel() {
        console.log('Setting up admin panel');

        // Create or get admin panel
        let adminPanel = document.querySelector('.admin-panel');
        if (!adminPanel) {
            adminPanel = document.createElement('div');
            adminPanel.className = 'admin-panel';
            adminPanel.style.display = 'none';
            adminPanel.innerHTML = `
                <div class="admin-header">
                    <h2>Admin Panel</h2>
                    <button class="admin-panel-close">&times;</button>
                </div>
                <div class="admin-section">
                    <h3>Player Management</h3>
                    <select id="playerList">
                        <option value="">Select Player</option>
                    </select>
                    <div class="admin-buttons">
                        <button id="killButton">Kill Player</button>
                        <button id="godModeButton">Toggle God Mode</button>
                        <button id="modButton">Toggle Moderator</button>
                        <button id="kickButton">Kick Player</button>
                        <button id="muteButton">Mute Player</button>
                    </div>
                </div>
            `;
            document.body.appendChild(adminPanel);

            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                .admin-panel {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.9);
                    padding: 20px;
                    border-radius: 10px;
                    z-index: 1001;
                    color: white;
                    min-width: 300px;
                }
                .admin-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .admin-panel h2 {
                    margin: 0;
                    color: #4a9eff;
                }
                .admin-panel-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                }
                .admin-section {
                    margin-bottom: 15px;
                }
                .admin-section h3 {
                    margin: 10px 0;
                    color: #bbb;
                }
                .admin-panel select {
                    width: 100%;
                    margin-bottom: 10px;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: white;
                    border-radius: 4px;
                }
                .admin-buttons {
                    display: grid;
                    gap: 8px;
                }
                .admin-panel button {
                    width: 100%;
                    padding: 8px;
                    background: #4a9eff;
                    border: none;
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background 0.3s;
                }
                .admin-panel button:hover {
                    background: #357abd;
                }
            `;
            document.head.appendChild(style);
        }

        // Setup toggle
        document.addEventListener('keydown', (e) => {
            if (e.key === "'") {
                e.preventDefault();
                adminPanel.style.display = adminPanel.style.display === 'none' ? 'block' : 'none';
                if (adminPanel.style.display === 'block') {
                    updatePlayerList();
                }
            }
        });

        // Close button
        const closeButton = adminPanel.querySelector('.admin-panel-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                adminPanel.style.display = 'none';
            });
        }

        // Button handlers
        const setupButton = (id, command, promptText = null, extraData = null) => {
            const button = adminPanel.querySelector(`#${id}`);
            if (button) {
                // Remove existing listeners
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);

                newButton.addEventListener('click', () => {
                    const playerSelect = adminPanel.querySelector('#playerList');
                    const selectedPlayer = playerSelect?.value;

                    if (!selectedPlayer) {
                        alert('Please select a player first');
                        return;
                    }

                    const data = {
                        command: command,
                        target_id: selectedPlayer
                    };

                    if (promptText) {
                        const input = prompt(promptText);
                        if (!input) return;
                        if (extraData) {
                            data[extraData] = input;
                        }
                    }

                    console.log('Sending admin command:', command, data);
                    socket.emit('admin_command', data);
                });
            }
        };

        // Wait for player list to be populated
        setTimeout(() => {
            // Setup buttons
            setupButton('killButton', 'kill');
            setupButton('godModeButton', 'god_mode');
            setupButton('modButton', 'mod');
            setupButton('kickButton', 'kick', 'Enter kick reason:', 'reason');
            setupButton('muteButton', 'mute', 'Enter mute duration (minutes):', 'duration');

            // Update player list initially
            socket.emit('get_player_info');
        }, 1000);

        // Listen for player info updates
        socket.on('player_info', (data) => {
            const playerList = document.querySelector('#playerList');
            if (!playerList) return;

            playerList.innerHTML = '<option value="">Select Player</option>';
            data.players.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = `${player.username} (${player.health}HP)`;
                playerList.appendChild(option);
            });
        });

        // Handle command responses
        socket.on('admin_command_result', (data) => {
            console.log('Admin command result:', data);
            if (data.success) {
                alert(data.message || 'Command executed successfully');
                updatePlayerList();
            } else {
                alert(data.error || 'Command failed');
            }
        });
    }

    function updatePlayerList() {
        const playerSelect = document.querySelector('#playerList');
        if (!playerSelect) return;

        const currentSelection = playerSelect.value;
        playerSelect.innerHTML = '<option value="">Select Player</option>';

        Object.entries(gameState.players).forEach(([id, player]) => {
            if (id !== socket.id) {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = `${player.username}${id.startsWith('bot_') ? ' (Bot)' : ''}`;
                playerSelect.appendChild(option);
            }
        });

        if (currentSelection && gameState.players[currentSelection]) {
            playerSelect.value = currentSelection;
        }
    }

    let player = {
        x: Math.random() * (map.width * tileSize - PLAYER_SIZE),
        y: Math.random() * (map.height * tileSize - PLAYER_SIZE),
        velX: 0,
        velY: 0,
        rotation: 0,
        health: 100,
        score: 0,
        kills: 0,
        deaths: 0,
        killStreak: 0,
        maxKillStreak: 0,
        currentWeapon: 'pistol',
        lastShot: 0,
        speedMultiplier: 1,
        damageMultiplier: 1,
        isInvulnerable: false
    };


    // UI elements
    const healthBar = document.querySelector('.health-fill');
    const healthText = document.querySelector('.health-text');
    const ammoCounter = document.getElementById('ammoCounter');
    const weaponSlots = document.querySelectorAll('.weapon-slot');
    const scoreboardElement = document.getElementById('scoreboard');
    const minimapElement = document.getElementById('minimap');
    const minimapCtx = minimapElement ? minimapElement.getContext('2d') : null;

    window.addEventListener('resize', resizeCanvas);


    const keys = {};
    let mouseX = 0, mouseY = 0;

    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (['1', '2', '3', '4'].includes(e.key)) {
            const weapons = ['pistol', 'shotgun', 'smg', 'knife'];
            switchWeapon(weapons[parseInt(e.key) - 1]);
        }
        if (e.key.toLowerCase() === 'r') {
            reload();
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left + camera.x;
        mouseY = e.clientY - rect.top + camera.y;
        updateRotation();
    });

    canvas.addEventListener('mousedown', shoot);

    function updateRotation() {
        const dx = mouseX - (player.x + PLAYER_SIZE / 2);
        const dy = mouseY - (player.y + PLAYER_SIZE / 2);
        player.rotation = Math.atan2(dy, dx);
    }

    function switchWeapon(weapon) {
        if (WEAPONS[weapon]) {
            player.currentWeapon = weapon;
            weaponSlots.forEach((slot, index) => {
                slot.classList.toggle('active', index === ['pistol', 'shotgun', 'smg', 'knife'].indexOf(weapon));
            });
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

    // Update shoot function to properly handle damage
    function shoot() {
        const now = Date.now();
        const weapon = WEAPONS[player.currentWeapon];

        if (now - player.lastShot < weapon.fireRate || weapon.ammo <= 0) return;
        player.lastShot = now;

        if (player.currentWeapon === 'knife') {
            socket.emit('player_melee', {
                x: player.x + PLAYER_SIZE / 2,
                y: player.y + PLAYER_SIZE / 2,
                rotation: player.rotation,
                range: weapon.range,
                damage: weapon.damage
            });
        } else {
            weapon.ammo--;
            const pellets = weapon.pellets || 1;

            for (let i = 0; i < pellets; i++) {
                const spread = (Math.random() - 0.5) * weapon.spread;
                const angle = player.rotation + spread;

                const bulletX = player.x + PLAYER_SIZE / 2;
                const bulletY = player.y + PLAYER_SIZE / 2;

                const bullet = {
                    x: bulletX,
                    y: bulletY,
                    angle: angle,
                    damage: weapon.damage * player.damageMultiplier, // Apply damage multiplier
                    shooter: socket.id,
                    weapon: player.currentWeapon,
                    created_at: Date.now()
                };

                gameState.localBullets.push(bullet);

                socket.emit('player_shoot', {
                    x: bulletX,
                    y: bulletY,
                    angle: angle,
                    damage: weapon.damage * player.damageMultiplier, // Apply damage multiplier
                    weapon: player.currentWeapon
                });
            }
            updateUI();
        }
    }

    function updateScoreboard() {
        if (!scoreboardElement) return;

        const scores = Object.entries(gameState.scores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

        scoreboardElement.innerHTML = `
            <div class="scoreboard-header">Top Players</div>
            ${scores.map(([id, score]) => `
                <div class="scoreboard-row">
                    <span class="player-name">${gameState.players[id]?.username || 'Unknown'}</span>
                    <span class="player-score">${score}</span>
                </div>
            `).join('')}
        `;
    }

    function updateUI() {
        if (healthBar && healthText) {
            healthBar.style.width = `${player.health}%`;
            healthText.textContent = `${Math.max(0, Math.floor(player.health))}HP`;
        }

        if (ammoCounter) {
            const weapon = WEAPONS[player.currentWeapon];
            ammoCounter.textContent = weapon.ammo !== undefined ?
                `${weapon.ammo}/${weapon.maxAmmo}` : '∞';
        }

        updateScoreboard();
        updatePlayerList(); // Update player list in UI
    }

    // Update checkBulletCollisions function to properly handle bot damage
    function checkBulletCollisions() {
        const PLAYER_HITBOX = 32;

        // Process both server bullets and local bullets
        const allBullets = [...gameState.bullets, ...gameState.localBullets];

        gameState.bullets = allBullets.filter(bullet => {
            if (Date.now() - bullet.created_at > 2000) return false;

            // Check collision with all players (including bots)
            for (const [id, targetPlayer] of Object.entries(gameState.players)) {
                // Skip if:
                // - Target is the shooter
                // - Target is already dead
                // - Target is invulnerable (due to shield powerup)
                if (id === bullet.shooter || targetPlayer.health <= 0 || targetPlayer.isInvulnerable) continue;

                const dx = targetPlayer.x + PLAYER_SIZE / 2 - bullet.x;
                const dy = targetPlayer.y + PLAYER_SIZE / 2 - bullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < PLAYER_HITBOX) {
                    console.log('Hit detected:', {
                        targetId: id,
                        isBot: id.startsWith('bot_'),
                        damage: bullet.damage,
                        shooter: bullet.shooter
                    });

                    createHitEffect(bullet.x, bullet.y);

                    socket.emit('player_hit', {
                        damage: bullet.damage,
                        shooter: bullet.shooter,
                        target_id: id,
                        weapon: bullet.weapon,
                        is_bot: id.startsWith('bot_')
                    });

                    // Apply immediate visual feedback
                    if (targetPlayer) {
                        targetPlayer.health = Math.max(0, targetPlayer.health - bullet.damage);
                        createHitEffect(targetPlayer.x + PLAYER_SIZE / 2, targetPlayer.y + PLAYER_SIZE / 2);
                    }
                    return false;
                }
            }

            // Check collision with local player
            if (bullet.shooter !== socket.id && player.health > 0 && !player.isInvulnerable) {
                const dx = player.x + PLAYER_SIZE / 2 - bullet.x;
                const dy = player.y + PLAYER_SIZE / 2 - bullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < PLAYER_HITBOX) {
                    console.log('Hit detected on local player:', {
                        damage: bullet.damage,
                        shooterId: bullet.shooter,
                        currentHealth: player.health
                    });

                    // Add hit effect
                    createHitEffect(bullet.x, bullet.y);

                    // Emit hit event to server
                    socket.emit('player_hit', {
                        damage: bullet.damage,
                        shooter: bullet.shooter,
                        target_id: socket.id,
                        weapon: bullet.weapon
                    });

                    // Apply damage locally for immediate feedback
                    player.health = Math.max(0, player.health - bullet.damage);
                    updateUI();

                    return false;
                }
            }

            // Update bullet position
            bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
            bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;

            // Keep bullet in bounds
            return bullet.x >= 0 && bullet.x <= map.width * tileSize &&
                   bullet.y >= 0 && bullet.y <= map.height * tileSize;
        });
    }

    function update(deltaTime) {
        if (player.health <= 0) return;

        // Update player movement with speed multiplier
        player.velX = 0;
        player.velY = 0;

        if (keys['w']) player.velY = -PLAYER_SPEED * player.speedMultiplier;
        if (keys['s']) player.velY = PLAYER_SPEED * player.speedMultiplier;
        if (keys['a']) player.velX = -PLAYER_SPEED * player.speedMultiplier;
        if (keys['d']) player.velX = PLAYER_SPEED * player.speedMultiplier;

        // Normalize diagonal movement
        if (player.velX !== 0 && player.velY !== 0) {
            player.velX *= 0.707;
            player.velY *= 0.707;
        }

        // Scale movement by deltaTime
        const timeScale = deltaTime / 16.67; // Normalize for 60fps
        player.x += player.velX * timeScale;
        player.y += player.velY * timeScale;

        // Clamp player position
        player.x = Math.max(0, Math.min(map.width * tileSize - PLAYER_SIZE, player.x));
        player.y = Math.max(0, Math.min(map.height * tileSize - PLAYER_SIZE, player.y));

        // Check for power-up collisions
        checkPowerupCollisions();

        // Update bullet positions and check collisions
        checkBulletCollisions();

        // Update camera with smooth following
        camera.followTarget(player, 0.1);

        // Network updates at fixed interval
        const now = Date.now();
        if (now - lastNetworkUpdate >= NETWORK_UPDATE_INTERVAL) {
            socket.emit('player_update', {
                x: player.x,
                y: player.y,
                rotation: player.rotation,
                health: player.health,
                weapon: player.currentWeapon
            });
            lastNetworkUpdate = now;
            updateMinimap();
        }
    }

    function drawBullet(bullet) {
        const screenX = bullet.x - camera.x;
        const screenY = bullet.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(bullet.angle);

        // Make bullets more visible with glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffff00';

        // Larger, more visible bullet
        ctx.fillStyle = '#fff700';
        ctx.fillRect(-6, -3, 12, 6);

        // Add bright center
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -2, 8, 4);

        ctx.restore();
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw map tiles
        const startCol = Math.floor(camera.x / tileSize);
        const endCol = Math.min(map.width, startCol + Math.ceil(canvas.width / tileSize) + 1);
        const startRow = Math.floor(camera.y / tileSize);
        const endRow = Math.min(map.height, startRow + Math.ceil(canvas.height / tileSize) + 1);

        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
                const tile = map.tiles[y][x];
                const screenX = x * tileSize - camera.x;
                const screenY = y * tileSize - camera.y;

                if (assets.tiles[tile] && assets.tiles[tile].complete) {
                    ctx.drawImage(assets.tiles[tile], screenX, screenY, tileSize, tileSize);
                }
            }
        }

        // Draw bullets with proper rotation
        gameState.localBullets.forEach(drawBullet);
        gameState.bullets.forEach(drawBullet);

        // Draw other players
        Object.values(gameState.players).forEach(p => {
            if (p.health <= 0) return;

            const screenX = p.x - camera.x;
            const screenY = p.y - camera.y;

            if (assets.player.complete) {
                ctx.save();
                ctx.translate(screenX + PLAYER_SIZE / 2, screenY + PLAYER_SIZE / 2);
                ctx.rotate(p.rotation);
                ctx.drawImage(assets.player, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
                ctx.restore();
            }

            // Draw player name and health
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(p.username, screenX + PLAYER_SIZE / 2, screenY - 20);

            // Health bar
            const healthBarWidth = 32;
            const healthBarHeight = 4;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(screenX, screenY - 10, healthBarWidth, healthBarHeight);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(screenX, screenY - 10, (p.health / 100) * healthBarWidth, healthBarHeight);
        });

        // Draw player if alive
        if (player.health > 0 && assets.player.complete) {
            ctx.save();
            ctx.translate(player.x - camera.x + PLAYER_SIZE / 2, player.y - camera.y + PLAYER_SIZE / 2);
            ctx.rotate(player.rotation);
            ctx.drawImage(assets.player, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
            ctx.restore();
        }

        // Draw powerups
        gameState.powerups.forEach(powerup => {
            const screenX = powerup.x - camera.x;
            const screenY = powerup.y - camera.y;

            if (assets.powerups[powerup.type].complete) {
                ctx.drawImage(assets.powerups[powerup.type], screenX, screenY, 32, 32);
            }
        });

        // Draw power-up status indicators
        if (Object.keys(gameState.activePowerups).length > 0) {
            const padding = 10;
            const size = 30;
            let offsetX = padding;

            Object.entries(gameState.activePowerups).forEach(([type, data]) => {
                const timeLeft = (POWERUPS[type].duration - (Date.now() - data.activatedAt)) / 1000;
                if (timeLeft > 0) {
                    ctx.drawImage(assets.powerups[type], offsetX, padding, size, size);
                    ctx.fillStyle = '#fff';
                    ctx.font = '12px Arial';
                    ctx.fillText(Math.ceil(timeLeft) + 's', offsetX + size / 4, padding + size + 15);
                    offsetX += size + padding;
                }
            });
        }
    }

    function updateMinimap() {
        if (!minimapCtx) return;

        minimapCtx.clearRect(0, 0, 150, 150);
        minimapCtx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        minimapCtx.fillRect(0, 0, 150, 150);
        const playerX = (player.x / (map.width * tileSize)) * 150;
        const playerY = (player.y / (map.height * tileSize)) * 150;
        minimapCtx.fillStyle = '#e74c3c';
        minimapCtx.fillRect(playerX - 2, playerY - 2, 4, 4);

        minimapCtx.fillStyle = '#3498db';
        Object.values(gameState.players).forEach(p => {
            if (p.health <= 0) return;
            const x = (p.x / (map.width * tileSize)) * 150;
            const y = (p.y / (map.height * tileSize)) * 150;
            minimapCtx.fillRect(x - 2, y - 2, 4, 4);
        });
    }


    // Chat UI creation
    function createChatUI() {
        const chatContainer = document.createElement('div');
        chatContainer.className = 'chat-container';
        chatContainer.innerHTML = `
            <div class="chat-messages"></div>
            <div class="chat-input-container">
                <input type="text" class="chat-input" placeholder="Type your message...">
                <button class="chat-send-button">Send</button>
            </div>
        `;
        document.body.appendChild(chatContainer);

        const chatInput = chatContainer.querySelector('.chat-input');
        const chatMessages = chatContainer.querySelector('.chat-messages');
        const sendButton = chatContainer.querySelector('.chat-send-button');

        // Add chat styles
        const style = document.createElement('style');
        style.textContent = `
            .chat-container {
                position: fixed;
                left: 20px;
                bottom: 20px;
                width: 300px;
                height: 200px;
                background: rgba(0, 0, 0, 0.8);
                border-radius: 5px;
                display: flex;
                flex-direction: column;
                z-index: 1000;
            }
            .chat-messages {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                color: white;
            }
            .chat-input-container {
                padding: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                gap: 8px;
            }
            .chat-input {
                flex: 1;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                padding: 8px;
                color: white;
                borderradius: 4px;
            }
            .chat-send-button {
                background: #4a9eff;
                border: none;
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.3s;
            }
            .chat-send-button:hover {
                background: #357abd;
            }
            .chat-message {
                margin-bottom: 5px;
            }
            .chat-timestamp {
                color: #666;
                margin-right: 5px;
            }
            .chat-username {
                color: #4a9eff;
                margin-right: 5px;
            }
            .chat-text {
                color: #fff;
            }
        `;
        document.head.appendChild(style);

        // Function to send chat message
        function sendChatMessage() {
            const message = chatInput.value.trim();
            if (message) {
                socket.emit('chat_message', { message: message });
                chatInput.value = '';
            }
        }

        // Add click handler for send button
        sendButton.addEventListener('click', sendChatMessage);

        // Keep Enter key functionality as well
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });

        return { chatMessages, chatInput };
    }

    // Command line interface
    function createCommandLine() {
        const cmdContainer = document.createElement('div');
        cmdContainer.className = 'command-line';
        cmdContainer.style.display = 'none';
        cmdContainer.innerHTML = `
            <div class="command-input-container">
                <span class="command-prompt">/</span>
                <input type="text" class="command-input" placeholder="Type /panel to open admin panel">
            </div>
        `;
        document.body.appendChild(cmdContainer);

        const cmdInput = cmdContainer.querySelector('.command-input');

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .command-line {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                padding: 10px;
                border-radius: 5px;
                z-index: 1000;
                display: none;
            }
            .command-input-container {
                display: flex;
                align-items: center;
            }
            .command-prompt {
                color: #fff;
                margin-right: 5px;
                font-family: monospace;
                font-size: 16px;
            }
            .command-input {
                flex: 1;
                background: transparent;
                border: none;
                color: #fff;
                font-family: monospace;
                font-size: 16px;
                outline: none;
                min-width: 300px;
            }
            .command-input::placeholder {
                color: rgba(255,255, 255, 0.5);
            }
            .admin-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                padding: 20px;
                border-radius: 10px;
                z-index: 1001;
                color: white;
                min-width: 300px;
                max-width: 400px;
            }
            .admin-panel h2 {
                margin: 0 0 15px 0;
                color: #4a9eff;
            }
            .admin-panel-close {
                position: absolute;
                top: 10px;
                right: 10px;
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 20px;
            }
            .admin-panel select, .adminpanel button {
                    width: 100%;
                    margin: 5px 0;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: white;
                    border-radius: 4px;
                }
                .admin-panel button {
                    background: #4a9eff;
                    border: none;
                    cursor: pointer;
                    transition: background 0.3s;
                }
                .admin-panel button:hover {
                    background: #357abd;
                }
                .admin-section {
                    margin-bottom: 15px;
                }
                .admin-section h3 {
                    margin: 10px 0;
                    color: #bbb;
                }
            `;
        document.head.appendChild(style);

        // Set up command input handling
        cmdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && cmdInput.value.trim().toLowerCase() === '/panel') {
                if (gameState.isAdmin) {
                    toggleAdminPanel();
                } else {
                    const resultElement = document.createElement('div');
                    resultElement.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: rgba(0, 0, 0, 0.8);
                        color: white;
                        padding: 10px 20px;
                        border-radius: 5px;
                        z-index: 1001;
                    `;
                    resultElement.textContent = 'Access denied: Admin privileges required';
                    document.body.appendChild(resultElement);
                    setTimeout(() => document.body.removeChild(resultElement), 3000);
                }
                cmdInput.value = '';
                cmdContainer.style.display = 'none';
            }
        });

        // Toggle command line with forward slash
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== cmdInput) {
                e.preventDefault();
                cmdContainer.style.display = cmdContainer.style.display === 'none' ? 'block' : 'none';
                if (cmdContainer.style.display === 'block') {
                    cmdInput.focus();
                }
            }
        });

        return { cmdContainer, cmdInput };
    }

    // Initialize interfaces
    const chatUI = createChatUI();
    const { cmdContainer, cmdInput } = createCommandLine();


    // Create admin panel function
    function createAdminPanel() {
        // Remove existing panel if it exists
        const existingPanel = document.querySelector('.admin-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.className = 'admin-panel';
        panel.innerHTML = `
            <button class="admin-panel-close">&times;</button>
            <h2>Admin Panel</h2>

            <div class="admin-section">
                <h3>Player Management</h3>
                <select id="playerList">
                    <option value="">Select Player</option>
                </select>
                <button id="killButton">Kill Player</button>
                <button id="kickButton">Kick Player</button>
                <button id="muteButton">Mute Player</button>
                <button id="godModeButton">Toggle God Mode</button>
                <button id="modButton">Toggle Moderator</button>
            </div>
        `;

        document.body.appendChild(panel);

        // Add close button functionality
        panel.querySelector('.admin-panel-close').addEventListener('click', () => {
            panel.remove();
        });

        // Close panel when clicking outside
        document.addEventListener('click', function closePanel(e) {
            if (!panel.contains(e.target) && e.target !== panel) {
                panel.remove();
                document.removeEventListener('click', closePanel);
            }
        });
    }

    function toggleAdminPanel() {
        const adminPanel = document.querySelector('.admin-panel');
        if (adminPanel) {
            adminPanel.style.display = adminPanel.style.display === 'none' ? 'block' : 'none';
            if (adminPanel.style.display === 'block') {
                updatePlayerList();
            }
        }
    }


    let lastTimestamp = 0;
    function gameLoop(timestamp) {
        const deltaTime = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        if (deltaTime < 1000) { // Skip large time gaps (e.g., tab switching)
            update(deltaTime);
        }
        draw();
        requestAnimationFrame(gameLoop);
    }

    // Socket events
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('authenticate');
    });

    socket.on('authentication_response', (data) => {
        console.log('Authentication response:', data);
        if (data.user_id) {
            gameState.userId = data.user_id;
            gameState.isAdmin = data.is_admin || false;
            gameState.isModerator = data.is_moderator || false;
            console.log('User authenticated:', {
                userId: gameState.userId,
                isAdmin: gameState.isAdmin,
                isModerator: gameState.isModerator
            });
        }
    });

    socket.on('game_state', (state) => {
        console.log('Received game state:', state);
        gameState.players = state.players || {};
        gameState.bullets = state.bullets || [];
        gameState.scores = state.scores || {};
        gameState.chatMessages = state.chat_messages || [];
        updateUI();
    });

    // Socket event handler for admin command results
    socket.on('admin_command_result', (data) => {
        console.log('Admin command result:', data);
        if (data.success) {
            alert(data.message || 'Command executed successfully');
        } else {
            alert(data.error || 'Command failed');
        }
    });

    // Socket events for chat
    socket.on('chat_update', (data) => {
        if (!chatUI.chatMessages) return;

        // Clear existing messages
        chatUI.chatMessages.innerHTML = '';

        // Add all messages
        data.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            messageDiv.innerHTML = `
            <span class="chat-timestamp">[${msg.timestamp}]</span>
            <span class="chat-username">${msg.username}:</span>
            <span class="chat-text">${msg.message}</span>
        `;
            chatUI.chatMessages.appendChild(messageDiv);
        });

        // Scroll to bottom
        chatUI.chatMessages.scrollTop = chatUI.chatMessages.scrollHeight;
    });


    // Add handler for player_died event
    socket.on('player_died', (data) => {
        console.log('Player died event received:', data);
        updateUI();
    });

    // Update socket.on handlers to properly handle damage
    socket.on('player_hit', (data) => {
        console.log('Hit event received from server:', data);

        // Update local player if they were hit
        if (data.target_id === socket.id && player.health > 0) {
            const oldHealth = player.health;
            player.health = Math.max(0, player.health - data.damage);

            console.log('Local player health updated:', {
                oldHealth: oldHealth,
                newHealth: player.health,
                damageTaken: data.damage
            });

            createHitEffect(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);

            updateUI();
        }
        // Update other players/bots in gameState
        else if (gameState.players[data.target_id]) {
            const targetPlayer = gameState.players[data.target_id];
            const oldHealth = targetPlayer.health;
            targetPlayer.health = Math.max(0, targetPlayer.health - data.damage);

            console.log('Other player/bot health updated:', {
                targetId: data.target_id,
                isBot: data.target_id.startsWith('bot_'),
                oldHealth: oldHealth,
                newHealth: targetPlayer.health,
                damageTaken: data.damage
            });

            createHitEffect(targetPlayer.x + PLAYER_SIZE / 2, targetPlayer.y + PLAYER_SIZE / 2);
            updateUI();
        }
    });

    // Start the game loop
    //requestAnimationFrame(gameLoop); //Removed for initGame()

    function checkBulletCollisions() {
        const PLAYER_HITBOX = 32;

        // Process both server bullets and local bullets
        const allBullets = [...gameState.bullets, ...gameState.localBullets];

        gameState.bullets = allBullets.filter(bullet => {
            if (Date.now() - bullet.created_at > 2000) return false;

            // Check collision with all players (including bots)
            for (const [id, targetPlayer] of Object.entries(gameState.players)) {
                // Skip if:
                // - Target is the shooter
                // - Target is already dead
                // - Target is invulnerable (due to shield powerup)
                if (id === bullet.shooter || targetPlayer.health <= 0 || targetPlayer.isInvulnerable) continue;

                const dx = targetPlayer.x + PLAYER_SIZE / 2 - bullet.x;
                const dy = targetPlayer.y + PLAYER_SIZE / 2 - bullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < PLAYER_HITBOX) {
                    console.log('Hit detected:', {
                        targetId: id,
                        isBot: id.startsWith('bot_'),
                        damage: bullet.damage,
                        shooter: bullet.shooter
                    });

                    createHitEffect(bullet.x, bullet.y);

                    socket.emit('player_hit', {
                        damage: bullet.damage,
                        shooter: bullet.shooter,
                        target_id: id,
                        weapon: bullet.weapon,
                        is_bot: id.startsWith('bot_')
                    });

                    // Apply immediate visual feedback
                    if (targetPlayer) {
                        targetPlayer.health = Math.max(0, targetPlayer.health - bullet.damage);
                        createHitEffect(targetPlayer.x + PLAYER_SIZE / 2, targetPlayer.y + PLAYER_SIZE / 2);
                    }
                    return false;
                }
            }

            // Check collision with local player
            if (bullet.shooter !== socket.id && player.health > 0 && !player.isInvulnerable) {
                const dx = player.x + PLAYER_SIZE / 2 - bullet.x;
                const dy = player.y + PLAYER_SIZE / 2 - bullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < PLAYER_HITBOX) {
                    console.log('Hit detected on local player:', {
                        damage: bullet.damage,
                        shooterId: bullet.shooter,
                        currentHealth: player.health
                    });

                    // Add hit effect
                    createHitEffect(bullet.x, bullet.y);

                    // Emit hit event to server
                    socket.emit('player_hit', {
                        damage: bullet.damage,
                        shooter: bullet.shooter,
                        target_id: socket.id,
                        weapon: bullet.weapon
                    });

                    // Apply damage locally for immediate feedback
                    player.health = Math.max(0, player.health - bullet.damage);
                    updateUI();

                    return false;
                }
            }

            // Update bullet position
            bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
            bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;

            // Keep bullet in bounds
            return bullet.x >= 0 && bullet.x <= map.width * tileSize &&
                   bullet.y >= 0 && bullet.y <= map.height * tileSize;
        });
    }

    function createHitEffect(x, y) {
        const particles = [];
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i;
            particles.push({
                x: x,
                y: y,
                dx: Math.cos(angle) * 2,
                dy: Math.sin(angle) * 2,
                life: 20
            });
        }

        // Update and draw particles
        function updateParticles() {
            particles.forEach(p => {
                p.x += p.dx;
                p.y += p.dy;
                p.life--;

                if (p.life > 0) {
                    const screenX = p.x - camera.x;
                    const screenY = p.y - camera.y;
                    ctx.fillStyle = `rgba(255, 255, 0, ${p.life / 20})`;
                    ctx.fillRect(screenX - 2, screenY - 2, 4, 4);
                }
            });

            if (particles.some(p => p.life > 0)) {
                requestAnimationFrame(updateParticles);
            }
        }

        updateParticles();
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

    function drawBullet(bullet) {
        const screenX = bullet.x - camera.x;
        const screenY = bullet.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(bullet.angle);

        // Make bullets more visible with glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffff00';

        // Larger, more visible bullet
        ctx.fillStyle = '#fff700';
        ctx.fillRect(-6, -3, 12, 6);

        // Add bright center
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -2, 8, 4);

        ctx.restore();
    }

    // Add powerup spawning function after the createChatUI function
    function spawnPowerup() {
        const types = ['speed', 'shield', 'damage'];
        const type = types[Math.floor(Math.random() * types.length)];
        const powerup = {
            type: type,
            x: Math.random() * (map.width * tileSize - 32),
            y: Math.random() * (map.height * tileSize - 32),
            createdAt: Date.now()
        };
        gameState.powerups.push(powerup);
        return powerup;
    }

    // Add powerup collection check in the update function
    function checkPowerupCollisions() {
        const PICKUP_RADIUS = 20;
        gameState.powerups = gameState.powerups.filter(powerup => {
            const dx = player.x + PLAYER_SIZE / 2 - (powerup.x + 16);
            const dy = player.y + PLAYER_SIZE / 2 - (powerup.y + 16);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < PICKUP_RADIUS) {
                activatePowerup(powerup.type);
                return false;
            }
            return true;
        });
    }

    // Add powerup activation function
    function activatePowerup(type) {
        const powerup = POWERUPS[type];
        const now = Date.now();

        // Create visual effect
        const effect = document.createElement('div');
        effect.className = 'powerup-effect';
        effect.style.cssText = `
        position: absolute;
        left: ${player.x - camera.x}px;
        top: ${player.y - camera.y}px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        animation: pulse 0.5s ease-out;
        background: ${type === 'speed' ? '#4287f5' : type === 'shield' ? '#42f5a1' : '#f54242'};
    `;
        document.body.appendChild(effect);
        setTimeout(() => effect.remove(), 500);

        // Deactivate existing powerup of same type if active
        if (gameState.activePowerups[type]) {
            clearTimeout(gameState.activePowerups[type].timeoutId);
        }

        // Apply powerup effect
        switch (type) {
            case 'speed':
                player.speedMultiplier = powerup.multiplier;
                break;
            case 'shield':
                player.isInvulnerable = true;
                break;
            case 'damage':
                player.damageMultiplier = powerup.multiplier;
                break;
        }

        // Set deactivation timeout
        const timeoutId = setTimeout(() => {
            deactivatePowerup(type);
        }, powerup.duration);

        gameState.activePowerups[type] = {
            activatedAt: now,
            timeoutId: timeoutId
        };

        // Schedule next powerup spawn
        setTimeout(spawnPowerup, powerup.respawnTime);
    }

    // Add powerup deactivation function
    function deactivatePowerup(type) {
        switch (type) {
            case 'speed':
                player.speedMultiplier = 1;
                break;
            case 'shield':
                player.isInvulnerable = false;
                break;
            case 'damage':
                player.damageMultiplier = 1;
                break;
        }
        delete gameState.activePowerups[type];
    }

    // Initialize first powerup spawn when game starts
    //setTimeout(spawnPowerup, 5000); //Removed for initGame()

    // Main game loop
    function gameLoop(timestamp) {
        const deltaTime = timestamp - lastUpdate;
        lastUpdate = timestamp;

        update(deltaTime);
        draw();
        requestAnimationFrame(gameLoop);
    }

    // Initialize game
    function initGame() {
        lastUpdate = performance.now();
        // Spawn initial power-ups
        for (let i = 0; i < 3; i++) {
            spawnPowerup();
        }
        requestAnimationFrame(gameLoop);
    }

    // Start the game when socket connects
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('authenticate');
        initGame();
    });

});