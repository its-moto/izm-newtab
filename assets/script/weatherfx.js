// =====================================
// 天気に合わせた演出（雨・雪・雷・霧）
// 背景の上・各パネルの下に透明なキャンバスを重ねて描く。今の天気は weather.js から受け取る
// =====================================
(() => {
    const FX_KEY = 'weather-fx'; // 'off' で演出なし
    const FPS = 30;

    const canvas = document.getElementById('weather-fx');
    const btn = document.getElementById('weather-fx-btn');
    const g = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let enabled = localStorage.getItem(FX_KEY) !== 'off';
    let effect = { type: 'none', level: 0 };
    let particles = [];
    let flash = 0;          // 雷の光（1 → 0 に消えていく）
    let nextFlash = 0;      // 次に光る時刻
    let running = false;
    let lastFrame = 0;

    // 天気コード（WMO）→ 演出の種類と強さ（1〜3）
    function effectOf(code) {
        const rain = { 51: 1, 53: 1, 55: 2, 56: 1, 57: 2, 61: 1, 63: 2, 65: 3, 66: 2, 67: 3, 80: 1, 81: 2, 82: 3 };
        const snow = { 71: 1, 73: 2, 75: 3, 77: 1, 85: 1, 86: 3 };
        const thunder = { 95: 2, 96: 3, 99: 3 };
        if (rain[code]) return { type: 'rain', level: rain[code], drizzle: code >= 51 && code <= 57 };
        if (snow[code]) return { type: 'snow', level: snow[code] };
        if (thunder[code]) return { type: 'thunder', level: thunder[code] };
        if (code === 45 || code === 48) return { type: 'fog', level: 1 };
        return { type: 'none', level: 0 };
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ---------- 粒の作成 ----------
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function makeParticle(type, anywhere) {
        const drizzle = effect.drizzle;
        if (type === 'rain' || type === 'thunder') {
            const speed = (drizzle ? 6 : 13) + Math.random() * (drizzle ? 3 : 7) + effect.level * 2;
            return {
                x: Math.random() * W() * 1.2 - W() * 0.1,
                y: anywhere ? Math.random() * H() : -20 - Math.random() * H() * 0.3,
                len: (drizzle ? 6 : 12) + Math.random() * (drizzle ? 6 : 14),
                speed,
                alpha: (drizzle ? 0.25 : 0.32) + Math.random() * 0.18,
                // 強い雨ほど太く（霧雨は細め）
                width: (drizzle ? 1.2 : 1.4 + effect.level * 0.45) + Math.random() * 0.6,
            };
        }
        if (type === 'snow') {
            return {
                x: Math.random() * W(),
                y: anywhere ? Math.random() * H() : -10,
                r: 1 + Math.random() * 2.2,
                speed: 0.6 + Math.random() * 1.2,
                phase: Math.random() * Math.PI * 2,
                sway: 0.4 + Math.random() * 0.8,
                alpha: 0.5 + Math.random() * 0.4,
            };
        }
        if (type === 'fog') {
            return {
                x: Math.random() * W(),
                y: H() * (0.3 + Math.random() * 0.7),
                r: 250 + Math.random() * 300,
                speed: 0.15 + Math.random() * 0.25,
                alpha: 0.05 + Math.random() * 0.05,
            };
        }
        return null;
    }

    function setupParticles() {
        const counts = {
            rain: [0, 70, 140, 240],
            thunder: [0, 70, 160, 260],
            snow: [0, 60, 110, 180],
            fog: [0, 6, 6, 6],
        };
        const count = counts[effect.type]?.[effect.level] ?? 0;
        particles = Array.from({ length: count }, () => makeParticle(effect.type, true));
        nextFlash = performance.now() + 3000 + Math.random() * 5000;
    }

    // ---------- 描画 ----------
    function draw(now) {
        g.clearRect(0, 0, W(), H());
        const type = effect.type;

        if (type === 'rain' || type === 'thunder') {
            const wind = 0.18; // 少し斜めに降らせる
            g.strokeStyle = 'rgb(200, 220, 255)';
            particles.forEach((p, i) => {
                p.y += p.speed;
                p.x += p.speed * wind;
                if (p.y > H() + 20) particles[i] = makeParticle(type, false);
                g.globalAlpha = p.alpha;
                g.lineWidth = p.width;
                g.lineCap = 'round';
                g.beginPath();
                g.moveTo(p.x, p.y);
                g.lineTo(p.x - p.len * wind, p.y - p.len);
                g.stroke();
            });
        } else if (type === 'snow') {
            g.fillStyle = '#fff';
            particles.forEach((p, i) => {
                p.y += p.speed;
                p.phase += 0.02;
                p.x += Math.sin(p.phase) * p.sway;
                if (p.y > H() + 10) particles[i] = makeParticle(type, false);
                g.globalAlpha = p.alpha;
                g.beginPath();
                g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                g.fill();
            });
        } else if (type === 'fog') {
            particles.forEach(p => {
                p.x += p.speed;
                if (p.x - p.r > W()) p.x = -p.r;
                const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
                grad.addColorStop(0, `rgba(200, 200, 210, ${p.alpha})`);
                grad.addColorStop(1, 'rgba(200, 200, 210, 0)');
                g.globalAlpha = 1;
                g.fillStyle = grad;
                g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
            });
        }

        // 雷：ときどき2回ほどチカッと光る
        if (type === 'thunder') {
            if (now > nextFlash) {
                flash = 1;
                nextFlash = now + 6000 + Math.random() * 12000;
                setTimeout(() => { flash = 0.8; }, 140);
            }
            if (flash > 0.01) {
                g.globalAlpha = flash * 0.22;
                g.fillStyle = '#e8f0ff';
                g.fillRect(0, 0, W(), H());
                flash *= 0.85;
            }
        }
        g.globalAlpha = 1;
    }

    function loop(now) {
        if (!running) return;
        requestAnimationFrame(loop);
        if (now - lastFrame < 1000 / FPS) return;
        lastFrame = now;
        // 見えていない間・大きいパネルを開いている間は描かない
        if (document.hidden || (typeof Modal !== 'undefined' && Modal.isOpen())) return;
        draw(now);
    }

    function update() {
        const active = enabled && !reduceMotion.matches && effect.type !== 'none';
        btn.classList.toggle('active', enabled);
        btn.title = enabled ? '天気の演出：オン（クリックでオフ）' : '天気の演出：オフ（クリックでオン）';
        if (active && !running) {
            running = true;
            requestAnimationFrame(loop);
        } else if (!active) {
            running = false;
            g.clearRect(0, 0, W(), H());
        }
    }

    function apply(code) {
        const next = effectOf(code);
        if (next.type !== effect.type || next.level !== effect.level) {
            effect = next;
            setupParticles();
        }
        update();
    }
    window.addEventListener('weather-now', e => apply(e.detail.code));

    // 隠しコマンド：DevTools のコンソールで weatherFx(65) のように天気コードを入れると、その演出を試せる
    // （61〜65: 雨 / 71〜75: 雪 / 95: 雷雨 / 45: 霧 / 0: なし。リロードで元の天気に戻る）
    window.weatherFx = code => {
        apply(Number(code));
        return `${effect.type} (level ${effect.level})`;
    };

    btn.addEventListener('click', () => {
        enabled = !enabled;
        localStorage.setItem(FX_KEY, enabled ? 'on' : 'off');
        update();
    });

    window.addEventListener('resize', resize);
    resize();
    update();
})();
