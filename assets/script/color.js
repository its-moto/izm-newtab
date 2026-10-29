const colorPicker = document.getElementById('color-picker');
const root = document.documentElement;

// 1. ページ読み込み時に保存された色を適用
const savedColor = localStorage.getItem('theme-color');
if (savedColor) {
    root.style.setProperty('--main-color', savedColor);
    colorPicker.value = savedColor; // ピッカーの色も保存分に合わせる
}

// 2. 色が変更された時の処理
colorPicker.addEventListener('input', (e) => {
    const newColor = e.target.value;

    // CSS変数を更新
    root.style.setProperty('--main-color', newColor);

    // ローカルストレージに保存
    localStorage.setItem('theme-color', newColor);
});

// ---------- サブカラー（パネルの背景色 RGB + 濃さ） ----------
// テーマカラーを暗い色にしたときは、明るいサブカラーにすると読みやすくなる
const subPicker = document.getElementById('sub-color-picker');
const subAlpha = document.getElementById('sub-alpha');
const SUB_COLOR_KEY = 'sub-color';
const SUB_ALPHA_KEY = 'sub-alpha';

function applySubColor() {
    const hex = subPicker.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    root.style.setProperty('--sub-color', `rgba(${r}, ${g}, ${b}, ${subAlpha.value})`);
    subAlpha.style.setProperty('--val', `${subAlpha.value * 100}%`);
    subAlpha.title = `濃さ ${Math.round(subAlpha.value * 100)}%`;
}

const savedSubColor = localStorage.getItem(SUB_COLOR_KEY);
if (/^#[0-9a-f]{6}$/i.test(savedSubColor)) subPicker.value = savedSubColor;
const savedSubAlpha = localStorage.getItem(SUB_ALPHA_KEY);
if (savedSubAlpha !== null && Number(savedSubAlpha) >= 0 && Number(savedSubAlpha) <= 1) subAlpha.value = savedSubAlpha;
applySubColor();

subPicker.addEventListener('input', () => {
    localStorage.setItem(SUB_COLOR_KEY, subPicker.value);
    applySubColor();
});
subAlpha.addEventListener('input', () => {
    localStorage.setItem(SUB_ALPHA_KEY, subAlpha.value);
    applySubColor();
});
