// Game setup
let canvas, ctx, socket;
let tileSize = 32;
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

// Initialize game after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
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
            this.lifetime = 2000; // 2 seconds lifetime
            this.spawnTime = Date.now();
            this.active = true;
        }

        update() {
            if (!this.active) return;

            // Move bullet
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;

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
        currentWeapon: 'pistol',
        lastShot: 0
    };

    let camera = {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
        update: function() {
            this.x = player.x - canvas.width/2;
            this.y = player.y - canvas.height/2;
            this.x = Math.max(0, Math.min(this.x, map.width * tileSize - canvas.width));
            this.y = Math.max(0, Math.min(this.y, map.height * tileSize - canvas.height));
        }
    };

    let gameState = {
        players: {},
        bullets: [],
        localBullets: []
    };

    // UI elements
    const healthBar = document.querySelector('.health-fill');
    const healthText = document.querySelector('.health-text');
    const ammoCounter = document.getElementById('ammoCounter');
    const weaponSlots = document.querySelectorAll('.weapon-slot');
    const joystickContainer = document.querySelector('.joystick-container');
    const shootButton = document.getElementById('shootButton');
    const reloadButton = document.getElementById('reloadButton');
    const minimap = document.getElementById('minimap');
    const minimapCtx = minimap ? minimap.getContext('2d') : null;


    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
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

    if (joystickContainer) {
        joystickContainer.addEventListener('touchstart', handleJoystickStart, { passive: false });
        joystickContainer.addEventListener('touchmove', handleJoystickMove, { passive: false });
        joystickContainer.addEventListener('touchend', handleJoystickEnd);
    }

    if (shootButton) {
        shootButton.addEventListener('touchstart', shoot, { passive: false });
    }

    if (reloadButton) {
        reloadButton.addEventListener('click', reload);
    }

    function handleJoystickStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        if (!joystick.base) return;

        const rect = joystick.base.getBoundingClientRect();
        joystick.active = true;
        joystick.baseX = rect.left + rect.width / 2;
        joystick.baseY = rect.top + rect.height / 2;
        updateJoystickPosition(touch.clientX, touch.clientY);
    }

    function handleJoystickMove(e) {
        e.preventDefault();
        if (!joystick.active) return;
        const touch = e.touches[0];
        updateJoystickPosition(touch.clientX, touch.clientY);
    }

    function updateJoystickPosition(x, y) {
        if (!joystick.stick) return;

        const deltaX = x - joystick.baseX;
        const deltaY = y - joystick.baseY;
        const distance = Math.min(60, Math.hypot(deltaX, deltaY));
        const angle = Math.atan2(deltaY, deltaX);

        joystick.deltaX = Math.cos(angle) * distance;
        joystick.deltaY = Math.sin(angle) * distance;

        joystick.stick.style.transform = `translate(${joystick.deltaX}px, ${joystick.deltaY}px)`;
    }

    function handleJoystickEnd() {
        joystick.active = false;
        joystick.deltaX = 0;
        joystick.deltaY = 0;
        if (joystick.stick) {
            joystick.stick.style.transform = 'translate(0px, 0px)';
        }
    }

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

                // Create bullet with offset from player center
                const bulletX = player.x + PLAYER_SIZE/2 + Math.cos(angle) * PLAYER_SIZE;
                const bulletY = player.y + PLAYER_SIZE/2 + Math.sin(angle) * PLAYER_SIZE;

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
    }

    function update() {
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

        // Update player position
        player.x = Math.max(0, Math.min(map.width * tileSize - PLAYER_SIZE, player.x + player.velX));
        player.y = Math.max(0, Math.min(map.height * tileSize - PLAYER_SIZE, player.y + player.velY));

        // Update bullets
        gameState.localBullets = gameState.localBullets.filter(bullet => {
            bullet.update();
            return bullet.active;
        });

        // Send player update to server
        socket.emit('player_update', {
            x: player.x,
            y: player.y,
            rotation: player.rotation,
            health: player.health,
            weapon: player.currentWeapon
        });
        updateMinimap();
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        camera.update();

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

        // Draw bullets
        function drawBullet(bullet) {
            if (!bullet.active) return;
            const screenX = bullet.x - camera.x;
            const screenY = bullet.y - camera.y;

            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        gameState.localBullets.forEach(drawBullet);
        gameState.bullets.forEach(drawBullet);

        // Draw other players
        Object.values(gameState.players).forEach(p => {
            const screenX = p.x - camera.x;
            const screenY = p.y - camera.y;

            if (assets.player.complete) {
                ctx.save();
                ctx.translate(screenX + PLAYER_SIZE/2, screenY + PLAYER_SIZE/2);
                ctx.rotate(p.rotation);
                ctx.drawImage(assets.player, -PLAYER_SIZE/2, -PLAYER_SIZE/2, PLAYER_SIZE, PLAYER_SIZE);
                ctx.restore();
            }

            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(p.username, screenX + PLAYER_SIZE/2, screenY - 10);
        });

        // Draw player
        if (assets.player.complete) {
            ctx.save();
            ctx.translate(player.x - camera.x + PLAYER_SIZE/2, player.y - camera.y + PLAYER_SIZE/2);
            ctx.rotate(player.rotation);
            ctx.drawImage(assets.player, -PLAYER_SIZE/2, -PLAYER_SIZE/2, PLAYER_SIZE, PLAYER_SIZE);
            ctx.restore();
        }
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
        gameState.bullets = state.bullets.map(b => new Bullet(
            b.x, b.y, b.angle, BULLET_SPEED, b.damage, b.weapon, b.shooter
        ));
    });

    socket.on('player_hit', (data) => {
        player.health -= data.damage;
        updateUI();
        if (player.health <= 0) {
            socket.emit('player_died');
        }
    });
    socket.on('player_joined', (data) => {
        console.log(`${data.username} joined the game`);
    });

    socket.on('player_left', (data) => {
        console.log(`${data.username} left the game`);
    });

    function updateMinimap() {
        if (!minimapCtx) return;

        minimapCtx.clearRect(0, 0, 150, 150);

        // Draw map boundary
        minimapCtx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        minimapCtx.fillRect(0, 0, 150, 150);

        // Draw player
        const playerX = (player.x / (map.width * tileSize)) * 150;
        const playerY = (player.y / (map.height * tileSize)) * 150;
        minimapCtx.fillStyle = '#e74c3c';
        minimapCtx.fillRect(playerX - 2, playerY - 2, 4, 4);

        // Draw other players
        minimapCtx.fillStyle = '#3498db';
        Object.values(gameState.players).forEach(p => {
            const x = (p.x / (map.width * tileSize)) * 150;
            const y = (p.y / (map.height * tileSize)) * 150;
            minimapCtx.fillRect(x - 2, y - 2, 4, 4);
        });
    }

    updateUI();
    gameLoop();
});