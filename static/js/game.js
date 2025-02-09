// Game setup
let canvas, ctx, socket;

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

    // Game state
    let player = {
        x: 0,
        y: 0,
        velX: 0,
        velY: 0,
        rotation: 0,
        health: 100,
        score: 0,
        currentWeapon: 'pistol',
        lastShot: 0
    };

    let gameState = {
        players: {},
        bullets: []
    };

    // Mobile controls state
    let joystick = {
        active: false,
        baseX: 0,
        baseY: 0,
        stickX: 0,
        stickY: 0,
        deltaX: 0,
        deltaY: 0,
        base: document.querySelector('.joystick-base'),
        stick: document.querySelector('.joystick-stick')
    };

    // UI elements
    const healthBar = document.querySelector('.health-fill');
    const healthText = document.querySelector('.health-text');
    const ammoCounter = document.getElementById('ammoCounter');
    const joystickContainer = document.querySelector('.joystick-container');
    const shootButton = document.getElementById('shootButton');
    const reloadButton = document.getElementById('reloadButton');
    const minimap = document.getElementById('minimap');
    const minimapCtx = minimap ? minimap.getContext('2d') : null;

    // Set canvas size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
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

    canvas.addEventListener('mousedown', shoot);

    // Touch controls
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
        player.rotation = Math.atan2(mouseY - (player.y + PLAYER_SIZE/2), 
                                   mouseX - (player.x + PLAYER_SIZE/2));
    }

    function switchWeapon(weapon) {
        if (WEAPONS[weapon]) {
            player.currentWeapon = weapon;
            document.querySelectorAll('.weapon-slot').forEach((slot, index) => {
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

    function updateMinimap() {
        if (!minimapCtx) return;

        minimapCtx.clearRect(0, 0, 150, 150);

        // Draw map boundary
        minimapCtx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        minimapCtx.fillRect(0, 0, 150, 150);

        // Draw player
        const playerX = (player.x / canvas.width) * 150;
        const playerY = (player.y / canvas.height) * 150;
        minimapCtx.fillStyle = '#e74c3c';
        minimapCtx.fillRect(playerX - 2, playerY - 2, 4, 4);

        // Draw other players
        minimapCtx.fillStyle = '#3498db';
        Object.values(gameState.players).forEach(p => {
            const x = (p.x / canvas.width) * 150;
            const y = (p.y / canvas.height) * 150;
            minimapCtx.fillRect(x - 2, y - 2, 4, 4);
        });
    }

    function update() {
        const moveSpeed = keys['shift'] ? PLAYER_SPEED * 1.5 : PLAYER_SPEED;

        if (joystick.active) {
            const magnitude = Math.hypot(joystick.deltaX, joystick.deltaY);
            const normalizedSpeed = moveSpeed * (magnitude / 60);
            player.velX = (joystick.deltaX / magnitude) * normalizedSpeed;
            player.velY = (joystick.deltaY / magnitude) * normalizedSpeed;
        } else {
            if (keys['w']) player.velY = -moveSpeed;
            else if (keys['s']) player.velY = moveSpeed;
            else player.velY = 0;

            if (keys['a']) player.velX = -moveSpeed;
            else if (keys['d']) player.velX = moveSpeed;
            else player.velX = 0;

            if (player.velX !== 0 && player.velY !== 0) {
                player.velX *= 0.707;
                player.velY *= 0.707;
            }
        }

        player.x = Math.max(0, Math.min(canvas.width - PLAYER_SIZE, player.x + player.velX));
        player.y = Math.max(0, Math.min(canvas.height - PLAYER_SIZE, player.y + player.velY));

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

            // Draw username
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(p.username, p.x + PLAYER_SIZE/2, p.y - 10);
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
        gameState = state;
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

    // Initialize UI and start game
    updateUI();
    gameLoop();
});