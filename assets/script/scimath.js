// =====================================
// 関数電卓の計算エンジン（画面は scicalc.js）
// ・数はできるだけ分数（BigInt）のまま誤差なく計算し、無理数が混ざったら小数にする
// ・式をいったん木（AST）にしてから計算するので、微分は式のまま行える
// ・TeX（\frac や \int など）を電卓の式に変換して読み込める
// =====================================
const SciMath = (() => {
    class CalcError extends Error {}
    const fail = msg => { throw new CalcError(msg); };

    // ---------- 数（分数 or 小数） ----------
    // { t: 'q', n, d } … 分数（BigInt、d > 0、約分済み）
    // { t: 'f', v }    … 小数（Number）
    const MAX_BITS = 4096; // これより大きい分数は小数に切り替える

    function bgcd(a, b) {
        if (a < 0n) a = -a;
        if (b < 0n) b = -b;
        while (b) [a, b] = [b, a % b];
        return a;
    }
    const bits = n => (n < 0n ? -n : n).toString(16).length * 4;

    function Q(n, d = 1n) {
        if (d === 0n) fail('0で割れません');
        if (d < 0n) { n = -n; d = -d; }
        const g = bgcd(n, d) || 1n;
        const q = { t: 'q', n: n / g, d: d / g };
        return bits(q.n) > MAX_BITS || bits(q.d) > MAX_BITS ? F(toNum(q)) : q;
    }
    function F(v) {
        if (Number.isNaN(v)) fail('計算できません（定義域の外です）');
        if (!Number.isFinite(v)) fail('値が大きすぎます');
        return { t: 'f', v };
    }
    const isQ = v => v.t === 'q';
    const isInt = v => isQ(v) && v.d === 1n;
    const isZero = v => (isQ(v) ? v.n === 0n : v.v === 0);
    function toNum(v) {
        if (!isQ(v)) return v.v;
        const r = Number(v.n) / Number(v.d);
        if (Number.isFinite(r)) return r;
        // 分子・分母がとても大きいときは桁をそろえてから割る
        const shift = BigInt(Math.max(bits(v.n), bits(v.d)) - 1000);
        return Number(v.n >> shift) / Number(v.d >> shift);
    }
    function fromDecimal(str) {
        const [a, b = ''] = str.split('.');
        return Q(BigInt((a || '0') + b), 10n ** BigInt(b.length));
    }

    const add = (a, b) => isQ(a) && isQ(b) ? Q(a.n * b.d + b.n * a.d, a.d * b.d) : F(toNum(a) + toNum(b));
    const sub = (a, b) => isQ(a) && isQ(b) ? Q(a.n * b.d - b.n * a.d, a.d * b.d) : F(toNum(a) - toNum(b));
    const mul = (a, b) => isQ(a) && isQ(b) ? Q(a.n * b.n, a.d * b.d) : F(toNum(a) * toNum(b));
    const neg = a => isQ(a) ? Q(-a.n, a.d) : F(-a.v);
    function div(a, b) {
        if (isZero(b)) fail('0で割れません');
        return isQ(a) && isQ(b) ? Q(a.n * b.d, a.d * b.n) : F(toNum(a) / toNum(b));
    }

    // n の k 乗根が整数ならそれを返す（なければ null）
    function iroot(n, k) {
        if (n < 0n) return null;
        const approx = Math.pow(Number(n), 1 / Number(k));
        if (!Number.isFinite(approx)) return null;
        const base = BigInt(Math.round(approx));
        for (const r of [base - 1n, base, base + 1n]) {
            if (r >= 0n && r ** k === n) return r;
        }
        return null;
    }

    function pow(a, b) {
        if (isInt(b) && isQ(a)) {
            const e = b.n;
            const abs = e < 0n ? -e : e;
            if (Math.max(bits(a.n), bits(a.d)) * Number(abs) <= MAX_BITS * 2) {
                if (e >= 0n) return Q(a.n ** e, a.d ** e);
                if (a.n === 0n) fail('0で割れません');
                return Q(a.d ** abs, a.n ** abs);
            }
        }
        // 4^(1/2) や (8/27)^(2/3) のように、累乗根がきれいに出るなら分数のまま
        if (isQ(a) && isQ(b) && b.d > 1n && b.d <= 64n) {
            const odd = b.d % 2n === 1n;
            if (a.n >= 0n || odd) {
                const rn = iroot(a.n < 0n ? -a.n : a.n, b.d);
                const rd = iroot(a.d, b.d);
                if (rn !== null && rd !== null) return pow(Q(a.n < 0n ? -rn : rn, rd), Q(b.n));
            }
        }
        const x = toNum(a);
        const y = toNum(b);
        // 負の数の 1/3 乗などは実数の答えを返す
        if (x < 0 && isQ(b) && b.d % 2n === 1n) {
            const r = Math.pow(-x, y);
            return F(b.n % 2n === 0n ? r : -r);
        }
        if (x === 0 && y < 0) fail('0で割れません');
        return F(Math.pow(x, y));
    }

    function factorial(v) {
        if (!isInt(v) || v.n < 0n) fail('階乗は0以上の整数だけです');
        if (v.n > 3000n) fail('値が大きすぎます');
        let r = 1n;
        for (let i = 2n; i <= v.n; i++) r *= i;
        return Q(r);
    }

    function needInt(v, name) {
        if (!isInt(v)) fail(`${name} は整数で指定してください`);
        return v.n;
    }

    // ---------- 関数 ----------
    // angle: 'deg' のとき三角関数は度で受け取り、逆三角関数は度で返す
    const toRad = (env, v) => toNum(v) * (env.angle === 'deg' ? Math.PI / 180 : 1);
    const fromRad = (env, r) => F(env.angle === 'deg' ? r * 180 / Math.PI : r);
    const real = f => (env, [x]) => F(f(toNum(x)));

    const FUNCS = {
        sin: { n: [1], f: (env, [x]) => F(cleanTrig(Math.sin(toRad(env, x)))) },
        cos: { n: [1], f: (env, [x]) => F(cleanTrig(Math.cos(toRad(env, x)))) },
        tan: {
            n: [1], f: (env, [x]) => {
                const r = toRad(env, x);
                if (Math.abs(Math.cos(r)) < 1e-15) fail('tan は定義されません');
                return F(cleanTrig(Math.tan(r)));
            }
        },
        sec: { n: [1], f: (env, [x]) => div(Q(1n), FUNCS.cos.f(env, [x])) },
        csc: { n: [1], f: (env, [x]) => div(Q(1n), FUNCS.sin.f(env, [x])) },
        cot: { n: [1], f: (env, [x]) => div(Q(1n), FUNCS.tan.f(env, [x])) },
        asin: { n: [1], f: (env, [x]) => fromRad(env, Math.asin(toNum(x))) },
        acos: { n: [1], f: (env, [x]) => fromRad(env, Math.acos(toNum(x))) },
        atan: { n: [1], f: (env, [x]) => fromRad(env, Math.atan(toNum(x))) },
        sinh: { n: [1], f: real(Math.sinh) },
        cosh: { n: [1], f: real(Math.cosh) },
        tanh: { n: [1], f: real(Math.tanh) },
        asinh: { n: [1], f: real(Math.asinh) },
        acosh: { n: [1], f: real(Math.acosh) },
        atanh: { n: [1], f: real(Math.atanh) },
        sqrt: { n: [1], f: (env, [x]) => pow(x, Q(1n, 2n)) },
        cbrt: { n: [1], f: (env, [x]) => pow(x, Q(1n, 3n)) },
        root: { n: [2], f: (env, [x, k]) => pow(x, div(Q(1n), k)) },
        exp: { n: [1], f: real(Math.exp) },
        ln: {
            n: [1], f: (env, [x]) => {
                if (toNum(x) <= 0) fail('ln は正の数だけです');
                return isQ(x) && x.n === 1n && x.d === 1n ? Q(0n) : F(Math.log(toNum(x)));
            }
        },
        log: {
            n: [1, 2], f: (env, [x, b]) => {
                if (toNum(x) <= 0) fail('log は正の数だけです');
                const base = b ? toNum(b) : 10;
                if (base <= 0 || base === 1) fail('log の底が正しくありません');
                const r = Math.log(toNum(x)) / Math.log(base);
                // log(1000) = 3 のように、ほぼ整数ならきっちり整数にする
                return Math.abs(r - Math.round(r)) < 1e-12 ? Q(BigInt(Math.round(r))) : F(r);
            }
        },
        abs: { n: [1], f: (env, [x]) => isQ(x) ? Q(x.n < 0n ? -x.n : x.n, x.d) : F(Math.abs(x.v)) },
        floor: { n: [1], f: (env, [x]) => isQ(x) ? Q(floorDiv(x.n, x.d)) : Q(BigInt(Math.floor(x.v))) },
        ceil: { n: [1], f: (env, [x]) => isQ(x) ? Q(-floorDiv(-x.n, x.d)) : Q(BigInt(Math.ceil(x.v))) },
        round: { n: [1], f: (env, [x]) => Q(BigInt(Math.round(toNum(x)))) },
        fact: { n: [1], f: (env, [x]) => factorial(x) },
        mod: {
            n: [2], f: (env, [a, b]) => {
                if (isZero(b)) fail('0で割れません');
                return sub(a, mul(b, FUNCS.floor.f(env, [div(a, b)])));
            }
        },
        gcd: { n: [2], f: (env, [a, b]) => Q(bgcd(needInt(a, 'gcd'), needInt(b, 'gcd'))) },
        lcm: {
            n: [2], f: (env, [a, b]) => {
                const x = needInt(a, 'lcm');
                const y = needInt(b, 'lcm');
                const g = bgcd(x, y);
                return Q(g === 0n ? 0n : (x * y < 0n ? -x * y : x * y) / g);
            }
        },
        nCr: {
            n: [2], f: (env, [a, b]) => {
                const n = needInt(a, 'nCr');
                let r = needInt(b, 'nCr');
                if (r < 0n || r > n) return Q(0n);
                if (r > n - r) r = n - r;
                let v = 1n;
                for (let i = 1n; i <= r; i++) v = v * (n - r + i) / i;
                return Q(v);
            }
        },
        nPr: {
            n: [2], f: (env, [a, b]) => {
                const n = needInt(a, 'nPr');
                const r = needInt(b, 'nPr');
                if (r < 0n || r > n) return Q(0n);
                let v = 1n;
                for (let i = n - r + 1n; i <= n; i++) v *= i;
                return Q(v);
            }
        },
    };
    // 微分・積分・総和は引数を計算する前に受け取る特別な関数
    const SPECIAL = { diff: [1, 2, 3], int: [3, 4], sum: [3, 4], prod: [3, 4] };
    const INVERSE = { sin: 'asin', cos: 'acos', tan: 'atan', sinh: 'asinh', cosh: 'acosh', tanh: 'atanh' };

    function floorDiv(n, d) {
        const q = n / d;
        return (n % d !== 0n && (n < 0n) !== (d < 0n)) ? q - 1n : q;
    }
    // sin(180°) が 1.2e-16 になるような誤差を 0 にそろえる
    const cleanTrig = v => (Math.abs(v) < 1e-15 ? 0 : v);

    // ---------- 字句解析 ----------
    const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
    const NAMES = [...Object.keys(FUNCS), ...Object.keys(SPECIAL), 'pi', 'ans']
        .sort((a, b) => b.length - a.length);

    function tokenize(src) {
        const s = src
            .replace(/[×✕⋅·∙]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
            .replace(/∫/g, 'int').replace(/Σ/g, 'sum').replace(/Π/g, 'prod');
        const tokens = [];
        let i = 0;
        while (i < s.length) {
            const c = s[i];
            if (/\s/.test(c)) { i++; continue; }
            const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
            if (num) {
                tokens.push({ t: 'num', v: num[1] });
                i += num[1].length;
                continue;
            }
            if (SUPERSCRIPT[c] !== undefined) {
                let sup = '';
                while (SUPERSCRIPT[s[i]] !== undefined) sup += SUPERSCRIPT[s[i++]];
                if (!/^-?\d+$/.test(sup)) fail('上付き文字が読めません');
                tokens.push({ t: 'sup', v: sup });
                continue;
            }
            if (/[a-zA-Z]/.test(c)) {
                // 知っている名前は長い順に探し、なければ1文字の変数（"2xy" は 2·x·y）
                const name = NAMES.find(n => s.startsWith(n, i));
                if (name) {
                    tokens.push({ t: 'name', v: name });
                    i += name.length;
                } else {
                    tokens.push({ t: 'var', v: c });
                    i++;
                }
                continue;
            }
            if (c === 'π') { tokens.push({ t: 'name', v: 'pi' }); i++; continue; }
            if (c === '√') { tokens.push({ t: 'name', v: 'sqrt' }); i++; continue; }
            if (c === '∛') { tokens.push({ t: 'name', v: 'cbrt' }); i++; continue; }
            if ('+-*/^!%(),|='.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
            fail(`読めない文字があります: ${c}`);
        }
        return tokens;
    }

    // ---------- 構文解析（式 → 木） ----------
    // 木の形: num(v) / var(name) / const(name) / neg(a) / bin(op, a, b) / fn(name, args)
    const N = {
        num: v => ({ k: 'num', v }),
        int: n => ({ k: 'num', v: Q(BigInt(n)) }),
        var: name => ({ k: 'var', name }),
        const: name => ({ k: 'const', name }),
        neg: a => ({ k: 'neg', a }),
        bin: (op, a, b) => ({ k: 'bin', op, a, b }),
        fn: (name, args) => ({ k: 'fn', name, args }),
    };

    function parse(src) {
        const tokens = tokenize(src);
        if (tokens.length === 0) fail('式が空です');
        let pos = 0;
        const peek = () => tokens[pos];
        const isOp = (v, t = peek()) => t && t.t === 'op' && t.v === v;
        const expect = v => {
            if (isOp(v)) { pos++; return; }
            if (v === ')' && !peek()) return; // 閉じ括弧の省略を許す
            fail(`「${v}」が足りません`);
        };
        // 掛け算の記号を省略できる位置か（2x、2sin x、(a)(b) など）
        const startsFactor = t => t && (t.t === 'num' || t.t === 'var' || t.t === 'name' || isOp('(', t));

        function parseExpr() {
            let node = parseTerm();
            while (isOp('+') || isOp('-')) {
                const op = tokens[pos++].v;
                node = N.bin(op, node, parseTerm());
            }
            return node;
        }
        function parseTerm() {
            let node = parseUnary();
            for (;;) {
                if (isOp('*') || isOp('/')) {
                    const op = tokens[pos++].v;
                    node = N.bin(op, node, parseUnary());
                } else if (startsFactor(peek())) {
                    node = N.bin('*', node, parsePower());
                } else {
                    return node;
                }
            }
        }
        function parseUnary() {
            if (isOp('-')) { pos++; return N.neg(parseUnary()); }
            if (isOp('+')) { pos++; return parseUnary(); }
            return parsePower();
        }
        function parsePower() {
            const base = parsePostfix();
            if (isOp('^')) {
                pos++;
                return N.bin('^', base, parseUnary());
            }
            return base;
        }
        function parsePostfix() {
            let node = parsePrimary();
            for (;;) {
                if (isOp('!')) { pos++; node = N.fn('fact', [node]); }
                else if (isOp('%')) { pos++; node = N.bin('/', node, N.int(100)); }
                else if (peek()?.t === 'sup') node = N.bin('^', node, N.int(tokens[pos++].v));
                else return node;
            }
        }
        function parsePrimary() {
            const t = tokens[pos++];
            if (!t) fail('式が途中で終わっています');
            if (t.t === 'num') return N.num(fromDecimal(t.v));
            if (t.t === 'var') return t.v === 'e' ? N.const('e') : N.var(t.v);
            if (isOp('(', t)) {
                const node = parseExpr();
                expect(')');
                return node;
            }
            if (isOp('|', t)) {
                const node = parseExpr();
                expect('|');
                return N.fn('abs', [node]);
            }
            if (t.t === 'name') {
                if (t.v === 'pi') return N.const('π');
                if (t.v === 'ans') return N.const('ans');
                return parseCall(t.v);
            }
            fail(`「${t.v}」の位置がおかしいです`);
        }
        function parseCall(name) {
            // sin²x や sin^-1 x（= asin x）の書き方
            let power = null;
            if (peek()?.t === 'sup') power = N.int(tokens[pos++].v);
            else if (isOp('^')) {
                pos++;
                if (isOp('-')) { pos++; power = N.neg(parsePostfix()); } else power = parsePostfix();
            }
            if (power && isMinusOne(power) && INVERSE[name]) {
                name = INVERSE[name];
                power = null;
            }

            let args;
            if (isOp('(')) {
                pos++;
                args = [parseExpr()];
                while (isOp(',')) { pos++; args.push(parseExpr()); }
                expect(')');
            } else {
                // 括弧なし（sin 2x = sin(2x)。次の関数の手前まで）
                let arg = parseUnary();
                const isFunction = t => t.t === 'name' && t.v !== 'pi' && t.v !== 'ans';
                while (startsFactor(peek()) && !isFunction(peek())) arg = N.bin('*', arg, parsePower());
                args = [arg];
            }

            const allowed = (FUNCS[name] || { n: SPECIAL[name] }).n;
            if (!allowed.includes(args.length)) fail(`${name} の引数の数が違います（${allowed.join('か')}個）`);
            const node = N.fn(name, args);
            return power ? N.bin('^', node, power) : node;
        }

        const node = parseExpr();
        if (pos < tokens.length) fail(`「${tokens[pos].v}」の位置がおかしいです`);
        return node;
    }
    const isMinusOne = n => (n.k === 'neg' && n.a.k === 'num' && isQ(n.a.v) && n.a.v.n === 1n && n.a.v.d === 1n)
        || (n.k === 'num' && isQ(n.v) && n.v.n === -1n && n.v.d === 1n);

    // ---------- 変数 ----------
    // 式の中で値が決まっていない変数（diff/int/sum で束縛されたものは除く）
    function freeVars(node, bound = new Set(), out = new Set()) {
        switch (node.k) {
            case 'var': if (!bound.has(node.name)) out.add(node.name); break;
            case 'neg': freeVars(node.a, bound, out); break;
            case 'bin': freeVars(node.a, bound, out); freeVars(node.b, bound, out); break;
            case 'fn': {
                if (SPECIAL[node.name]) {
                    const { body, v, rest } = specialArgs(node);
                    const inner = new Set(bound);
                    // diff(f, x) は x の式を返すので、x は束縛しない
                    if (!(node.name === 'diff' && rest.length === 0)) inner.add(v);
                    freeVars(body, inner, out);
                    rest.forEach(r => freeVars(r, bound, out));
                } else {
                    node.args.forEach(a => freeVars(a, bound, out));
                }
            }
        }
        return out;
    }

    // diff(f[, x[, a]]) / int(f, [x,] a, b) / sum(f, [k,] a, b) の引数を整理する
    function specialArgs(node) {
        const [body, ...others] = node.args;
        const guess = () => {
            const vars = [...freeVars(body)];
            return vars.length === 1 ? vars[0] : (vars.includes('x') ? 'x' : (vars[0] || 'x'));
        };
        if (node.name === 'diff') {
            if (others.length === 0) return { body, v: guess(), rest: [] };
            if (others[0].k !== 'var') fail('diff の2つ目には変数を書いてください（例: diff(x^2, x)）');
            return { body, v: others[0].name, rest: others.slice(1) };
        }
        if (others.length === 2) return { body, v: guess(), rest: others };
        if (others[0].k !== 'var') fail(`${node.name} の2つ目には変数を書いてください`);
        return { body, v: others[0].name, rest: others.slice(1) };
    }

    // ---------- 計算 ----------
    // env: { angle: 'deg' | 'rad', vars: Map, ans }
    function evaluate(node, env) {
        switch (node.k) {
            case 'num': return node.v;
            case 'const':
                if (node.name === 'π') return F(Math.PI);
                if (node.name === 'e') return F(Math.E);
                if (!env.ans) fail('ans（前の答え）がまだありません');
                return env.ans;
            case 'var': {
                const v = env.vars.get(node.name);
                if (!v) fail(`${node.name} の値が決まっていません`);
                return v;
            }
            case 'neg': return neg(evaluate(node.a, env));
            case 'bin': {
                const a = evaluate(node.a, env);
                const b = evaluate(node.b, env);
                switch (node.op) {
                    case '+': return add(a, b);
                    case '-': return sub(a, b);
                    case '*': return mul(a, b);
                    case '/': return div(a, b);
                    case '^': return pow(a, b);
                }
                break;
            }
            case 'fn': {
                if (SPECIAL[node.name]) return evaluateSpecial(node, env);
                return FUNCS[node.name].f(env, node.args.map(a => evaluate(a, env)));
            }
        }
        fail('計算できない式です');
    }

    const withVar = (env, name, value) => ({ ...env, vars: new Map(env.vars).set(name, value) });
    // 微分・積分の中は常にラジアンで計算する
    const radEnv = env => ({ ...env, angle: 'rad' });

    function evaluateSpecial(node, env) {
        const { body, v, rest } = specialArgs(node);
        if (node.name === 'diff') {
            if (rest.length === 0) fail('微分した結果は式になります（diff(f, x, 値) で値も出せます）');
            const d = simplify(derive(body, v));
            return evaluate(d, withVar(radEnv(env), v, evaluate(rest[0], env)));
        }
        const a = evaluate(rest[0], env);
        const b = evaluate(rest[1], env);
        if (node.name === 'int') {
            const inner = radEnv(env);
            return F(integrate(t => toNum(evaluate(body, withVar(inner, v, F(t)))), toNum(a), toNum(b)));
        }
        // sum / prod
        const from = needInt(a, node.name);
        const to = needInt(b, node.name);
        if (to - from > 1000000n) fail('回数が多すぎます（100万回まで）');
        let acc = node.name === 'sum' ? Q(0n) : Q(1n);
        for (let k = from; k <= to; k++) {
            const term = evaluate(body, withVar(env, v, Q(k)));
            acc = node.name === 'sum' ? add(acc, term) : mul(acc, term);
        }
        return acc;
    }

    // 定積分（二重指数型 tanh-sinh 法）
    // 端で値が無限大になる ∫1/√x のような積分にも強い。波の多い関数のため区間を分けてから計算する
    function integrate(f, a, b) {
        if (!Number.isFinite(a) || !Number.isFinite(b)) fail('積分の範囲は有限の値にしてください');
        if (a === b) return 0;
        if (a > b) return -integrate(f, b, a);
        const PIECES = 8;
        let budget = 400; // 細かく分ける回数の上限（重くなりすぎないように）
        // 半分ずつに分けた結果と合わなければ、さらに分ける（折れ目や鋭い山に強くなる）
        const refine = (l, r, whole, depth) => {
            const m = (l + r) / 2;
            const left = tanhSinh(f, l, m);
            const right = tanhSinh(f, m, r);
            budget--;
            if (depth <= 0 || budget <= 0 || Math.abs(left + right - whole) <= 1e-12 * Math.max(1, Math.abs(whole))) return left + right;
            return refine(l, m, left, depth - 1) + refine(m, r, right, depth - 1);
        };
        const h = (b - a) / PIECES;
        let total = 0;
        for (let i = 0; i < PIECES; i++) {
            const l = a + h * i;
            const r = i === PIECES - 1 ? b : l + h;
            total += refine(l, r, tanhSinh(f, l, r), 12);
        }
        if (!Number.isFinite(total)) fail('積分が発散しました');
        return total;
    }

    function tanhSinh(f, a, b) {
        const c = (a + b) / 2;
        const r = (b - a) / 2;
        const T_MAX = 3.5; // これより外側の点は重みがほぼ 0
        // 端からの距離で点を作る（端の点そのものは計算しない）
        const sample = t => {
            const u = Math.PI / 2 * Math.sinh(t);
            const ch = Math.cosh(u);
            const w = Math.PI / 2 * Math.cosh(t) / (ch * ch);
            const dist = r * Math.exp(-u) / ch; // r·(1 − tanh u)
            let s = 0;
            for (const x of [b - dist, a + dist]) {
                if (x <= a || x >= b) continue;
                const y = f(x);
                if (Number.isFinite(y)) s += y;
            }
            return w * s;
        };

        let step = 1;
        let sum = Math.PI / 2 * f(c);
        for (let t = step; t <= T_MAX; t += step) sum += sample(t);
        let estimate = sum * step * r;
        for (let level = 0; level < 9; level++) {
            step /= 2;
            for (let t = step; t <= T_MAX; t += 2 * step) sum += sample(t);
            const next = sum * step * r;
            if (Math.abs(next - estimate) <= 1e-13 * Math.max(1, Math.abs(next))) return next;
            estimate = next;
        }
        return estimate;
    }

    // ---------- 微分（式のまま） ----------
    const ZERO = N.int(0);
    const ONE = N.int(1);
    const has = (node, v) => freeVars(node).has(v);

    function derive(node, v) {
        if (!has(node, v)) return ZERO;
        switch (node.k) {
            case 'var': return node.name === v ? ONE : ZERO;
            case 'neg': return N.neg(derive(node.a, v));
            case 'bin': {
                const { a, b } = node;
                const da = () => derive(a, v);
                const db = () => derive(b, v);
                switch (node.op) {
                    case '+': return N.bin('+', da(), db());
                    case '-': return N.bin('-', da(), db());
                    case '*': return N.bin('+', N.bin('*', da(), b), N.bin('*', a, db()));
                    case '/': return N.bin('/', N.bin('-', N.bin('*', da(), b), N.bin('*', a, db())), N.bin('^', b, N.int(2)));
                    case '^':
                        if (!has(b, v)) return N.bin('*', N.bin('*', b, N.bin('^', a, N.bin('-', b, ONE))), da());
                        if (!has(a, v)) return N.bin('*', N.bin('*', node, N.fn('ln', [a])), db());
                        // u^v = e^(v ln u)
                        return N.bin('*', node, N.bin('+', N.bin('*', db(), N.fn('ln', [a])), N.bin('/', N.bin('*', b, da()), a)));
                }
                break;
            }
            case 'fn': return deriveFn(node, v);
        }
        fail('この式は微分できません');
    }

    function deriveFn(node, v) {
        if (node.name === 'diff') {
            const { body, v: inner, rest } = specialArgs(node);
            if (rest.length === 0) return derive(simplify(derive(body, inner)), v);
        }
        if (SPECIAL[node.name]) fail(`${node.name} を含む式は微分できません`);

        const [u, w] = node.args;
        const du = derive(u, v);
        const chain = outer => N.bin('*', outer, du);
        const two = N.int(2);
        const sq = x => N.bin('^', x, two);
        const f = (name, ...args) => N.fn(name, args);
        switch (node.name) {
            case 'sin': return chain(f('cos', u));
            case 'cos': return chain(N.neg(f('sin', u)));
            case 'tan': return chain(N.bin('/', ONE, sq(f('cos', u))));
            case 'sec': return chain(N.bin('*', f('sec', u), f('tan', u)));
            case 'csc': return chain(N.neg(N.bin('*', f('csc', u), f('cot', u))));
            case 'cot': return chain(N.neg(N.bin('/', ONE, sq(f('sin', u)))));
            case 'asin': return chain(N.bin('/', ONE, f('sqrt', N.bin('-', ONE, sq(u)))));
            case 'acos': return chain(N.neg(N.bin('/', ONE, f('sqrt', N.bin('-', ONE, sq(u))))));
            case 'atan': return chain(N.bin('/', ONE, N.bin('+', ONE, sq(u))));
            case 'sinh': return chain(f('cosh', u));
            case 'cosh': return chain(f('sinh', u));
            case 'tanh': return chain(N.bin('/', ONE, sq(f('cosh', u))));
            case 'asinh': return chain(N.bin('/', ONE, f('sqrt', N.bin('+', sq(u), ONE))));
            case 'acosh': return chain(N.bin('/', ONE, f('sqrt', N.bin('-', sq(u), ONE))));
            case 'atanh': return chain(N.bin('/', ONE, N.bin('-', ONE, sq(u))));
            case 'exp': return chain(f('exp', u));
            case 'ln': return chain(N.bin('/', ONE, u));
            case 'log':
                if (w && has(w, v)) fail('底に変数がある log は微分できません');
                return chain(N.bin('/', ONE, N.bin('*', u, f('ln', w || N.int(10)))));
            case 'sqrt': return chain(N.bin('/', ONE, N.bin('*', two, f('sqrt', u))));
            case 'cbrt': return chain(N.bin('/', ONE, N.bin('*', N.int(3), sq(f('cbrt', u)))));
            case 'root': return derive(N.bin('^', u, N.bin('/', ONE, w)), v);
            case 'abs': return chain(N.bin('/', u, f('abs', u)));
        }
        fail(`${node.name} は微分できません`);
    }

    // ---------- 式の整理 ----------
    const isNum = (n, value) => n.k === 'num' && (value === undefined || (isQ(n.v) && n.v.n === BigInt(value) && n.v.d === 1n));
    const same = (a, b) => toText(a) === toText(b);

    function simplify(node) {
        let cur = node;
        for (let i = 0; i < 8; i++) {
            const next = simplifyOnce(cur);
            if (same(next, cur)) return next;
            cur = next;
        }
        return cur;
    }

    function simplifyOnce(node) {
        switch (node.k) {
            case 'neg': {
                const a = simplifyOnce(node.a);
                if (a.k === 'neg') return a.a;
                if (a.k === 'num') return N.num(neg(a.v));
                return N.neg(a);
            }
            case 'fn': {
                const args = node.args.map(simplifyOnce);
                const out = N.fn(node.name, args);
                // 数だけの引数で、きっちり分数になるもの（sqrt(4)、abs(-3) など）は計算してしまう
                if (FUNCS[node.name] && args.every(a => a.k === 'num')) {
                    try {
                        const v = evaluate(out, { angle: 'rad', vars: new Map() });
                        if (isQ(v)) return N.num(v);
                        // cos(0) = 1 のように、ちょうど整数になったものもまとめる
                        if (Number.isInteger(v.v) && Math.abs(v.v) < 1e15) return N.int(v.v);
                    } catch { /* そのまま残す */ }
                }
                if (node.name === 'ln' && args[0].k === 'const' && args[0].name === 'e') return ONE;
                if (node.name === 'exp' && args[0].k === 'fn' && args[0].name === 'ln') return args[0].args[0];
                if (node.name === 'ln' && args[0].k === 'fn' && args[0].name === 'exp') return args[0].args[0];
                if (node.name === 'exp' && isNum(args[0], 0)) return ONE;
                return out;
            }
            case 'bin': return simplifyBin(node.op, simplifyOnce(node.a), simplifyOnce(node.b));
            default: return node;
        }
    }

    function simplifyBin(op, a, b) {
        if (a.k === 'num' && b.k === 'num' && (op !== '^' || isInt(b.v))) {
            try {
                const v = evaluate(N.bin(op, a, b), { angle: 'rad', vars: new Map() });
                if (isQ(v)) return N.num(v);
            } catch { /* 0で割るなどはそのまま */ }
        }
        switch (op) {
            case '+':
                if (isNum(a, 0)) return b;
                if (isNum(b, 0)) return a;
                if (b.k === 'neg') return N.bin('-', a, b.a);
                if (b.k === 'num' && isQ(b.v) && b.v.n < 0n) return N.bin('-', a, N.num(neg(b.v)));
                if (a.k === 'num' && b.k !== 'num') return N.bin('+', b, a); // 定数は後ろへ
                {
                    // 2x + x = 3x、(x² + 2x) + x = x² + 3x
                    const merged = mergeTerms(a, b, 1);
                    if (merged) return merged;
                    if (a.k === 'bin' && a.op === '+') {
                        const inner = mergeTerms(a.b, b, 1);
                        if (inner) return N.bin('+', a.a, inner);
                    }
                }
                break;
            case '-':
                if (isNum(b, 0)) return a;
                if (isNum(a, 0)) return N.neg(b);
                if (same(a, b)) return ZERO;
                if (b.k === 'neg') return N.bin('+', a, b.a);
                {
                    const merged = mergeTerms(a, b, -1);
                    if (merged) return merged;
                }
                break;
            case '*':
                if (isNum(a, 0) || isNum(b, 0)) return ZERO;
                if (isNum(a, 1)) return b;
                if (isNum(b, 1)) return a;
                if (isNum(a, -1)) return N.neg(b);
                if (a.k === 'num' && toNum(a.v) < 0) return N.neg(N.bin('*', N.num(neg(a.v)), b));
                if (a.k === 'neg') return N.neg(N.bin('*', a.a, b));
                if (b.k === 'neg') return N.neg(N.bin('*', a, b.a));
                if (b.k === 'num' && a.k !== 'num') return N.bin('*', b, a); // 係数は前へ
                if (b.k === 'var' && a.k !== 'num' && a.k !== 'var') return N.bin('*', b, a); // cos(x)·x → x·cos(x)
                if (a.k === 'num' && b.k === 'bin' && b.op === '*' && b.a.k === 'num') return N.bin('*', N.num(mul(a.v, b.a.v)), b.b);
                if (a.k === 'bin' && a.op === '*' && a.a.k === 'num') return N.bin('*', a.a, N.bin('*', a.b, b));
                if (b.k === 'bin' && b.op === '/' && isNum(b.a, 1)) return N.bin('/', a, b.b);
                if (a.k === 'bin' && a.op === '/' && isNum(a.a, 1)) return N.bin('/', b, a.b);
                {
                    // x·x = x²、x·x³ = x⁴
                    const [ba, ea] = asPower(a);
                    const [bb, eb] = asPower(b);
                    if (same(ba, bb) && ea.k === 'num' && eb.k === 'num') return N.bin('^', ba, N.num(add(ea.v, eb.v)));
                }
                break;
            case '/':
                if (isNum(a, 0)) return ZERO;
                if (isNum(b, 1)) return a;
                if (same(a, b)) return ONE;
                if (a.k === 'neg') return N.neg(N.bin('/', a.a, b));
                if (b.k === 'neg') return N.neg(N.bin('/', a, b.a));
                if (a.k === 'bin' && a.op === '/') return N.bin('/', a.a, N.bin('*', a.b, b));
                {
                    const [ba, ea] = asPower(a);
                    const [bb, eb] = asPower(b);
                    if (same(ba, bb) && ea.k === 'num' && eb.k === 'num') return N.bin('^', ba, N.num(sub(ea.v, eb.v)));
                }
                break;
            case '^':
                if (isNum(b, 0)) return ONE;
                if (isNum(b, 1)) return a;
                if (isNum(a, 1)) return ONE;
                if (a.k === 'bin' && a.op === '^' && a.b.k === 'num' && b.k === 'num') return N.bin('^', a.a, N.num(mul(a.b.v, b.v)));
                break;
        }
        return N.bin(op, a, b);
    }
    const asPower = n => (n.k === 'bin' && n.op === '^' ? [n.a, n.b] : [n, ONE]);
    // 係数と残りに分ける（3x² → [3, x²]）
    const asTerm = n => {
        if (n.k === 'neg') { const [c, r] = asTerm(n.a); return [neg(c), r]; }
        if (n.k === 'bin' && n.op === '*' && n.a.k === 'num') return [n.a.v, n.b];
        return [Q(1n), n];
    };
    // 同じ形の項をまとめる（sign = 1 で足し算、-1 で引き算）
    function mergeTerms(a, b, sign) {
        if (a.k === 'num' || b.k === 'num') return null;
        const [ca, ra] = asTerm(a);
        const [cb, rb] = asTerm(b);
        if (!same(ra, rb)) return null;
        return N.bin('*', N.num(sign > 0 ? add(ca, cb) : sub(ca, cb)), ra);
    }

    // ---------- 表示 ----------
    function formatFloat(v) {
        if (v === 0) return '0';
        const abs = Math.abs(v);
        let s;
        if (abs >= 1e15 || abs < 1e-9) {
            const [m, e] = v.toExponential(11).split('e');
            s = `${String(parseFloat(m))}×10^${Number(e)}`;
        } else {
            s = String(parseFloat(v.toPrecision(12)));
        }
        return s.replace('-', '−');
    }

    function formatInt(n) {
        const s = (n < 0n ? -n : n).toString();
        const body = s.length > 40 ? `${s[0]}.${s.slice(1, 12)}×10^${s.length - 1}` : s;
        return (n < 0n ? '−' : '') + body;
    }

    // 小数を分数に近似する（分母10000まで）。sin(30°) = 0.5 → 1/2 など
    function approxFraction(v) {
        if (!Number.isFinite(v) || Math.abs(v) > 1e12) return null;
        let [h0, h1, k0, k1] = [0, 1, 1, 0];
        let x = Math.abs(v);
        for (let i = 0; i < 30; i++) {
            const a = Math.floor(x);
            [h0, h1] = [h1, a * h1 + h0];
            [k0, k1] = [k1, a * k1 + k0];
            if (k1 > 10000) return null;
            if (Math.abs(h1 / k1 - Math.abs(v)) <= 1e-11 * Math.max(1, Math.abs(v))) {
                return k1 === 1 ? null : Q(BigInt(v < 0 ? -h1 : h1), BigInt(k1));
            }
            if (x - a < 1e-15) return null;
            x = 1 / (x - a);
        }
        return null;
    }

    // mode: 'S'（分数） / 'D'（小数）
    function formatValue(v, mode = 'S') {
        if (isQ(v)) {
            if (v.d === 1n) return formatInt(v.n);
            // 分母や分子が長すぎる分数は読めないので小数で出す
            if (mode === 'S' && bits(v.n) < 100 && bits(v.d) < 100) return `${formatInt(v.n)}/${formatInt(v.d)}`;
            return formatFloat(toNum(v));
        }
        if (mode === 'S') {
            const q = approxFraction(v.v);
            if (q) return formatValue(q, 'S');
        }
        return formatFloat(v.v);
    }
    // S⇔D で表示が変わるか
    function hasAlternate(v) {
        if (isQ(v)) return v.d !== 1n && bits(v.n) < 100 && bits(v.d) < 100;
        return approxFraction(v.v) !== null;
    }

    // 木 → 文字列（電卓にそのまま貼り直せる形）
    const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
    const SUP_OUT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
    const startsWithLetter = s => /^[a-zA-Zπ√|]/.test(s);

    function precOf(node) {
        if (node.k === 'bin') return PREC[node.op];
        if (node.k === 'neg') return 3;
        if (node.k === 'num' && isQ(node.v)) {
            if (node.v.n < 0n) return 3;
            if (node.v.d !== 1n) return 2;
        }
        if (node.k === 'num' && !isQ(node.v) && node.v.v < 0) return 3;
        return 5;
    }

    function toText(node, minPrec = 0) {
        const s = rawText(node);
        return precOf(node) < minPrec ? `(${s})` : s;
    }

    function rawText(node) {
        switch (node.k) {
            case 'num': return formatValue(node.v, 'S');
            case 'var': return node.name;
            case 'const': return node.name;
            case 'neg': return `−${toText(node.a, 2)}`;
            case 'bin': {
                const { op, a, b } = node;
                if (op === '+') return `${toText(a, 1)} + ${toText(b, 1)}`;
                if (op === '-') return `${toText(a, 1)} − ${toText(b, 1.5)}`;
                if (op === '*') {
                    // 1/2·x は x/2 と書く
                    if (a.k === 'num' && isQ(a.v) && a.v.d !== 1n) {
                        const top = a.v.n === 1n ? b : N.bin('*', N.num(Q(a.v.n)), b);
                        return toText(N.bin('/', top, N.num(Q(a.v.d))));
                    }
                    const left = toText(a, 2);
                    const right = toText(b, b.k === 'bin' && b.op === '/' ? 2.5 : 2);
                    // 2x、3sin(x) のように数字のあとは掛け算の記号を省く
                    if (a.k === 'num' && precOf(a) === 5 && startsWithLetter(right)) return left + right;
                    return `${left}·${right}`;
                }
                if (op === '/') return `${toText(a, 2)}/${toText(b, 2.5)}`;
                if (op === '^') {
                    const base = toText(a, 4.5);
                    if (b.k === 'num' && isInt(b.v)) return base + b.v.n.toString().split('').map(c => SUP_OUT[c]).join('');
                    return `${base}^${toText(b, 5)}`;
                }
                break;
            }
            case 'fn': {
                const args = node.args.map(x => toText(x));
                if (node.name === 'fact') return `${toText(node.args[0], 5)}!`;
                if (node.name === 'abs') return `|${args[0]}|`;
                if (node.name === 'sqrt') return `√(${args[0]})`;
                return `${node.name}(${args.join(', ')})`;
            }
        }
        return '?';
    }

    // 木 → TeX
    const TEX_FN = {
        sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot',
        asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
        sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', ln: '\\ln', log: '\\log', exp: '\\exp',
    };
    function valueToTex(v, mode = 'S') {
        const text = formatValue(v, mode);
        const frac = text.match(/^(−?)(\d+)\/(\d+)$/);
        if (frac) return `${frac[1] ? '-' : ''}\\frac{${frac[2]}}{${frac[3]}}`;
        return text.replace('−', '-').replace(/×10\^(−?\d+)/, (m, e) => `\\times 10^{${e.replace('−', '-')}}`);
    }
    function toTex(node, minPrec = 0) {
        const s = rawTex(node);
        return precOf(node) < minPrec && !(node.k === 'bin' && node.op === '/') ? `\\left(${s}\\right)` : s;
    }
    function rawTex(node) {
        switch (node.k) {
            case 'num': return valueToTex(node.v);
            case 'var': return node.name;
            case 'const': return node.name === 'π' ? '\\pi' : node.name === 'ans' ? '\\mathrm{ans}' : node.name;
            case 'neg': return `-${toTex(node.a, 2)}`;
            case 'bin': {
                const { op, a, b } = node;
                if (op === '+') return `${toTex(a, 1)} + ${toTex(b, 1)}`;
                if (op === '-') return `${toTex(a, 1)} - ${toTex(b, 1.5)}`;
                if (op === '*') {
                    const left = toTex(a, 2);
                    const right = toTex(b, b.k === 'bin' && b.op === '/' ? 2.5 : 2);
                    return a.k === 'num' && precOf(a) === 5 && /^[a-zA-Z\\{]/.test(right) ? `${left} ${right}` : `${left} \\cdot ${right}`;
                }
                if (op === '/') return `\\frac{${toTex(a)}}{${toTex(b)}}`;
                if (op === '^') return `{${toTex(a, 4.5)}}^{${toTex(b)}}`;
                break;
            }
            case 'fn': {
                const args = node.args.map(x => toTex(x));
                if (node.name === 'sqrt') return `\\sqrt{${args[0]}}`;
                if (node.name === 'root') return `\\sqrt[${args[1]}]{${args[0]}}`;
                if (node.name === 'abs') return `\\left|${args[0]}\\right|`;
                if (node.name === 'fact') return `${toTex(node.args[0], 5)}!`;
                if (node.name === 'log' && args[1]) return `\\log_{${args[1]}}\\left(${args[0]}\\right)`;
                if (TEX_FN[node.name]) return `${TEX_FN[node.name]}\\left(${args.join(', ')}\\right)`;
                return `\\operatorname{${node.name}}\\left(${args.join(', ')}\\right)`;
            }
        }
        return '';
    }

    // ---------- TeX → 電卓の式 ----------
    const TEX_FUNCS = {
        sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot',
        arcsin: 'asin', arccos: 'acos', arctan: 'atan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
        ln: 'ln', exp: 'exp', log: 'log',
    };
    const TEX_SYMBOLS = { pi: 'π', cdot: '*', times: '*', div: '/', ast: '*' };

    function texToExpr(src) {
        let s = src
            .replace(/\$/g, '')
            .replace(/\\(left|right|displaystyle|textstyle|bigg?|Bigg?)(?![a-zA-Z])/g, '')
            .replace(/\\[,;:! ]/g, ' ')
            .replace(/\\(?:mathrm|text|operatorname)\{([^{}]*)\}/g, '$1')
            .replace(/\\\\/g, ' ')
            .replace(/&/g, '')
            .trim();
        // "y = x^2" のような書き方は右辺だけ使う
        const eq = topLevelIndex(s, '=');
        if (eq >= 0) s = s.slice(eq + 1);
        return convertTex(s).replace(/\s+/g, ' ').trim();
    }

    // 括弧の外にある ch の最後の位置
    function topLevelIndex(s, ch) {
        let depth = 0;
        let found = -1;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if ('{(['.includes(c)) depth++;
            else if ('})]'.includes(c)) depth--;
            else if (c === ch && depth === 0) found = i;
        }
        return found;
    }

    function convertTex(s) {
        let i = 0;
        let out = '';

        const skipSpaces = () => { while (s[i] === ' ') i++; };
        // {…} の中身、またはコマンド1つ・1文字を読む
        function readGroup() {
            skipSpaces();
            if (s[i] === '{') {
                let depth = 0;
                const start = i;
                for (; i < s.length; i++) {
                    if (s[i] === '{') depth++;
                    else if (s[i] === '}' && --depth === 0) { i++; return s.slice(start + 1, i - 1); }
                }
                fail('TeX の { } が閉じていません');
            }
            if (s[i] === '\\') {
                const m = s.slice(i).match(/^\\[a-zA-Z]+/);
                i += m[0].length;
                return m[0];
            }
            return s[i++] ?? '';
        }
        // ( … ) をまとめて読む（\log_2(x) の引数など）
        function readArgument() {
            skipSpaces();
            if (s[i] === '(') {
                let depth = 0;
                const start = i;
                for (; i < s.length; i++) {
                    if (s[i] === '(') depth++;
                    else if (s[i] === ')' && --depth === 0) { i++; return s.slice(start + 1, i - 1); }
                }
                return s.slice(start + 1);
            }
            return readGroup();
        }
        // _{…} と ^{…}（どちらが先でもよい）
        function readLimits() {
            const lim = {};
            for (;;) {
                skipSpaces();
                if (s[i] === '_') { i++; lim.lower = readGroup(); }
                else if (s[i] === '^') { i++; lim.upper = readGroup(); }
                else return lim;
            }
        }

        while (i < s.length) {
            const c = s[i];
            if (c === '\\') {
                const name = s.slice(i + 1).match(/^[a-zA-Z]+/)?.[0];
                if (!name) fail('TeX が読めません');
                i += name.length + 1;

                if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
                    const top = readGroup();
                    const bottom = readGroup();
                    const dvar = top.trim() === 'd' && bottom.trim().match(/^d\s*([a-zA-Z])$/);
                    if (dvar) {
                        // \frac{d}{dx} の後ろ全部を微分する
                        out += `diff(${convertTex(s.slice(i))}, ${dvar[1]})`;
                        return out;
                    }
                    out += `((${convertTex(top)})/(${convertTex(bottom)}))`;
                } else if (name === 'sqrt') {
                    skipSpaces();
                    if (s[i] === '[') {
                        const end = s.indexOf(']', i);
                        const k = s.slice(i + 1, end);
                        i = end + 1;
                        out += `root(${convertTex(readGroup())}, ${convertTex(k)})`;
                    } else {
                        out += `sqrt(${convertTex(readGroup())})`;
                    }
                } else if (name === 'int') {
                    const { lower, upper } = readLimits();
                    if (lower === undefined || upper === undefined) fail('不定積分には対応していません（\\int_a^b の形にしてください）');
                    const rest = s.slice(i);
                    const d = findDifferential(rest);
                    const body = d ? rest.slice(0, d.index) : rest;
                    out += `int(${convertTex(body)}, ${d ? d.v : 'x'}, ${convertTex(lower)}, ${convertTex(upper)})`;
                    if (!d) return out;
                    i += d.end;
                } else if (name === 'sum' || name === 'prod') {
                    const { lower, upper } = readLimits();
                    const m = lower?.match(/^\s*([a-zA-Z])\s*=(.+)$/);
                    if (!m || upper === undefined) fail(`\\${name} は _{k=1}^{n} の形にしてください`);
                    out += `${name}(${convertTex(s.slice(i))}, ${m[1]}, ${convertTex(m[2])}, ${convertTex(upper)})`;
                    return out;
                } else if (name === 'log' && s.slice(i).trimStart().startsWith('_')) {
                    skipSpaces();
                    i++;
                    const base = readGroup();
                    out += `log(${convertTex(readArgument())}, ${convertTex(base)})`;
                } else if (TEX_FUNCS[name]) {
                    out += ` ${TEX_FUNCS[name]}`;
                    skipSpaces();
                    if (s[i] === '^') { i++; out += `^(${convertTex(readGroup())})`; }
                    out += ' ';
                } else if (TEX_SYMBOLS[name]) {
                    out += ` ${TEX_SYMBOLS[name]} `;
                } else if (name === 'infty') {
                    fail('∞ には対応していません');
                } else {
                    fail(`TeX の \\${name} には対応していません`);
                }
            } else if (c === '{') {
                out += `(${convertTex(readGroup())})`;
            } else if (c === '^') {
                i++;
                out += `^(${convertTex(readGroup())})`;
            } else if (c === '[' || c === ']') {
                out += c === '[' ? '(' : ')';
                i++;
            } else if (c === '_') {
                fail('TeX の下付き文字（x_1 など）には対応していません');
            } else {
                out += c;
                i++;
            }
        }
        return out;
    }

    // 積分の dx を探す（括弧の外で、d の前が文字でないもの）
    function findDifferential(s) {
        let depth = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if ('{(['.includes(c)) depth++;
            else if ('})]'.includes(c)) depth--;
            else if (c === 'd' && depth === 0 && !/[a-zA-Z\\]/.test(s[i - 1] || '')) {
                const m = s.slice(i).match(/^d\s*([a-zA-Z])(?![a-zA-Z])/);
                if (m) return { index: i, end: i + m[0].length, v: m[1] };
            }
        }
        return null;
    }

    // ---------- まとめ ----------
    // 入力された式を計算する。値なら { kind: 'value' }、x などが残れば { kind: 'expr' }
    function run(src, env) {
        let text = src.trim();
        let tex = null;
        if (/[\\$]/.test(text)) {
            tex = texToExpr(text);
            text = tex;
        }
        // a = 式 で変数に代入
        const assign = text.match(/^([a-df-zA-Z])\s*=(?!=)(.+)$/);
        const node = parse(assign ? assign[2] : text);
        const free = [...freeVars(node)].filter(v => !env.vars.has(v));

        // y = x^2 のように右辺に変数が残るときは、代入ではなく式として扱う
        if (free.length > 0) {
            const expanded = simplify(expandDiffs(node));
            return { kind: 'expr', node: expanded, vars: [...freeVars(expanded)], tex };
        }
        const value = evaluate(node, env);
        return { kind: 'value', value, assign: assign?.[1], tex };
    }

    // 式の中の diff(f, x) を微分した結果に置き換える
    function expandDiffs(node) {
        switch (node.k) {
            case 'neg': return N.neg(expandDiffs(node.a));
            case 'bin': return N.bin(node.op, expandDiffs(node.a), expandDiffs(node.b));
            case 'fn': {
                if (node.name === 'diff') {
                    const { body, v, rest } = specialArgs(node);
                    if (rest.length === 0) return simplify(derive(expandDiffs(body), v));
                }
                return N.fn(node.name, node.args.map(expandDiffs));
            }
            default: return node;
        }
    }

    // グラフ用：x の値を入れて計算する関数を作る（計算できない点は NaN）
    function compile(node, v, env) {
        const inner = radEnv(env);
        return t => {
            try {
                return toNum(evaluate(node, withVar(inner, v, F(t))));
            } catch {
                return NaN;
            }
        };
    }

    return {
        CalcError, run, parse, evaluate, simplify, derive, compile, texToExpr,
        toText, toTex, formatValue, valueToTex, hasAlternate, freeVars, isQ,
        Q, F,
    };
})();

if (typeof module !== 'undefined') module.exports = SciMath;
