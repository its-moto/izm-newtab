// =====================================
// タブのファビコン（テーマカラーに連動）
// 色相(15°刻み・24段階)ごとに、5x5の左右対称ピクセル模様を決める。
// 色の明るさ・彩度を変えても模様は変わらず、色だけが変わる。
// =====================================

// 色相を24段階に丸める。ほぼ無彩色(白・グレー・黒)は 'gray'
function hueBucket(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.08) return 'gray';

    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return Math.round(h / 15) % 24;
}

// シード付き乱数（同じシードなら毎回同じ模様になる）
function mulberry32(seed) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 5行x5列のtrue/false。左3列を乱数で決めて右にミラーする
function faviconPattern(bucket) {
    const seed = (typeof bucket === 'number' ? bucket + 1 : 99) * 2654435761;
    const rand = mulberry32(seed);

    for (let tries = 0; tries < 100; tries++) {
        const half = Array.from({ length: 5 }, () => [rand() < 0.5, rand() < 0.5, rand() < 0.5]);
        const grid = half.map(([a, b, c]) => [a, b, c, b, a]);
        const count = grid.flat().filter(Boolean).length;
        const centerCount = grid.filter(row => row[2]).length;
        // 少なすぎ・多すぎ・中央が空っぽの模様は避ける
        if (count >= 9 && count <= 15 && centerCount >= 3) return grid;
    }
    // 万一見つからなかった場合の保険（十字）
    return [0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4].map(c => r === 2 || c === 2));
}

// 16x16のSVG: 黒地 + 1pxの枠 + 2px四方のセルで5x5模様（整数ピクセルでにじまない）
function faviconSvg(hex) {
    const grid = faviconPattern(hueBucket(hex));
    let cells = '';
    grid.forEach((row, r) => row.forEach((on, c) => {
        if (on) cells += `<rect x="${3 + c * 2}" y="${3 + r * 2}" width="2" height="2" fill="${hex}"/>`;
    }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
        `<rect width="16" height="16" fill="#000"/>` +
        `<rect x=".5" y=".5" width="15" height="15" fill="none" stroke="${hex}" stroke-width="1"/>` +
        cells + `</svg>`;
}

// ---------- ページへの適用 ----------
if (typeof document !== 'undefined') {
    (() => {
        const picker = document.getElementById('color-picker');
        if (!picker) return;

        // hrefを書き換えるだけだと反映されないことがあるので、linkごと作り直す
        function applyFavicon() {
            const link = document.createElement('link');
            link.id = 'favicon';
            link.rel = 'icon';
            link.type = 'image/svg+xml';
            link.href = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg(picker.value));
            document.getElementById('favicon')?.remove();
            document.head.appendChild(link);
        }

        applyFavicon();

        // ピッカーをドラッグ中は連続で発火するので、少し間引く
        let timer;
        picker.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(applyFavicon, 60);
        });
    })();
}

// 動作確認(Node)用
if (typeof module !== 'undefined') module.exports = { hueBucket, faviconPattern, faviconSvg };