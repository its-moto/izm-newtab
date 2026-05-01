const searchInput = document.getElementById('searchbox');

// 入力欄でキーが押された時の処理
searchInput.addEventListener('keypress', (e) => {
    // Enterキー（keyCode 13）が押されたかチェック
    if (e.key === 'Enter') {
        const query = searchInput.value;
        if (query) {
            // Google検索のURLにクエリを結合して遷移
            // '_blank' を指定すると新しいタブで開きます
            // window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');

            // 現在のタブで開く場合はこちら：
            window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }
    }
});

function updateClock() {
    const now = new Date();

    // 曜日のリストを作成（0が日曜日、6が土曜日）
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"];
    const dayName = dayOfWeek[now.getDay()]; // getDay()で0〜6の数値を取得

    // --- 日付の更新 ---
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    // 最後に (${dayName}) を付け加える
    const dateString = `${year}/${month}/${day}(${dayName})`;
    document.getElementById('date').textContent = dateString;

    // --- 時刻の更新（さっきと同じ） ---
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds}`;
}

setInterval(updateClock, 1000);
updateClock();

