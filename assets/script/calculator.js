// =====================================
// 電卓（eval不使用・再帰下降パーサー）
// =====================================
(() => {
    const box = document.getElementById('calc-box');
    const displayEl = document.getElementById('calc-display');
    const historyEl = document.getElementById('calc-history');
    const keysEl = document.getElementById('calc-keys');

    // [表示, 入力値/アクション, 追加クラス]
    const LAYOUT = [
        ['C', 'clear', 'op'], ['⌫', 'back', 'op'], ['(', '(', 'op'], [')', ')', 'op'],
        ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷', 'op'],
        ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×', 'op'],
        ['1', '1'], ['2', '2'], ['3', '3'], ['−', '−', 'op'],
        ['0', '0'], ['.', '.'], ['%', '%', 'op'], ['+', '+', 'op'],
        ['ANS', 'ans', 'op'], ['fx', 'sci', 'op'], ['=', 'eval', 'wide2']
    ];

    let expr = '';
    let lastAnswer = '0';
    let justEvaluated = false;

    LAYOUT.forEach(([label, action, cls]) => {
        const b = document.createElement('button');
        b.className = 'calc-key ' + (cls || '');
        b.textContent = label;
        b.addEventListener('click', () => press(action));
        keysEl.appendChild(b);
    });

    // ---------- 式の評価 ----------
    function evaluate(src) {
        const tokens = src.match(/\d+\.?\d*|\.\d+|[+\-*/()%]/g) || [];
        if (tokens.join('') !== src.replace(/\s/g, '')) throw new Error('syntax');
        let pos = 0;
        const peek = () => tokens[pos];
        const next = () => tokens[pos++];

        function parseExpr() {
            let v = parseTerm();
            while (peek() === '+' || peek() === '-') {
                const op = next();
                const r = parseTerm();
                v = op === '+' ? v + r : v - r;
            }
            return v;
        }
        function parseTerm() {
            let v = parseUnary();
            while (peek() === '*' || peek() === '/') {
                const op = next();
                const r = parseUnary();
                if (op === '/' && r === 0) throw new Error('div0');
                v = op === '*' ? v * r : v / r;
            }
            return v;
        }
        function parseUnary() {
            if (peek() === '-') { next(); return -parseUnary(); }
            if (peek() === '+') { next(); return parseUnary(); }
            return parsePostfix();
        }
        function parsePostfix() {
            let v = parsePrimary();
            while (peek() === '%') { next(); v /= 100; }
            return v;
        }
        function parsePrimary() {
            const t = next();
            if (t === undefined) throw new Error('syntax');
            if (t === '(') {
                const v = parseExpr();
                if (next() !== ')') throw new Error('syntax');
                return v;
            }
            const n = parseFloat(t);
            if (isNaN(n)) throw new Error('syntax');
            return n;
        }

        const result = parseExpr();
        if (pos !== tokens.length) throw new Error('syntax');
        if (!isFinite(result)) throw new Error('range');
        return result;
    }

    const toInternal = s => s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

    // 括弧が足りなければ自動で閉じる
    function autoClose(s) {
        const open = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
        return open > 0 ? s + ')'.repeat(open) : s;
    }

    function formatNumber(n) {
        return String(parseFloat(n.toPrecision(12))).replace('-', '−');
    }

    // ---------- 入力処理 ----------
    function render(isError = false) {
        displayEl.textContent = expr === '' ? '0' : expr;
        displayEl.classList.toggle('error', isError);
        displayEl.scrollLeft = displayEl.scrollWidth;
    }

    function press(action) {
        const isOp = ['+', '−', '×', '÷'].includes(action);
        const isDigit = /^[0-9.]$/.test(action);

        // 計算直後に数字を打ったら新規入力、演算子なら答えを引き継ぐ
        if (justEvaluated) {
            if (isDigit || action === '(') expr = '';
            justEvaluated = false;
        }

        switch (action) {
            case 'clear':
                expr = ''; historyEl.textContent = ''; break;
            case 'back':
                expr = expr.slice(0, -1); break;
            case 'ans':
                expr += lastAnswer; break;
            case 'sci':
                // 関数電卓を開く（今の式を引き継ぐ。scicalc.js）
                window.openSciCalc?.(expr);
                return;
            case 'eval': {
                if (expr === '') return;
                try {
                    const closed = autoClose(expr);
                    const result = evaluate(toInternal(closed));
                    historyEl.textContent = `${closed} =`;
                    lastAnswer = formatNumber(result);
                    expr = lastAnswer;
                    justEvaluated = true;
                    render();
                } catch (e) {
                    expr = '';
                    displayEl.textContent = e.message === 'div0' ? '0で割れません' : '式エラー';
                    displayEl.classList.add('error');
                }
                return;
            }
            default:
                if (isOp) {
                    // 演算子の連続は置き換え（先頭の − のみ許可）
                    if (expr === '' && action !== '−') { expr = '0'; }
                    if (/[+−×÷]$/.test(expr)) expr = expr.slice(0, -1);
                }
                expr += action;
        }
        render();
    }

    // ---------- キーボード操作（ホバー中 or フォーカス中のみ） ----------
    const KEYMAP = { '*': '×', '/': '÷', '-': '−' };
    window.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (typing) return;
        if (!(box.matches(':hover') || box.matches(':focus-within'))) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const k = e.key;
        if (/^[0-9.()%+]$/.test(k)) press(k);
        else if (KEYMAP[k]) press(KEYMAP[k]);
        else if (k === 'Enter' || k === '=') press('eval');
        else if (k === 'Backspace') press('back');
        else if (k === 'Escape' || k === 'Delete') press('clear');
        else return;
        e.preventDefault();
    });

    render();
})();