// =====================================
// 接続状態・Ping（回線速度パネルの下）
// 接続の種類などは navigator.connection（Chromeの推定値）、Ping は Cloudflare への往復時間
// =====================================
(() => {
    const PING_URL = 'https://speed.cloudflare.com/__down?bytes=0';
    const PING_MS = 5000;     // Ping の間隔
    const PING_HISTORY = 40;  // グラフに残す回数
    const PING_TIMEOUT_MS = 3000;

    const statusEl = document.getElementById('net-status');
    const pingEl = document.getElementById('net-ping');
    const graph = document.getElementById('net-ping-graph');
    const conn = navigator.connection;

    const pings = []; // ms（失敗は null）

    // ---------- 接続状態 ----------
    function renderStatus() {
        if (!navigator.onLine) {
            statusEl.textContent = 'オフライン';
            statusEl.classList.add('bad');
            return;
        }
        statusEl.classList.remove('bad');
        if (!conn) {
            statusEl.textContent = 'オンライン';
            return;
        }
        // Chrome は downlink を最大 10Mbps、rtt を 25ms 単位に丸めて返す
        const type = conn.type && conn.type !== 'unknown' ? `${conn.type} / ` : '';
        const downlink = conn.downlink >= 10 ? '10+' : conn.downlink;
        statusEl.textContent = `${type}${conn.effectiveType} ${downlink}Mbps`;
        statusEl.title = `推定RTT ${conn.rtt}ms${conn.saveData ? ' / データセーバー有効' : ''}（Chromeの推定値）`;
    }

    // ---------- Ping ----------
    async function ping() {
        // 見えていない間と、回線速度の計測中（speedchecker.js）は測らない
        if (document.hidden || (typeof isTestRunning !== 'undefined' && isTestRunning)) return;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
        let ms = null;
        try {
            const start = performance.now();
            const res = await fetch(PING_URL, { cache: 'no-store', signal: controller.signal });
            await res.arrayBuffer();
            if (res.ok) ms = performance.now() - start;
        } catch {
            // タイムアウト・オフライン
        } finally {
            clearTimeout(timeoutId);
        }

        pings.push(ms);
        if (pings.length > PING_HISTORY) pings.shift();
        pingEl.textContent = ms === null ? '失敗' : `${Math.round(ms)}ms`;
        pingEl.classList.toggle('bad', ms === null);
        drawGraph();
    }

    // 最新が右端の細い棒グラフ。失敗した回は下に赤い印を出す
    function drawGraph() {
        const dpr = (window.devicePixelRatio || 1) * PageZoom.value; // ページの拡大（layout.js）でもぼやけないように
        const w = graph.clientWidth;
        const h = graph.clientHeight;
        if (!w || !h) return;
        graph.width = Math.round(w * dpr);
        graph.height = Math.round(h * dpr);
        const g = graph.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);

        const color = getComputedStyle(document.documentElement)
            .getPropertyValue('--main-color').trim() || '#00eaff';
        const ok = pings.filter(v => v !== null);
        const max = Math.max(50, ...ok) * 1.1; // 50ms 未満なら 50ms を上限に
        const step = w / PING_HISTORY;

        pings.forEach((v, i) => {
            const x = w - (pings.length - i) * step;
            if (v === null) {
                g.globalAlpha = 1;
                g.fillStyle = '#ff3030';
                g.fillRect(x + 1, h - 3, step - 2, 3);
                return;
            }
            const bh = Math.max(1, (v / max) * h);
            g.fillStyle = color;
            g.globalAlpha = i === pings.length - 1 ? 1 : 0.5;
            g.fillRect(x + 1, h - bh, step - 2, bh);
        });
        g.globalAlpha = 1;
    }

    // ---------- 起動時の処理 ----------
    if (conn) conn.addEventListener('change', renderStatus);
    window.addEventListener('online', () => { renderStatus(); ping(); });
    window.addEventListener('offline', renderStatus);

    renderStatus();
    ping();
    setInterval(ping, PING_MS);
})();
