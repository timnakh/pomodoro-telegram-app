/* =====================================================================
 *  Telegram CloudStorage → Promise wrappers
 *  (весь дальнейший код пользуется ТОЛЬКО этими функциями)
 * =================================================================== */
function tgGetItem(key) {
  return new Promise((resolve, reject) => {
    const cs = window.Telegram?.WebApp?.CloudStorage;
    if (!cs) return resolve(null);          // Запущено вне TG-вебвью
    cs.getItem(
      key,
      value => resolve(value ?? null),
      err   => reject(err)
    );
  });
}

function tgSetItem(key, value) {
  return new Promise((resolve, reject) => {
    const cs = window.Telegram?.WebApp?.CloudStorage;
    if (!cs) return resolve(false);         // Нет CloudStorage
    cs.setItem(
      key,
      value,
      () => resolve(true),
      err => reject(err)
    );
  });
}

/* =====================================================================
 *  Pomodoro mini-app
 * =================================================================== */
class PomodoroTimer {
  constructor() {
    /* ---------- DEFAULT SETTINGS ---------- */
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
    this.settings = { ...this.defaultSettings };

    /* ---------- TIMER STATE ---------- */
    this.currentSession    = 'work';
    this.sessionsCompleted = 0;
    this.currentTime       = this.settings.workDuration * 60;
    this.isRunning         = false;
    this.timer             = null;
    this.lastUpdate        = null;
    this.startTime         = null;

    /* ---------- AUDIO ---------- */
    this.audioContext = null;
    this.soundBuffers = {};

    /* ---------- STATISTICS ---------- */
    this.stats = {
      today : { pomodoros: 0, time: 0, date: new Date().toDateString(),
                completed: 0, interrupted: 0 },
      week  : Array(7).fill().map(() => ({ pomodoros: 0, time: 0 })),
      total : { pomodoros: 0, time: 0, sessions: 0,
                firstSession: null, bestDay: { date: null, pomodoros: 0 },
                currentStreak: 0, bestStreak: 0 },
      achievements : { first: false, streak: false, master: false, efficient: false }
    };

    /* ---------- BOOTSTRAP ---------- */
    if (typeof window !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.init());
      } else {
        this.init();
      }
    }
  }

  /* ===================================================================
   *  Инициализация
   * ================================================================= */
  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Telegram-SDK
    window.Telegram?.WebApp?.ready?.();

    await this.loadSettings();
    await this.loadStats();

    this.resetTimer();
    this.updateDisplay();
    this.updateSessionInfo();
    this.updateButton();
    this.initializeSettings();
    this.updateStats();

    await this.initSounds().catch(console.error);

    this.bindEvents();
  }

  /* ===================================================================
   *  SETTINGS  (CloudStorage + localStorage)
   * ================================================================= */
  async loadSettings() {
    try {
      const cloud = await tgGetItem('pomodoroSettings');
      const src   = cloud ?? localStorage.getItem('pomodoroSettings');
      if (src) this.settings = { ...this.defaultSettings, ...JSON.parse(src) };
    } catch (e) {
      console.error('settings load error:', e);
    }
  }

  async saveSettings(showToast = true) {
    const str = JSON.stringify(this.settings);
    try { await tgSetItem('pomodoroSettings', str); } catch {}
    localStorage.setItem('pomodoroSettings', str);
    if (showToast) this.showNotification('Настройки сохранены');
  }

  /* ===================================================================
   *  STATISTICS  (CloudStorage + localStorage)
   * ================================================================= */
  async loadStats() {
    try {
      const cloud = await tgGetItem('pomodoroStats');
      const src   = cloud ?? localStorage.getItem('pomodoroStats');
      if (src) this.stats = JSON.parse(src);

      // Новый день → сброс daily
      const today = new Date().toDateString();
      if (this.stats.today.date !== today) {
        const idx = new Date().getDay();
        this.stats.week[idx] = { pomodoros: 0, time: 0 };
        this.stats.today = { pomodoros: 0, time: 0, date: today, completed: 0, interrupted: 0 };
      }
    } catch (e) {
      console.error('stats load error:', e);
    }
  }

  async saveStats() {
    const str = JSON.stringify(this.stats);
    try { await tgSetItem('pomodoroStats', str); } catch {}
    localStorage.setItem('pomodoroStats', str);
  }

  /* ===================================================================
   *  TIMER CONTROL  (start / pause / reset / skip)
   * ================================================================= */
  startTimer() {
    if (this.isRunning) return;
    this.isRunning  = true;
    this.startTime  = Date.now() - ((this.settings.workDuration * 60) - this.currentTime) * 1000;
    this.lastUpdate = Date.now();

    this.timer = setInterval(() => {
      const now     = Date.now();
      const elapsed = Math.floor((now - this.lastUpdate) / 1000);
      if (elapsed >= 1) {
        this.currentTime = Math.max(0, this.currentTime - elapsed);
        this.lastUpdate  = now;
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
    this.isRunning = false;
    clearInterval(this.timer);
    this.timer = null;
    this.updateButton();
  }

  resetTimer() {
    this.pauseTimer();
    this.currentTime = this.settings.workDuration * 60;
    this.updateDisplay();
  }

  skipSession() {
    if (this.currentSession === 'work') {
      this.stats.today.interrupted++;
      this.saveStats();
      this.updateStats();
    }
    this.completeSession();
  }

  /* ---------- SESSION COMPLETE ---------- */
  completeSession() {
    this.pauseTimer();
    if (this.settings.soundEnabled) this.playNotificationSound();

    /* Update stats for finished work block */
    if (this.currentSession === 'work') {
      this.stats.today.pomodoros++;
      this.stats.today.completed++;
      this.stats.today.time += this.settings.workDuration;

      const d = new Date(); const idx = d.getDay();
      this.stats.week[idx].pomodoros++;
      this.stats.week[idx].time += this.settings.workDuration;

      this.stats.total.pomodoros++;
      this.stats.total.time += this.settings.workDuration;
      this.stats.total.sessions++;
      if (!this.stats.total.firstSession) this.stats.total.firstSession = d.toISOString();

      this.checkAchievements();
      this.saveStats();
      this.updateStats();
    }

    /* Determine next session */
    if (this.currentSession === 'work') {
      this.sessionsCompleted++;
      if (this.sessionsCompleted >= this.settings.sessionsUntilLongBreak) {
        this.currentSession   = 'longBreak';
        this.sessionsCompleted = 0;
      } else {
        this.currentSession = 'shortBreak';
      }
    } else {
      this.currentSession = 'work';
    }

    switch (this.currentSession) {
      case 'work':       this.currentTime = this.settings.workDuration * 60;        break;
      case 'shortBreak': this.currentTime = this.settings.shortBreakDuration * 60;  break;
      case 'longBreak':  this.currentTime = this.settings.longBreakDuration * 60;   break;
    }

    this.updateDisplay();
    this.updateSessionInfo();

    if ((this.currentSession === 'work'       && this.settings.autoStartWork)   ||
        (this.currentSession !== 'work'       && this.settings.autoStartBreaks)) {
      this.startTimer();
    }
  }

  /* ===================================================================
   *  ACHIEVEMENTS
   * ================================================================= */
  checkAchievements() {
    if (!this.stats.achievements.first && this.stats.total.pomodoros === 1) {
      this.stats.achievements.first = true;     this.showNotification('🎯 Первый помидор!');
    }
    if (!this.stats.achievements.streak && this.stats.today.pomodoros >= 3) {
      this.stats.achievements.streak = true;    this.showNotification('🔥 На волне!');
    }
    if (!this.stats.achievements.master && this.stats.today.pomodoros >= 10) {
      this.stats.achievements.master = true;    this.showNotification('💯 100 помидоров!');
    }
    const eff = this.stats.today.completed /
                (this.stats.today.completed + this.stats.today.interrupted || 1);
    if (!this.stats.achievements.efficient && eff >= 0.9 && this.stats.today.completed >= 5) {
      this.stats.achievements.efficient = true; this.showNotification('⚡ 90 % эффективность!');
    }
  }

  /* ===================================================================
   *  UI HELPERS  (display / buttons / stats / notifications)
   * ================================================================= */
  updateDisplay() {
    const m = Math.floor(this.currentTime / 60).toString().padStart(2,'0');
    const s = (this.currentTime % 60).toString().padStart(2,'0');
    document.getElementById('time-display').textContent = `${m}:${s}`;

    const ring = document.querySelector('.progress-ring-fill');
    if (ring) {
      let total;
      switch (this.currentSession) {
        case 'work':       total = this.settings.workDuration * 60;       break;
        case 'shortBreak': total = this.settings.shortBreakDuration * 60; break;
        case 'longBreak':  total = this.settings.longBreakDuration * 60;  break;
      }
      const prog = this.currentTime / total;
      ring.style.strokeDashoffset = 816 * (1 - prog);   // 816 = 2πr (r=130)
    }
  }

  updateButton() {
    const btn  = document.getElementById('start-pause-btn');
    const icn  = btn.querySelector('.btn-icon');
    const txt  = btn.querySelector('.btn-text');
    if (this.isRunning) { icn.textContent='⏸️'; txt.textContent='Пауза'; }
    else                { icn.textContent='▶️'; txt.textContent='Начать'; }
  }

  updateSessionInfo() {
    const t = document.getElementById('session-type');
    const c = document.getElementById('session-count');
    t.textContent = { work:'Рабочий блок', shortBreak:'Короткий перерыв', longBreak:'Длинный перерыв' }[this.currentSession];
    c.textContent = `${this.sessionsCompleted + 1}/${this.settings.sessionsUntilLongBreak}`;
  }

  showNotification(msg) {
    const box = document.getElementById('notification');
    const txt = document.getElementById('notification-text');
    txt.textContent = msg;
    box.classList.remove('hidden');
    box.classList.add('show');
    setTimeout(() => { box.classList.remove('show'); box.classList.add('hidden'); }, 3300);
  }

  updateStats() {
    /* --- основные цифры --- */
    document.getElementById('period-pomodoros').textContent = this.stats.today.pomodoros;
    document.getElementById('period-time').textContent      = this.stats.today.time;
    document.getElementById('period-streak').textContent    = this.stats.total.currentStreak;
    const total = this.stats.today.completed + this.stats.today.interrupted;
    document.getElementById('period-efficiency').textContent =
      total ? Math.round((this.stats.today.completed / total)*100)+'%' : '0%';

    /* --- график по дням --- */
    const max = Math.max(...this.stats.week.map(d=>d.pomodoros));
    document.querySelectorAll('.chart-bar').forEach((bar,i)=>{
      const h = max ? (this.stats.week[i].pomodoros / max)*100 : 0;
      bar.style.height = `${h}%`; bar.title = `${this.stats.week[i].pomodoros} помидоров`;
    });

    /* --- подробные цифры --- */
    const avg = this.stats.total.sessions
              ? Math.round(this.stats.total.time / this.stats.total.sessions)
              : this.settings.workDuration;
    document.getElementById('avg-session-time').textContent = `${avg} мин`;
    if (this.stats.total.bestDay.date) {
      const d  = new Date(this.stats.total.bestDay.date).toLocaleDateString();
      document.getElementById('best-day').textContent = `${d} (${this.stats.total.bestDay.pomodoros} помидоров)`;
    }
    document.getElementById('total-sessions').textContent = this.stats.total.sessions;
    if (this.stats.total.firstSession) {
      document.getElementById('first-session').textContent =
        new Date(this.stats.total.firstSession).toLocaleDateString();
    }

    /* --- достижения --- */
    document.querySelectorAll('[data-achievement]').forEach(el=>{
      if (this.stats.achievements[el.dataset.achievement]) {
        el.classList.remove('locked'); el.classList.add('unlocked');
      }
    });
  }

  /* ===================================================================
   *  SOUNDS
   * ================================================================= */
  async initSounds() {
    const list = Array.from({length:10},(_,i)=>`sound${i+1}`);
    for (const name of list) {
      const a = new Audio();
      a.preload='auto';
      a.src = `sounds/${name}.wav`;
      this.soundBuffers[name] = a;
    }
  }
  playNotificationSound() {
    if (!this.settings.soundEnabled) return;
    const a = this.soundBuffers[this.settings.selectedSound];
    if (a) { a.currentTime=0; a.play().catch(console.error); }
  }

  /* ===================================================================
   *  DOM EVENTS & SETTINGS UI
   * ================================================================= */
  bindEvents() {
    const on = (sel,ev,fn) => document.getElementById(sel)?.addEventListener(ev,fn,{passive:false});
    on('start-pause-btn','click',e=>{e.preventDefault(); this.isRunning?this.pauseTimer():this.startTimer();});
    on('reset-btn','click',e=>{e.preventDefault(); this.resetTimer();});
    on('skip-btn','click',e=>{e.preventDefault(); this.skipSession();});
    on('test-sound','click',e=>{e.preventDefault(); this.playNotificationSound();});
    on('save-settings','click', ()=>this.saveSettings());
    on('reset-settings','click',()=>{
      if (confirm('Вернуть значения по умолчанию?')) {
        this.settings = { ...this.defaultSettings };
        this.initializeSettings(); this.saveSettings(false); this.resetTimer();
      }
    });
    on('reset-stats','click',()=>{
      if (confirm('Сбросить всю статистику?')) {
        this.stats = {
          today:{pomodoros:0,time:0,date:new Date().toDateString(),completed:0,interrupted:0},
          week:Array(7).fill().map(()=>({pomodoros:0,time:0})),
          total:{pomodoros:0,time:0,sessions:0,firstSession:null,bestDay:{date:null,pomodoros:0},currentStreak:0,bestStreak:0},
          achievements:{first:false,streak:false,master:false,efficient:false}
        };
        this.saveStats(); this.updateStats();
      }
    });

    /* вкладки */
    document.querySelectorAll('.nav-tab').forEach(tab=>{
      tab.addEventListener('click',()=>{
        document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
      });
    });

    /* number inputs */
    const numInput = (id,prop,min,max)=>{
      const el = document.getElementById(id);
      el.value = this.settings[prop];
      const wrap = el.parentElement;
      wrap.querySelector('.decrease').addEventListener('click',()=>{ el.stepDown(); el.dispatchEvent(new Event('change')); });
      wrap.querySelector('.increase').addEventListener('click',()=>{ el.stepUp();   el.dispatchEvent(new Event('change')); });
      el.addEventListener('change',()=>{
        let v = parseInt(el.value); if (isNaN(v)) v=min;
        v=Math.max(min,Math.min(max,v)); el.value=v; this.settings[prop]=v; this.saveSettings(false); this.resetTimer();
      });
    };
    numInput('work-duration','workDuration',1,60);
    numInput('short-break-duration','shortBreakDuration',1,30);
    numInput('long-break-duration','longBreakDuration',5,60);
    numInput('sessions-until-long-break','sessionsUntilLongBreak',2,8);

    /* checkboxes / select */
    const chk = (id,prop)=>{ const el=document.getElementById(id); el.checked=this.settings[prop];
      el.addEventListener('change',()=>{this.settings[prop]=el.checked; this.saveSettings(false);}); };
    chk('sound-enabled','soundEnabled');
    chk('auto-start-breaks','autoStartBreaks');
    chk('auto-start-work','autoStartWork');

    const sel = document.getElementById('sound-select');
    sel.value = this.settings.selectedSound;
    sel.addEventListener('change',()=>{ this.settings.selectedSound=sel.value; this.saveSettings(false); if(this.settings.soundEnabled)this.playNotificationSound();});
  }

  /* ===================================================================
   *  INITIALIZE SETTINGS UI (populate fields)
   * ================================================================= */
  initializeSettings() {
    document.getElementById('work-duration'            ).value = this.settings.workDuration;
    document.getElementById('short-break-duration'     ).value = this.settings.shortBreakDuration;
    document.getElementById('long-break-duration'      ).value = this.settings.longBreakDuration;
    document.getElementById('sessions-until-long-break').value = this.settings.sessionsUntilLongBreak;
    document.getElementById('sound-enabled'            ).checked = this.settings.soundEnabled;
    document.getElementById('auto-start-breaks'        ).checked = this.settings.autoStartBreaks;
    document.getElementById('auto-start-work'          ).checked = this.settings.autoStartWork;
    document.getElementById('sound-select'             ).value   = this.settings.selectedSound;
  }
}

/* =====================================================================
 *  Bootstrap the app
 * =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  window.pomodoroTimer = new PomodoroTimer();
});
