// =====================================
// タブのファビコン（テーマカラー・サブカラーに連動）
// 5x5の左右対称ピクセル模様。模様は色の RGB(+A) の値から決める
// ・テーマカラーの R・G・B とサブカラーの R・G・B・A … 模様の形（値が変わると別の模様）
// ・テーマカラーの明るさ … 点灯するマスの数（明るいほど多い）
// ・テーマカラーの鮮やかさ … 半分の明るさのマスの数（くすんだ色ほど多い）
// ・サブカラー … 背景の色（濃さも反映）
// =====================================

const parseHex = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// 彩度・明度（HSL の S と L、0〜1）
function saturationLightness([r, g, b]) {
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    return { s, l };
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

// 数の並びから1つのシードを作る（FNV-1a）
function hashValues(values) {
    let h = 2166136261;
    values.forEach(v => {
        h ^= v;
        h = Math.imul(h, 16777619);
    });
    return h >>> 0;
}

// 5行x5列。0: 消灯 / 1: 半分の明るさ / 2: 点灯。左3列を決めて右にミラーする
// ピッカーを少し動かしただけで模様が変わりすぎないよう、RGB は 8 段刻み（サブカラーは 16 段刻み）でまとめる
function faviconPattern(main, sub = [0, 0, 0], alpha = 0.5) {
    const seed = hashValues([...main.map(v => v >> 3), ...sub.map(v => v >> 4), Math.round(alpha * 10)]);
    const rand = mulberry32(seed);
    const { s, l } = saturationLightness(main);
    const lit = 8 + Math.round(Math.min(l, 0.85) / 0.85 * 8); // 8〜16マス
    const dimRate = (1 - s) * 0.5;                            // 点灯しないマスのうち半分の明るさにする割合

    for (let tries = 0; tries < 300; tries++) {
        const half = Array.from({ length: 5 }, () => [rand(), rand(), rand()].map(v => (v < 0.5 ? 2 : 0)));
        const grid = half.map(([a, b, c]) => [a, b, c, b, a]);
        const count = grid.flat().filter(v => v === 2).length;
        const centerCount = grid.filter(row => row[2] === 2).length;
        // 明るさに合った数だけ点灯していて、中央が空っぽでない模様を選ぶ
        if (Math.abs(count - lit) > 1 || centerCount < 2) continue;
        // 消灯のマスの一部を半分の明るさにする（左右対称のまま）
        return grid.map(row => {
            const left = row.slice(0, 3).map(v => (v === 0 && rand() < dimRate ? 1 : v));
            return [left[0], left[1], left[2], left[1], left[0]];
        });
    }
    // 万一見つからなかった場合の保険（十字）
    return [0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4].map(c => (r === 2 || c === 2 ? 2 : 0)));
}

// サブカラーを黒の上に重ねた色（アイコンの背景）
function backgroundColor(sub, alpha) {
    const [r, g, b] = sub.map(v => Math.round(v * alpha));
    return `rgb(${r},${g},${b})`;
}

// 16x16のSVG: サブカラーの地 + 1pxの枠 + 2px四方のセルで5x5模様（整数ピクセルでにじまない）
function faviconSvg(mainHex, subHex = '#000000', alpha = 0.5) {
    const main = parseHex(mainHex);
    const sub = parseHex(subHex);
    const grid = faviconPattern(main, sub, alpha);
    let cells = '';
    grid.forEach((row, r) => row.forEach((v, c) => {
        if (v === 0) return;
        const opacity = v === 1 ? ' fill-opacity=".4"' : '';
        cells += `<rect x="${3 + c * 2}" y="${3 + r * 2}" width="2" height="2" fill="${mainHex}"${opacity}/>`;
    }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
        `<rect width="16" height="16" fill="${backgroundColor(sub, alpha)}"/>` +
        `<rect x=".5" y=".5" width="15" height="15" fill="none" stroke="${mainHex}" stroke-width="1"/>` +
        cells + `</svg>`;
}

// ---------- ページへの適用 ----------
if (typeof document !== 'undefined') {
    (() => {
        const picker = document.getElementById('color-picker');
        const subPicker = document.getElementById('sub-color-picker');
        const subAlpha = document.getElementById('sub-alpha');
        if (!picker) return;

        // hrefを書き換えるだけだと反映されないことがあるので、linkごと作り直す
        function applyFavicon() {
            const link = document.createElement('link');
            link.id = 'favicon';
            link.rel = 'icon';
            link.type = 'image/svg+xml';
            const svg = faviconSvg(picker.value, subPicker?.value, subAlpha ? Number(subAlpha.value) : 0.5);
            link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
            document.getElementById('favicon')?.remove();
            document.head.appendChild(link);
        }

        applyFavicon();

        // ピッカーをドラッグ中は連続で発火するので、少し間引く
        let timer;
        [picker, subPicker, subAlpha].forEach(el => el?.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(applyFavicon, 60);
        }));
    })();
}

// 動作確認(Node)用
if (typeof module !== 'undefined') module.exports = { faviconPattern, faviconSvg, saturationLightness };
