// =====================================
// 季節のイベント（ハロウィン・クリスマス・お正月・バレンタイン・七夕）
// その日だけ、画面に飾りが流れ、時計の横にアイコンが出て、起動演出のあいさつが変わる
// 隠しコマンド：DevTools のコンソールで eventFx('halloween') など / コナミコマンド（↑↑↓↓←→←→BA）で順番に切り替え
// =====================================
const Events = (() => {
    const FPS = 30;
    const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    const rand = (a, b) => a + Math.random() * (b - a);
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function drawEmoji(g, text, x, y, size, alpha = 1, scaleY = 1) {
        g.save();
        g.globalAlpha = alpha;
        g.translate(x, y);
        g.scale(1, scaleY);
        g.font = `${size}px ${EMOJI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, 0, 0);
        g.restore();
    }

    // ---------- イベントごとの飾り ----------
    // init() で粒を作り、frame(g, s, t) で毎フレーム動かして描く（t は秒）
    const DEFS = {
        halloween: {
            name: 'Halloween',
            icon: '🎃',
            greeting: '> Happy Halloween!',
            active: d => d.getMonth() === 9 && d.getDate() === 31,
            init: () => ({
                pumpkins: Array.from({ length: 6 }, () => ({ x: rand(0, W()), y: rand(0, H()), size: rand(22, 38), speed: rand(8, 18), phase: rand(0, 6) })),
                bats: Array.from({ length: 5 }, () => ({ x: rand(0, W()), y: rand(40, H() * 0.6), size: rand(20, 30), speed: rand(60, 120), phase: rand(0, 6) })),
                ghosts: Array.from({ length: 2 }, () => ({ x: rand(0, W()), y: rand(80, H() - 80), born: rand(-8, 0) })),
            }),
            frame(g, s, t, dt) {
                // かぼちゃがゆらゆら浮かび上がる
                s.pumpkins.forEach(p => {
                    p.y -= p.speed * dt;
                    if (p.y < -40) Object.assign(p, { y: H() + 40, x: rand(0, W()) });
                    drawEmoji(g, '🎃', p.x + Math.sin(t + p.phase) * 18, p.y, p.size, 0.55);
                });
                // コウモリがパタパタ横切る
                s.bats.forEach(b => {
                    b.x -= b.speed * dt;
                    if (b.x < -40) Object.assign(b, { x: W() + 40, y: rand(40, H() * 0.6) });
                    const flap = 0.55 + Math.abs(Math.sin(t * 9 + b.phase)) * 0.45;
                    drawEmoji(g, '🦇', b.x, b.y + Math.sin(t * 2 + b.phase) * 12, b.size, 0.7, flap);
                });
                // おばけがふわっと現れて消える（8秒周期）
                s.ghosts.forEach(gh => {
                    const age = t - gh.born;
                    if (age > 8) Object.assign(gh, { born: t, x: rand(60, W() - 60), y: rand(80, H() - 80) });
                    const alpha = Math.sin(Math.min(1, age / 8) * Math.PI) * 0.45;
                    drawEmoji(g, '👻', gh.x + Math.sin(t) * 10, gh.y - age * 6, 34, alpha);
                });
            },
        },
        christmas: {
            name: 'Christmas',
            icon: '🎄',
            greeting: '> Merry Christmas!',
            active: d => d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 25),
            init: () => ({
                flakes: Array.from({ length: 40 }, () => ({ x: rand(0, W()), y: rand(0, H()), size: rand(10, 20), speed: rand(20, 50), phase: rand(0, 6) })),
                gifts: Array.from({ length: 3 }, () => ({ x: rand(0, W()), y: rand(-H(), 0), speed: rand(30, 50), spin: rand(-1, 1) })),
            }),
            frame(g, s, t, dt) {
                s.flakes.forEach(f => {
                    f.y += f.speed * dt;
                    if (f.y > H() + 20) Object.assign(f, { y: -20, x: rand(0, W()) });
                    g.globalAlpha = 0.7;
                    g.fillStyle = '#fff';
                    g.font = `${f.size}px ${EMOJI_FONT}`;
                    g.fillText('❄', f.x + Math.sin(t + f.phase) * 15, f.y);
                });
                s.gifts.forEach(p => {
                    p.y += p.speed * dt;
                    if (p.y > H() + 40) Object.assign(p, { y: -40, x: rand(0, W()) });
                    g.save();
                    g.translate(p.x, p.y);
                    g.rotate(Math.sin(t * p.spin) * 0.4);
                    drawEmoji(g, '🎁', 0, 0, 30, 0.6);
                    g.restore();
                });
                // 画面の上に電飾（色が順番に光る）
                const colors = ['#ff4040', '#40ff70', '#ffd040', '#40a0ff'];
                for (let x = 20, i = 0; x < W(); x += 42, i++) {
                    const on = (Math.floor(t * 2) + i) % colors.length;
                    g.globalAlpha = 0.85;
                    g.fillStyle = colors[on];
                    g.shadowColor = colors[on];
                    g.shadowBlur = 10;
                    g.beginPath();
                    g.arc(x, 10 + Math.sin(i * 0.9) * 4, 4, 0, Math.PI * 2);
                    g.fill();
                }
                g.shadowBlur = 0;
                g.globalAlpha = 1;
            },
        },
        newyear: {
            name: 'New Year',
            icon: '🎍',
            greeting: '> Happy New Year!',
            active: d => d.getMonth() === 0 && d.getDate() <= 3,
            init: () => ({ sparks: [], next: 0 }),
            frame(g, s, t, dt) {
                // 花火：ときどき打ち上がって、はじける
                if (t > s.next) {
                    s.next = t + rand(0.8, 2);
                    const x = rand(W() * 0.15, W() * 0.85);
                    const y = rand(H() * 0.15, H() * 0.5);
                    const hue = rand(0, 360);
                    for (let i = 0; i < 60; i++) {
                        const a = (i / 60) * Math.PI * 2;
                        const v = rand(60, 160);
                        s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: hue + rand(-20, 20) });
                    }
                }
                s.sparks = s.sparks.filter(p => p.life > 0);
                s.sparks.forEach(p => {
                    p.vy += 60 * dt;
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.life -= dt * 0.7;
                    g.globalAlpha = Math.max(0, p.life);
                    g.fillStyle = `hsl(${p.hue}, 100%, 65%)`;
                    g.fillRect(p.x, p.y, 2.5, 2.5);
                });
                g.globalAlpha = 1;
            },
        },
        valentine: {
            name: "Valentine's Day",
            icon: '💝',
            greeting: "> Happy Valentine's Day!",
            active: d => d.getMonth() === 1 && d.getDate() === 14,
            init: () => ({
                hearts: Array.from({ length: 14 }, () => ({ x: rand(0, W()), y: rand(0, H()), size: rand(14, 30), speed: rand(15, 35), phase: rand(0, 6) })),
            }),
            frame(g, s, t, dt) {
                s.hearts.forEach(h => {
                    h.y -= h.speed * dt;
                    if (h.y < -30) Object.assign(h, { y: H() + 30, x: rand(0, W()) });
                    const beat = 1 + Math.max(0, Math.sin(t * 6 + h.phase)) * 0.12;
                    drawEmoji(g, '💗', h.x + Math.sin(t + h.phase) * 20, h.y, h.size * beat, 0.55);
                });
            },
        },
        tanabata: {
            name: 'Tanabata',
            icon: '🎋',
            greeting: '> Make a wish under the stars.',
            active: d => d.getMonth() === 6 && d.getDate() === 7,
            init: () => ({
                stars: Array.from({ length: 70 }, () => ({ x: rand(0, W()), y: rand(0, H()), r: rand(0.5, 1.8), phase: rand(0, 6) })),
                shoot: null,
                next: 3,
            }),
            frame(g, s, t, dt) {
                // 天の川
                const grad = g.createLinearGradient(0, H() * 0.8, W(), H() * 0.1);
                grad.addColorStop(0, 'rgba(150, 170, 255, 0)');
                grad.addColorStop(0.5, 'rgba(170, 190, 255, 0.10)');
                grad.addColorStop(1, 'rgba(150, 170, 255, 0)');
                g.fillStyle = grad;
                g.fillRect(0, 0, W(), H());
                // またたく星
                s.stars.forEach(st => {
                    g.globalAlpha = 0.3 + Math.abs(Math.sin(t * 1.5 + st.phase)) * 0.6;
                    g.fillStyle = '#fff';
                    g.beginPath();
                    g.arc(st.x, st.y, st.r, 0, Math.PI * 2);
                    g.fill();
                });
                // ときどき流れ星
                if (!s.shoot && t > s.next) s.shoot = { x: rand(W() * 0.3, W()), y: rand(0, H() * 0.3), life: 1 };
                if (s.shoot) {
                    const p = s.shoot;
                    p.x -= 500 * dt;
                    p.y += 250 * dt;
                    p.life -= dt * 1.5;
                    g.globalAlpha = Math.max(0, p.life);
                    g.strokeStyle = '#fff';
                    g.lineWidth = 2;
                    g.beginPath();
                    g.moveTo(p.x, p.y);
                    g.lineTo(p.x + 80, p.y - 40);
                    g.stroke();
                    if (p.life <= 0) {
                        s.shoot = null;
                        s.next = t + rand(3, 8);
                    }
                }
                g.globalAlpha = 1;
            },
        },
    };
    const ORDER = Object.keys(DEFS);

    // ---------- 描画 ----------
    const canvas = document.getElementById('event-fx');
    const badge = document.getElementById('event-badge');
    const g = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = null; // 表示中のイベントの名前
    let state = null;
    let running = false;
    let last = 0;
    let startTime = 0;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(W() * dpr);
        canvas.height = Math.round(H() * dpr);
        canvas.style.width = `${W()}px`;
        canvas.style.height = `${H()}px`;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function loop(now) {
        if (!running) return;
        requestAnimationFrame(loop);
        if (now - last < 1000 / FPS) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        // 見えていない間・大きいパネルを開いている間は描かない
        if (document.hidden || (typeof Modal !== 'undefined' && Modal.isOpen())) return;
        g.clearRect(0, 0, W(), H());
        DEFS[current].frame(g, state, (now - startTime) / 1000, dt);
    }

    function start(name) {
        current = name;
        const def = DEFS[name];
        badge.textContent = def.icon;
        badge.title = def.name;
        badge.hidden = false;
        if (reduceMotion) return;
        state = def.init();
        startTime = performance.now();
        last = startTime;
        if (!running) {
            running = true;
            requestAnimationFrame(loop);
        }
    }

    function stop() {
        current = null;
        running = false;
        badge.hidden = true;
        g.clearRect(0, 0, W(), H());
    }

    window.addEventListener('resize', resize);
    resize();

    // 今日のイベント
    const today = ORDER.find(name => DEFS[name].active(new Date()));
    if (today) start(today);

    // ---------- 隠しコマンド ----------
    // コンソールで eventFx('christmas') / eventFx('off') / eventFx() で一覧
    window.eventFx = (name) => {
        if (name === 'off') { stop(); return 'off'; }
        if (!DEFS[name]) return `使えるイベント: ${ORDER.join(', ')}, off`;
        start(name);
        return `${DEFS[name].icon} ${DEFS[name].name}`;
    };

    // コナミコマンドで順番に切り替え（最後は off）
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let progress = 0;
    window.addEventListener('keydown', (e) => {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        progress = key === KONAMI[progress] ? progress + 1 : (key === KONAMI[0] ? 1 : 0);
        if (progress < KONAMI.length) return;
        progress = 0;
        const next = ORDER[(ORDER.indexOf(current) + 1)];
        if (next) start(next); else stop();
    });

    return {
        // 起動演出のあいさつに使う（今日のイベントがなければ null）
        greeting: () => (current ? DEFS[current].greeting : null),
    };
})();
