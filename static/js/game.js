function executeAdminCommand(command) {
    const playerList = document.getElementById('playerList');
    const selectedPlayer = playerList.value;

    if (!selectedPlayer) {
        alert('Please select a player first');
        return;
    }

    switch (command) {
        case 'kill':
            socket.emit('admin_command', {
                command: 'instant_kill',
                target_id: selectedPlayer
            });
            break;
        case 'god':
            socket.emit('admin_command', {
                command: 'god_mode',
                target_id: selectedPlayer
            });
            break;
        case 'mod':
            socket.emit('admin_command', {
                command: 'make_moderator',
                target_id: selectedPlayer
            });
            break;
        case 'ban':
            const reason = prompt('Enter ban reason:');
            if (reason) {
                socket.emit('admin_command', {
                    command: 'ban_player',
                    target_id: selectedPlayer,
                    reason: reason
                });
            }
            break;
        case 'kick':
            const kickReason = prompt('Enter kick reason:');
            if (kickReason) {
                socket.emit('admin_command', {
                    command: 'kick',
                    target_id: selectedPlayer,
                    reason: kickReason
                });
            }
            break;
        case 'mute':
            const duration = prompt('Enter mute duration (minutes):', '5');
            if (duration) {
                socket.emit('admin_command', {
                    command: 'mute',
                    target_id: selectedPlayer,
                    duration: parseInt(duration)
                });
            }
            break;
    }
}

function toggleAdminPanel() {
    console.log('Toggling admin panel');
    const panel = document.querySelector('.admin-panel');
    if (panel) {
        panel.classList.toggle('active');
    }
}

function createAdminPanel() {
    console.log('Creating admin panel');

    // Don't create if it already exists
    if (document.querySelector('.admin-panel')) {
        console.log('Admin panel already exists');
        return;
    }

    // Create and inject styles first
    const style = document.createElement('style');
    style.textContent = `
        .admin-toggle {
            position: fixed;
            top: 20px;
            left: 20px;
            width: 40px;
            height: 40px;
            background: rgba(0, 0, 0, 0.8);
            border: none;
            border-radius: 10px;
            cursor: pointer;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            pointer-events: all;
        }

        .admin-panel {
            position: fixed;
            top: 20px;
            left: -200px;
            width: 200px;
            background: rgba(0, 0, 0, 0.8);
            padding: 15px;
            border-radius: 10px;
            transition: left 0.3s ease;
            z-index: 1999;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            pointer-events: all;
        }

        .admin-panel.active {
            left: 20px;
        }
    `;
    document.head.appendChild(style);
    console.log('Admin styles injected');

    // Create toggle button first (separate from panel)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'admin-toggle';
    toggleBtn.innerHTML = '<span class="action-icon">⚙️</span>';
    toggleBtn.addEventListener('click', function(e) {
        console.log('Toggle button clicked');
        e.preventDefault();
        e.stopPropagation();
        toggleAdminPanel();
    });
    document.body.appendChild(toggleBtn);
    console.log('Toggle button created');

    // Create panel
    const adminPanel = document.createElement('div');
    adminPanel.className = 'admin-panel';
    adminPanel.style.pointerEvents = 'all';

    // Add content to panel
    const playerList = document.createElement('select');
    playerList.id = 'playerList';
    playerList.className = 'form-select mb-2';
    playerList.innerHTML = '<option value="">Select Player</option>';
    adminPanel.appendChild(playerList);

    // Add buttons based on permissions
    if (gameState.isAdmin) {
        const adminButtons = [
            { text: 'Instant Kill', command: 'kill', class: 'btn-danger' },
            { text: 'Toggle God Mode', command: 'god', class: 'btn-warning' },
            { text: 'Toggle Moderator', command: 'mod', class: 'btn-info' },
            { text: 'Ban Player', command: 'ban', class: 'btn-danger' }
        ];

        adminButtons.forEach(btn => {
            const button = document.createElement('button');
            button.textContent = btn.text;
            button.className = `btn ${btn.class} mb-2 w-100`;
            button.onclick = () => executeAdminCommand(btn.command);
            adminPanel.appendChild(button);
        });
    }

    const modButtons = [
        { text: 'Kick Player', command: 'kick', class: 'btn-warning' },
        { text: 'Mute Player', command: 'mute', class: 'btn-secondary' }
    ];

    modButtons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.className = `btn ${btn.class} mb-2 w-100`;
        button.onclick = () => executeAdminCommand(btn.command);
        adminPanel.appendChild(button);
    });

    document.body.appendChild(adminPanel);
    console.log('Admin panel added to document');

    // Start updating player list
    setInterval(() => {
        socket.emit('get_player_info');
    }, 1000);
}

// Game setup
let canvas, ctx, socket;
let tileSize = 32;
let lastUpdate = 0;
const UPDATE_INTERVAL = 1000 / 60; // 60fps target
const NETWORK_UPDATE_INTERVAL = 50; // Send updates every 50ms
let lastNetworkUpdate = 0;
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

// Initialize game after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    ctx = canvas.getContext('2d');
    socket = io();

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

    let camera = {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
        followTarget: function(target, smooth = 0.1) {
            const targetX = target.x - this.width/2;
            const targetY = target.y - this.height/2;

            this.x += (targetX - this.x) * smooth;
            this.y += (targetY - this.y) * smooth;

            this.x = Math.max(0, Math.min(this.x, map.width * tileSize - this.width));
            this.y = Math.max(0, Math.min(this.y, map.height * tileSize - this.height));
        }
    };

    let gameState = {
        players: {},
        bullets: [],
        localBullets: [],
        scores: {},
        isAdmin: false,
        isModerator: false,
        chatMessages: []
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
            ctx.textAlign = 'center';
            ctx.fillText(p.username, screenX + PLAYER_SIZE/2, screenY - 20);

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
    });

    socket.on('game_state', (state) => {
        console.log('Received game state:', state);
        console.log('Admin status:', state.is_admin);

        gameState.players = state.players;
        gameState.bullets = state.bullets;
        gameState.scores = state.scores;
        gameState.chatMessages = state.chat_messages;

        if (!gameState.hasOwnProperty('isAdmin')) {
            console.log('Setting initial admin status:', state.is_admin);
            gameState.isAdmin = state.is_admin;
            gameState.isModerator = state.is_moderator;

            if (state.is_admin || state.is_moderator) {
                console.log('User has admin/mod privileges, creating panel');
                createAdminPanel();
            }
        }

        updateUI();
    });

    socket.on('player_info', (data) => {
        const playerList = document.getElementById('playerList');
        if (!playerList) {
            console.log('Player list element not found');
            return;
        }

        playerList.innerHTML = '<option value="">Select Player</option>';
        data.players.forEach(player => {
            if (player.id !== socket.id) {  // Don't include self
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = `${player.username} (HP: ${player.health})`;
                playerList.appendChild(option);
            }
        });
    });


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

    socket.on('muted', (data) => {
        alert(`You have been muted for ${data.duration} minutes`);
    });

    socket.on('kicked', (data) => {
        alert(`You have been kicked: ${data.reason}`);
        window.location.href = '/';
    });

    socket.on('moderator_status', (data) => {
        gameState.isModerator = data.is_moderator;
        if (data.is_moderator && !document.querySelector('.admin-panel')) {
            createAdminPanel();
        }
    });

    socket.on('god_mode_update', (data) => {
        if (data.enabled) {
            alert('God mode enabled');
        } else {
            alert('God mode disabled');
        }
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
        updateUI();
    });
    socket.on('banned', (data) => {
        alert(`You have been banned: ${data.reason}`);
        window.location.href = '/logout';
    });

    updateUI();
    requestAnimationFrame(gameLoop);
});

let joystick = {
    base: document.getElementById('joystickBase'),
    stick: document.getElementById('joystickStick'),
    active: false,
    baseX: 0,
    baseY: 0,
    deltaX: 0,
    deltaY: 0
};