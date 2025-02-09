// Menu system management
class MenuManager {
    constructor() {
        this.initializeSettings();
        this.bindEventListeners();
    }

    initializeSettings() {
        // Initialize settings with default values or load from localStorage
        this.settings = {
            soundVolume: localStorage.getItem('soundVolume') || 50,
            musicVolume: localStorage.getItem('musicVolume') || 50
        };

        // Update UI to reflect current settings
        this.updateSettingsUI();
    }

    bindEventListeners() {
        // Settings sliders
        const soundSlider = document.querySelector('input[type="range"]:nth-of-type(1)');
        const musicSlider = document.querySelector('input[type="range"]:nth-of-type(2)');

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

        // Modal events
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.addEventListener('shown.bs.modal', () => {
                this.updateSettingsUI();
            });

            settingsModal.addEventListener('hidden.bs.modal', () => {
                this.saveSettings();
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
        const soundSlider = document.querySelector('input[type="range"]:nth-of-type(1)');
        const musicSlider = document.querySelector('input[type="range"]:nth-of-type(2)');

        if (soundSlider) {
            soundSlider.value = this.settings.soundVolume;
        }
        if (musicSlider) {
            musicSlider.value = this.settings.musicVolume;
        }
    }

    saveSettings() {
        Object.entries(this.settings).forEach(([key, value]) => {
            localStorage.setItem(key, value);
        });
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

// Add any required CSS dynamically
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
