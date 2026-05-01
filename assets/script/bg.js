// indexDBを使用した映像記憶+描画システム

const canvas = document.getElementById('background');
const ctx = canvas.getContext('2d');
const video = document.getElementById('bg-video');
const selector = document.getElementById('video-selector');

const DB_NAME = "MyDesktopDB";
const STORE_NAME = "assets";
let db;

let currentFadeCount = -30;

// Canvas初期設定
canvas.width = 1920;
canvas.height = 1080;

// IndexedDB初期化
const request = indexedDB.open(DB_NAME, 1);
request.onupgradeneeded = (e) => {
    e.target.result.createObjectStore(STORE_NAME);
};

request.onsuccess = (e) => {
    db = e.target.result;
    loadStoredVideo();
};


// 動画ファイルが選択された時の処理
selector.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(file, "bgVideo");

    transaction.oncomplete = () => {
        location.reload(); // 保存したら再読み込みして適用
    };
});

video.oncanplay = () => {
    document.body.style.animation = "fadeIn 0.8s ease-in-out forwards";
};

async function loadStoredVideo() {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const videoBlob = await getValue(store, "bgVideo");
    const lastTime = await getValue(store, "lastTime") || 0;

    if (videoBlob) {
        video.src = URL.createObjectURL(videoBlob);
        video.currentTime = lastTime;
        video.play().catch(() => {
            window.addEventListener('click', () => video.play(), { once: true });
        });
        requestAnimationFrame(draw);
    }
}

// 描画
function draw() {
    // 1. カウントアップ（100まで）
    if (currentFadeCount < 100) {
        currentFadeCount++;
    }

    // 2. ビデオを描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 3. フェードイン（徐々に透明にする黒い四角）
    // 計算結果を ${} で文字列に埋め込む
    const opacity = 1 - (currentFadeCount / 100);
    
    if (opacity > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // 4. 全体のオーバーレイ（もし常に少し暗くしたいなら）
    ctx.fillStyle = `rgba(0, 0, 0, ${sliderValue})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    requestAnimationFrame(draw);
}

// 1. 値を保持するための変数
let sliderValue = 0.5;

const slider = document.getElementById('bg-opacity');
const display = document.getElementById('valDisplay');

// 2. 入力イベントを監視
slider.addEventListener('input', (e) => {
    // 文字列として取得されるため、数値型(Number)に変換して代入
    sliderValue = Number(e.target.value);

    // 3. 画面上の表示も更新（確認用）
    display.textContent = sliderValue;

    // ここで他の関数を呼ぶなど、変数を使った処理を行えます
    console.log("変数の値が更新されました:", sliderValue);
});

const saveCurrentTime = () => {
    if (!video.paused && db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(video.currentTime, "lastTime");
    }
};

// 1. 定期実行（バックアップ）
setInterval(saveCurrentTime, 5000);

// 2. ページを離れる瞬間に保存（記憶にある方法）
window.addEventListener('beforeunload', saveCurrentTime);

// 3. ブラウザのタブが非表示になった時（スマホや別タブ移動時）
document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveCurrentTime();
});

function getValue(store, key) {
    return new Promise(resolve => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
    });
}

// レスポンシブ対応
function resize() {
    const scale = Math.max(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
    canvas.style.width = `${canvas.width * scale}px`;
    canvas.style.height = `${canvas.height * scale}px`;
}
window.addEventListener('resize', resize);
resize();

// --- ショートカットキーの実装 ---
// Ctrl + Alt + Shift + M でミュート切替
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyM') {
        video.muted = !video.muted;
        console.log(video.muted ? "Muted" : "Unmuted");

        // ミュート解除時に再生が止まっていたら動かす（ブラウザ対策）
        if (!video.muted) {
            video.play().catch(console.error);
        }
    }
});