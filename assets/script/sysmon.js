// =====================================
// システムモニター（CPU使用率・メモリ使用量のリアルタイムグラフ）
// chrome.system.cpu / chrome.system.memory を使用（manifestの permissions が必要）
// グラフは心電図のように左から右へ描き、右端まで行ったら左端から上書きする
// =====================================
(() => {
    const SAMPLE_MS = 250;   // 計測間隔
    const TEXT_MS = 1000;    // 数値表示の更新間隔（速すぎると読めないので）
    const SWEEP_MS = 10000;  // 左端から右端まで描くのにかかる時間
    const GAP_PX = 14;       // 描画位置の先にある消去部分の幅
    const EASE = 0.35;       // 1pxごとに目標値へ近づく割合（線をなめらかにする）

    const cpuValue = document.getElementById('cpu-value');
    const memValue = document.getElementById('mem-value');
    const note = document.getElementById('sys-note');
    const osDetail = document.getElementById('sys-os');
    const cpuDetail = document.getElementById('cpu-detail');
    const coresEl = document.getElementById('cpu-cores');
    const picker = document.getElementById('color-picker');

    const hasApi = typeof chrome !== 'undefined' && chrome.system &&
        chrome.system.cpu && chrome.system.memory;
    if (!hasApi) {
        cpuValue.textContent = '--';
        memValue.textContent = '--';
        note.textContent = '拡張機能として読み込み、system.cpu / system.memory 権限を許可してください';
        return;
    }

    // target: 最新の計測値(%)、shown: 描画中の値、cols: 横1pxごとの値
    const graphs = {
        cpu: { canvas: document.getElementById('cpu-graph'), target: null, shown: null, cols: null },
        mem: { canvas: document.getElementById('mem-graph'), target: null, shown: null, cols: null },
    };
    let prevCpu = null;    // 前回のコアごとの累積値 [{ total, idle }]
    let coreFills = [];
    let lastText = 0;
    let lastCol = null;
    let color = '#00eaff';

    const getCpu = () => new Promise(resolve => chrome.system.cpu.getInfo(resolve));
    const getMem = () => new Promise(resolve => chrome.system.memory.getInfo(resolve));

    // ---------- OS・CPUの詳細 ----------
    // "AMD Ryzen 7 5800X 8-Core Processor" → "Ryzen 7 5800X" のように短くする（正式名はツールチップに出す）
    function shortCpuName(name) {
        return name
            .replace(/\((R|TM)\)/gi, '')
            .replace(/\s+(w\/|with)\s+Radeon.*$/i, '') // 内蔵GPUの名前
            .replace(/^\s*(\d+th Gen\s+)?(AMD|Intel)\s+/i, '')
            .replace(/\s+@\s+[\d.]+\s*GHz/i, '')
            .replace(/\b\d+-Core\b|\bProcessor\b|\bCPU\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function showDetails(cpu) {
        const name = shortCpuName(cpu.modelName || '');
        cpuDetail.textContent = `${name} ${cpu.numOfProcessors}T`;
        cpuDetail.title = `${cpu.modelName}（${cpu.archName} / ${cpu.numOfProcessors}スレッド）`;

        // Windows 10 と 11 は UA の文字列では区別できないので platformVersion を見る（13以上が11）
        let os = navigator.userAgentData?.platform || navigator.platform;
        try {
            const ua = await navigator.userAgentData.getHighEntropyValues(['platformVersion', 'architecture', 'bitness']);
            const major = parseInt(ua.platformVersion, 10);
            if (ua.platform === 'Windows' && major > 0) os = `Windows ${major >= 13 ? 11 : 10}`;
            else if (ua.platformVersion) os = `${ua.platform} ${ua.platformVersion}`;
            const arch = ua.architecture === 'arm' ? 'ARM' : ua.bitness === '64' ? 'x64' : 'x86';
            os += ` (${arch})`;
        } catch {
            // userAgentData が無いブラウザでは platform のみ
        }
        osDetail.textContent = os;
    }

    // コアごとの横向きバー。横に最大8個ずつ並べる（16スレッドなら横8x縦2、12なら横6x縦2）
    const CORE_COLUMNS = 8;
    function setupCores(count) {
        coresEl.style.gridTemplateColumns =
            `repeat(${Math.min(CORE_COLUMNS, Math.ceil(count / 2))}, 1fr)`;
        coreFills = Array.from({ length: count }, () => {
            const core = document.createElement('div');
            core.className = 'cpu-core';
            const fill = document.createElement('div');
            fill.className = 'cpu-core-fill';
            fill.style.width = '0%';
            core.appendChild(fill);
            coresEl.appendChild(core);
            return fill;
        });
    }

    function readColor() {
        color = getComputedStyle(document.documentElement)
            .getPropertyValue('--main-color').trim() || '#00eaff';
    }

    // 描画の解像度。2本指で拡大（ピンチズーム）しても devicePixelRatio は変わらないので、
    // ふだんから2倍で描き、拡大されたらその倍率に合わせる（最大4倍）
    function pixelScale() {
        const pinch = window.visualViewport?.scale || 1;
        return (window.devicePixelRatio || 1) * Math.min(4, Math.max(2, pinch));
    }

    // キャンバスのサイズや倍率が変わったら描画バッファを作り直す
    function fitCanvas(graph) {
        const { canvas } = graph;
        const scale = pixelScale();
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return false;
        if (canvas.width !== Math.round(w * scale) || canvas.height !== Math.round(h * scale)) {
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
        }
        // 波形のデータは幅が変わったときだけ作り直す（倍率が変わっても消さない）
        if (graph.cols?.length !== Math.round(w)) {
            graph.cols = new Float32Array(Math.round(w)).fill(NaN);
            lastCol = null;
        }
        return true;
    }

    // ---------- 描画 ----------
    function drawGraph(graph, head) {
        const { canvas, cols } = graph;
        const dpr = canvas.width / canvas.clientWidth;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const g = canvas.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);

        // 方眼（心電図の記録紙）
        g.strokeStyle = color;
        g.lineWidth = 1;
        g.globalAlpha = 0.08;
        g.beginPath();
        for (let x = 10.5; x < w; x += 10) { g.moveTo(x, 0); g.lineTo(x, h); }
        for (let y = h - 10.5; y > 0; y -= 10) { g.moveTo(0, y); g.lineTo(w, y); }
        g.stroke();

        // 50% の目安線
        g.globalAlpha = 0.25;
        g.setLineDash([2, 3]);
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
        g.setLineDash([]);

        const toY = v => h - (Math.min(100, Math.max(0, v)) / 100) * (h - 4) - 2;
        const n = cols.length;

        // 波形：描画位置から遠い（古い）ほど薄くする。数pxずつまとめて描く
        g.lineWidth = 1.5;
        g.lineJoin = 'round';
        g.shadowColor = color;
        g.shadowBlur = 6;
        // age: 描画位置から何px後ろ（＝左、折り返しあり）の列か。古い方から新しい方へたどる
        const CHUNK = 6;
        for (let age = n - 1; age >= 0; age -= CHUNK) {
            g.beginPath();
            let started = false;
            for (let a = age; a >= Math.max(age - CHUNK, 0); a--) {
                const x = (head - a + n) % n;
                const v = cols[x];
                // まだ値のない列（消去部分を含む）や、右端→左端の折り返しでは線をつなげない
                if (Number.isNaN(v)) { started = false; continue; }
                if (started && x === 0) started = false;
                if (started) g.lineTo(x, toY(v)); else { g.moveTo(x, toY(v)); started = true; }
            }
            g.globalAlpha = 1 - (age / n) * 0.8;
            g.stroke();
        }

        // 描画位置の光る点
        const v = cols[head];
        if (!Number.isNaN(v)) {
            g.globalAlpha = 1;
            g.shadowBlur = 12;
            g.fillStyle = color;
            g.beginPath();
            g.arc(head, toY(v), 2.5, 0, Math.PI * 2);
            g.fill();
        }
        g.shadowBlur = 0;
        g.globalAlpha = 1;
    }

    function frame(now) {
        requestAnimationFrame(frame);
        const list = Object.values(graphs);
        if (!list.every(fitCanvas)) return;

        const n = list[0].cols.length;
        const col = Math.floor(((now % SWEEP_MS) / SWEEP_MS) * n);
        if (lastCol === null) lastCol = col;

        // 前のフレームから進んだ列に値を書き込む（右端まで行ったら左端へ）
        const steps = (col - lastCol + n) % n;
        list.forEach(graph => {
            if (graph.target === null) return;
            for (let i = 1; i <= steps; i++) {
                const x = (lastCol + i) % n;
                graph.shown += (graph.target - graph.shown) * EASE;
                graph.cols[x] = graph.shown;
                // 描画位置の先は消しておく（心電図の消去バー）
                graph.cols[(x + GAP_PX) % n] = NaN;
            }
        });
        lastCol = col;

        list.forEach(graph => drawGraph(graph, col));
    }

    function setTarget(graph, value) {
        if (graph.shown === null) graph.shown = value;
        graph.target = value;
    }

    // ---------- 計測 ----------
    async function sample() {
        if (document.hidden) return; // 見えていない間は計測しない

        try {
            const [cpu, mem] = await Promise.all([getCpu(), getMem()]);
            if (!cpu || !cpu.processors || !mem) throw new Error('no data');
            const updateText = performance.now() - lastText >= TEXT_MS;
            if (updateText) lastText = performance.now();

            // CPU: usage は起動からの累積値なので、前回との差分から使用率を出す
            const now = cpu.processors.map(p => ({ total: p.usage.total, idle: p.usage.idle }));
            if (!prevCpu) {
                showDetails(cpu);
                setupCores(now.length);
            } else {
                let total = 0;
                let idle = 0;
                now.forEach((c, i) => {
                    const dTotal = c.total - prevCpu[i].total;
                    const dIdle = c.idle - prevCpu[i].idle;
                    total += dTotal;
                    idle += dIdle;
                    if (dTotal > 0) coreFills[i].style.width = `${(1 - dIdle / dTotal) * 100}%`;
                });
                if (total > 0) {
                    const usage = (1 - idle / total) * 100;
                    setTarget(graphs.cpu, usage);
                    if (updateText) cpuValue.textContent = `${Math.round(usage)}%`;
                }
            }
            prevCpu = now;

            // メモリ
            const used = mem.capacity - mem.availableCapacity;
            const percent = (used / mem.capacity) * 100;
            const GB = 1024 ** 3;
            setTarget(graphs.mem, percent);
            if (updateText) {
                memValue.textContent =
                    `${(used / GB).toFixed(1)} / ${(mem.capacity / GB).toFixed(1)} GB (${Math.round(percent)}%)`;
            }

            note.textContent = '';
        } catch (e) {
            console.error('System monitor error:', e);
            note.textContent = '取得エラー';
        }
    }

    // テーマカラーが変わったら線の色も変える
    if (picker) picker.addEventListener('input', readColor);

    readColor();
    sample();
    setInterval(sample, SAMPLE_MS);
    requestAnimationFrame(frame);
})();
