// Menu system management
class MenuManager {
    constructor() {
        this.initializeSettings();
        this.bindEventListeners();
        this.initializeServerBrowser();
        this.initializeCharacterPreview();
    }

    initializeSettings() {
        // Initialize settings with default values or load from localStorage
        this.settings = {
            soundVolume: localStorage.getItem('soundVolume') || 50,
            musicVolume: localStorage.getItem('musicVolume') || 50,
            graphicsQuality: localStorage.getItem('graphicsQuality') || 'medium'
        };

        // Update UI to reflect current settings
        this.updateSettingsUI();
    }

    bindEventListeners() {
        // Settings controls
        const soundSlider = document.getElementById('soundVolume');
        const musicSlider = document.getElementById('musicVolume');
        const graphicsSelect = document.getElementById('graphicsQuality');

        if (soundSlider) {
            soundSlider.addEventListener('input', (e) => {
                this.updateSetting('soundVolume', e.target.value);
            });
        }

        if (musicSlider) {
            musicSlider.addEventListener('input', (e) => {
                this.updateSetting('musicVolume', e.target.value);
            });
        }

        if (graphicsSelect) {
            graphicsSelect.addEventListener('change', (e) => {
                this.updateSetting('graphicsQuality', e.target.value);
            });
        }

        // Modal events
        const modals = ['settingsModal', 'playModal', 'customizeModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.addEventListener('shown.bs.modal', () => {
                    if (modalId === 'settingsModal') {
                        this.updateSettingsUI();
                    } else if (modalId === 'customizeModal') {
                        this.updateCharacterPreview();
                    }
                });
            }
        });

        // Server browser refresh
        const refreshButton = document.querySelector('.server-browser .btn-refresh');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                this.refreshServerList();
            });
        }
        // Play button
        const playButton = document.querySelector('a[href*="game"]');
        if (playButton) {
            playButton.addEventListener('click', (e) => {
                this.handlePlayClick(e);
            });
        }
    }

    updateSetting(setting, value) {
        this.settings[setting] = value;
        localStorage.setItem(setting, value);
    }

    updateSettingsUI() {
        const soundSlider = document.getElementById('soundVolume');
        const musicSlider = document.getElementById('musicVolume');
        const graphicsSelect = document.getElementById('graphicsQuality');

        if (soundSlider) soundSlider.value = this.settings.soundVolume;
        if (musicSlider) musicSlider.value = this.settings.musicVolume;
        if (graphicsSelect) graphicsSelect.value = this.settings.graphicsQuality;
    }

    initializeServerBrowser() {
        this.refreshServerList();
        // Auto-refresh every 30 seconds
        setInterval(() => this.refreshServerList(), 30000);
    }

    refreshServerList() {
        const serverList = document.getElementById('serverList');
        if (!serverList) return;

        // Clear current list
        serverList.innerHTML = '';

        // Example server data - replace with actual server fetching
        const servers = [
            { name: 'US West #1', players: '24/50', ping: 45 },
            { name: 'US East #1', players: '31/50', ping: 60 },
            { name: 'Europe #1', players: '42/50', ping: 120 }
        ];

        servers.forEach(server => {
            const serverItem = document.createElement('div');
            serverItem.className = 'server-item';
            serverItem.innerHTML = `
                <div>
                    <strong>${server.name}</strong>
                    <span class="text-muted ms-2">${server.players}</span>
                </div>
                <div>
                    <span class="badge bg-success">${server.ping}ms</span>
                    <button class="btn btn-sm btn-primary ms-2">Join</button>
                </div>
            `;
            serverList.appendChild(serverItem);
        });
    }

    initializeCharacterPreview() {
        const canvas = document.getElementById('characterPreview');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const skins = ['cowboy', 'sheriff', 'bandit', 'native'];
        const skinSelector = document.getElementById('skinSelector');

        skins.forEach(skin => {
            const button = document.createElement('button');
            button.className = 'btn btn-outline-primary';
            button.textContent = skin.charAt(0).toUpperCase() + skin.slice(1);
            button.onclick = () => this.selectSkin(skin);
            skinSelector.appendChild(button);
        });

        // Draw initial character
        this.drawCharacter(ctx, 'cowboy');
    }

    selectSkin(skin) {
        const canvas = document.getElementById('characterPreview');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        this.drawCharacter(ctx, skin);
        localStorage.setItem('selectedSkin', skin);
    }

    drawCharacter(ctx, skin) {
        // Clear canvas
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw character placeholder
        ctx.fillStyle = '#666';
        ctx.fillRect(50, 50, 100, 100);

        // Draw some details based on skin
        ctx.fillStyle = this.getSkinColor(skin);
        ctx.fillRect(60, 60, 80, 80);
    }

    getSkinColor(skin) {
        const colors = {
            cowboy: '#8B4513',
            sheriff: '#DAA520',
            bandit: '#696969',
            native: '#CD853F'
        };
        return colors[skin] || '#8B4513';
    }

    handlePlayClick(e) {
        // Add any pre-game checks or loading animations here
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div class="mt-2">Loading game...</div>
        `;
        document.body.appendChild(loadingOverlay);

        // Remove overlay after transition to game page
        setTimeout(() => {
            loadingOverlay.remove();
        }, 1000);
    }
}

// Initialize menu system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const menuManager = new MenuManager();

    // Add smooth hover effects to buttons
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.05)';
            button.style.transition = 'transform 0.2s ease';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
        });
    });

    // Add dynamic background effects
    const mainMenu = document.querySelector('.card');
    if (mainMenu) {
        mainMenu.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.3)';
        mainMenu.style.transition = 'box-shadow 0.3s ease';

        mainMenu.addEventListener('mouseenter', () => {
            mainMenu.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.5)';
        });

        mainMenu.addEventListener('mouseleave', () => {
            mainMenu.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.3)';
        });
    }

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const settingsModal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
            if (settingsModal) {
                settingsModal.hide();
            }
        }
    });
});

// Party system
function createParty() {
    const partyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    alert(`Party Created! Share this code with friends: ${partyCode}`);
    // Here you would normally send this to the server and redirect to a party lobby
}

// Add loading overlay style
const style = document.createElement('style');
style.textContent = `
    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: white;
        z-index: 9999;
    }
    .btn {
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .btn:hover {
        box-shadow: 0 0 15px rgba(var(--bs-primary-rgb), 0.5);
    }

    .card {
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
`;
document.head.appendChild(style);