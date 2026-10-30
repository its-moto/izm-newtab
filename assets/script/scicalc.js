// =====================================
// 関数電卓パネル（計算は scimath.js）
// 小さい電卓の「fx」から開く。式はキーボードでもボタンでも入力できる
// =====================================
(() => {
    const M = SciMath;
    const HISTORY_KEY = 'sci-history';
    const ANGLE_KEY = 'sci-angle';
    const HISTORY_MAX = 30;
    const CURSOR = '▮'; // テンプレートを入れたあとのカーソル位置

    const box = document.getElementById('sci-box');
    const input = document.getElementById('sci-input');
    const resultEl = document.getElementById('sci-result');
    const subEl = document.getElementById('sci-sub');
    const noteEl = document.getElementById('sci-note');
    const historyEl = document.getElementById('sci-history');
    const keysEl = document.getElementById('sci-keys');
    const angleBtn = document.getElementById('sci-angle-btn');
    const sdBtn = document.getElementById('sci-sd-btn');
    const texBtn = document.getElementById('sci-tex-btn');
    const graphBtn = document.getElementById('sci-graph-btn');
    const graph = document.getElementById('sci-graph');

    // [表示, 入力する文字（CURSOR の位置にカーソル）, 追加クラス]
    const KEYS = [
        ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['π', 'π'], ['e', 'e'], ['x', 'x'], ['(', '('], [')', ')'],
        ['sin⁻¹', 'asin('], ['cos⁻¹', 'acos('], ['tan⁻¹', 'atan('], ['√', '√('], ['x²', '²'], ['xʸ', '^'], ['n!', '!'], [',', ', '],
        ['sinh', 'sinh('], ['cosh', 'cosh('], ['tanh', 'tanh('], ['ln', 'ln('], ['log', 'log('], ['eˣ', 'e^('], ['|x|', 'abs('], ['⌫', 'back', 'op'],
        ['d/dx', `diff(${CURSOR}, x)`, 'fx'], ['∫', `int(${CURSOR}, x, 0, 1)`, 'fx'], ['Σ', `sum(${CURSOR}, k, 1, 10)`, 'fx'], ['7', '7', 'num'], ['8', '8', 'num'], ['9', '9', 'num'], ['÷', '÷', 'op'], ['AC', 'clear', 'op'],
        ['nCr', 'nCr('], ['nPr', 'nPr('], ['mod', 'mod('], ['4', '4', 'num'], ['5', '5', 'num'], ['6', '6', 'num'], ['×', '×', 'op'], ['ans', 'ans', 'op'],
        ['gcd', 'gcd('], ['lcm', 'lcm('], ['k', 'k'], ['1', '1', 'num'], ['2', '2', 'num'], ['3', '3', 'num'], ['−', '−', 'op'], ['y', 'y'],
        ['floor', 'floor('], ['ceil', 'ceil('], ['round', 'round('], ['0', '0', 'num'], ['.', '.', 'num'], ['+', '+', 'op'], ['=', 'eval', 'eq'],
    ];

    let angle = localStorage.getItem(ANGLE_KEY) === 'rad' ? 'rad' : 'deg';
    let mode = 'S';            // S: 分数 / D: 小数
    let last = null;           // 直前の結果（S⇔D・TeXコピー・グラフ用）
    let ans = null;            // ans で使う前の答え
    const vars = new Map();    // a = 5 で代入した変数
    let history = loadHistory();
    let historyPos = -1;       // ↑↓で履歴をたどる位置

    function loadHistory() {
        try {
            const data = JSON.parse(localStorage.getItem(HISTORY_KEY));
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    // ---------- ボタン ----------
    KEYS.forEach(([label, action, cls]) => {
        const b = document.createElement('button');
        b.className = `sci-key ${cls || ''}`;
        b.textContent = label;
        b.addEventListener('mousedown', e => e.preventDefault()); // 入力欄のカーソル位置を保つ
        b.addEventListener('click', () => press(action));
        keysEl.appendChild(b);
    });

    function press(action) {
        if (action === 'eval') return calculate();
        if (action === 'clear') {
            input.value = '';
            showIdle();
        } else if (action === 'back') {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            if (start === end && start > 0) input.setRangeText('', start - 1, end, 'end');
            else input.setRangeText('', start, end, 'end');
        } else {
            insert(action);
        }
        input.focus();
    }

    // カーソルの位置に入れる。テンプレートは ▮ の位置にカーソルを置く
    function insert(text) {
        const at = text.indexOf(CURSOR);
        const clean = text.replace(CURSOR, '');
        const start = input.selectionStart ?? input.value.length;
        input.setRangeText(clean, start, input.selectionEnd ?? start, 'end');
        if (at >= 0) input.setSelectionRange(start + at, start + at);
    }

    // ---------- 計算 ----------
    function calculate() {
        const src = input.value.trim();
        if (!src) return;
        try {
            const r = M.run(src, { angle, vars, ans });
            last = r;
            noteEl.textContent = r.tex ? `TeX → ${M.toText(M.parse(r.tex))}` : '';
            noteEl.classList.remove('error');
            if (r.kind === 'value') {
                ans = r.value;
                if (r.assign) vars.set(r.assign, r.value);
            }
            renderResult();
            pushHistory(src, r.assign ? M.formatValue(r.value, mode) : resultText());
            if (!graph.hidden) drawGraph();
        } catch (e) {
            last = null;
            resultEl.textContent = 'エラー';
            subEl.textContent = '';
            noteEl.textContent = e instanceof M.CalcError ? e.message : '式が読めません';
            noteEl.classList.add('error');
            updateButtons();
            if (!(e instanceof M.CalcError)) console.error(e);
        }
        historyPos = -1;
    }

    function resultText() {
        if (!last) return '';
        if (last.kind === 'expr') return M.toText(last.node);
        const text = M.formatValue(last.value, mode);
        return last.assign ? `${last.assign} = ${text}` : text;
    }

    function renderResult() {
        resultEl.textContent = resultText();
        resultEl.classList.toggle('expr', last?.kind === 'expr');
        if (last?.kind === 'value' && M.hasAlternate(last.value)) {
            subEl.textContent = `≒ ${M.formatValue(last.value, mode === 'S' ? 'D' : 'S')}`;
        } else if (last?.kind === 'expr') {
            subEl.textContent = last.vars.length ? `${last.vars.join(', ')} の式（グラフで表示できます）` : '';
        } else {
            subEl.textContent = '';
        }
        updateButtons();
    }

    function showIdle() {
        last = null;
        resultEl.textContent = '0';
        resultEl.classList.remove('expr');
        subEl.textContent = '';
        noteEl.textContent = '';
        noteEl.classList.remove('error');
        updateButtons();
    }

    function updateButtons() {
        angleBtn.textContent = angle.toUpperCase();
        sdBtn.disabled = !(last?.kind === 'value' && M.hasAlternate(last.value));
        sdBtn.textContent = mode === 'S' ? '分数 → 小数' : '小数 → 分数';
        texBtn.disabled = !last;
        graphBtn.classList.toggle('active', !graph.hidden);
    }

    // ---------- 履歴 ----------
    function pushHistory(expr, result) {
        history = history.filter(h => h.expr !== expr);
        history.unshift({ expr, result });
        history = history.slice(0, HISTORY_MAX);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* 保存できなくても続ける */ }
        renderHistory();
    }

    function renderHistory() {
        historyEl.replaceChildren(...history.map(h => {
            const row = document.createElement('div');
            row.className = 'sci-history-item';
            row.title = 'クリックで式を入れ直す';
            const expr = document.createElement('span');
            expr.className = 'sci-history-expr';
            expr.textContent = h.expr;
            const res = document.createElement('span');
            res.className = 'sci-history-result';
            res.textContent = `= ${h.result}`;
            row.append(expr, res);
            row.addEventListener('click', () => {
                input.value = h.expr;
                input.focus();
            });
            return row;
        }));
    }

    // ---------- 上のボタン ----------
    angleBtn.addEventListener('click', () => {
        angle = angle === 'deg' ? 'rad' : 'deg';
        localStorage.setItem(ANGLE_KEY, angle);
        updateButtons();
        if (input.value.trim()) calculate();
    });
    sdBtn.addEventListener('click', () => {
        mode = mode === 'S' ? 'D' : 'S';
        renderResult();
    });
    texBtn.addEventListener('click', async () => {
        if (!last) return;
        const tex = last.kind === 'expr' ? M.toTex(last.node) : M.valueToTex(last.value, mode);
        try {
            await navigator.clipboard.writeText(tex);
            flashNote(`TeX をコピーしました: ${tex}`);
        } catch {
            flashNote(tex); // コピーできなければ表示だけ
        }
    });
    graphBtn.addEventListener('click', () => {
        graph.hidden = !graph.hidden;
        updateButtons();
        if (!graph.hidden) {
            view = null;
            drawGraph();
        }
    });
    document.getElementById('sci-close-btn').addEventListener('click', close);

    function flashNote(text) {
        noteEl.textContent = text;
        noteEl.classList.remove('error');
    }

    // ---------- キーボード ----------
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            calculate();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (history.length === 0) return;
            e.preventDefault();
            historyPos = Math.max(-1, Math.min(history.length - 1, historyPos + (e.key === 'ArrowUp' ? 1 : -1)));
            input.value = historyPos < 0 ? '' : history[historyPos].expr;
        }
    });

    // ---------- 開く・閉じる ----------
    function open(initial) {
        Modal.open(box); // 後ろを暗くして触れなくする（modal.js）
        if (initial) input.value = initial;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        if (!graph.hidden) drawGraph();
    }
    function close() {
        Modal.close(box);
    }
    window.openSciCalc = open; // calculator.js の fx ボタンから呼ぶ

    // ---------- グラフ ----------
    // view: 表示範囲 { x0, x1, y0, y1 }（null のときは自動）
    let view = null;
    let hover = null;

    // 今の結果、なければ入力中の式から、変数が1つの式を取り出す
    function graphTarget() {
        let r = last;
        if (!r || r.kind !== 'expr') {
            try { r = M.run(input.value, { angle, vars, ans }); } catch { return null; }
        }
        if (r.kind !== 'expr' || r.vars.length !== 1) return null;
        return { f: M.compile(r.node, r.vars[0], { angle, vars, ans }), v: r.vars[0], label: M.toText(r.node) };
    }

    function autoView(f) {
        const ys = [];
        for (let i = 0; i <= 400; i++) {
            const y = f(-10 + i * 0.05);
            if (Number.isFinite(y)) ys.push(y);
        }
        ys.sort((a, b) => a - b);
        if (ys.length === 0) return { x0: -10, x1: 10, y0: -10, y1: 10 };
        // 極端な値（漸近線など）に引っぱられないよう、上下5%は除いて範囲を決める
        let lo = ys[Math.floor(ys.length * 0.05)];
        let hi = ys[Math.ceil(ys.length * 0.95) - 1];
        if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
        const pad = (hi - lo) * 0.15;
        return { x0: -10, x1: 10, y0: lo - pad, y1: hi + pad };
    }

    function niceStep(range) {
        const raw = range / 8;
        const p = 10 ** Math.floor(Math.log10(raw));
        const n = raw / p;
        return p * (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10);
    }

    function drawGraph() {
        const dpr = (window.devicePixelRatio || 1) * 2;
        const w = graph.clientWidth;
        const h = graph.clientHeight;
        if (!w || !h) return;
        graph.width = Math.round(w * dpr);
        graph.height = Math.round(h * dpr);
        const g = graph.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);

        const color = getComputedStyle(document.documentElement).getPropertyValue('--main-color').trim() || '#00eaff';
        const target = graphTarget();
        g.font = '12px MaruMonica, monospace';
        if (!target) {
            g.fillStyle = color;
            g.globalAlpha = 0.7;
            g.textAlign = 'center';
            g.fillText('x などの変数が1つある式を入力すると、ここにグラフが出ます', w / 2, h / 2);
            g.globalAlpha = 1;
            return;
        }
        if (!view) view = autoView(target.f);
        const { x0, x1, y0, y1 } = view;
        const sx = x => (x - x0) / (x1 - x0) * w;
        const sy = y => h - (y - y0) / (y1 - y0) * h;

        // 方眼と目盛り
        g.strokeStyle = color;
        g.fillStyle = color;
        g.lineWidth = 1;
        const xs = niceStep(x1 - x0);
        const ysStep = niceStep(y1 - y0);
        g.globalAlpha = 0.12;
        g.beginPath();
        for (let x = Math.ceil(x0 / xs) * xs; x <= x1; x += xs) { g.moveTo(sx(x), 0); g.lineTo(sx(x), h); }
        for (let y = Math.ceil(y0 / ysStep) * ysStep; y <= y1; y += ysStep) { g.moveTo(0, sy(y)); g.lineTo(w, sy(y)); }
        g.stroke();
        g.globalAlpha = 0.6;
        g.textAlign = 'left';
        const fmt = v => String(parseFloat(v.toPrecision(6)));
        for (let x = Math.ceil(x0 / xs) * xs; x <= x1; x += xs) {
            if (Math.abs(x) > xs / 2) g.fillText(fmt(x), sx(x) + 2, Math.min(h - 4, Math.max(12, sy(0) + 12)));
        }
        for (let y = Math.ceil(y0 / ysStep) * ysStep; y <= y1; y += ysStep) {
            if (Math.abs(y) > ysStep / 2) g.fillText(fmt(y), Math.min(w - 40, Math.max(2, sx(0) + 3)), sy(y) - 2);
        }
        // 軸
        g.globalAlpha = 0.5;
        g.beginPath();
        if (y0 < 0 && y1 > 0) { g.moveTo(0, sy(0)); g.lineTo(w, sy(0)); }
        if (x0 < 0 && x1 > 0) { g.moveTo(sx(0), 0); g.lineTo(sx(0), h); }
        g.stroke();

        // 曲線（値が飛ぶところ・計算できないところは線を切る）
        g.globalAlpha = 1;
        g.lineWidth = 2;
        g.shadowColor = color;
        g.shadowBlur = 6;
        g.beginPath();
        let drawing = false;
        let prevY = null;
        const N = Math.round(w * 2);
        for (let i = 0; i <= N; i++) {
            const x = x0 + (x1 - x0) * i / N;
            const y = target.f(x);
            const py = sy(y);
            const jump = prevY !== null && Math.abs(py - prevY) > h * 2;
            if (!Number.isFinite(y) || jump) { drawing = false; prevY = Number.isFinite(y) ? py : null; continue; }
            const cy = Math.max(-h, Math.min(2 * h, py));
            if (drawing) g.lineTo(sx(x), cy); else g.moveTo(sx(x), cy);
            drawing = true;
            prevY = py;
        }
        g.stroke();
        g.shadowBlur = 0;

        g.textAlign = 'left';
        g.fillText(`y = ${target.label}`, 6, 14);

        // マウスの位置の値
        if (hover) {
            const x = x0 + (x1 - x0) * hover.x / w;
            const y = target.f(x);
            g.globalAlpha = 0.5;
            g.setLineDash([3, 3]);
            g.beginPath();
            g.moveTo(sx(x), 0);
            g.lineTo(sx(x), h);
            g.stroke();
            g.setLineDash([]);
            g.globalAlpha = 1;
            if (Number.isFinite(y)) {
                g.beginPath();
                g.arc(sx(x), sy(y), 3.5, 0, Math.PI * 2);
                g.fill();
            }
            g.textAlign = 'right';
            g.fillText(`${target.v} = ${fmt(x)}, y = ${Number.isFinite(y) ? fmt(y) : '—'}`, w - 6, 14);
        }
    }

    // ホイールで拡大縮小、ドラッグで移動、ダブルクリックで元に戻す
    let drag = null;
    graph.addEventListener('wheel', (e) => {
        if (!view) return;
        e.preventDefault();
        const k = e.deltaY > 0 ? 1.2 : 1 / 1.2;
        const rect = graph.getBoundingClientRect();
        const px = view.x0 + (view.x1 - view.x0) * (e.clientX - rect.left) / rect.width;
        const py = view.y1 - (view.y1 - view.y0) * (e.clientY - rect.top) / rect.height;
        view = {
            x0: px + (view.x0 - px) * k, x1: px + (view.x1 - px) * k,
            y0: py + (view.y0 - py) * k, y1: py + (view.y1 - py) * k,
        };
        drawGraph();
    }, { passive: false });
    graph.addEventListener('pointerdown', (e) => {
        if (!view) return;
        drag = { x: e.clientX, y: e.clientY, view: { ...view } };
        graph.setPointerCapture(e.pointerId);
    });
    graph.addEventListener('pointermove', (e) => {
        const rect = graph.getBoundingClientRect();
        hover = { x: e.clientX - rect.left };
        if (drag) {
            const dx = (e.clientX - drag.x) / rect.width * (drag.view.x1 - drag.view.x0);
            const dy = (e.clientY - drag.y) / rect.height * (drag.view.y1 - drag.view.y0);
            view = { x0: drag.view.x0 - dx, x1: drag.view.x1 - dx, y0: drag.view.y0 + dy, y1: drag.view.y1 + dy };
        }
        drawGraph();
    });
    graph.addEventListener('pointerup', () => { drag = null; });
    graph.addEventListener('pointerleave', () => { hover = null; drawGraph(); });
    graph.addEventListener('dblclick', () => { view = null; drawGraph(); });

    renderHistory();
    showIdle();
})();
