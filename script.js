console.log("Pomodoro Timer Loading...");

// Звуки для уведомлений
const SOUNDS = {
    sound1: { name: '🌪️ Волшебный вжух', file: 'sound1.wav' },
    sound2: { name: '🕹️ Геймовер', file: 'sound2.wav' },
    sound3: { name: '🔔 Колокольчик', file: 'sound3.wav' },
    sound4: { name: '🎺 Весёлый свисток', file: 'sound4.wav' },
    sound5: { name: '✨ Правильный ответ', file: 'sound5.wav' },
    sound6: { name: '💫 Быстрый взмах', file: 'sound6.wav' },
    sound7: { name: '👾 Ретро-уведомление', file: 'sound7.wav' },
    sound8: { name: '🛸 Космический клик', file: 'sound8.wav' },
    sound9: { name: '🤧 Апчхи!', file: 'sound9.wav' },
    sound10: { name: '🚀 Запуск системы', file: 'sound10.wav' }
};

class PomodoroTimer {
    constructor() {
        // Default settings
        this.defaultSettings = {
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            sessionsUntilLongBreak: 4,
            soundEnabled: true,
            autoStartBreaks: false,
            autoStartWork: false,
            selectedSound: 'sound4' // Весёлый свисток по умолчанию
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

        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadStats();
        await this.initSounds();
        this.resetTimer();
        this.bindEvents();
        this.initializeSettings();
        this.updateStats();
        console.log("Timer Ready!");
    }

    // Функции для работы с Telegram Storage
    async saveTelegramStorage(key, data) {
        try {
            await window.Telegram.WebApp.CloudStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving to Telegram Storage:', error);
            // Fallback to localStorage if Telegram Storage fails
            localStorage.setItem(key, JSON.stringify(data));
        }
    }

    async loadTelegramStorage(key, defaultValue = null) {
        try {
            return new Promise((resolve) => {
                window.Telegram.WebApp.CloudStorage.getItem(key, (error, value) => {
                    if (error || !value) {
                        // Try loading from localStorage as fallback
                        const localData = localStorage.getItem(key);
                        if (localData) {
                            resolve(JSON.parse(localData));
                        } else {
                            resolve(defaultValue);
                        }
                    } else {
                        resolve(JSON.parse(value));
                    }
                });
            });
        } catch (error) {
            console.error('Error loading from Telegram Storage:', error);
            // Fallback to localStorage
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
        // Timer controls
        document.getElementById("start-pause-btn").addEventListener("click", () => this.toggleTimer());
        document.getElementById("reset-btn").addEventListener("click", () => this.resetTimer());
        document.getElementById("skip-btn").addEventListener("click", () => this.skipSession());
        
        // Tab navigation
        document.querySelectorAll(".nav-tab").forEach(tab => {
            tab.addEventListener("click", (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Settings controls
        document.getElementById("save-settings").addEventListener("click", () => this.saveSettings());
        document.getElementById("reset-settings").addEventListener("click", () => this.resetSettings());

        // Number input controls
        document.querySelectorAll('.number-input').forEach(container => {
            const input = container.querySelector('input');
            const decreaseBtn = container.querySelector('.decrease');
            const increaseBtn = container.querySelector('.increase');

            decreaseBtn.addEventListener('click', () => {
                const newValue = Math.max(parseInt(input.value) - 1, parseInt(input.min));
                input.value = newValue;
            });

            increaseBtn.addEventListener('click', () => {
                const newValue = Math.min(parseInt(input.value) + 1, parseInt(input.max));
                input.value = newValue;
            });
        });

        // Statistics controls
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateStats(btn.dataset.period);
            });
        });

        document.getElementById('reset-stats').addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите сбросить всю статистику?')) {
                this.resetStats();
            }
        });

        // Привязываем обработчик к кнопке теста звука
        const testSoundButton = document.getElementById('test-sound');
        if (testSoundButton) {
            testSoundButton.addEventListener('click', () => {
                console.log('Test sound button clicked');
                this.playNotificationSound();
            });
        }

        // Привязываем обработчик к селектору звуков
        const soundSelect = document.getElementById('sound-select');
        if (soundSelect) {
            soundSelect.addEventListener('change', (e) => {
                console.log('Sound changed to:', e.target.value);
                this.settings.selectedSound = e.target.value;
            });
        }
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

        // Set sound selector
        const soundSelect = document.getElementById('sound-select');
        if (soundSelect) {
            soundSelect.value = this.settings.selectedSound;
        }
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
        if (this.isRunning) {
            btn.innerHTML = '<span class="btn-icon">⏸️</span> Пауза';
        } else {
            btn.innerHTML = '<span class="btn-icon">▶️</span> Начать';
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

            // Проверяем состояние AudioContext
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('AudioContext resumed');
            }

            const selectedSound = this.settings.selectedSound;
            console.log('Playing sound:', selectedSound);

            if (!this.soundBuffers[selectedSound]) {
                console.error('Sound buffer not found for:', selectedSound);
                return;
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
                    this.soundBuffers[key] = await this.audioContext.decodeAudioData(arrayBuffer);
                    console.log(`Sound loaded successfully: ${sound.file}`);
                } catch (error) {
                    console.error(`Error loading sound ${sound.file}:`, error);
                }
            }
        } catch (error) {
            console.error('Error initializing audio system:', error);
        }
    }

    createSoundSelector() {
        const settingsContainer = document.querySelector('.settings-container');
        const soundGroup = document.createElement('div');
        soundGroup.className = 'setting-group';
        
        const label = document.createElement('label');
        label.textContent = 'Звук уведомления';
        
        const select = document.createElement('select');
        select.id = 'sound-select';
        select.className = 'sound-select';
        
        Object.entries(SOUNDS).forEach(([key, sound]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = sound.name;
            select.appendChild(option);
        });
        
        const testButton = document.createElement('button');
        testButton.className = 'control-btn secondary';
        testButton.innerHTML = '<span class="btn-icon">🔊</span><span class="btn-text">Тест</span>';
        testButton.onclick = () => {
            console.log('Test button clicked');
            this.playNotificationSound();
        };
        
        soundGroup.appendChild(label);
        soundGroup.appendChild(select);
        soundGroup.appendChild(testButton);
        
        const saveButton = document.querySelector('#save-settings');
        settingsContainer.insertBefore(soundGroup, saveButton);
        
        select.addEventListener('change', (e) => {
            console.log('Sound changed to:', e.target.value);
            this.settings.selectedSound = e.target.value;
        });
        
        return select;
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

// Initialize the timer when the document is ready
document.addEventListener("DOMContentLoaded", function() {
    window.pomodoroTimer = new PomodoroTimer();
}); 
