// =====================================
// 温度などの詳しいセンサー情報（システムの「詳細」ボタンで開くパネル）
// 拡張機能だけでは温度を読めないので、LibreHardwareMonitor の Web サーバー（data.json）から取る
// LibreHardwareMonitor を入れていない人には、設定方法だけを表示する
// =====================================
(() => {
    const PORT_KEY = 'hw-port';
    const DEFAULT_PORT = 8085;
    const REFRESH_MS = 250;   // LibreHardwareMonitor の Update Interval を 250ms にするとこの速さで変わる
    const SWEEP_MS = 15000;   // グラフが左端から右端まで描くのにかかる時間
    const TIMEOUT_MS = 1500;
    const WARM = 70; // これ以上はオレンジ
    const HOT = 85;  // これ以上は赤

    const btn = document.getElementById('hw-toggle-btn');
    const panel = document.getElementById('hw-box');
    const statusEl = document.getElementById('hw-status');
    const summary = document.getElementById('hw-summary');
    const chartsEl = document.getElementById('hw-charts');
    const list = document.getElementById('hw-list');
    const setup = document.getElementById('hw-setup');
    const portInput = document.getElementById('hw-port');

    let port = Number(localStorage.getItem(PORT_KEY)) || DEFAULT_PORT;
    let timer = null;
    let connected = false;
    portInput.value = port;

    // ---------- データの取得 ----------
    async function fetchData() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(`http://localhost:${port}/data.json`, { cache: 'no-store', signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // ツリーから機器（CPU・GPU など）ごとにセンサーを集める
    function collectHardware(root) {
        const result = [];
        const walk = (node, hw) => {
            const isHardware = !node.Type && (node.HardwareId || isHardwareImage(node.ImageURL));
            let current = hw;
            if (isHardware) {
                current = { name: node.Text, id: node.HardwareId || '', image: node.ImageURL || '', sensors: [] };
                result.push(current);
            }
            if (node.Type && current) {
                current.sensors.push({
                    name: node.Text,
                    type: node.Type,
                    text: node.Value,
                    // RawValue は単位をそろえた値（通信量はいつも B/s）。版によって数値か "16309.2 B/s" のような文字列
                    value: typeof node.RawValue === 'number' ? node.RawValue : parseFloat(node.RawValue ?? node.Value),
                });
            }
            (node.Children || []).forEach(child => walk(child, current));
        };
        walk(root, null);
        return result;
    }
    // 古い版（HardwareId がない）では、アイコンの名前で機器かどうかを見分ける
    const isHardwareImage = url => /(cpu|amd|intel|nvidia|ati|gpu|ram|hdd|nic|battery|mainboard|chip)\.png$/i.test(url || '');

    // 機器の種類（並び順と、どのセンサーを出すかに使う）
    function kindOf(hw) {
        const s = `${hw.id} ${hw.image}`.toLowerCase();
        if (/cpu/.test(s) || /\/(amdcpu|intelcpu)/.test(s)) return 'cpu';
        if (/gpu|nvidia|ati\.png/.test(s)) return 'gpu';
        if (/\/vram/.test(s)) return 'virtual';
        if (/\/ram|ram\.png/.test(s)) return 'memory';
        if (/nvme|hdd|ssd|storage/.test(s)) return 'storage';
        if (/battery/.test(s)) return 'battery';
        if (/\/nic|nic\.png/.test(s)) return 'network';
        return 'other';
    }
    const KIND_ORDER = ['cpu', 'gpu', 'memory', 'virtual', 'storage', 'battery', 'network', 'other'];
    const KIND_LABEL = { cpu: 'CPU', gpu: 'GPU', memory: 'メモリ', virtual: '仮想メモリ', storage: 'ストレージ', battery: 'バッテリー', network: 'ネットワーク', other: 'その他' };

    // 種類ごとに出すセンサー（上から順に、条件に合うものを max 個まで）
    const RULES = {
        cpu: [
            { type: 'Temperature', re: /package|tctl|tdie|cpu|core.*(max|average)/i, max: 1, label: '温度' },
            { type: 'Load', re: /total/i, max: 1, label: '使用率' },
            { type: 'Power', re: /package|total|cpu/i, max: 1, label: '消費電力' },
            { type: 'Clock', re: /core/i, pick: 'max', label: '最大クロック' },
            { type: 'Fan', max: 2 },
        ],
        gpu: [
            { type: 'Temperature', re: /core|gpu/i, max: 1, label: '温度' },
            { type: 'Temperature', re: /hot ?spot/i, max: 1, label: 'ホットスポット' },
            { type: 'Load', re: /core|gpu/i, max: 1, label: '使用率' },
            { type: 'Power', re: /package|total|gpu|core/i, max: 1, label: '消費電力' },
            { type: 'Clock', re: /core/i, max: 1, label: 'クロック' },
            { type: 'SmallData', re: /memory used|used/i, max: 1, label: 'VRAM使用量' },
            { type: 'Fan', max: 2 },
        ],
        memory: [
            { type: 'Load', re: /^memory$|physical/i, max: 1, label: '使用率' },
            { type: 'Data', re: /used/i, max: 1, label: '使用量' },
            { type: 'Data', re: /available/i, max: 1, label: '空き' },
        ],
        virtual: [
            { type: 'Load', re: /memory/i, max: 1, label: '使用率' },
            { type: 'Data', re: /used/i, max: 1, label: '使用量' },
        ],
        storage: [
            { type: 'Temperature', max: 1, label: '温度' },
            { type: 'Load', re: /used space/i, max: 1, label: '使用済み' },
            { type: 'Throughput', re: /read/i, max: 1, label: '読み込み' },
            { type: 'Throughput', re: /write/i, max: 1, label: '書き込み' },
        ],
        battery: [
            { type: 'Level', re: /charge/i, max: 1, label: '残量' },
            { type: 'Level', re: /degradation|wear/i, max: 1, label: '劣化' },
            { type: 'Power', re: /rate|charge|discharge/i, max: 1, label: '充放電' },
        ],
        network: [
            { type: 'Throughput', re: /download/i, max: 1, label: '受信' },
            { type: 'Throughput', re: /upload/i, max: 1, label: '送信' },
        ],
        other: [
            { type: 'Temperature', max: 3 },
            { type: 'Fan', max: 3 },
        ],
    };

    function pickSensors(hw, kind) {
        const used = new Set();
        const rows = [];
        for (const rule of RULES[kind]) {
            const candidates = hw.sensors.filter(s => s.type === rule.type && !used.has(s) &&
                (!rule.re || rule.re.test(s.name)) && Number.isFinite(s.value));
            if (candidates.length === 0) continue;
            const chosen = rule.pick === 'max'
                ? [candidates.reduce((a, b) => (b.value > a.value ? b : a))]
                : candidates.slice(0, rule.max);
            chosen.forEach(s => {
                used.add(s);
                rows.push({ ...s, label: rule.label || s.name });
            });
        }
        return rows;
    }

    // ---------- グラフ ----------
    // sys: 拡張機能だけで取れるもの（sysmon.js から受け取る）/ それ以外は LibreHardwareMonitor から
    const valueOf = (hardware, kind, label) => hardware.find(h => h.kind === kind)?.rows.find(r => r.label === label)?.value;
    const formatRate = v => {
        const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        let i = 0;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)}${units[i]}`;
    };
    const CHART_DEFS = [
        { id: 'cpu', title: 'CPU使用率', sys: true, min: 0, max: 100, fmt: v => `${Math.round(v)}%` },
        { id: 'mem', title: 'メモリ使用率', sys: true, min: 0, max: 100, fmt: v => `${Math.round(v)}%` },
        {
            id: 'temp', title: '温度', legend: ['CPU', 'GPU'], floor: 10, fmt: v => `${Math.round(v)}℃`,
            pick: hw => [valueOf(hw, 'cpu', '温度'), valueOf(hw, 'gpu', '温度')],
        },
        {
            id: 'gpu', title: 'GPU使用率', min: 0, max: 100, fmt: v => `${Math.round(v)}%`,
            pick: hw => [valueOf(hw, 'gpu', '使用率')],
        },
        {
            id: 'power', title: '消費電力', legend: ['CPU', 'GPU'], min: 0, floor: 5, fmt: v => `${v.toFixed(1)}W`,
            pick: hw => [valueOf(hw, 'cpu', '消費電力'), valueOf(hw, 'gpu', '消費電力')],
        },
        {
            id: 'clock', title: 'CPU最大クロック', min: 0, floor: 1, fmt: v => `${v.toFixed(2)}GHz`,
            pick: hw => [valueOf(hw, 'cpu', '最大クロック') / 1000],
        },
        {
            id: 'net', title: 'ネットワーク', legend: ['受信', '送信'], min: 0, floor: 1024, fmt: formatRate,
            pick: hw => [valueOf(hw, 'network', '受信'), valueOf(hw, 'network', '送信')],
        },
        {
            id: 'disk', title: 'ストレージ', legend: ['読み', '書き'], min: 0, floor: 1024, fmt: formatRate,
            pick: hw => [valueOf(hw, 'storage', '読み込み'), valueOf(hw, 'storage', '書き込み')],
        },
    ];

    // カードを作る（LibreHardwareMonitor のものは値が来るまで隠しておく）
    const charts = CHART_DEFS.map(def => {
        const card = document.createElement('div');
        card.className = 'hw-chart';
        card.hidden = !def.sys;
        const head = document.createElement('div');
        head.className = 'hw-chart-head';
        const title = document.createElement('span');
        title.textContent = def.title;
        const value = document.createElement('span');
        value.className = 'hw-chart-value';
        head.append(title, value);
        const canvas = document.createElement('canvas');
        card.append(head, canvas);
        chartsEl.appendChild(card);
        return { def, card, value, latest: [], chart: new TrendChart(canvas, { windowMs: SWEEP_MS, min: def.min, max: def.max, floor: def.floor, format: def.fmt }) };
    });
    const chartById = id => charts.find(c => c.def.id === id);

    // コアごとの使用率（縦棒を並べる）
    const coresCard = document.createElement('div');
    coresCard.className = 'hw-chart hw-cores';
    const coresHead = document.createElement('div');
    coresHead.className = 'hw-chart-head';
    const coresTitle = document.createElement('span');
    coresTitle.textContent = 'コアごとの使用率';
    const coresValue = document.createElement('span');
    coresValue.className = 'hw-chart-value';
    coresHead.append(coresTitle, coresValue);
    const coresCanvas = document.createElement('canvas');
    coresCard.append(coresHead, coresCanvas);
    chartsEl.appendChild(coresCard);
    let cores = [];      // 最新のコアごとの使用率
    let shownCores = []; // 描いている値（cores に少しずつ近づけて滑らかに動かす）

    function feed(c, values) {
        c.latest = values;
        values.forEach((v, i) => c.chart.push(i, v));
        if (values.some(Number.isFinite)) c.card.hidden = false;
    }

    // 拡張機能のグラフはパネルを閉じていても記録しておく（開いたときに直近1分が見える）
    window.addEventListener('sysmon-sample', (e) => {
        feed(chartById('cpu'), [e.detail.cpu]);
        feed(chartById('mem'), [e.detail.mem]);
        cores = e.detail.cores;
    });

    function feedSensors(hardware) {
        charts.filter(c => c.def.pick).forEach(c => feed(c, c.def.pick(hardware)));
    }

    function drawCores() {
        const w = coresCanvas.clientWidth;
        const h = coresCanvas.clientHeight;
        if (!w || !h || cores.length === 0) return;
        shownCores = cores.map((v, i) => {
            const prev = shownCores[i] ?? v;
            return prev + (v - prev) * 0.2;
        });
        const dpr = (window.devicePixelRatio || 1) * 2 * PageZoom.value;
        coresCanvas.width = Math.round(w * dpr);
        coresCanvas.height = Math.round(h * dpr);
        const g = coresCanvas.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const color = getComputedStyle(document.documentElement).getPropertyValue('--main-color').trim() || '#00eaff';
        const gap = 3;
        const bw = (w - gap * (shownCores.length - 1)) / shownCores.length;
        g.font = '9px MaruMonica, monospace';
        g.textAlign = 'center';
        shownCores.forEach((v, i) => {
            const x = i * (bw + gap);
            const bh = Math.max(1, v / 100 * (h - 12));
            g.fillStyle = color;
            g.globalAlpha = 0.15;
            g.fillRect(x, 0, bw, h - 12);
            g.globalAlpha = 0.4 + v / 100 * 0.6;
            g.fillRect(x, h - 12 - bh, bw, bh);
            g.globalAlpha = 0.6;
            g.fillText(String(i), x + bw / 2, h - 2);
        });
        g.globalAlpha = 1;
        coresValue.textContent = `最大 ${Math.round(Math.max(...cores))}%`;
    }

    // パネルを開いている間だけ描く（30fps くらいに抑える）
    let drawing = false;
    let lastDraw = 0;
    function drawLoop(now) {
        if (!drawing) return;
        requestAnimationFrame(drawLoop);
        if (now - lastDraw < 33) return;
        lastDraw = now;
        charts.forEach(c => {
            if (c.card.hidden) return;
            c.chart.draw(now);
            const parts = c.latest
                .map((v, i) => (Number.isFinite(v) ? `${c.def.legend ? `${c.def.legend[i]} ` : ''}${c.def.fmt(v)}` : null))
                .filter(Boolean);
            c.value.textContent = parts.join(' / ');
        });
        drawCores();
    }

    // ---------- 表示 ----------
    const tempClass = t => (t >= HOT ? 'hot' : t >= WARM ? 'warm' : '');

    function render(data) {
        const hardware = collectHardware(data)
            .map(hw => ({ ...hw, kind: kindOf(hw) }))
            .map(hw => ({ ...hw, rows: pickSensors(hw, hw.kind) }))
            .filter(hw => hw.rows.length > 0)
            // ネットワークは一番通信している1つだけ
            .filter((hw, i, all) => hw.kind !== 'network' || hw === all.filter(h => h.kind === 'network')
                .reduce((a, b) => (sumValues(b) > sumValues(a) ? b : a)))
            .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

        // 上の大きい表示：CPU と GPU の温度
        summary.replaceChildren(...['cpu', 'gpu'].map(kind => {
            const hw = hardware.find(h => h.kind === kind);
            const temp = hw?.rows.find(r => r.type === 'Temperature');
            if (!temp) return null;
            const el = document.createElement('div');
            el.className = `hw-temp ${tempClass(temp.value)}`;
            const label = document.createElement('span');
            label.className = 'hw-temp-label';
            label.textContent = KIND_LABEL[kind];
            const value = document.createElement('span');
            value.className = 'hw-temp-value';
            value.textContent = `${temp.value.toFixed(0)}℃`;
            const bar = document.createElement('div');
            bar.className = 'hw-temp-bar';
            const fill = document.createElement('div');
            fill.style.width = `${Math.min(100, Math.max(0, (temp.value - 20) / (100 - 20) * 100))}%`;
            bar.appendChild(fill);
            el.append(label, value, bar);
            return el;
        }).filter(Boolean));

        list.replaceChildren(...hardware.map(hw => {
            const group = document.createElement('div');
            group.className = 'hw-group';
            const head = document.createElement('div');
            head.className = 'hw-group-head';
            head.textContent = hw.kind === 'other' ? hw.name : `${KIND_LABEL[hw.kind]}  ${hw.name}`;
            head.title = hw.name;
            group.appendChild(head);
            hw.rows.forEach(r => {
                const row = document.createElement('div');
                row.className = `hw-row ${r.type === 'Temperature' ? tempClass(r.value) : ''}`;
                const name = document.createElement('span');
                name.textContent = r.label;
                name.title = r.name;
                const value = document.createElement('span');
                value.className = 'sys-value';
                value.textContent = r.text;
                row.append(name, value);
                group.appendChild(row);
            });
            return group;
        }));
        feedSensors(hardware);
    }
    const sumValues = hw => hw.rows.reduce((s, r) => s + (r.value || 0), 0);

    function setConnected(ok) {
        connected = ok;
        btn.classList.toggle('connected', ok);
        btn.title = ok ? '温度などの詳細（LibreHardwareMonitor に接続中）' : '温度などの詳細（LibreHardwareMonitor が必要です）';
        setup.hidden = ok;
        summary.hidden = !ok;
        list.hidden = !ok;
        statusEl.textContent = ok ? `● 接続中（localhost:${port}）` : '未接続';
        statusEl.classList.toggle('connected', ok);
    }

    let fetching = false; // 前の取得が終わるまで次は送らない
    async function update() {
        if (document.hidden || fetching) return;
        fetching = true;
        try {
            render(await fetchData());
            setConnected(true);
        } catch {
            setConnected(false);
        } finally {
            fetching = false;
        }
    }

    // ---------- 開く・閉じる ----------
    // 開いている間だけ定期的に取り直す。後ろは暗くして触れなくする（modal.js）
    function setOpen(open) {
        if (open) Modal.open(panel); else Modal.close(panel);
        drawing = open;
        if (open) requestAnimationFrame(drawLoop);
        clearInterval(timer);
        if (open) {
            update();
            timer = setInterval(update, REFRESH_MS);
        }
    }

    btn.addEventListener('click', () => setOpen(true));
    document.getElementById('hw-close-btn').addEventListener('click', () => setOpen(false));
    document.getElementById('hw-retry-btn').addEventListener('click', () => {
        const p = Number(portInput.value);
        if (Number.isInteger(p) && p > 0 && p < 65536) {
            port = p;
            localStorage.setItem(PORT_KEY, p);
        } else {
            portInput.value = port;
        }
        update();
    });

    setConnected(false);
    // 開く前に、ツールが動いているかだけ一度確かめてボタンに印を付ける
    update();
})();
