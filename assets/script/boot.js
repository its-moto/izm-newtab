// =====================================
// 起動演出の道具
// ・パネルを順番に開く / 閉じる（起動演出・背景鑑賞モードで使う）
// ・箱の中身（電卓のボタン・ショートカット・天気の予報など）を順番に出す
// =====================================
const Boot = (() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    const PANELS = [
        'clockbox', 'battery-box', 'theme-box', 'speed-box', 'memo-box', 'searchbox', 'shortcut-box',
        'timetable-box', 'weather-box', 'eew-box', 'setup-ui', 'calc-box', 'sys-box', 'dl-box',
    ];
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    // 画面の左上から右下への順（横の位置を優先し、縦は少しだけ効かせる）
    function panelsInOrder() {
        const order = el => {
            const r = el.getBoundingClientRect();
            return r.left + r.top * 0.6;
        };
        return PANELS.map(id => document.getElementById(id)).filter(Boolean).sort((a, b) => order(a) - order(b));
    }

    // パネルを左上から順に開く（reveal(el) で表示できる状態にしてから開くアニメーション）
    function panelsIn({ delay = 0, step = 40, reveal = () => {} } = {}) {
        const panels = panelsInOrder();
        panels.forEach((el, i) => setTimeout(() => {
            reveal(el);
            Modal.animate(el, 'anim-open');
        }, delay + i * step));
        return wait(delay + panels.length * step + 450);
    }

    // パネルを右下から順に閉じる（閉じ終わったら hide(el) で隠す）
    function panelsOut({ step = 35, hide = () => {} } = {}) {
        const panels = panelsInOrder().reverse();
        return Promise.all(panels.map((el, i) => wait(i * step)
            .then(() => Modal.animate(el, 'anim-close', () => hide(el)))));
    }

    // el が起動演出で表示されるまで待つ。表示されたら extra ms 後に解決（演出中でなければすぐ）
    function whenShown(el, extra = 0) {
        return new Promise(resolve => {
            const ready = () => !root.classList.contains('booting') || el.classList.contains('boot-shown');
            if (!root.classList.contains('booting')) return resolve();
            if (ready()) return setTimeout(resolve, extra);
            const observer = new MutationObserver(() => {
                if (!ready()) return;
                observer.disconnect();
                setTimeout(resolve, extra);
            });
            observer.observe(el, { attributes: true, attributeFilter: ['class'] });
            observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        });
    }

    // 中身を少しずつずらして、ふわっと出す（箱が表示されるまでは隠しておく）
    function popIn(container, items, step = 30) {
        if (reduceMotion || items.length === 0) return;
        items.forEach(el => el.classList.add('pop-pending'));
        whenShown(container, 250).then(() => {
            items.forEach((el, i) => {
                el.classList.remove('pop-pending');
                el.style.animationDelay = `${i * step}ms`;
                el.classList.add('pop-in');
                const done = e => {
                    if (e.target !== el) return;
                    el.removeEventListener('animationend', done);
                    el.classList.remove('pop-in');
                    el.style.animationDelay = '';
                };
                el.addEventListener('animationend', done);
            });
        });
    }

    return { whenShown, popIn, panelsIn, panelsOut };
})();

// =====================================
// 起動演出：新しいタブを開くたびに、各パネルが左上から順に立ち上がる
// その日（朝6時区切り）はじめて開いたときは、タイトルとあいさつを出してからゆっくり立ち上がる長い演出にする
// <head> で読み込み、表示前にパネルを隠しておく（アニメーションは modal.js の anim-open を使う）
// =====================================
(() => {
    const BOOT_KEY = 'boot-day';
    const DAY_START_HOUR = 6; // この時刻より前は前の日の続きとみなす
    // short: 毎回 / long: その日はじめて
    const MODES = {
        short: { delay: 40, step: 40 },
        long: { delay: 0, step: 110 },
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const now = new Date();
    const dayKey = new Date(now.getTime() - DAY_START_HOUR * 3600000).toDateString();
    let mode = 'short';
    try {
        if (localStorage.getItem(BOOT_KEY) !== dayKey) mode = 'long';
        localStorage.setItem(BOOT_KEY, dayKey);
    } catch { /* 保存できないときは短い演出 */ }

    // DevTools のコンソールで replayBoot() と打つと、長い起動演出をもう一度見られる（隠しコマンド）
    window.replayBoot = () => {
        localStorage.removeItem(BOOT_KEY);
        location.reload();
    };

    document.documentElement.classList.add('booting');

    // ---------- 長い演出 ----------
    // 1. 四隅に枠が現れ、真ん中に線が広がってタイトルが下から浮かび上がる
    // 2. 日付とあいさつがタイプされ、左下に起動ログが流れる
    // 3. 「PRESS ANY KEY」が点滅し、背景の映像が見えるくらいまで暗幕が薄くなる
    // 4. キーかクリックで、線が画面いっぱいに伸びて光り、パネルが立ち上がる
    // コンソールっぽく英語で
    function greeting(hour) {
        if (hour >= 5 && hour < 11) return '> Good morning.';
        if (hour >= 11 && hour < 18) return '> Good afternoon.';
        return '> Good evening.';
    }

    function typeText(el, text, perChar = 28) {
        return new Promise(resolve => {
            let i = 0;
            const timer = setInterval(() => {
                el.textContent = text.slice(0, ++i);
                if (i >= text.length) {
                    clearInterval(timer);
                    resolve();
                }
            }, perChar);
        });
    }

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    // 左下に流す起動ログ（画面サイズや時刻など、今の状態を少し混ぜる）
    function bootLog() {
        const zoom = typeof PageZoom !== 'undefined' ? PageZoom.value : 1;
        const theme = document.getElementById('color-picker')?.value || '#00eaff';
        return [
            `[ OK ] Display ${window.innerWidth}x${window.innerHeight} @ ${zoom.toFixed(2)}x`,
            `[ OK ] Clock synchronized  ${now.toLocaleTimeString('ja-JP')}`,
            `[ OK ] Theme color  ${theme}`,
            '[ OK ] Timetable loaded',
            '[ OK ] Weather service',
            '[ OK ] Quake monitor (JMA / Wolfx)',
            '[ OK ] System monitor',
            `[ OK ] Network  ${navigator.onLine ? 'online' : 'offline'}`,
            '> All systems ready.',
        ];
    }

    async function showSplash() {
        const version = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.().version) || '';
        const week = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
        const date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} (${week})`;

        const splash = document.createElement('div');
        splash.id = 'boot-splash';
        splash.innerHTML = `
            <div class="boot-corner tl"></div><div class="boot-corner tr"></div>
            <div class="boot-corner bl"></div><div class="boot-corner br"></div>
            <div class="boot-title"></div><div class="boot-line"></div>
            <div class="boot-sub"></div><div class="boot-greet"></div>
            <div class="boot-press">PRESS ANY KEY</div>
            <div class="boot-log"></div>`;
        document.body.appendChild(splash);
        // 起動演出の間は背景の暗さを 0.5 に固定（キーを押したら設定の暗さへ戻す。bg.js）
        if (typeof BgDim !== 'undefined') BgDim.hold(0.5);

        // キーかクリックで先へ進む（演出の途中なら飛ばす）
        let pressed = false;
        let onPress;
        const press = new Promise(resolve => {
            onPress = e => {
                if (e.type === 'keydown') e.preventDefault();
                pressed = true;
                resolve();
            };
        });
        splash.addEventListener('click', onPress);
        window.addEventListener('keydown', onPress);

        // 起動ログを1行ずつ流す
        const logEl = splash.querySelector('.boot-log');
        bootLog().forEach((line, i) => setTimeout(() => {
            if (pressed) return;
            const row = document.createElement('div');
            row.textContent = line;
            logEl.appendChild(row);
        }, 400 + i * 160));

        const intro = async () => {
            await wait(250); // 線が伸びきるのを待つ
            // タイトルだけは全部の文字を同時に、下からふわっと出す
            const title = splash.querySelector('.boot-title');
            title.textContent = `IZM NewTab${version ? ` v${version}` : ''}`;
            title.classList.add('rise');
            await wait(450);
            await typeText(splash.querySelector('.boot-sub'), date, 22);
            // 季節のイベントの日はイベントのあいさつ（events.js）
            const special = typeof Events !== 'undefined' ? Events.greeting() : null;
            await typeText(splash.querySelector('.boot-greet'), special || greeting(now.getHours()), 60);
            await wait(400);
        };
        await Promise.race([intro(), press]);

        if (!pressed) {
            // キーが押されるまで、暗幕を薄くして背景を見せながら待つ
            splash.classList.add('idle');
            await press;
        }
        window.removeEventListener('keydown', onPress);
        if (typeof BgDim !== 'undefined') BgDim.release();

        // 線が画面いっぱいに伸びて光り、全体が消える
        splash.classList.add('leaving');
        await wait(650);
        splash.remove();
    }

    // ---------- パネルを順番に立ち上げる ----------
    async function bootPanels({ delay, step }) {
        await Boot.panelsIn({ delay, step, reveal: el => el.classList.add('boot-shown') });
        await new Promise(resolve => setTimeout(resolve, 250));
        document.documentElement.classList.remove('booting');
        document.querySelectorAll('.boot-shown').forEach(el => el.classList.remove('boot-shown'));
    }

    window.addEventListener('DOMContentLoaded', async () => {
        if (mode === 'long') await showSplash();
        bootPanels(MODES[mode]);
    });
})();
