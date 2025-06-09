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
        const select = document.createElement('select');
        select.className = 'sound-selector';
        
        // Добавляем опции для каждого звука
        for (let i = 1; i <= 10; i++) {
            const option = document.createElement('option');
            option.value = `sound${i}`;
            option.textContent = `Sound ${i}`;
            select.appendChild(option);
        }

        // Устанавливаем текущий выбранный звук
        select.value = this.settings.selectedSound || 'sound4';

        // Создаем контейнер для селектора и кнопки
        const container = document.createElement('div');
        container.className = 'sound-selector-container';

        // Создаем кнопку тестирования звука
        const testButton = document.createElement('button');
        testButton.textContent = 'Test';
        testButton.className = 'test-sound-button';
        testButton.style.cursor = 'pointer';
        testButton.style.pointerEvents = 'auto';
        testButton.style.userSelect = 'none';
        testButton.style.padding = '5px 10px';
        testButton.style.marginLeft = '10px';
        testButton.style.backgroundColor = '#4CAF50';
        testButton.style.color = 'white';
        testButton.style.border = 'none';
        testButton.style.borderRadius = '4px';

        // Привязываем обработчики событий
        const handleTestSound = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.log('Test button pressed');
            await this.playNotificationSound();
        };

        // Добавляем обработчики для разных типов устройств
        testButton.addEventListener('click', handleTestSound, { passive: false });
        testButton.addEventListener('touchstart', handleTestSound, { passive: false });

        // Обработчик изменения звука
        const handleSoundChange = async () => {
            this.settings.selectedSound = select.value;
            await this.saveSettings();
            // Воспроизводим выбранный звук
            await this.playNotificationSound();
        };

        select.addEventListener('change', handleSoundChange);

        container.appendChild(select);
        container.appendChild(testButton);

        return container;
    }

    async playNotificationSound() {
        console.log('Attempting to play notification sound...');
        
        if (!this.settings.soundEnabled) {
            console.log('Sound is disabled in settings');
            return;
        }

        try {
            // Убеждаемся, что AudioContext инициализирован
            if (!this.audioContext) {
                console.log('Creating new AudioContext...');
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Проверяем состояние AudioContext
            if (this.audioContext.state === 'suspended') {
                console.log('AudioContext suspended, attempting to resume...');
                await this.audioContext.resume();
            }

            const selectedSound = this.settings.selectedSound || 'sound4';
            console.log('Selected sound:', selectedSound);

            // Проверяем наличие буфера
            if (!this.soundBuffers[selectedSound]) {
                console.log('Sound buffer not found, attempting to load sounds...');
                await this.initSounds();
                if (!this.soundBuffers[selectedSound]) {
                    console.error('Failed to load sound buffer even after initialization');
                    return;
                }
            }

            // Создаем источник звука
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = this.soundBuffers[selectedSound];
            gainNode.gain.value = 0.5; // 50% громкости
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Добавляем обработку окончания воспроизведения
            source.onended = () => {
                console.log('Sound playback completed');
            };

            console.log('Starting sound playback...');
            source.start(0);
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }

    async initSounds() {
        console.log('Initializing sounds...');
        try {
            // Создаем AudioContext если его еще нет
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('AudioContext created');
            }

            // Инициализируем буферы для всех звуков
            this.soundBuffers = {};
            
            // Загружаем все звуки параллельно
            const loadPromises = [];
            for (let i = 1; i <= 10; i++) {
                const soundName = `sound${i}`;
                const soundUrl = `sounds/${soundName}.mp3`;
                
                loadPromises.push(
                    fetch(soundUrl)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            return response.arrayBuffer();
                        })
                        .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
                        .then(audioBuffer => {
                            this.soundBuffers[soundName] = audioBuffer;
                            console.log(`Loaded sound: ${soundName}`);
                        })
                        .catch(error => {
                            console.error(`Error loading sound ${soundName}:`, error);
                        })
                );
            }

            await Promise.all(loadPromises);
            console.log('All sounds initialized');
        } catch (error) {
            console.error('Error initializing sounds:', error);
        }
    }

    // ... rest of the class methods ...
} 
