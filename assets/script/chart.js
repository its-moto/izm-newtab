// =====================================
// 心電図風の折れ線グラフ（ハードウェア詳細で使う）
// 心電図のように左から右へ描き、右端まで行ったら左端から上書きする（1周 windowMs）。系列は2本まで重ねられる
// =====================================
class TrendChart {
    // options: { min, max（固定。なければ自動）, floor（自動のときの最小の上限）, windowMs, format(v) }
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.options = { windowMs: 60000, ...options };
        this.series = [[], []]; // [{ t, v }]
        // target: 最新の計測値 / shown: 描いている値（毎フレーム target に近づけて、点を滑らかに動かす）
        this.state = [{ target: null, shown: null }, { target: null, shown: null }];
        this.interval = 250;     // 値が変わる間隔の目安（ms）。これに合わせて追いつく速さを変える
        this.lastChange = null;
        this.lastDraw = -Infinity;
        this.lastTick = null;
    }

    push(index, value, time = performance.now()) {
        if (!Number.isFinite(value)) return;
        const s = this.state[index];
        // 値が変わった間隔を覚えておく（LibreHardwareMonitor は1秒ごと、システムは0.25秒ごとなど）
        if (index === 0 && value !== s.target) {
            if (this.lastChange !== null) {
                const gap = Math.min(3000, Math.max(100, time - this.lastChange));
                this.interval += (gap - this.interval) * 0.3;
            }
            this.lastChange = time;
        }
        s.target = value;
        if (s.shown === null) s.shown = value;
        // 描いていない間（パネルを閉じているとき）は、計測値をそのまま記録しておく
        if (time - this.lastDraw > 500) {
            s.shown = value;
            this.addPoint(index, value, time);
        }
    }

    addPoint(index, value, time) {
        const list = this.series[index];
        list.push({ t: time, v: value });
        // 表示範囲より古いものは捨てる（左端で線が切れないよう1つだけ残す）
        const limit = time - this.options.windowMs;
        while (list.length > 2 && list[1].t < limit) list.shift();
    }

    // 描くたびに、表示中の値を計測値へ少しずつ近づけて点を足す
    tick(now) {
        const dt = this.lastTick === null ? 0 : Math.min(now - this.lastTick, 500);
        this.lastTick = now;
        // 次の値が来るころにちょうど追いつく速さで近づける（間隔が長いほどゆっくり）
        const k = 1 - Math.exp(-dt / (this.interval * 0.3));
        this.state.forEach((s, i) => {
            if (s.target === null) return;
            s.shown += (s.target - s.shown) * k;
            this.addPoint(i, s.shown, now);
        });
    }

    clear() {
        this.series = [[], []];
        this.state.forEach(s => { s.target = null; s.shown = null; });
    }

    range(now) {
        const { min, max, floor = 1 } = this.options;
        if (min !== undefined && max !== undefined) return [min, max];
        const values = this.series.flat().filter(p => p.t >= now - this.options.windowMs).map(p => p.v);
        if (values.length === 0) return [min ?? 0, max ?? floor];
        let lo = min ?? Math.min(...values);
        let hi = max ?? Math.max(...values);
        if (min === undefined) lo -= (hi - lo) * 0.15 + 1;
        if (max === undefined) hi = Math.max(hi + (hi - lo) * 0.15, (min ?? lo) + floor);
        return [lo, hi];
    }

    draw(now = performance.now()) {
        this.tick(now);
        this.lastDraw = now;
        const { canvas } = this;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return;
        const dpr = (window.devicePixelRatio || 1) * 2;
        if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
        if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
        const g = canvas.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);

        const color = getComputedStyle(document.documentElement).getPropertyValue('--main-color').trim() || '#00eaff';
        const [lo, hi] = this.range(now);
        const { windowMs } = this.options;
        const gapMs = windowMs * 0.05; // 描画位置の先の消去部分
        // 心電図のように、時刻に応じて左から右へ進み、右端まで行ったら左端から上書きする
        const x = t => ((t % windowMs) / windowMs) * w;
        const y = v => h - 3 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (h - 6);

        // 方眼（横は10秒ごと。位置は固定）
        g.strokeStyle = color;
        g.lineWidth = 1;
        g.globalAlpha = 0.08;
        g.beginPath();
        for (let t = 10000; t < windowMs; t += 10000) {
            const px = Math.round(t / windowMs * w) + 0.5;
            g.moveTo(px, 0);
            g.lineTo(px, h);
        }
        for (let i = 1; i < 4; i++) {
            const py = Math.round(h * i / 4) + 0.5;
            g.moveTo(0, py);
            g.lineTo(w, py);
        }
        g.stroke();

        // 上下の目盛り
        g.globalAlpha = 0.5;
        g.fillStyle = color;
        g.font = '10px MaruMonica, monospace';
        g.textAlign = 'left';
        const fmt = this.options.format || (v => String(Math.round(v)));
        g.fillText(fmt(hi), 3, 10);
        g.fillText(fmt(lo), 3, h - 3);

        // 2本目（白っぽい線）→ 1本目（テーマカラー）の順に描く
        const CHUNK = 15; // この点数ごとにまとめて描く（古いほど薄く）
        [1, 0].forEach(index => {
            const points = this.series[index].filter(p => now - p.t < windowMs - gapMs);
            if (points.length < 2) return;
            const lineColor = index === 0 ? color : 'rgba(255, 255, 255, 0.75)';
            g.lineJoin = 'round';
            g.strokeStyle = lineColor;
            g.fillStyle = lineColor;

            for (let start = 0; start < points.length - 1; start += CHUNK) {
                const chunk = points.slice(start, start + CHUNK + 1);
                const age = (now - chunk[chunk.length - 1].t) / windowMs;
                const alpha = 1 - age * 0.8;
                g.beginPath();
                chunk.forEach((p, i) => {
                    // 右端→左端の折り返しでは線をつなげない
                    if (i === 0 || x(p.t) < x(chunk[i - 1].t)) g.moveTo(x(p.t), y(p.v));
                    else g.lineTo(x(p.t), y(p.v));
                });
                // shadowBlur は重いので、太い半透明の線を下に重ねて光って見せる
                g.globalAlpha = 0.25 * alpha;
                g.lineWidth = 4;
                g.stroke();
                g.globalAlpha = alpha;
                g.lineWidth = 1.5;
                g.stroke();
            }

            // 今の値の点
            const last = points[points.length - 1];
            g.globalAlpha = 1;
            g.beginPath();
            g.arc(x(last.t), y(last.v), 2.5, 0, Math.PI * 2);
            g.fill();
        });

        // 描画位置の縦線
        g.globalAlpha = 0.3;
        g.strokeStyle = color;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(Math.round(x(now)) + 0.5, 0);
        g.lineTo(Math.round(x(now)) + 0.5, h);
        g.stroke();
        g.globalAlpha = 1;
    }
}
