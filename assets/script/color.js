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