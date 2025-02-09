// Game setup and global variables
let canvas, ctx, socket;
let tileSize = 32;
let lastUpdate = 0;
const UPDATE_INTERVAL = 1000 / 60; // 60fps target
const NETWORK_UPDATE_INTERVAL = 50; // Send updates every 50ms
let lastNetworkUpdate = 0;
let camera; // Define camera globally

// Initialize gameState globally
let gameState = {
    players: {},
    bullets: [],
    localBullets: [],
    scores: {},
    isAdmin: false,
    isModerator: false,
    chatMessages: [],
    userId: null,  // Store the current user's ID
    adminIds: new Set()  // Store admin user IDs
};

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

// Game constants
const PLAYER_SIZE = 32;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 15;
const WEAPONS = {
    pistol: { damage: 15, fireRate: 400, spread: 0.1, ammo: 30, maxAmmo: 30 },
    shotgun: { damage: 8, fireRate: 800, spread: 0.3, pellets: 5, ammo: 10, maxAmmo: 10 },
    smg: { damage: 10, fireRate: 150, spread: 0.15, ammo: 45, maxAmmo: 45 },
    knife: { damage: 35, fireRate: 500, range: 50 }
};

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

    // Initialize socket
    socket = io();

    // Setup canvas resize handling
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (camera) {
            camera.width = canvas.width;
            camera.height = canvas.height;
        }
    }

    // Initialize camera with canvas dimensions
    camera = {
        x: 0,
        y: 0,
        width: window.innerWidth, // Use window dimensions initially
        height: window.innerHeight,
        followTarget: function(target, smooth = 0.1) {
            const targetX = target.x - this.width/2;
            const targetY = target.y - this.height/2;

            this.x += (targetX - this.x) * smooth;
            this.y += (targetY - this.y) * smooth;

            this.x = Math.max(0, Math.min(this.x, map.width * tileSize - this.width));
            this.y = Math.max(0, Math.min(this.y, map.height * tileSize - this.height));
        }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial resize

    // Create chat UI function
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
            }
            .chat-input {
                width: 100%;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                padding: 5px 10px;
                color: white;
                border-radius: 3px;
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

        return { chatMessages, chatInput };
    }

    // Create command line interface
    function createCommandLine() {
        const cmdContainer = document.createElement('div');
        cmdContainer.className = 'command-line';
        cmdContainer.style.display = 'none';
        cmdContainer.innerHTML = `
            <div class="command-input-container">
                <span class="command-prompt">/</span>
                <input type="text" class="command-input" placeholder="Enter command...">
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
                color: rgba(255, 255, 255, 0.5);
            }
        `;
        document.head.appendChild(style);

        // Set up command input handling
        cmdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && cmdInput.value.trim()) {
                const result = processCommand(cmdInput.value.trim());
                if (result) {
                    // Display command result
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
                    resultElement.textContent = result;
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

    // Command processing function
    function processCommand(command) {
        // Remove the leading slash if present
        const cmd = command.startsWith('/') ? command.slice(1).toLowerCase().trim() : command.toLowerCase().trim();

        if (cmd === 'help') {
            return `Available commands:
            /help - Show this help message
            /kill <player_id> - Admin only: Kill specified player
            /god <player_id> - Admin only: Toggle god mode for player
            /kick <player_id> - Mod only: Kick player from game
            /mute <player_id> <duration> - Mod only: Mute player
            /ban <player_id> - Admin only: Ban player`;
        }

        const [action, ...args] = cmd.split(' ');
        const targetId = args[0];  // First argument is now the player ID

        // Check if user is authenticated
        if (!gameState.userId) {
            return 'Error: You must be logged in to use commands.';
        }

        // Check permissions and execute command
        switch(action) {
            case 'kill':
            case 'god':
            case 'ban':
                if (!gameState.isAdmin) {
                    return 'You do not have permission to use this command.';
                }
                if (!targetId) {
                    return `${action} command requires a player ID.`;
                }
                executeAdminCommand(action, targetId);
                return `Executing ${action} command on player ${targetId}`;

            case 'kick':
            case 'mute':
                if (!gameState.isAdmin && !gameState.isModerator) {
                    return 'You do not have permission to use this command.';
                }
                if (!targetId) {
                    return `${action} command requires a player ID.`;
                }
                executeAdminCommand(action, targetId);
                return `Executing ${action} command on player ${targetId}`;

            default:
                return 'Unknown command. Type /help for available commands.';
        }
    }

    function executeAdminCommand(command, targetId) {
        // Check if target exists in players
        if (!gameState.players[targetId]) {
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
            resultElement.textContent = `Player ID '${targetId}' not found`;
            document.body.appendChild(resultElement);
            setTimeout(() => document.body.removeChild(resultElement), 3000);
            return;
        }

        switch(command) {
            case 'kill':
                socket.emit('admin_command', {
                    command: 'instant_kill',
                    target_id: targetId,
                    admin_id: gameState.userId
                });
                break;
            case 'god':
                socket.emit('admin_command', {
                    command: 'god_mode',
                    target_id: targetId,
                    admin_id: gameState.userId
                });
                break;
            case 'ban':
                const reason = prompt('Enter ban reason:');
                if (reason) {
                    socket.emit('admin_command', {
                        command: 'ban_player',
                        target_id: targetId,
                        admin_id: gameState.userId,
                        reason: reason
                    });
                }
                break;
            case 'kick':
                const kickReason = prompt('Enter kick reason:');
                if (kickReason) {
                    socket.emit('admin_command', {
                        command: 'kick',
                        target_id: targetId,
                        admin_id: gameState.userId,
                        reason: kickReason
                    });
                }
                break;
            case 'mute':
                const duration = prompt('Enter mute duration (minutes):', '5');
                if (duration) {
                    socket.emit('admin_command', {
                        command: 'mute',
                        target_id: targetId,
                        admin_id: gameState.userId,
                        duration: parseInt(duration)
                    });
                }
                break;
        }
    }

    // Map configuration
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
    map.generateTiles();

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
        currentWeapon: 'pistol',
        lastShot: 0
    };


    // UI elements
    const healthBar = document.querySelector('.health-fill');
    const healthText = document.querySelector('.health-text');
    const ammoCounter = document.getElementById('ammoCounter');
    const weaponSlots = document.querySelectorAll('.weapon-slot');
    const scoreboardElement = document.getElementById('scoreboard');
    const minimapElement = document.getElementById('minimap');
    const minimapCtx = minimapElement ? minimapElement.getContext('2d') : null;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        camera.width = canvas.width;
        camera.height = canvas.height;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const keys = {};
    let mouseX = 0, mouseY = 0;

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

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left + camera.x;
        mouseY = e.clientY - rect.top + camera.y;
        updateRotation();
    });

    canvas.addEventListener('mousedown', shoot);

    function updateRotation() {
        const dx = mouseX - (player.x + PLAYER_SIZE/2);
        const dy = mouseY - (player.y + PLAYER_SIZE/2);
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

    function shoot() {
        const now = Date.now();
        const weapon = WEAPONS[player.currentWeapon];

        if (now - player.lastShot < weapon.fireRate || weapon.ammo <= 0) return;
        player.lastShot = now;

        if (player.currentWeapon === 'knife') {
            socket.emit('player_melee', {
                x: player.x + PLAYER_SIZE/2,
                y: player.y + PLAYER_SIZE/2,
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

                // Calculate bullet spawn position from the center of the player
                const bulletX = player.x + PLAYER_SIZE/2;
                const bulletY = player.y + PLAYER_SIZE/2;

                const bullet = new Bullet(
                    bulletX,
                    bulletY,
                    angle,
                    BULLET_SPEED,
                    weapon.damage,
                    player.currentWeapon,
                    socket.id
                );
                gameState.localBullets.push(bullet);

                socket.emit('player_shoot', {
                    x: bulletX,
                    y: bulletY,
                    angle: angle,
                    damage: weapon.damage,
                    weapon: player.currentWeapon
                });
            }
            updateUI();
        }
    }

    function updateScoreboard() {
        if (!scoreboardElement) return;

        const scores = Object.entries(gameState.scores)
            .sort(([,a], [,b]) => b - a)
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
    }

    function checkBulletCollisions() {
        const PLAYER_HITBOX = 32; // Increased hitbox size for better hit detection

        // Update and filter bullets
        gameState.bullets = gameState.bullets.filter(bullet => {
            // Check for bullet lifetime first
            if (Date.now() - bullet.spawnTime > 2000) {
                return false;
            }

            // Check collision with current player
            if (bullet.shooter !== socket.id && player.health > 0) {
                const dx = player.x + PLAYER_SIZE/2 - bullet.x;
                const dy = player.y + PLAYER_SIZE/2 - bullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < PLAYER_HITBOX) {
                    socket.emit('player_hit', {
                        damage: bullet.damage,
                        shooter: bullet.shooter,
                        target_id: socket.id
                    });
                    return false; // Remove bullet after hit
                }
            }

            // Check collision with other players and bots
            for (const [id, otherPlayer] of Object.entries(gameState.players)) {
                if (id === bullet.shooter || otherPlayer.health <= 0 || id === socket.id) continue;

                const dx = otherPlayer.x + PLAYER_SIZE/2 - bullet.x;
                const dy = otherPlayer.y + PLAYER_SIZE/2 - bullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < PLAYER_HITBOX) {
                    socket.emit('player_hit', {
                        damage: bullet.damage,
                        shooter: bullet.shooter,
                        target_id: id
                    });
                    return false; // Remove bullet after hit
                }
            }

            // Update bullet position
            const speed = bullet.speed || BULLET_SPEED;
            bullet.x += Math.cos(bullet.angle) * speed;
            bullet.y += Math.sin(bullet.angle) * speed;

            // Keep bullet in game bounds
            const mapWidth = 50 * tileSize;
            const mapHeight = 50 * tileSize;
            if (bullet.x < 0 || bullet.x > mapWidth || bullet.y < 0 || bullet.y > mapHeight) {
                return false;
            }

            return true; // Keep bullet if no collision
        });

        // Clean up local bullets
        gameState.localBullets = gameState.localBullets.filter(bullet => {
            if (!bullet.active) return false;
            bullet.update(16.67);
            return bullet.active;
        });
    }

    function update(deltaTime) {
        if (player.health <= 0) return;

        // Update player movement
        player.velX = 0;
        player.velY = 0;

        if (keys['w']) player.velY = -PLAYER_SPEED;
        if (keys['s']) player.velY = PLAYER_SPEED;
        if (keys['a']) player.velX = -PLAYER_SPEED;
        if (keys['d']) player.velX = PLAYER_SPEED;

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

        // Update bullets with deltaTime
        gameState.localBullets = gameState.localBullets.filter(bullet => {
            bullet.update(deltaTime);
            return bullet.active;
        });

        // Check bullet collisions
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
        if (!bullet.active) return;
        const screenX = bullet.x - camera.x;
        const screenY = bullet.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(bullet.angle);

        // Draw bullet as a small elongated rectangle
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(-4, -1, 8, 2);

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
                ctx.translate(screenX + PLAYER_SIZE/2, screenY + PLAYER_SIZE/2);
                ctx.rotate(p.rotation);
                ctx.drawImage(assets.player, -PLAYER_SIZE/2, -PLAYER_SIZE/2, PLAYER_SIZE, PLAYER_SIZE);
                ctx.restore();
            }

            // Draw player name and health
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';            ctx.fillText(p.username, screenX + PLAYER_SIZE/2, screenY - 20);

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
            ctx.translate(player.x - camera.x + PLAYER_SIZE/2, player.y - camera.y + PLAYER_SIZE/2);
            ctx.rotate(player.rotation);
            ctx.drawImage(assets.player, -PLAYER_SIZE/2, -PLAYER_SIZE/2, PLAYER_SIZE, PLAYER_SIZE);
            ctx.restore();
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

            if (gameState.isAdmin) {
                createAdminPanel();
            }
        }
    });


    socket.on('game_state', (state) => {
        console.log('Received game state:', state);

        // Store all relevant state information
        gameState.players = state.players || {};
        gameState.bullets = state.bullets || [];
        gameState.scores = state.scores || {};
        gameState.chatMessages = state.chat_messages || [];

        // Update player list if admin panel exists
        const playerList = document.getElementById('playerList');
        if (playerList && Object.keys(gameState.players).length > 0) {
            updatePlayerList();
        }

        updateUI();
    });

    function updatePlayerList() {
        const playerList = document.getElementById('playerList');
        if (!playerList) return;

        playerList.innerHTML = '<option value="">Select Player</option>';
        Object.entries(gameState.players).forEach(([id, player]) => {
            if (id !== gameState.userId) {  // Don't include self
                const option = document.createElement('option');
                option.value = id;
                option.textContent = `${player.username} (ID: ${id})`;
                playerList.appendChild(option);
            }
        });
    }

    // Add command line toggle with ' key
    document.addEventListener('keydown', (e) => {
        if (e.key === "'") {
            e.preventDefault();
            const isVisible = cmdContainer.style.display === 'block';
            cmdContainer.style.display = isVisible ? 'none' :'block';
            if (!isVisible) {
                cmdInput.focus();
            }
        }
    });

    cmdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && cmdInput.value.trim()) {
            const result = processCommand(cmdInput.value.trim());
            // Create a temporary message element to show the command result
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
            resultElement.textContent = result;
            document.body.appendChild(resultElement);

            // Remove the result message after 3 seconds
            setTimeout(() => {
                document.body.removeChild(resultElement);
            }, 3000);

            cmdInput.value = '';
            cmdContainer.style.display = 'none';
        }
    });

    // Socket events for chat
    socket.on('chat_message', (data) => {
        if (!chatUI.chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';

        const timestamp = new Date().toLocaleTimeString();
        messageDiv.innerHTML = `
            <span class="chat-timestamp">[${timestamp}]</span>
            <span class="chat-username">${data.username}:</span>
            <span class="chat-text">${data.message}</span>
        `;

        chatUI.chatMessages.appendChild(messageDiv);
        chatUI.chatMessages.scrollTop = chatUI.chatMessages.scrollHeight;
    });

    // Update socket events for admin commands
    socket.on('admin_command_result', (data) => {
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
        resultElement.textContent = data.message;
        document.body.appendChild(resultElement);

        setTimeout(() => {
            document.body.removeChild(resultElement);
        }, 3000);
    });

    // Start the game loop
    requestAnimationFrame(gameLoop);
});

class Bullet {
    constructor(x, y, angle, speed, damage, weapon, shooter) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.weapon = weapon;
        this.shooter = shooter;
        this.lifetime = 2000;
        this.spawnTime = Date.now();
        this.active = true;
    }

    update(deltaTime) {
        if (!this.active) return;

        // Update position with delta time
        const movement = this.speed * (deltaTime / 16.67);
        this.x += Math.cos(this.angle) * movement;
        this.y += Math.sin(this.angle) * movement;

        // Check map bounds
        const mapWidth = 50 * tileSize;
        const mapHeight = 50 * tileSize;
        if (this.x < 0 || this.x > mapWidth || this.y < 0 || this.y > mapHeight) {
            this.active = false;
        }

        // Check lifetime
        if (Date.now() - this.spawnTime > this.lifetime) {
            this.active = false;
        }
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