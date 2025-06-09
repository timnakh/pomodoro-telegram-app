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

    initializeSettings() {
        // Get all settings inputs
        const workDurationInput = document.getElementById('work-duration');
        const shortBreakInput = document.getElementById('short-break-duration');
        const longBreakInput = document.getElementById('long-break-duration');
        const sessionsInput = document.getElementById('sessions-until-long-break');
        const soundEnabledInput = document.getElementById('sound-enabled');
        const autoStartBreaksInput = document.getElementById('auto-start-breaks');
        const autoStartWorkInput = document.getElementById('auto-start-work');
        const soundSelect = document.getElementById('sound-select');

        // Set initial values
        if (workDurationInput) workDurationInput.value = this.settings.workDuration;
        if (shortBreakInput) shortBreakInput.value = this.settings.shortBreakDuration;
        if (longBreakInput) longBreakInput.value = this.settings.longBreakDuration;
        if (sessionsInput) sessionsInput.value = this.settings.sessionsUntilLongBreak;
        if (soundEnabledInput) soundEnabledInput.checked = this.settings.soundEnabled;
        if (autoStartBreaksInput) autoStartBreaksInput.checked = this.settings.autoStartBreaks;
        if (autoStartWorkInput) autoStartWorkInput.checked = this.settings.autoStartWork;
        if (soundSelect) soundSelect.value = this.settings.selectedSound;

        // Add event listeners
        const inputs = [workDurationInput, shortBreakInput, longBreakInput, sessionsInput];
        inputs.forEach(input => {
            if (input) {
                input.addEventListener('change', () => {
                    const value = parseInt(input.value);
                    if (!isNaN(value) && value > 0) {
                        switch(input.id) {
                            case 'work-duration':
                                this.settings.workDuration = value;
                                break;
                            case 'short-break-duration':
                                this.settings.shortBreakDuration = value;
                                break;
                            case 'long-break-duration':
                                this.settings.longBreakDuration = value;
                                break;
                            case 'sessions-until-long-break':
                                this.settings.sessionsUntilLongBreak = value;
                                break;
                        }
                        this.saveSettings();
                        this.resetTimer();
                    }
                });
            }
        });

        // Add event listeners for checkboxes
        if (soundEnabledInput) {
            soundEnabledInput.addEventListener('change', () => {
                this.settings.soundEnabled = soundEnabledInput.checked;
                this.saveSettings();
            });
        }

        if (autoStartBreaksInput) {
            autoStartBreaksInput.addEventListener('change', () => {
                this.settings.autoStartBreaks = autoStartBreaksInput.checked;
                this.saveSettings();
            });
        }

        if (autoStartWorkInput) {
            autoStartWorkInput.addEventListener('change', () => {
                this.settings.autoStartWork = autoStartWorkInput.checked;
                this.saveSettings();
            });
        }

        if (soundSelect) {
            soundSelect.addEventListener('change', () => {
                this.settings.selectedSound = soundSelect.value;
                this.saveSettings();
                // Play selected sound as preview
                if (this.settings.soundEnabled) {
                    this.playNotificationSound();
                }
            });
        }
    }

    async initSounds() {
        console.log('Initializing sounds...');
        
        // Create audio elements for each sound
        const sounds = ['sound1', 'sound2', 'sound3', 'sound4', 'sound5', 
                       'sound6', 'sound7', 'sound8', 'sound9', 'sound10'];
                       
        for (const sound of sounds) {
            try {
                const audio = new Audio();
                audio.preload = 'auto';  // Предзагрузка звука
                audio.src = `sounds/${sound}.wav`;  // Используем .wav вместо .mp3
                this.soundBuffers[sound] = audio;
            } catch (error) {
                console.log(`Error loading sound ${sound}:`, error);
            }
        }
        
        console.log('All sounds initialized');
    }

    playNotificationSound() {
        if (!this.settings.soundEnabled) return;
        
        const sound = this.soundBuffers[this.settings.selectedSound];
        if (sound) {
            sound.currentTime = 0;  // Сбрасываем время воспроизведения
            sound.play().catch(error => {
                console.log('Error playing sound:', error);
            });
        }
    }

    bindEvents() {
        // Обработчики для основных кнопок управления таймером
        const handleClick = (e, action) => {
            e.preventDefault();
            e.stopPropagation();
            
            switch(action) {
                case 'start':
                    if (this.isRunning) {
                        this.pauseTimer();
                    } else {
                        this.startTimer();
                    }
                    break;
                case 'reset':
                    this.resetTimer();
                    break;
                case 'skip':
                    this.skipSession();
                    break;
            }
        };

        // Привязываем обработчики к кнопкам
        const startPauseBtn = document.getElementById('start-pause-btn');
        const resetBtn = document.getElementById('reset-btn');
        const skipBtn = document.getElementById('skip-btn');
        const testSoundBtn = document.getElementById('test-sound');

        if (startPauseBtn) {
            startPauseBtn.addEventListener('click', (e) => handleClick(e, 'start'));
            startPauseBtn.addEventListener('touchstart', (e) => handleClick(e, 'start'));
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => handleClick(e, 'reset'));
            resetBtn.addEventListener('touchstart', (e) => handleClick(e, 'reset'));
        }

        if (skipBtn) {
            skipBtn.addEventListener('click', (e) => handleClick(e, 'skip'));
            skipBtn.addEventListener('touchstart', (e) => handleClick(e, 'skip'));
        }

        // Добавляем обработчик для кнопки проверки звука
        if (testSoundBtn) {
            const handleTestSound = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.playNotificationSound();
            };
            testSoundBtn.addEventListener('click', handleTestSound);
            testSoundBtn.addEventListener('touchstart', handleTestSound);
        }

        // Обработчики для вкладок
        const handleTabClick = (e) => {
            const tab = e.target.closest('.nav-tab');
            if (!tab) return;

            // Убираем активный класс со всех вкладок
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

            // Добавляем активный класс выбранной вкладке
            tab.classList.add('active');

            // Показываем соответствующий контент
            const tabName = tab.dataset.tab;
            const tabContent = document.getElementById(`${tabName}-tab`);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        };

        // Привязываем обработчик к контейнеру вкладок
        const tabContainer = document.querySelector('.nav-tabs');
        if (tabContainer) {
            tabContainer.addEventListener('click', handleTabClick);
        }

        // Кнопки настроек
        const saveSettingsBtn = document.getElementById('save-settings');
        const resetSettingsBtn = document.getElementById('reset-settings');
        const resetStatsBtn = document.getElementById('reset-stats');

        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', e => handleClick(e, 'save'));
            saveSettingsBtn.addEventListener('touchstart', e => handleClick(e, 'save'));
        }

        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', e => handleClick(e, 'resetSettings'));
            resetSettingsBtn.addEventListener('touchstart', e => handleClick(e, 'resetSettings'));
        }

        if (resetStatsBtn) {
            resetStatsBtn.addEventListener('click', e => handleClick(e, 'resetStats'));
            resetStatsBtn.addEventListener('touchstart', e => handleClick(e, 'resetStats'));
        }

        // Кнопки периодов статистики
        const periodBtns = document.querySelectorAll('.period-btn');
        periodBtns.forEach(btn => {
            const handlePeriodClick = (e) => {
                e.preventDefault();
                if (e.type === 'touchstart') {
                    e.stopPropagation();
                }
                
                const period = btn.getAttribute('data-period');
                periodBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-period') === period));
                this.updateStats(period);
            };

            btn.addEventListener('click', handlePeriodClick);
            btn.addEventListener('touchstart', handlePeriodClick);
        });

        // Числовые инпуты
        const numberInputs = document.querySelectorAll('.number-input');
        numberInputs.forEach(container => {
            const input = container.querySelector('input');
            const decreaseBtn = container.querySelector('.decrease');
            const increaseBtn = container.querySelector('.increase');

            if (input && decreaseBtn && increaseBtn) {
                const handleDecrease = (e) => {
                    e.preventDefault();
                    if (e.type === 'touchstart') {
                        e.stopPropagation();
                    }
                    const min = parseInt(input.min) || 1;
                    input.value = Math.max(min, parseInt(input.value) - 1);
                    input.dispatchEvent(new Event('change'));
                };

                const handleIncrease = (e) => {
                    e.preventDefault();
                    if (e.type === 'touchstart') {
                        e.stopPropagation();
                    }
                    const max = parseInt(input.max) || 60;
                    input.value = Math.min(max, parseInt(input.value) + 1);
                    input.dispatchEvent(new Event('change'));
                };

                decreaseBtn.addEventListener('click', handleDecrease);
                decreaseBtn.addEventListener('touchstart', handleDecrease);
                increaseBtn.addEventListener('click', handleIncrease);
                increaseBtn.addEventListener('touchstart', handleIncrease);

                input.addEventListener('change', () => {
                    const settingName = input.id.replace(/-/g, '');
                    this.settings[settingName] = parseInt(input.value);
                });
            }
        });

        // Чекбоксы
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const settingName = checkbox.id.replace(/-/g, '');
                this.settings[settingName] = checkbox.checked;
            });
        });
    }

    async loadSettings() {
        try {
            // Пробуем загрузить из Telegram CloudStorage
            if (window.Telegram?.WebApp?.CloudStorage) {
                const cloudSettings = await window.Telegram.WebApp.CloudStorage.getItem('pomodoroSettings');
                if (cloudSettings) {
                    this.settings = { ...this.defaultSettings, ...JSON.parse(cloudSettings) };
                    console.log('Settings loaded from Telegram Cloud:', this.settings);
                    return;
                }
            }
            
            // Если нет CloudStorage или данных в нем, используем localStorage
            const savedSettings = localStorage.getItem('pomodoroSettings');
            if (savedSettings) {
                this.settings = { ...this.defaultSettings, ...JSON.parse(savedSettings) };
            }
            console.log('Settings loaded:', this.settings);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.settings = { ...this.defaultSettings };
        }
    }

    async saveSettings() {
        try {
            const settingsString = JSON.stringify(this.settings);
            
            // Сохраняем в Telegram CloudStorage
            if (window.Telegram?.WebApp?.CloudStorage) {
                await window.Telegram.WebApp.CloudStorage.setItem('pomodoroSettings', settingsString);
                console.log('Settings saved to Telegram Cloud');
            }
            
            // Дублируем в localStorage для офлайн доступа
            localStorage.setItem('pomodoroSettings', settingsString);
            console.log('Settings saved:', this.settings);
            this.showNotification('Настройки сохранены');
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('Ошибка при сохранении настроек');
        }
    }

    async loadStats() {
        try {
            // Пробуем загрузить из Telegram CloudStorage
            if (window.Telegram?.WebApp?.CloudStorage) {
                const cloudStats = await window.Telegram.WebApp.CloudStorage.getItem('pomodoroStats');
                if (cloudStats) {
                    this.stats = JSON.parse(cloudStats);
                    
                    // Проверяем, не начался ли новый день
                    const today = new Date().toDateString();
                    if (this.stats.today.date !== today) {
                        // Обновляем недельную статистику
                        const dayIndex = new Date().getDay();
                        this.stats.week[dayIndex] = { pomodoros: 0, time: 0 };
                        
                        // Сбрасываем дневную статистику
                        this.stats.today = {
                            pomodoros: 0,
                            time: 0,
                            date: today,
                            completed: 0,
                            interrupted: 0
                        };
                    }
                    
                    console.log('Stats loaded from Telegram Cloud:', this.stats);
                    return;
                }
            }
            
            // Если нет CloudStorage или данных в нем, используем localStorage
            const savedStats = localStorage.getItem('pomodoroStats');
            if (savedStats) {
                this.stats = JSON.parse(savedStats);
            }
            console.log('Stats loaded:', this.stats);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async saveStats() {
        try {
            const statsString = JSON.stringify(this.stats);
            
            // Сохраняем в Telegram CloudStorage
            if (window.Telegram?.WebApp?.CloudStorage) {
                await window.Telegram.WebApp.CloudStorage.setItem('pomodoroStats', statsString);
                console.log('Stats saved to Telegram Cloud');
            }
            
            // Дублируем в localStorage для офлайн доступа
            localStorage.setItem('pomodoroStats', statsString);
            console.log('Stats saved:', this.stats);
        } catch (error) {
            console.error('Error saving stats:', error);
        }
    }

    startTimer() {
        if (this.isRunning) return;
        
        console.log('Starting timer...');
        this.isRunning = true;
        this.startTime = Date.now() - ((this.settings.workDuration * 60) - this.currentTime) * 1000;
        this.lastUpdate = Date.now();
        
        this.timer = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.floor((now - this.lastUpdate) / 1000);
            
            if (elapsed >= 1) {
                this.currentTime = Math.max(0, this.currentTime - elapsed);
                this.lastUpdate = now;
                
                if (this.currentTime <= 0) {
                    this.completeSession();
                } else {
                    this.updateDisplay();
                }
            }
        }, 100);

        this.updateButton();
    }

    pauseTimer() {
        if (!this.isRunning) return;
        
        console.log('Pausing timer...');
        this.isRunning = false;
        clearInterval(this.timer);
        this.timer = null;
        this.updateButton();
    }

    resetTimer() {
        console.log('Resetting timer...');
        this.pauseTimer();
        this.currentTime = this.settings.workDuration * 60;
        this.updateDisplay();
    }

    skipSession() {
        console.log('Skipping session...');
        // Если пропускаем рабочую сессию, увеличиваем счетчик прерванных
        if (this.currentSession === 'work') {
            this.stats.today.interrupted++;
            this.saveStats();
            this.updateStats();
        }
        this.completeSession();
    }

    completeSession() {
        this.pauseTimer();
        
        // Воспроизводим звук уведомления
        if (this.settings.soundEnabled) {
            this.playNotificationSound();
        }
        
        // Обновляем статистику только если завершился рабочий блок
        if (this.currentSession === 'work') {
            // Увеличиваем счетчики
            this.stats.today.pomodoros++;
            this.stats.today.completed++;
            
            // Добавляем время фокуса (в минутах)
            this.stats.today.time += this.settings.workDuration;
            
            // Обновляем недельную статистику
            const dayIndex = new Date().getDay();
            this.stats.week[dayIndex].pomodoros++;
            this.stats.week[dayIndex].time += this.settings.workDuration;
            
            // Обновляем общую статистику
            this.stats.total.pomodoros++;
            this.stats.total.time += this.settings.workDuration;
            this.stats.total.sessions++;
            
            // Устанавливаем дату первой сессии, если еще не установлена
            if (!this.stats.total.firstSession) {
                this.stats.total.firstSession = new Date().toISOString();
            }
            
            // Проверяем достижения
            this.checkAchievements();
            
            // Сохраняем статистику
            this.saveStats();
            
            // Обновляем отображение статистики
            this.updateStats();
        }
        
        // Переключаем тип сессии
        if (this.currentSession === 'work') {
            this.sessionsCompleted++;
            if (this.sessionsCompleted >= this.settings.sessionsUntilLongBreak) {
                this.currentSession = 'longBreak';
                this.sessionsCompleted = 0;
            } else {
                this.currentSession = 'shortBreak';
            }
        } else {
            this.currentSession = 'work';
        }
        
        // Устанавливаем новое время
        switch (this.currentSession) {
            case 'work':
                this.currentTime = this.settings.workDuration * 60;
                break;
            case 'shortBreak':
                this.currentTime = this.settings.shortBreakDuration * 60;
                break;
            case 'longBreak':
                this.currentTime = this.settings.longBreakDuration * 60;
                break;
        }
        
        // Обновляем интерфейс
        this.updateDisplay();
        this.updateSessionInfo();
        
        // Автозапуск следующей сессии если включено
        if ((this.currentSession === 'work' && this.settings.autoStartWork) ||
            ((this.currentSession === 'shortBreak' || this.currentSession === 'longBreak') && this.settings.autoStartBreaks)) {
            this.startTimer();
        }
    }

    checkAchievements() {
        // Первый помидор
        if (!this.stats.achievements.first && this.stats.total.pomodoros === 1) {
            this.stats.achievements.first = true;
            this.showNotification('🎯 Достижение разблокировано: Первый помидор!');
        }

        // На волне (3 помидора подряд)
        if (!this.stats.achievements.streak && this.stats.today.pomodoros >= 3) {
            this.stats.achievements.streak = true;
            this.showNotification('🔥 Достижение разблокировано: На волне!');
        }

        // Мастер фокуса (10 помидоров за день)
        if (!this.stats.achievements.master && this.stats.today.pomodoros >= 10) {
            this.stats.achievements.master = true;
            this.showNotification('🎓 Достижение разблокировано: Мастер фокуса!');
        }

        // Эффективность (не прерывать 5 помидоров подряд)
        const efficiency = this.stats.today.completed / (this.stats.today.completed + this.stats.today.interrupted);
        if (!this.stats.achievements.efficient && efficiency >= 0.9 && this.stats.today.completed >= 5) {
            this.stats.achievements.efficient = true;
            this.showNotification('⚡ Достижение разблокировано: Эффективность!');
        }
    }

    updateDisplay() {
        const minutes = Math.floor(this.currentTime / 60);
        const seconds = this.currentTime % 60;
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) {
            timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Обновляем прогресс-кольцо
        const progressRing = document.querySelector('.progress-ring-fill');
        if (progressRing) {
            let totalTime;
            switch (this.currentSession) {
                case 'work':
                    totalTime = this.settings.workDuration * 60;
                    break;
                case 'shortBreak':
                    totalTime = this.settings.shortBreakDuration * 60;
                    break;
                case 'longBreak':
                    totalTime = this.settings.longBreakDuration * 60;
                    break;
            }
            
            const progress = (this.currentTime / totalTime);
            const circumference = 816; // 2 * π * r, где r = 130
            const offset = circumference * (1 - progress);
            progressRing.style.strokeDashoffset = offset;
        }
    }

    updateButton() {
        const button = document.getElementById('start-pause-btn');
        if (button) {
            const icon = button.querySelector('.btn-icon');
            const text = button.querySelector('.btn-text');
            
            if (this.isRunning) {
                icon.textContent = '⏸️';
                text.textContent = 'Пауза';
            } else {
                icon.textContent = '▶️';
                text.textContent = 'Начать';
            }
        }
    }

    updateSessionInfo() {
        const sessionType = document.getElementById('session-type');
        const sessionCount = document.getElementById('session-count');
        
        if (sessionType) {
            switch (this.currentSession) {
                case 'work':
                    sessionType.textContent = 'Рабочий блок';
                    break;
                case 'shortBreak':
                    sessionType.textContent = 'Короткий перерыв';
                    break;
                case 'longBreak':
                    sessionType.textContent = 'Длинный перерыв';
                    break;
            }
        }
        
        if (sessionCount) {
            sessionCount.textContent = `${this.sessionsCompleted + 1}/${this.settings.sessionsUntilLongBreak}`;
        }
    }

    showNotification(message) {
        const notification = document.getElementById('notification');
        const notificationText = document.getElementById('notification-text');
        
        if (notification && notificationText) {
            notificationText.textContent = message;
            notification.classList.remove('hidden');
            notification.classList.add('show');
            
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                    notification.classList.add('hidden');
                }, 300);
            }, 3000);
        }
    }

    updateStats() {
        // Обновляем основные показатели
        const periodPomodoros = document.getElementById('period-pomodoros');
        const periodTime = document.getElementById('period-time');
        const periodStreak = document.getElementById('period-streak');
        const periodEfficiency = document.getElementById('period-efficiency');

        if (periodPomodoros) {
            periodPomodoros.textContent = this.stats.today.pomodoros;
        }

        if (periodTime) {
            periodTime.textContent = this.stats.today.time;
        }

        if (periodStreak) {
            periodStreak.textContent = this.stats.total.currentStreak;
        }

        if (periodEfficiency) {
            const total = this.stats.today.completed + this.stats.today.interrupted;
            const efficiency = total > 0 ? Math.round((this.stats.today.completed / total) * 100) : 0;
            periodEfficiency.textContent = efficiency + '%';
        }

        // Обновляем график активности
        const weeklyChart = document.getElementById('weekly-chart');
        if (weeklyChart) {
            const bars = weeklyChart.querySelectorAll('.chart-bar');
            const maxPomodoros = Math.max(...this.stats.week.map(day => day.pomodoros));
            
            bars.forEach((bar, index) => {
                const height = maxPomodoros > 0 ? (this.stats.week[index].pomodoros / maxPomodoros) * 100 : 0;
                bar.style.height = `${height}%`;
                bar.title = `${this.stats.week[index].pomodoros} помидоров`;
            });
        }

        // Обновляем детальную статистику
        const avgSessionTime = document.getElementById('avg-session-time');
        const bestDay = document.getElementById('best-day');
        const totalSessions = document.getElementById('total-sessions');
        const firstSession = document.getElementById('first-session');

        if (avgSessionTime) {
            const avg = this.stats.total.sessions > 0 
                ? Math.round(this.stats.total.time / this.stats.total.sessions) 
                : this.settings.workDuration;
            avgSessionTime.textContent = `${avg} мин`;
        }

        if (bestDay && this.stats.total.bestDay.date) {
            const date = new Date(this.stats.total.bestDay.date);
            bestDay.textContent = `${date.toLocaleDateString()} (${this.stats.total.bestDay.pomodoros} помидоров)`;
        }

        if (totalSessions) {
            totalSessions.textContent = this.stats.total.sessions;
        }

        if (firstSession && this.stats.total.firstSession) {
            const date = new Date(this.stats.total.firstSession);
            firstSession.textContent = date.toLocaleDateString();
        }

        // Обновляем достижения
        const achievementList = document.getElementById('achievement-list');
        if (achievementList) {
            const achievements = achievementList.querySelectorAll('[data-achievement]');
            achievements.forEach(achievement => {
                const type = achievement.dataset.achievement;
                if (this.stats.achievements[type]) {
                    achievement.classList.remove('locked');
                    achievement.classList.add('unlocked');
                }
            });
        }
    }
}

// Создаем и инициализируем таймер
document.addEventListener('DOMContentLoaded', () => {
    const timer = new PomodoroTimer();
    // Сохраняем экземпляр таймера глобально для отладки
    window.pomodoroTimer = timer;
}); 
