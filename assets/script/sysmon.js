// =====================================
// システムモニター（CPU使用率・メモリ使用量のリアルタイムグラフ）
// chrome.system.cpu / chrome.system.memory を使用（manifestの permissions が必要）
// =====================================
(() => {
    const SAMPLE_MS = 1000; // 計測間隔
    const HISTORY = 60;     // グラフに残すサンプル数（1秒間隔なら60秒分）

    const cpuValue = document.getElementById('cpu-value');
    const memValue = document.getElementById('mem-value');
    const cpuGraph = document.getElementById('cpu-graph');
    const memGraph = document.getElementById('mem-graph');
    const note = document.getElementById('sys-note');
    const picker = document.getElementById('color-picker');

    const hasApi = typeof chrome !== 'undefined' && chrome.system &&
        chrome.system.cpu && chrome.system.memory;
    if (!hasApi) {
        cpuValue.textContent = '--';
        memValue.textContent = '--';
        note.textContent = '拡張機能として読み込み、system.cpu / system.memory 権限を許可してください';
        return;
    }

    const cpuHist = [];
    const memHist = [];
    let prevCpu = null;

    const getCpu = () => new Promise(resolve => chrome.system.cpu.getInfo(resolve));
    const getMem = () => new Promise(resolve => chrome.system.memory.getInfo(resolve));

    function pushHistory(arr, value) {
        arr.push(value);
        if (arr.length > HISTORY) arr.shift();
    }

    // ---------- グラフ描画（最新が右端） ----------
    function drawGraph(canvas, data) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        const g = canvas.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);

        const color = getComputedStyle(document.documentElement)
            .getPropertyValue('--main-color').trim() || '#00eaff';

        // 50% の目安線
        g.strokeStyle = color;
        g.globalAlpha = 0.25;
        g.lineWidth = 1;
        g.setLineDash([2, 3]);
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
        g.setLineDash([]);

        if (data.length < 2) { g.globalAlpha = 1; return; }

        const step = w / (HISTORY - 1);
        const pts = data.map((v, i) => [
            w - (data.length - 1 - i) * step,
            h - (Math.min(100, Math.max(0, v)) / 100) * (h - 2) - 1
        ]);

        // 塗りつぶし
        g.beginPath();
        g.moveTo(pts[0][0], h);
        pts.forEach(([x, y]) => g.lineTo(x, y));
        g.lineTo(pts[pts.length - 1][0], h);
        g.closePath();
        g.fillStyle = color;
        g.globalAlpha = 0.22;
        g.fill();

        // 折れ線
        g.beginPath();
        pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
        g.globalAlpha = 1;
        g.lineWidth = 1.5;
        g.stroke();
    }

    function drawAll() {
        drawGraph(cpuGraph, cpuHist);
        drawGraph(memGraph, memHist);
    }

    // ---------- 計測 ----------
    async function sample() {
        if (document.hidden) return; // 見えていない間は計測しない

        try {
            const [cpu, mem] = await Promise.all([getCpu(), getMem()]);
            if (!cpu || !cpu.processors || !mem) throw new Error('no data');

            // CPU: usage は起動からの累積値なので、前回との差分から使用率を出す
            let total = 0;
            let idle = 0;
            cpu.processors.forEach(p => {
                total += p.usage.total;
                idle += p.usage.idle;
            });
            if (prevCpu && total > prevCpu.total) {
                const usage = (1 - (idle - prevCpu.idle) / (total - prevCpu.total)) * 100;
                pushHistory(cpuHist, usage);
                cpuValue.textContent = `${Math.round(usage)}%`;
            }
            prevCpu = { total, idle };

            // メモリ
            const used = mem.capacity - mem.availableCapacity;
            const percent = (used / mem.capacity) * 100;
            const GB = 1024 ** 3;
            pushHistory(memHist, percent);
            memValue.textContent =
                `${(used / GB).toFixed(1)} / ${(mem.capacity / GB).toFixed(1)} GB (${Math.round(percent)}%)`;

            note.textContent = '';
            drawAll();
        } catch (e) {
            console.error('System monitor error:', e);
            note.textContent = '取得エラー';
        }
    }

    // テーマカラー変更・画面サイズ変更で再描画
    if (picker) picker.addEventListener('input', drawAll);
    window.addEventListener('resize', drawAll);

    sample();
    setInterval(sample, SAMPLE_MS);
})();