// =====================================
// 大きいパネル（関数電卓・ハードウェア詳細）を開いている間、後ろを暗くして触れなくする
// 閉じるのはパネルの × ボタンだけ
// =====================================
const Modal = (() => {
    const backdrop = document.getElementById('modal-backdrop');
    const opened = new Set();

    // 開いているパネルと暗幕以外を inert にする（クリック・Tab移動・キー入力が届かなくなる）
    function lockBackground() {
        const locked = opened.size > 0;
        backdrop.hidden = !locked;
        for (const el of document.body.children) {
            if (el === backdrop || opened.has(el) || el.tagName === 'SCRIPT') continue;
            el.inert = locked;
        }
    }

    return {
        open(panel) {
            panel.hidden = false;
            opened.add(panel);
            lockBackground();
        },
        close(panel) {
            panel.hidden = true;
            opened.delete(panel);
            lockBackground();
        },
        // 後ろのアニメーションを止めるのに使う
        isOpen: () => opened.size > 0,
    };
})();
