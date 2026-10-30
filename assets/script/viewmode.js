// =====================================
// 背景鑑賞モード（「背景を選択」の左の目のボタン）
// パネルを右下から順に閉じて背景を見せ、左下にシステムログを流し続ける（背景の暗さは設定のまま）
// クリックかキーで、パネルが起動演出のように戻ってくる
// =====================================
(() => {
    const LOG_MAX = 14;
    const btn = document.getElementById('view-mode-btn');
    const root = document.documentElement;

    // ログに使う最新の値（各機能から受け取る）
    const latest = { cpu: null, mem: null, weather: null };
    window.addEventListener('sysmon-sample', e => {
        latest.cpu = e.detail.cpu;
        latest.mem = e.detail.mem;
    });
    window.addEventListener('weather-now', e => { latest.weather = e.detail.code; });

    let overlay = null;
    let logTimer = null;
    let clockTimer = null;
    let active = false;
    let busy = false; // 開閉のアニメーション中

    const pad = n => String(n).padStart(2, '0');
    const timeText = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const rnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
    const text = id => document.getElementById(id)?.textContent.trim() || '';

    // ---------- ログの中身 ----------
    // 本物の値（画面の各パネルや計測値）と、雰囲気用のダミーを混ぜて流す。英語の中に日本語が混ざらないよう訳す
    // 天気コード（WMO）→ 英語
    function weatherWord(code) {
        if (code === null) return null;
        if (code === 0) return 'clear';
        if (code <= 2) return 'partly cloudy';
        if (code === 3) return 'overcast';
        if (code === 45 || code === 48) return 'fog';
        if (code >= 51 && code <= 57) return 'drizzle';
        if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
        if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
        if (code >= 95) return 'thunderstorm';
        return 'unknown';
    }
    const WORDS = { '充電中': 'charging', '放電中': 'discharging', 'バッテリーなし': 'no battery', 'AC電源': 'AC', 'オフライン': 'offline', 'オンライン': 'online', '失敗': 'timeout', '発生': 'origin', '検知': 'detected' };
    const english = s => Object.entries(WORDS).reduce((out, [ja, en]) => out.replaceAll(ja, en), s);

    const REAL = [
        () => latest.cpu !== null && ['CPU', `load ${Math.round(latest.cpu)}%  mem ${Math.round(latest.mem)}%`],
        () => latest.weather !== null && text('main-temp') && ['WTHR', `${weatherWord(latest.weather)}  ${text('main-temp')}°C`],
        () => text('net-ping') && ['NET', english(`ping ${text('net-ping')}  ${text('net-status')}`)],
        () => text('level') && ['PWR', english(`battery ${text('level')}  ${text('status')}`)],
        () => text('storage-value') && ['DISK', `storage ${text('storage-value')}`],
        () => {
            const sep = document.querySelector('#eew-list .eew-sep');
            return sep && ['QUAKE', english(`latest ${sep.textContent.trim()}`)];
        },
        () => ['TIME', `${new Date().toLocaleDateString('ja-JP')}  uptime ${Math.floor(performance.now() / 60000)}m`],
        () => {
            // メモのチェックリスト（memo.js）。中身は日本語なので数だけ出す
            if (typeof Memo === 'undefined') return null;
            const { open, done } = Memo.taskCounts();
            if (open + done === 0) return null;
            return ['TODO', open > 0 ? `${open} task${open > 1 ? 's' : ''} remaining  (${done} done)` : 'all tasks done'];
        },
    ];
    const DUMMY = [
        () => ['SCAN', `sector ${rnd(1, 9)}${pick('ABCDEFG')} ... clear`],
        () => ['SYNC', `uplink ${(90 + Math.random() * 10).toFixed(1)}%`],
        () => ['CORE', `thermal nominal  fan ${rnd(1800, 3200)}rpm`],
        () => ['MEM', `page 0x${rnd(0, 0xffffff).toString(16).padStart(6, '0')} verified`],
        () => ['NET', `packet ${rnd(100, 999)} routed via node-${rnd(1, 64)}`],
        () => ['GPU', `shader cache warm  ${rnd(55, 144)}fps`],
        () => ['SEC', 'firewall  0 threats'],
        () => ['AI', pick(['waiting for input', 'idle', 'dreaming of electric sheep', 'all good'])],
        () => ['ORBIT', `sat-${rnd(1, 12)} signal ${rnd(-90, -40)}dBm`],
        () => ['SYS', `entropy ${(Math.random()).toFixed(4)}`],
    ];

    // 本物の値は全部を順番（毎回シャッフル）に出し、同じ種類が続かないようにする。取れないものは飛ばす
    let realQueue = [];
    let lastTag = '';
    function nextReal() {
        for (let tries = 0; tries < REAL.length * 2; tries++) {
            if (realQueue.length === 0) realQueue = [...REAL].sort(() => Math.random() - 0.5);
            const line = realQueue.shift()();
            if (line && line[0] !== lastTag) return line;
        }
        return null;
    }

    function nextLine() {
        let line = Math.random() < 0.6 ? nextReal() : null;
        while (!line || line[0] === lastTag) line = pick(DUMMY)();
        lastTag = line[0];
        return line;
    }

    function addLog() {
        const log = overlay.querySelector('.view-log');
        const [tag, msg] = nextLine();
        const row = document.createElement('div');
        const time = document.createElement('span');
        time.className = 'view-log-time';
        time.textContent = `[${timeText(new Date())}]`;
        const tagEl = document.createElement('span');
        tagEl.className = 'view-log-tag';
        tagEl.textContent = tag.padEnd(5, ' ');
        row.append(time, tagEl, document.createTextNode(msg));
        log.appendChild(row);
        while (log.children.length > LOG_MAX) log.firstChild.remove();
        // 次の行までの間隔をばらつかせて、本物のログっぽく
        logTimer = setTimeout(addLog, rnd(350, 1400));
    }

    function updateClock() {
        const now = new Date();
        overlay.querySelector('.view-clock').textContent = timeText(now);
        const week = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
        overlay.querySelector('.view-date').textContent = `${now.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${week}`;
    }

    // ---------- 入る・戻る ----------
    async function enter() {
        if (active || busy) return;
        busy = true;
        active = true;
        await Boot.panelsOut({ step: 30, hide: el => el.classList.add('view-hidden') });
        root.classList.add('viewing');

        overlay = document.createElement('div');
        overlay.id = 'view-mode';
        overlay.innerHTML = `
            <div class="boot-corner tl"></div><div class="boot-corner tr"></div>
            <div class="boot-corner bl"></div><div class="boot-corner br"></div>
            <div class="view-hint">VIEW MODE — PRESS ANY KEY TO RETURN</div>
            <div class="view-log"></div>
            <div class="view-time"><div class="view-clock"></div><div class="view-date"></div></div>`;
        document.body.appendChild(overlay);
        updateClock();
        clockTimer = setInterval(updateClock, 1000);
        addLog();

        // すぐのクリックで戻らないよう、少し待ってから受け付ける
        setTimeout(() => {
            overlay?.addEventListener('click', exit);
            window.addEventListener('keydown', onKey);
        }, 300);
        busy = false;
    }

    function onKey(e) {
        e.preventDefault();
        exit();
    }

    async function exit() {
        if (!active || busy) return;
        busy = true;
        window.removeEventListener('keydown', onKey);
        clearTimeout(logTimer);
        clearInterval(clockTimer);
        overlay.classList.add('leaving');
        setTimeout(() => { overlay?.remove(); overlay = null; }, 400);
        root.classList.remove('viewing');
        await Boot.panelsIn({ delay: 150, step: 40, reveal: el => el.classList.remove('view-hidden') });
        active = false;
        busy = false;
    }

    btn.addEventListener('click', enter);
})();
