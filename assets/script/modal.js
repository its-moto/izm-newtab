// =====================================
// 大きいパネル（関数電卓・ハードウェア詳細）を開いている間、後ろを暗くして触れなくする
// 閉じるのはパネルの × ボタンだけ
// 開くとき・閉じるときのアニメーションもここで付ける（ショートカット編集でも使う）
// =====================================
const Modal = (() => {
    const backdrop = document.getElementById('modal-backdrop');
    const opened = new Set();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // 開いているパネルと暗幕以外を inert にする（クリック・Tab移動・キー入力が届かなくなる）
    function lockBackground() {
        const locked = opened.size > 0;
        backdrop.hidden = !locked;
        for (const el of document.body.children) {
            if (el === backdrop || opened.has(el) || el.tagName === 'SCRIPT') continue;
            el.inert = locked;
        }
    }

    // cls（anim-open / anim-close）のアニメーションを付けて、終わったら外す
    function animate(el, cls) {
        return new Promise(resolve => {
            el.classList.remove('anim-open', 'anim-close');
            if (reduceMotion.matches) return resolve();
            void el.offsetWidth; // 続けて開閉してもアニメーションが最初から動くように
            el.classList.add(cls);
            let finished = false;
            const done = () => {
                if (finished) return;
                finished = true;
                el.removeEventListener('animationend', onEnd);
                el.classList.remove(cls);
                resolve();
            };
            const onEnd = e => { if (e.target === el) done(); };
            el.addEventListener('animationend', onEnd);
            setTimeout(done, 700); // animationend が来なかったときの保険
        });
    }

    return {
        open(panel) {
            panel.hidden = false;
            opened.add(panel);
            lockBackground();
            animate(panel, 'anim-open');
        },
        async close(panel) {
            backdrop.classList.add('closing');
            await animate(panel, 'anim-close');
            backdrop.classList.remove('closing');
            panel.hidden = true;
            opened.delete(panel);
            lockBackground();
        },
        animate,
        // 後ろのアニメーションを止めるのに使う
        isOpen: () => opened.size > 0,
    };
})();
