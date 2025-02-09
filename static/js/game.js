let gameState = {
    players: {},
    bullets: [],
    scores: {},
    isAdmin: false,
    isModerator: false,
    chatMessages: []
};

function toggleAdminPanel() {
    const adminPanel = document.querySelector('.admin-panel');
    if (adminPanel) {
        adminPanel.classList.toggle('active');
    }
}

// Admin UI and commands
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

    // Add additional data for specific commands
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

// Create admin panel UI
function createAdminPanel() {
    const adminPanel = document.querySelector('.admin-panel');
    if (!adminPanel || (!gameState.isAdmin && !gameState.isModerator)) return;

    // Update player list periodically
    setInterval(() => {
        socket.emit('get_player_info');
    }, 1000);

    socket.on('player_info', (data) => {
        const playerList = document.getElementById('playerList');
        if (!playerList) return;

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

    // Add buttons based on permissions
    if (gameState.isAdmin) {
        const killButton = document.createElement('button');
        killButton.textContent = 'Instant Kill';
        killButton.className = 'btn btn-danger mb-2 w-100';
        killButton.onclick = () => executeAdminCommand('kill');
        adminPanel.appendChild(killButton);

        const godModeButton = document.createElement('button');
        godModeButton.textContent = 'Toggle God Mode';
        godModeButton.className = 'btn btn-warning mb-2 w-100';
        godModeButton.onclick = () => executeAdminCommand('god');
        adminPanel.appendChild(godModeButton);

        const modButton = document.createElement('button');
        modButton.textContent = 'Toggle Moderator';
        modButton.className = 'btn btn-info mb-2 w-100';
        modButton.onclick = () => executeAdminCommand('mod');
        adminPanel.appendChild(modButton);

        const banButton = document.createElement('button');
        banButton.textContent = 'Ban Player';
        banButton.className = 'btn btn-danger mb-2 w-100';
        banButton.onclick = () => executeAdminCommand('ban');
        adminPanel.appendChild(banButton);
    }

    // Buttons for both admins and moderators
    const kickButton = document.createElement('button');
    kickButton.textContent = 'Kick Player';
    kickButton.className = 'btn btn-warning mb-2 w-100';
    kickButton.onclick = () => executeAdminCommand('kick');
    adminPanel.appendChild(kickButton);

    const muteButton = document.createElement('button');
    muteButton.textContent = 'Mute Player';
    muteButton.className = 'btn btn-secondary mb-2 w-100';
    muteButton.onclick = () => executeAdminCommand('mute');
    adminPanel.appendChild(muteButton);

    const playerList = document.createElement('select');
    playerList.id = 'playerList';
    playerList.className = 'form-select mb-2';
    playerList.addEventListener('change', (e) => {
        selectedTarget = e.target.value;
    });
    adminPanel.insertBefore(playerList, adminPanel.firstChild);
}

// Socket event handlers for admin panel
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

    // Create admin panel if admin/moderator and panel doesn't exist
    if ((state.is_admin || state.is_moderator) && !document.querySelector('.admin-panel.active')) {
        createAdminPanel();
    }
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


//Existing code from original file.  No changes needed.
socket.on('game_state', (state) => {
    gameState.players = state.players;
    gameState.bullets = state.bullets.map(b => new Bullet(
        b.x, b.y, b.angle, BULLET_SPEED, b.damage, b.weapon, b.shooter
    ));
    gameState.scores = state.scores;
    gameState.isAdmin = state.is_admin;
    gameState.isModerator = state.is_moderator;

    // Create admin panel if admin and panel doesn't exist
    if ((state.is_admin || state.is_moderator) && !document.querySelector('.admin-panel.active')) {
        createAdminPanel();
    }

    // Update UI to reflect new game state
    updateUI();
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