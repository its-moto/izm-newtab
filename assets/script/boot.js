// =====================================
// 起動演出に合わせて、箱の中身（電卓のボタン・ショートカット・天気の予報など）を順番に出すための道具
// =====================================
const Boot = (() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;

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

    return { whenShown, popIn };
})();

// =====================================
// 起動演出：新しいタブを開くたびに、各パネルが左上から順に立ち上がる
// その日（朝6時区切り）はじめて開いたときは、タイトルとあいさつを出してからゆっくり立ち上がる長い演出にする
// <head> で読み込み、表示前にパネルを隠しておく（アニメーションは modal.js の anim-open を使う）
// =====================================
(() => {
    const BOOT_KEY = 'boot-day';
    const DAY_START_HOUR = 6; // この時刻より前は前の日の続きとみなす
    const PANELS = [
        'clockbox', 'battery-box', 'theme-box', 'speed-box', 'searchbox', 'shortcut-box',
        'timetable-box', 'weather-box', 'eew-box', 'setup-ui', 'calc-box', 'sys-box', 'dl-box',
    ];
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

    // ---------- 長い演出：真ん中に線が広がり、文字がタイプされていく ----------
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

    async function showSplash() {
        const version = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.().version) || '';
        const week = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
        const date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} (${week})`;

        const splash = document.createElement('div');
        splash.id = 'boot-splash';
        splash.innerHTML = '<div class="boot-title"></div><div class="boot-line"></div><div class="boot-sub"></div><div class="boot-greet"></div>';
        document.body.appendChild(splash);

        // クリックかキーで飛ばせる
        let skipped = false;
        const skip = () => { skipped = true; };
        splash.addEventListener('click', skip);
        window.addEventListener('keydown', skip, { once: true });

        const steps = async () => {
            await wait(250); // 線が伸びきるのを待つ
            // タイトルだけは全部の文字を同時に、下からふわっと出す
            const title = splash.querySelector('.boot-title');
            title.textContent = `IZM NewTab${version ? ` v${version}` : ''}`;
            title.classList.add('rise');
            await wait(450);
            await typeText(splash.querySelector('.boot-sub'), date, 22);
            await typeText(splash.querySelector('.boot-greet'), greeting(now.getHours()), 60);
            await wait(650);
        };
        await Promise.race([steps(), new Promise(resolve => {
            const check = setInterval(() => { if (skipped) { clearInterval(check); resolve(); } }, 50);
        })]);

        window.removeEventListener('keydown', skip);
        splash.classList.add('leaving');
        await wait(350);
        splash.remove();
    }

    // ---------- パネルを順番に立ち上げる ----------
    function bootPanels({ delay, step }) {
        const panels = PANELS.map(id => document.getElementById(id)).filter(Boolean);
        // 画面の左上から右下へ順番に（横の位置を優先し、縦は少しだけ効かせる）
        const order = el => {
            const r = el.getBoundingClientRect();
            return r.left + r.top * 0.6;
        };
        panels.sort((a, b) => order(a) - order(b));

        panels.forEach((el, i) => setTimeout(() => {
            el.classList.add('boot-shown');
            Modal.animate(el, 'anim-open');
        }, delay + i * step));

        setTimeout(() => {
            document.documentElement.classList.remove('booting');
            panels.forEach(el => el.classList.remove('boot-shown'));
        }, delay + panels.length * step + 700);
    }

    window.addEventListener('DOMContentLoaded', async () => {
        if (mode === 'long') await showSplash();
        bootPanels(MODES[mode]);
    });
})();
