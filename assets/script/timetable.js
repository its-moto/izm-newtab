const days = ["mon", "tue", "wed", "thu", "fri", "sat"];
const periods = 5;
const tbody = document.getElementById('timetable-body');

// 1. テーブルの生成
for (let i = 1; i <= periods; i++) {
    const row = document.createElement('tr');
    
    // 何限目かを表示する列
    const numCell = document.createElement('td');
    numCell.className = 'period-num';
    numCell.textContent = i;
    row.appendChild(numCell);

    // 月〜土のセルを作成
    days.forEach(day => {
        const td = document.createElement('td');
        const idBase = `${day}-${i}`;
        
        td.innerHTML = `
            <div class="cell-content">
                <input type="text" id="sub-${idBase}" class="subject-input" placeholder="...">
                <input type="text" id="room-${idBase}" class="room-input" placeholder="Room">
            </div>
        `;
        row.appendChild(td);
    });
    tbody.appendChild(row);
}

// 2. 保存と読み込みのロジック
const inputs = document.querySelectorAll('.subject-input, .room-input');

// 読み込み
inputs.forEach(input => {
    const savedValue = localStorage.getItem(input.id);
    if (savedValue) input.value = savedValue;

    // 入力するたびに保存
    input.addEventListener('input', () => {
        localStorage.setItem(input.id, input.value);
    });
});

// --- エクスポート機能 ---
document.getElementById('export-btn').addEventListener('click', () => {
    const data = {};
    // localStorageから時間割関連のデータ（sub-とroom-で始まるもの）だけを抽出
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('sub-') || key.startsWith('room-')) {
            data[key] = localStorage.getItem(key);
        }
    }

    // JSONファイルとしてダウンロード
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetable_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

// --- インポート機能 ---
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            
            // 既存のデータを上書き
            Object.keys(data).forEach(key => {
                if (key.startsWith('sub-') || key.startsWith('room-')) {
                    localStorage.setItem(key, data[key]);
                }
            });
            
            alert('時間割をインポートしました！');
            location.reload(); // 画面を更新して反映
        } catch (err) {
            alert('ファイルの形式が正しくありません。');
        }
    };
    reader.readAsText(file);
});