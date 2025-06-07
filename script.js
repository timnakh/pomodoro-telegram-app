class PomodoroTimer {
    constructor() {
        // Настройки по умолчанию
        this.defaultSettings = {
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            sessionsUntilLongBreak: 4,
            soundEnabled: true,
            autoStartBreaks: false,
            autoStartWork: false
        };

        // Текущие настройки
        this.settings = { ...this.defaultSettings };

        // Состояние таймера
        this.isRunning = false;
        this.isPaused = false;
        this.currentSession = 'work'; // 'work', 'shortBreak', 'longBreak'
        this.sessionsCompleted = 0;
        this.timeRemaining = this.settings.workDuration * 60;
        this.totalTime = this.settings.workDuration * 60;
        this.timer = null;

        // Статистика
        this.stats = {
            today: { pomodoros: 0, time: 0, date: new Date().toDateString() },
            week: [],
            total: { pomodoros: 0, time: 0, sessions: 0, firstSession: null },
            achievements: []
        };

        // Инициализация
        this.init();
    }

    init() {
        this.loadSettings();
        this.loadStats();
        this.initializeElements();
        this.bindEvents();
        this.updateDisplay();
        this.updateStats();
        this.checkAchievements();

        // Telegram Web App готовность
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
        }
    }

    initializeElements() {
        // Основные элементы
        this.timeDisplay = document.getElementById('time-display');
        this.sessionType = document.getElementById('session-type');
        this.sessionCount = document.getElementById('session-count');
        this.startPauseBtn = document.getElementById('start-pause-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.skipBtn = document.getElementById('skip-btn');
        this.progressRing = document.querySelector('.progress-ring-fill');

        // Элементы вкладок
        this.navTabs = document.querySelectorAll('.nav-tab');
        this.tabContents = document.querySelectorAll('.tab-content');

        // Элементы настроек
        this.workDurationInput = document.getElementById('work-duration');
        this.shortBreakInput = document.getElementById('short-break-duration');
        this.longBreakInput = document.getElementById('long-break-duration');
        this.sessionsInput = document.getElementById('sessions-until-long-break');
        this.soundEnabledInput = document.getElementById('sound-enabled');
        this.autoStartBreaksInput = document.getElementById('auto-start-breaks');
        this.autoStartWorkInput = document.getElementById('auto-start-work');
        this.saveSettingsBtn = document.getElementById('save-settings-btn');
        this.resetSettingsBtn = document.getElementById('reset-settings-btn');

        // Элементы статистики
        this.periodBtns = document.querySelectorAll('.period-btn');
        this.resetStatsBtn = document.getElementById('reset-stats-btn');

        // Уведомления
        this.notification = document.getElementById('notification');
        this.notificationText = document.getElementById('notification-text');

        // Инициализируем значения настроек в полях
        this.updateSettingsInputs();
    }

    bindEvents() {
        // Основные кнопки
        this.startPauseBtn.addEventListener('click', () => this.toggleTimer());
        this.resetBtn.addEventListener('click', () => this.resetTimer());
        this.skipBtn.addEventListener('click', () => this.skipSession());

        // Навигация по вкладкам
        this.navTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Настройки
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());

        // Переключатели периодов статистики
        this.periodBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchStatsPeriod(btn.dataset.period));
        });

        // Сброс статистики
        this.resetStatsBtn.addEventListener('click', () => this.resetStats());
    }

    // === МЕТОДЫ ТАЙМЕРА ===

    toggleTimer() {
        if (!this.isRunning && !this.isPaused) {
            this.startTimer();
        } else if (this.isRunning) {
            this.pauseTimer();
        } else if (this.isPaused) {
            this.resumeTimer();
        }
    }

    startTimer() {
        this.isRunning = true;
        this.isPaused = false;
        this.updateButton('pause');
        
        this.timer = setInterval(() => {
            this.timeRemaining--;
            this.updateDisplay();
            
            if (this.timeRemaining <= 0) {
                this.completeSession();
            }
        }, 1000);
    }

    pauseTimer() {
        this.isRunning = false;
        this.isPaused = true;
        clearInterval(this.timer);
        this.updateButton('resume');
    }

    resumeTimer() {
        this.isRunning = true;
        this.isPaused = false;
        this.updateButton('pause');
        this.startTimer();
    }

    resetTimer() {
        clearInterval(this.timer);
        this.isRunning = false;
        this.isPaused = false;
        this.setSessionDuration();
        this.updateDisplay();
        this.updateButton('start');
    }

    skipSession() {
        clearInterval(this.timer);
        this.completeSession();
    }

    completeSession() {
        clearInterval(this.timer);
        this.isRunning = false;
        this.isPaused = false;

        // Сохраняем статистику для рабочих сессий
        if (this.currentSession === 'work') {
            this.sessionsCompleted++;
            this.updateSessionStats();
        }

        // Играем звук уведомления
        if (this.settings.soundEnabled) {
            this.playNotificationSound();
        }

        // Показываем уведомление
        this.showNotification(this.getSessionCompleteMessage());

        // Переключаемся на следующую сессию
        this.switchToNextSession();

        // Автозапуск если включен
        if (this.shouldAutoStart()) {
            setTimeout(() => this.startTimer(), 3000);
        } else {
            this.updateButton('start');
        }
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

        this.setSessionDuration();
        this.updateDisplay();
    }

    setSessionDuration() {
        switch (this.currentSession) {
            case 'work':
                this.totalTime = this.settings.workDuration * 60;
                break;
            case 'shortBreak':
                this.totalTime = this.settings.shortBreakDuration * 60;
                break;
            case 'longBreak':
                this.totalTime = this.settings.longBreakDuration * 60;
                break;
        }
        this.timeRemaining = this.totalTime;
    }

    // === МЕТОДЫ ОТОБРАЖЕНИЯ ===

    updateDisplay() {
        // Обновляем время
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        this.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Обновляем тип сессии
        this.sessionType.textContent = this.getSessionTypeText();

        // Обновляем счетчик сессий
        const currentCycle = Math.floor(this.sessionsCompleted / this.settings.sessionsUntilLongBreak) + 1;
        const sessionInCycle = (this.sessionsCompleted % this.settings.sessionsUntilLongBreak) + 1;
        this.sessionCount.textContent = `${sessionInCycle}/${this.settings.sessionsUntilLongBreak}`;

        // Обновляем кольцо прогресса
        this.updateProgressRing();

        // Обновляем дневной прогресс
        this.updateTodayDisplay();
    }

    updateProgressRing() {
        const progress = 1 - (this.timeRemaining / this.totalTime);
        const circumference = 2 * Math.PI * 130; // radius = 130
        const strokeDashoffset = circumference * (1 - progress);
        this.progressRing.style.strokeDashoffset = strokeDashoffset;

        // Меняем цвет в зависимости от типа сессии
        if (this.currentSession === 'work') {
            this.progressRing.style.stroke = '#667eea';
        } else {
            this.progressRing.style.stroke = '#51cf66';
        }
    }

    updateButton(state) {
        const icon = this.startPauseBtn.querySelector('.btn-icon');
        const text = this.startPauseBtn.childNodes[1];

        switch (state) {
            case 'start':
                icon.textContent = '▶️';
                text.textContent = ' Начать';
                break;
            case 'pause':
                icon.textContent = '⏸️';
                text.textContent = ' Пауза';
                break;
            case 'resume':
                icon.textContent = '▶️';
                text.textContent = ' Продолжить';
                break;
        }
    }

    // === МЕТОДЫ ВКЛАДОК ===

    switchTab(tabName) {
        // Обновляем активные вкладки
        this.navTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Показываем соответствующий контент
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // Обновляем статистику при переходе на вкладку
        if (tabName === 'stats') {
            this.updateStats();
        }
    }

    // === МЕТОДЫ НАСТРОЕК ===

    updateSettingsInputs() {
        this.workDurationInput.value = this.settings.workDuration;
        this.shortBreakInput.value = this.settings.shortBreakDuration;
        this.longBreakInput.value = this.settings.longBreakDuration;
        this.sessionsInput.value = this.settings.sessionsUntilLongBreak;
        this.soundEnabledInput.checked = this.settings.soundEnabled;
        this.autoStartBreaksInput.checked = this.settings.autoStartBreaks;
        this.autoStartWorkInput.checked = this.settings.autoStartWork;
    }

    saveSettings() {
        const newSettings = {
            workDuration: parseInt(this.workDurationInput.value),
            shortBreakDuration: parseInt(this.shortBreakInput.value),
            longBreakDuration: parseInt(this.longBreakInput.value),
            sessionsUntilLongBreak: parseInt(this.sessionsInput.value),
            soundEnabled: this.soundEnabledInput.checked,
            autoStartBreaks: this.autoStartBreaksInput.checked,
            autoStartWork: this.autoStartWorkInput.checked
        };

        // Валидация
        if (newSettings.workDuration < 1 || newSettings.workDuration > 60) {
            this.showNotification('❌ Рабочий блок должен быть от 1 до 60 минут');
            return;
        }

        this.settings = newSettings;
        this.saveSettingsToStorage();
        
        // Применяем новые настройки
        if (!this.isRunning && !this.isPaused) {
            this.setSessionDuration();
            this.updateDisplay();
        }

        this.showNotification('✅ Настройки сохранены');
    }

    resetSettings() {
        this.settings = { ...this.defaultSettings };
        this.updateSettingsInputs();
        this.saveSettingsToStorage();
        
        if (!this.isRunning && !this.isPaused) {
            this.setSessionDuration();
            this.updateDisplay();
        }

        this.showNotification('🔄 Настройки сброшены к стандартным');
    }

    // === МЕТОДЫ СТАТИСТИКИ ===

    updateSessionStats() {
        const today = new Date().toDateString();
        
        // Обновляем статистику за сегодня
        if (this.stats.today.date !== today) {
            this.stats.today = { pomodoros: 0, time: 0, date: today };
        }
        
        this.stats.today.pomodoros++;
        this.stats.today.time += this.settings.workDuration;

        // Обновляем общую статистику
        this.stats.total.pomodoros++;
        this.stats.total.time += this.settings.workDuration;
        this.stats.total.sessions++;
        
        if (!this.stats.total.firstSession) {
            this.stats.total.firstSession = today;
        }

        // Обновляем недельную статистику
        this.updateWeeklyStats();

        // Сохраняем статистику
        this.saveStatsToStorage();

        // Проверяем достижения
        this.checkAchievements();
    }

    updateWeeklyStats() {
        const today = new Date();
        const dayOfWeek = today.getDay();
        
        // Инициализируем массив недели если нужно
        if (this.stats.week.length === 0) {
            this.stats.week = Array(7).fill(0);
        }

        this.stats.week[dayOfWeek] = this.stats.today.pomodoros;
    }

    switchStatsPeriod(period) {
        // Обновляем активную кнопку
        this.periodBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });

        // Обновляем отображение статистики
        this.updateStatsDisplay(period);
    }

    updateStats() {
        this.updateStatsDisplay('today');
        this.updateChart();
        this.updateDetailedStats();
        this.updateAchievements();
    }

    updateStatsDisplay(period) {
        let data;
        
        switch (period) {
            case 'today':
                data = {
                    pomodoros: this.stats.today.pomodoros,
                    time: this.stats.today.time,
                    streak: this.calculateStreak(),
                    efficiency: this.calculateEfficiency()
                };
                break;
            case 'week':
                data = {
                    pomodoros: this.stats.week.reduce((a, b) => a + b, 0),
                    time: this.stats.week.reduce((a, b) => a + b, 0) * this.settings.workDuration,
                    streak: this.calculateStreak(),
                    efficiency: this.calculateEfficiency()
                };
                break;
            case 'month':
                // Упрощенная логика для демо
                data = {
                    pomodoros: this.stats.total.pomodoros,
                    time: this.stats.total.time,
                    streak: this.calculateStreak(),
                    efficiency: this.calculateEfficiency()
                };
                break;
            case 'all':
                data = {
                    pomodoros: this.stats.total.pomodoros,
                    time: this.stats.total.time,
                    streak: this.calculateStreak(),
                    efficiency: this.calculateEfficiency()
                };
                break;
        }

        document.getElementById('period-pomodoros').textContent = data.pomodoros;
        document.getElementById('period-time').textContent = data.time;
        document.getElementById('period-streak').textContent = data.streak;
        document.getElementById('period-efficiency').textContent = data.efficiency + '%';
    }

    updateTodayDisplay() {
        document.getElementById('today-pomodoros').textContent = this.stats.today.pomodoros;
        document.getElementById('today-time').textContent = this.stats.today.time;
    }

    updateChart() {
        const chartBars = document.querySelectorAll('.chart-bar');
        const maxValue = Math.max(...this.stats.week, 1);

        chartBars.forEach((bar, index) => {
            const value = this.stats.week[index] || 0;
            const height = (value / maxValue) * 100;
            bar.style.height = Math.max(height, 5) + '%';
        });
    }

    updateDetailedStats() {
        document.getElementById('avg-session-time').textContent = this.settings.workDuration + ' мин';
        document.getElementById('total-sessions').textContent = this.stats.total.sessions;
        document.getElementById('first-session').textContent = this.stats.total.firstSession || 'Сегодня';
        document.getElementById('best-day').textContent = this.getBestDay();
    }

    // === МЕТОДЫ ДОСТИЖЕНИЙ ===

    checkAchievements() {
        const achievements = [
            {
                id: 'first-pomodoro',
                condition: () => this.stats.total.pomodoros >= 1,
                icon: '🥇',
                text: 'Первый помидор'
            },
            {
                id: 'streak-5',
                condition: () => this.calculateStreak() >= 5,
                icon: '🔥',
                text: '5 дней подряд'
            },
            {
                id: 'hundred-pomodoros',
                condition: () => this.stats.total.pomodoros >= 100,
                icon: '💯',
                text: '100 помидоров'
            }
        ];

        achievements.forEach(achievement => {
            if (achievement.condition() && !this.stats.achievements.includes(achievement.id)) {
                this.stats.achievements.push(achievement.id);
                this.showNotification(`🏆 Достижение: ${achievement.text}`);
            }
        });

        this.saveStatsToStorage();
    }

    updateAchievements() {
        const achievementElements = document.querySelectorAll('.achievement');
        
        achievementElements.forEach((element, index) => {
            const achievementIds = ['first-pomodoro', 'streak-5', 'hundred-pomodoros'];
            const isUnlocked = this.stats.achievements.includes(achievementIds[index]);
            
            element.classList.toggle('locked', !isUnlocked);
            element.classList.toggle('unlocked', isUnlocked);
        });
    }

    resetStats() {
        if (confirm('Вы уверены, что хотите сбросить всю статистику?')) {
            this.stats = {
                today: { pomodoros: 0, time: 0, date: new Date().toDateString() },
                week: [],
                total: { pomodoros: 0, time: 0, sessions: 0, firstSession: null },
                achievements: []
            };
            
            this.saveStatsToStorage();
            this.updateStats();
            this.showNotification('🗑️ Статистика сброшена');
        }
    }

    // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

    getSessionTypeText() {
        switch (this.currentSession) {
            case 'work':
                return 'Рабочий блок';
            case 'shortBreak':
                return 'Короткий перерыв';
            case 'longBreak':
                return 'Длинный перерыв';
            default:
                return 'Рабочий блок';
        }
    }

    getSessionCompleteMessage() {
        switch (this.currentSession) {
            case 'work':
                return '🍅 Рабочий блок завершен! Время отдохнуть.';
            case 'shortBreak':
                return '☕ Перерыв окончен! Пора работать.';
            case 'longBreak':
                return '🎉 Длинный перерыв завершен! Новый цикл начинается.';
            default:
                return '✅ Сессия завершена!';
        }
    }

    shouldAutoStart() {
        return (this.currentSession === 'work' && this.settings.autoStartWork) ||
               ((this.currentSession === 'shortBreak' || this.currentSession === 'longBreak') && this.settings.autoStartBreaks);
    }

    calculateStreak() {
        // Упрощенная логика - возвращаем количество дней с первой сессии
        if (!this.stats.total.firstSession) return 0;
        
        const firstDate = new Date(this.stats.total.firstSession);
        const today = new Date();
        const diffTime = Math.abs(today - firstDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return Math.min(diffDays, 30); // Максимум 30 дней для демо
    }

    calculateEfficiency() {
        const totalSessions = this.stats.total.sessions;
        if (totalSessions === 0) return 0;
        
        // Простая формула: процент завершенных полных сессий
        return Math.round((this.stats.total.pomodoros / totalSessions) * 100);
    }

    getBestDay() {
        const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
        const maxIndex = this.stats.week.indexOf(Math.max(...this.stats.week));
        return maxIndex >= 0 ? days[maxIndex] : 'Сегодня';
    }

    playNotificationSound() {
        if (!this.settings.soundEnabled) return;
        
        // Создаем простой звуковой сигнал
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = this.currentSession === 'work' ? 800 : 400;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    }

    showNotification(message) {
        this.notificationText.textContent = message;
        this.notification.classList.remove('hidden');
        this.notification.classList.add('show');
        
        setTimeout(() => {
            this.notification.classList.remove('show');
            this.notification.classList.add('hidden');
        }, 3000);
    }

    // === МЕТОДЫ СОХРАНЕНИЯ/ЗАГРУЗКИ ===

    loadSettings() {
        const savedSettings = this.getFromStorage('pomodoro_settings');
        if (savedSettings) {
            this.settings = { ...this.defaultSettings, ...savedSettings };
        }
    }

    saveSettingsToStorage() {
        this.saveToStorage('pomodoro_settings', this.settings);
    }

    loadStats() {
        const savedStats = this.getFromStorage('pomodoro_stats');
        if (savedStats) {
            this.stats = { ...this.stats, ...savedStats };
        }
    }

    saveStatsToStorage() {
        this.saveToStorage('pomodoro_stats', this.stats);
    }

    saveToStorage(key, data) {
        if (window.Telegram?.WebApp?.CloudStorage) {
            window.Telegram.WebApp.CloudStorage.setItem(key, JSON.stringify(data));
        } else {
            localStorage.setItem(key, JSON.stringify(data));
        }
    }

    getFromStorage(key) {
        if (window.Telegram?.WebApp?.CloudStorage) {
            return new Promise((resolve) => {
                window.Telegram.WebApp.CloudStorage.getItem(key, (err, result) => {
                    try {
                        resolve(result ? JSON.parse(result) : null);
                    } catch (e) {
                        resolve(null);
                    }
                });
            });
        } else {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (e) {
                return null;
            }
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new PomodoroTimer();
}); 
