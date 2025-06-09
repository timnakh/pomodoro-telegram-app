// @charset "UTF-8";

// Отладочные сообщения
console.log('=== Debug Info ===');
console.log('Script loading...');

console.log("Pomodoro Timer Loading...");

// Звуки для уведомлений
const SOUNDS = {
    'sound1': { 
        name: '🌪️ Волшебный вжух', 
        file: 'sound1.wav' 
    },
    'sound2': { 
        name: '🕹️ Геймовер', 
        file: 'sound2.wav' 
    },
    'sound3': { 
        name: '🎺 Фанфары', 
        file: 'sound3.wav' 
    },
    'sound4': { 
        name: '🎵 Весёлый свисток', 
        file: 'sound4.wav' 
    },
    'sound5': { 
        name: '✨ Правильный ответ', 
        file: 'sound5.wav' 
    },
    'sound6': { 
        name: '💫 Быстрый взмах', 
        file: 'sound6.wav' 
    },
    'sound7': { 
        name: '👾 Ретро-уведомление', 
        file: 'sound7.wav' 
    },
    'sound8': { 
        name: '🛸 Космический клик', 
        file: 'sound8.wav' 
    },
    'sound9': { 
        name: '🤧 Апчхи!', 
        file: 'sound9.wav' 
    },
    'sound10': { 
        name: '🚀 Запуск системы', 
        file: 'sound10.wav' 
    }
};

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

            // Очистка дублирующихся селекторов звука при старте
            const duplicateSelectors = document.querySelectorAll('.setting-group.sound-selector');
            duplicateSelectors.forEach((selector, index) => {
                if (index > 0) { // Оставляем только первый селектор
                    selector.remove();
                }
            });

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

    // Функции для работы с Telegram Storage
    async saveTelegramStorage(key, data) {
        try {
            if (window.Telegram?.WebApp?.CloudStorage?.setItem) {
                await window.Telegram.WebApp.CloudStorage.setItem(key, JSON.stringify(data));
            } else {
                // Fallback to localStorage if Telegram Storage is not available
                localStorage.setItem(key, JSON.stringify(data));
            }
        } catch (error) {
            console.log('Using localStorage fallback:', error);
            localStorage.setItem(key, JSON.stringify(data));
        }
    }

    async loadTelegramStorage(key, defaultValue = null) {
        try {
            if (window.Telegram?.WebApp?.CloudStorage?.getItem) {
                return new Promise((resolve) => {
                    window.Telegram.WebApp.CloudStorage.getItem(key, (error, value) => {
                        if (error || !value) {
                            // Try loading from localStorage as fallback
                            const localData = localStorage.getItem(key);
                            resolve(localData ? JSON.parse(localData) : defaultValue);
                        } else {
                            resolve(JSON.parse(value));
                        }
                    });
                });
            } else {
                // Fallback to localStorage if Telegram Storage is not available
                const localData = localStorage.getItem(key);
                return localData ? JSON.parse(localData) : defaultValue;
            }
        } catch (error) {
            console.log('Using localStorage fallback:', error);
            const localData = localStorage.getItem(key);
            return localData ? JSON.parse(localData) : defaultValue;
        }
    }

    async saveSettings() {
        const settings = {
            workDuration: parseInt(document.getElementById("work-duration").value),
            shortBreakDuration: parseInt(document.getElementById("short-break-duration").value),
            longBreakDuration: parseInt(document.getElementById("long-break-duration").value),
            sessionsUntilLongBreak: parseInt(document.getElementById("sessions-until-long-break").value),
            soundEnabled: document.getElementById("sound-enabled").checked,
            autoStartBreaks: document.getElementById("auto-start-breaks").checked,
            autoStartWork: document.getElementById("auto-start-work").checked,
            selectedSound: document.querySelector('#sound-select').value
        };

        if (this.validateSettings(settings)) {
            this.settings = settings;
            await this.saveTelegramStorage('pomodoro_settings', settings);
            this.showNotification("✅ Настройки сохранены");
            
            if (!this.isRunning) {
                this.resetTimer();
            }
        }
    }

    async loadSettings() {
        const settings = await this.loadTelegramStorage('pomodoro_settings', this.defaultSettings);
        this.settings = { ...this.defaultSettings, ...settings };
        this.initializeSettings();
    }

    bindEvents() {
        console.log("Binding events...");
        
        const bindButton = (id, handler) => {
            const btn = document.getElementById(id);
            if (!btn) {
                console.error(`Button ${id} not found!`);
                return;
            }
            
            console.log(`Binding events to ${id}`);
            
            // Remove existing event listeners if any
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Create a wrapper that prevents default and stops propagation
            const handleEvent = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`${id} clicked`);
                handler.call(this);
            };

            // Add both click and touch events
            newBtn.addEventListener('click', handleEvent);
            newBtn.addEventListener('touchend', handleEvent);
            
            // Ensure the button is enabled and clickable
            newBtn.disabled = false;
            newBtn.style.pointerEvents = 'auto';
            newBtn.style.cursor = 'pointer';
            
            console.log(`Successfully bound ${id}`);
            
            // Return the new button for potential future reference
            return newBtn;
        };

        // Bind timer control buttons
        const buttons = {
            start: bindButton("start-pause-btn", this.toggleTimer),
            reset: bindButton("reset-btn", this.resetTimer),
            skip: bindButton("skip-btn", this.skipSession),
            save: bindButton("save-settings", this.saveSettings),
            resetSettings: bindButton("reset-settings", this.resetSettings)
        };

        // Tab navigation
        const navTabs = document.querySelectorAll(".nav-tab");
        console.log("Found nav tabs:", navTabs.length);
        
        navTabs.forEach(tab => {
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
            
            const handleTabClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tabName = e.target.closest('.nav-tab').dataset.tab;
                console.log("Tab clicked:", tabName);
                this.switchTab(tabName);
            };

            newTab.addEventListener("click", handleTabClick);
            newTab.addEventListener("touchend", handleTabClick);
        });

        // Make all buttons explicitly clickable
        document.querySelectorAll('button, .control-btn').forEach(btn => {
            if (!btn.hasAttribute('data-bound')) {
                btn.disabled = false;
                btn.style.pointerEvents = 'auto';
                btn.style.cursor = 'pointer';
                btn.setAttribute('data-bound', 'true');
            }
        });
        
        console.log("Event binding completed");
    }

    switchTab(tabName) {
        document.querySelectorAll(".nav-tab").forEach(tab => tab.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
        const tabContent = document.getElementById(`${tabName}-tab`);
        if (tabContent) {
            tabContent.classList.add("active");
        }
    }

    initializeSettings() {
        // Set input values
        document.getElementById("work-duration").value = this.settings.workDuration;
        document.getElementById("short-break-duration").value = this.settings.shortBreakDuration;
        document.getElementById("long-break-duration").value = this.settings.longBreakDuration;
        document.getElementById("sessions-until-long-break").value = this.settings.sessionsUntilLongBreak;
        
        // Set checkbox states
        document.getElementById("sound-enabled").checked = this.settings.soundEnabled;
        document.getElementById("auto-start-breaks").checked = this.settings.autoStartBreaks;
        document.getElementById("auto-start-work").checked = this.settings.autoStartWork;

        // Создаем селектор звука только если его еще нет
        if (!document.getElementById('sound-select')) {
            this.createSoundSelector();
        } else {
            // Если селектор уже есть, просто обновляем его значение
            const soundSelect = document.getElementById('sound-select');
            if (soundSelect) {
                soundSelect.value = this.settings.selectedSound;
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
        });

        // Добавляем обработчик для кнопки тест
        testButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Test sound button clicked');
            this.playNotificationSound();
        });

        return select;
    }

    validateSettings(settings) {
        if (settings.workDuration < 1 || settings.workDuration > 60) {
            this.showNotification("⚠️ Длительность рабочего блока должна быть от 1 до 60 минут");
            return false;
        }
        if (settings.shortBreakDuration < 1 || settings.shortBreakDuration > 30) {
            this.showNotification("⚠️ Длительность короткого перерыва должна быть от 1 до 30 минут");
            return false;
        }
        if (settings.longBreakDuration < 5 || settings.longBreakDuration > 60) {
            this.showNotification("⚠️ Длительность длинного перерыва должна быть от 5 до 60 минут");
            return false;
        }
        if (settings.sessionsUntilLongBreak < 2 || settings.sessionsUntilLongBreak > 8) {
            this.showNotification("⚠️ Количество сессий должно быть от 2 до 8");
            return false;
        }
        return true;
    }

    resetSettings() {
        // Очищаем дублирующиеся селекторы перед сбросом
        const duplicateSelectors = document.querySelectorAll('.setting-group.sound-selector');
        duplicateSelectors.forEach(selector => selector.remove());

        this.settings = { ...this.defaultSettings };
        this.initializeSettings();
        this.saveToStorage();
        this.showNotification("🔄 Настройки сброшены к стандартным значениям");
        
        if (!this.isRunning) {
            this.resetTimer();
        }
    }

    toggleTimer() {
        if (this.isRunning) {
            this.pauseTimer();
        } else {
            this.startTimer();
        }
    }

    startTimer() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.updateButton();
            this.lastUpdate = performance.now();
            this.startTime = this.lastUpdate;
            
            const updateTimer = (currentTime) => {
                if (!this.isRunning) return;
                
                const elapsed = (currentTime - this.lastUpdate) / 1000;
                this.lastUpdate = currentTime;
                
                this.currentTime = Math.max(0, this.currentTime - elapsed);
                
                if (this.currentTime <= 0) {
                    this.completeSession();
                    return;
                }
                
                this.updateDisplay();
                this.updateProgress();
                requestAnimationFrame(updateTimer);
            };
            
            requestAnimationFrame(updateTimer);
        }
    }

    pauseTimer() {
        this.isRunning = false;
        clearInterval(this.timer);
        this.updateButton();
    }

    resetTimer() {
        this.pauseTimer();
        this.currentTime = this.getCurrentSessionDuration() * 60;
        this.updateDisplay();
        this.updateProgress(true);
    }

    skipSession() {
        if (this.currentSession === 'work' && this.isRunning) {
            this.updateSessionStats(false);
        }
        this.pauseTimer();
        this.completeSession();
    }

    completeSession() {
        this.pauseTimer();
        
        if (this.currentSession === 'work') {
            this.sessionsCompleted++;
            this.updateSessionStats(true);
        }

        if (this.settings.soundEnabled) {
            this.playNotificationSound();
        }

        this.showNotification(this.getSessionCompleteMessage());
        this.switchToNextSession();
        this.checkAchievements();

        if (this.shouldAutoStart()) {
            setTimeout(() => this.startTimer(), 3000);
        }

        // Сохраняем статистику в Telegram Storage
        this.saveStats();
    }

    switchToNextSession() {
        if (this.currentSession === 'work') {
            if (this.sessionsCompleted % this.settings.sessionsUntilLongBreak === 0) {
                this.currentSession = 'longBreak';
            } else {
                this.currentSession = 'shortBreak';
            }
        } else {
            this.currentSession = 'work';
        }

        this.currentTime = this.getCurrentSessionDuration() * 60;
        this.updateDisplay();
        this.updateProgress();
        this.updateSessionInfo();
    }

    getCurrentSessionDuration() {
        switch (this.currentSession) {
            case 'work': return this.settings.workDuration;
            case 'shortBreak': return this.settings.shortBreakDuration;
            case 'longBreak': return this.settings.longBreakDuration;
            default: return this.settings.workDuration;
        }
    }

    shouldAutoStart() {
        return (this.currentSession === 'work' && this.settings.autoStartWork) ||
               ((this.currentSession === 'shortBreak' || this.currentSession === 'longBreak') && 
                this.settings.autoStartBreaks);
    }

    updateDisplay() {
        const minutes = Math.floor(this.currentTime / 60);
        const seconds = Math.floor(this.currentTime % 60);
        const display = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        document.getElementById("time-display").textContent = display;
        
        // Update the label text based on remaining time
        const timerLabel = document.querySelector('.timer-label');
        if (minutes === 0) {
            timerLabel.textContent = 'секунд осталось';
        } else {
            timerLabel.textContent = 'минут осталось';
        }
        
        this.updateSessionInfo();
    }

    updateSessionInfo() {
        document.getElementById("session-type").textContent = this.getSessionTypeText();
        document.getElementById("session-count").textContent = 
            `${(this.sessionsCompleted % this.settings.sessionsUntilLongBreak) + 1}/${this.settings.sessionsUntilLongBreak}`;
    }

    updateProgress(isInitial = false) {
        const progressRing = document.querySelector('.progress-ring-fill');
        if (progressRing) {
            const radius = 130;
            const circumference = 2 * Math.PI * radius;
            const totalTime = this.getCurrentSessionDuration() * 60;
            const progress = (totalTime - this.currentTime) / totalTime;
            const offset = circumference - (progress * circumference);
            
            if (isInitial) {
                // Remove transition for initial state to prevent animation
                progressRing.style.transition = 'none';
                progressRing.style.strokeDashoffset = offset;
                progressRing.style.stroke = this.currentSession === 'work' ? '#667eea' : '#51cf66';
                
                // Force reflow
                progressRing.getBoundingClientRect();
                
                // Restore transition
                progressRing.style.transition = 'stroke-dashoffset 0.1s linear, stroke 0.3s ease';
            } else {
                progressRing.style.strokeDashoffset = offset;
                progressRing.style.stroke = this.currentSession === 'work' ? '#667eea' : '#51cf66';
            }
        }
    }

    updateButton() {
        const btn = document.getElementById("start-pause-btn");
        if (btn) {
            if (this.isRunning) {
                btn.innerHTML = '<span class="btn-icon">⏸️</span><span class="btn-text">Пауза</span>';
            } else {
                btn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">Начать</span>';
            }
        }
    }

    getSessionTypeText() {
        switch (this.currentSession) {
            case 'work': return 'Рабочий блок';
            case 'shortBreak': return 'Короткий перерыв';
            case 'longBreak': return 'Длинный перерыв';
            default: return 'Рабочий блок';
        }
    }

    getSessionCompleteMessage() {
        switch (this.currentSession) {
            case 'work': return '🍅 Рабочий блок завершен! Время отдохнуть.';
            case 'shortBreak': return '☕ Перерыв окончен! Пора работать.';
            case 'longBreak': return '🎉 Длинный перерыв завершен! Новый цикл начинается.';
            default: return '✅ Сессия завершена!';
        }
    }

    async playNotificationSound() {
        if (!this.settings.soundEnabled) {
            console.log('Sound is disabled in settings');
            return;
        }

        try {
            // Убеждаемся, что AudioContext инициализирован
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('AudioContext created on playback');
            }

            // Проверяем состояние AudioContext и пытаемся разблокировать его
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('AudioContext resumed');
            }

            // На мобильных устройствах может потребоваться дополнительная разблокировка
            if (this.audioContext.state !== 'running') {
                const unlockAudio = async () => {
                    await this.audioContext.resume();
                    document.body.removeEventListener('touchstart', unlockAudio);
                    document.body.removeEventListener('click', unlockAudio);
                };
                document.body.addEventListener('touchstart', unlockAudio);
                document.body.addEventListener('click', unlockAudio);
            }

            const selectedSound = this.settings.selectedSound || 'sound4';
            console.log('Playing sound:', selectedSound);

            if (!this.soundBuffers[selectedSound]) {
                console.error('Sound buffer not found for:', selectedSound);
                // Попробуем перезагрузить звуки
                await this.initSounds();
                if (!this.soundBuffers[selectedSound]) {
                    return;
                }
            }

            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = this.soundBuffers[selectedSound];
            gainNode.gain.value = 0.5; // 50% громкости
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            source.start(0);
            console.log('Sound playback started');
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }

    showNotification(message) {
        const notification = document.getElementById("notification");
        const notificationText = document.getElementById("notification-text");
        
        notificationText.textContent = message;
        notification.classList.remove("hidden");
        notification.classList.add("show");
        
        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => notification.classList.add("hidden"), 300);
        }, 3000);
    }

    saveToStorage() {
        localStorage.setItem('pomodoro_settings', JSON.stringify(this.settings));
    }

    async initSounds() {
        try {
            // Инициализируем аудио контекст при взаимодействии пользователя
            const initAudioContext = () => {
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    console.log('AudioContext initialized');
                }
                document.removeEventListener('click', initAudioContext);
            };
            document.addEventListener('click', initAudioContext);
            
            let loadedSounds = 0;
            const totalSounds = Object.keys(SOUNDS).length;
            
            // Загружаем все звуки
            for (const [key, sound] of Object.entries(SOUNDS)) {
                try {
                    console.log(`Loading sound: ${sound.file}`);
                    const response = await fetch(`sounds/${sound.file}`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    if (!this.audioContext) {
                        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    }
                    console.log(`Decoding audio data for ${sound.file}...`);
                    this.soundBuffers[key] = await this.audioContext.decodeAudioData(arrayBuffer);
                    console.log(`Sound loaded successfully: ${sound.file}`);
                    loadedSounds++;
                } catch (error) {
                    console.warn(`Error loading sound ${sound.file}:`, error);
                    // Create a silent buffer as fallback
                    if (!this.audioContext) {
                        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    }
                    const sampleRate = this.audioContext.sampleRate;
                    const buffer = this.audioContext.createBuffer(1, sampleRate * 0.5, sampleRate);
                    this.soundBuffers[key] = buffer;
                }
            }

            if (loadedSounds === 0) {
                console.warn('No sounds were loaded successfully. Sound notifications may not work.');
            } else if (loadedSounds < totalSounds) {
                console.warn(`Only ${loadedSounds} out of ${totalSounds} sounds were loaded successfully.`);
            } else {
                console.log('All sounds loaded successfully!');
            }
        } catch (error) {
            console.error('Error initializing audio system:', error);
        }
    }

    updateSessionStats(completed = true) {
        const today = new Date().toDateString();
        
        // Reset today's stats if it's a new day
        if (this.stats.today.date !== today) {
            this.stats.today = {
                pomodoros: 0,
                time: 0,
                date: today,
                completed: 0,
                interrupted: 0
            };
        }

        // Update today's stats
        if (completed) {
            this.stats.today.pomodoros++;
            this.stats.today.completed++;
            this.stats.today.time += this.settings.workDuration;
        } else {
            this.stats.today.interrupted++;
        }

        // Update weekly stats
        const dayOfWeek = new Date().getDay();
        const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Monday-based
        if (completed) {
            this.stats.week[adjustedDay].pomodoros++;
            this.stats.week[adjustedDay].time += this.settings.workDuration;
        }

        // Update total stats
        if (completed) {
            this.stats.total.pomodoros++;
            this.stats.total.time += this.settings.workDuration;
            this.stats.total.sessions++;
        }

        // Update first session
        if (!this.stats.total.firstSession) {
            this.stats.total.firstSession = new Date().toISOString();
        }

        // Update best day
        if (this.stats.today.pomodoros > (this.stats.total.bestDay.pomodoros || 0)) {
            this.stats.total.bestDay = {
                date: today,
                pomodoros: this.stats.today.pomodoros
            };
        }

        // Update streak
        if (this.stats.today.pomodoros > 0) {
            if (this.stats.total.currentStreak === 0) {
                this.stats.total.currentStreak = 1;
            } else {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayString = yesterday.toDateString();
                
                if (this.stats.today.date === today && this.stats.week[adjustedDay > 0 ? adjustedDay - 1 : 6].pomodoros > 0) {
                    this.stats.total.currentStreak++;
                }
            }
        }

        // Update best streak
        if (this.stats.total.currentStreak > this.stats.total.bestStreak) {
            this.stats.total.bestStreak = this.stats.total.currentStreak;
        }

        this.saveStats();
        this.updateStats();
    }

    updateStats(period = 'today') {
        let stats;
        switch (period) {
            case 'today':
                stats = this.stats.today;
                document.getElementById('period-pomodoros').textContent = stats.pomodoros;
                document.getElementById('period-time').textContent = stats.time;
                document.getElementById('period-streak').textContent = this.stats.total.currentStreak;
                document.getElementById('period-efficiency').textContent = 
                    stats.completed > 0 ? 
                    Math.round((stats.completed / (stats.completed + stats.interrupted)) * 100) + '%' : 
                    '0%';
                break;
            case 'week':
                stats = this.stats.week.reduce((acc, day) => ({
                    pomodoros: acc.pomodoros + day.pomodoros,
                    time: acc.time + day.time
                }), { pomodoros: 0, time: 0 });
                document.getElementById('period-pomodoros').textContent = stats.pomodoros;
                document.getElementById('period-time').textContent = stats.time;
                document.getElementById('period-streak').textContent = this.stats.total.bestStreak;
                break;
            case 'month':
            case 'all':
                stats = this.stats.total;
                document.getElementById('period-pomodoros').textContent = stats.pomodoros;
                document.getElementById('period-time').textContent = stats.time;
                document.getElementById('period-streak').textContent = stats.bestStreak;
                break;
        }

        // Update weekly chart
        this.updateWeeklyChart();

        // Update detailed stats
        document.getElementById('avg-session-time').textContent = 
            this.stats.total.sessions > 0 ? 
            Math.round(this.stats.total.time / this.stats.total.sessions) + ' мин' : 
            '0 мин';
        
        document.getElementById('best-day').textContent = 
            this.stats.total.bestDay.date ? 
            new Date(this.stats.total.bestDay.date).toLocaleDateString('ru-RU') + 
            ` (${this.stats.total.bestDay.pomodoros} помидоров)` : 
            'Нет данных';
        
        document.getElementById('total-sessions').textContent = this.stats.total.sessions;
        
        document.getElementById('first-session').textContent = 
            this.stats.total.firstSession ? 
            new Date(this.stats.total.firstSession).toLocaleDateString('ru-RU') : 
            'Сегодня';
    }

    updateWeeklyChart() {
        const maxPomodoros = Math.max(...this.stats.week.map(day => day.pomodoros));
        this.stats.week.forEach((day, index) => {
            const bar = document.querySelector(`[data-day="${index}"]`);
            const height = maxPomodoros > 0 ? (day.pomodoros / maxPomodoros) * 100 : 0;
            bar.style.height = `${height}%`;
        });
    }

    checkAchievements() {
        const achievements = this.stats.achievements;
        const stats = this.stats.total;
        
        // First Pomodoro
        if (!achievements.first && stats.pomodoros > 0) {
            achievements.first = true;
            this.unlockAchievement('first');
        }
        
        // 5-day streak
        if (!achievements.streak && stats.currentStreak >= 5) {
            achievements.streak = true;
            this.unlockAchievement('streak');
        }
        
        // 100 Pomodoros
        if (!achievements.master && stats.pomodoros >= 100) {
            achievements.master = true;
            this.unlockAchievement('master');
        }
        
        // 90% efficiency
        const efficiency = this.stats.today.completed / (this.stats.today.completed + this.stats.today.interrupted);
        if (!achievements.efficient && efficiency >= 0.9 && this.stats.today.completed >= 10) {
            achievements.efficient = true;
            this.unlockAchievement('efficient');
        }
        
        this.saveStats();
    }

    unlockAchievement(id) {
        const achievement = document.querySelector(`[data-achievement="${id}"]`);
        if (achievement) {
            achievement.classList.remove('locked');
            this.showNotification('🏆 Новое достижение разблокировано!');
        }
    }

    resetStats() {
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
        
        this.saveStats();
        this.updateStats();
        
        // Reset achievements UI
        document.querySelectorAll('.achievement').forEach(achievement => {
            achievement.classList.add('locked');
        });
        
        this.showNotification('📊 Статистика сброшена');
    }

    async saveStats() {
        await this.saveTelegramStorage('pomodoro_stats', this.stats);
    }

    async loadStats() {
        const stats = await this.loadTelegramStorage('pomodoro_stats', this.stats);
        this.stats = { ...this.stats, ...stats };
        
        Object.entries(this.stats.achievements).forEach(([id, unlocked]) => {
            if (unlocked) {
                this.unlockAchievement(id);
            }
        });
    }
}

// Create and initialize the timer
console.log('Creating timer instance...');
const timer = new PomodoroTimer();
console.log('Timer instance created!'); 
