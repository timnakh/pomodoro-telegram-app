class PomodoroTimer {
    constructor() {
        console.log("=== Constructor called ===");
        // Default settings
        this.defaultSettings = {
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            sessionsUntilLongBreak: 4,
            soundEnabled: true,
            autoStartBreaks: false,
            autoStartWork: false,
            selectedSound: 'sound4'
        };

        // Current settings
        this.settings = { ...this.defaultSettings };
        
        // Timer state
        this.currentTime = this.settings.workDuration * 60;
        this.isRunning = false;
        this.timer = null;
        this.currentSession = 'work';
        this.sessionsCompleted = 0;
        this.lastUpdate = null;
        this.startTime = null;

        // Audio context and buffers
        this.audioContext = null;
        this.soundBuffers = {};
        
        // Initialize audio on first interaction
        const initAudio = () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.initSounds().catch(console.error);
                document.removeEventListener('click', initAudio);
                document.removeEventListener('touchstart', initAudio);
            }
        };
        document.addEventListener('click', initAudio);
        document.addEventListener('touchstart', initAudio);

        // Statistics
        this.stats = {
            today: { 
                pomodoros: 0, 
                time: 0, 
                date: new Date().toDateString(),
                completed: 0,
                interrupted: 0
            },
            week: Array(7).fill().map(() => ({ pomodoros: 0, time: 0 })),
            total: {
                pomodoros: 0,
                time: 0,
                sessions: 0,
                firstSession: null,
                bestDay: { date: null, pomodoros: 0 },
                currentStreak: 0,
                bestStreak: 0
            },
            achievements: {
                first: false,
                streak: false,
                master: false,
                efficient: false
            }
        };

        console.log('Constructor finished, calling init...');
        // Initialize immediately if we're in a browser environment
        if (typeof window !== 'undefined') {
            if (document.readyState === 'loading') {
                console.log('DOM not ready, waiting for DOMContentLoaded...');
                document.addEventListener('DOMContentLoaded', () => {
                    console.log('DOMContentLoaded fired, initializing...');
                    this.init();
                });
            } else {
                console.log('DOM already ready, initializing immediately...');
                this.init();
            }
        }
    }

    async init() {
        if (this.initialized) {
            console.log("Already initialized, skipping...");
            return;
        }

        console.log("Starting initialization...");
        try {
            // Mark as initialized first to prevent double initialization
            this.initialized = true;

            // Initialize Telegram Web App if available
            if (window.Telegram?.WebApp?.ready) {
                console.log("Initializing Telegram Web App...");
                window.Telegram.WebApp.ready();
            } else {
                console.log("Telegram Web App not available, running in browser mode...");
            }

            // Load settings and stats first
            await this.loadSettings();
            await this.loadStats();
            
            // Initialize UI components
            this.resetTimer();
            this.updateDisplay();
            this.updateSessionInfo();
            this.updateButton();
            
            // Initialize settings UI
            this.initializeSettings();
            this.updateStats();
            
            // Initialize sounds last since they're not critical
            await this.initSounds().catch(error => {
                console.log('Sound initialization failed, continuing without sounds:', error);
            });
            
            // Bind events after all UI is ready
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure DOM is ready
            this.bindEvents();
            
            console.log("Timer initialization completed successfully!");
        } catch (error) {
            console.error("Error during initialization:", error);
            this.initialized = false; // Reset initialized flag on error
            
            // Try to bind events even if other initialization failed
            try {
                this.bindEvents();
            } catch (e) {
                console.error("Failed to bind events:", e);
            }
        }
    }

    createSoundSelector() {
        // Сначала найдем все существующие селекторы и удалим их
        document.querySelectorAll('.setting-group.sound-selector').forEach(el => el.remove());
        document.querySelectorAll('#sound-select').forEach(el => el.closest('.setting-group')?.remove());

        // Найдем группу с чекбоксом включения звука
        const soundEnabledGroup = document.getElementById("sound-enabled")?.closest('.setting-group');
        if (!soundEnabledGroup) {
            console.error('Sound enabled checkbox group not found');
            return;
        }

        // Создаем новую группу для селектора звука
        const soundGroup = document.createElement('div');
        soundGroup.className = 'setting-group sound-selector';
        
        // Создаем метку
        const label = document.createElement('label');
        label.textContent = 'Звук уведомления';
        
        // Создаем селектор
        const select = document.createElement('select');
        select.id = 'sound-select';
        select.className = 'sound-select';
        
        // Добавляем опции звуков
        Object.entries(SOUNDS).forEach(([key, sound]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = sound.name;
            if (key === this.settings.selectedSound) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        // Создаем кнопку тестирования
        const testButton = document.createElement('button');
        testButton.id = 'test-sound';
        testButton.className = 'control-btn secondary';
        testButton.innerHTML = '<span class="btn-icon">🔊</span><span class="btn-text">Тест</span>';
        
        // Собираем группу
        soundGroup.appendChild(label);
        soundGroup.appendChild(select);
        soundGroup.appendChild(testButton);
        
        // Вставляем после группы с чекбоксом
        if (soundEnabledGroup.nextSibling) {
            soundEnabledGroup.parentNode.insertBefore(soundGroup, soundEnabledGroup.nextSibling);
        } else {
            soundEnabledGroup.parentNode.appendChild(soundGroup);
        }
        
        // Добавляем обработчик изменения
        select.addEventListener('change', (e) => {
            console.log('Sound changed to:', e.target.value);
            this.settings.selectedSound = e.target.value;
            this.saveSettings(); // Сохраняем изменения сразу
        });

        // Добавляем обработчик для кнопки тест
        const handleTestClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Test sound button clicked');
            this.playNotificationSound();
        };

        // Привязываем контекст this к обработчику
        const boundHandleTestClick = handleTestClick.bind(this);

        testButton.addEventListener('click', boundHandleTestClick);
        testButton.addEventListener('touchend', boundHandleTestClick);

        // Делаем кнопку явно кликабельной
        testButton.style.pointerEvents = 'auto';
        testButton.style.cursor = 'pointer';
        testButton.disabled = false;

        return select;
    }

    // ... rest of the class methods ...
} 
