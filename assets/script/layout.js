// =====================================
// 画面の幅に合わせてページ全体を拡大・縮小する
// レイアウトは横幅 1536px の画面で作っているので、幅が違う画面では同じ見た目のまま縮めたり広げたりする
// （1280px なら 0.83 倍、1920px なら 1.25 倍）
// =====================================
const PageZoom = (() => {
    const BASE_WIDTH = 1536;
    const MIN = 0.5;
    const MAX = 2;
    let zoom = 1;

    function apply() {
        zoom = Math.min(MAX, Math.max(MIN, window.innerWidth / BASE_WIDTH));
        document.body.style.zoom = zoom;
        // 背景は画面いっぱいに出したいので、拡大・縮小を打ち消す（bg.js が実際の画面サイズで合わせる）
        const background = document.getElementById('background');
        if (background) background.style.zoom = 1 / zoom;
    }

    apply();
    window.addEventListener('resize', apply);

    return {
        // キャンバスを拡大してもぼやけないよう、描画の解像度に掛けるのに使う
        get value() { return zoom; },
    };
})();
