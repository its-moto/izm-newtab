// indexDBを使用した背景(動画・画像)記憶+描画システム

const canvas = document.getElementById('background');
const ctx = canvas.getContext('2d');
const video = document.getElementById('bg-video');
const selector = document.getElementById('video-selector');

const DB_NAME = "MyDesktopDB";
const STORE_NAME = "assets";
const MEDIA_KEY = "bgMedia";
const LEGACY_KEY = "bgVideo"; // 旧バージョンの保存キー（互換用）
let db;

let currentFadeCount = 0;
let imageLayer = null; // 背景が画像のとき、cover済みの描画結果を保持

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
    loadStoredBackground();
};

// 背景ファイルが選択された時の処理
selector.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(file, MEDIA_KEY);
    store.delete(LEGACY_KEY);
    store.delete("lastTime"); // 別の背景になるので再生位置はリセット
    video.currentPlayTime = 0; // 動画の再生位置もリセット

    transaction.oncomplete = () => location.reload(); // 保存したら再読み込みして適用
});

// 背景を削除
document.getElementById('bg-delete-btn').addEventListener('click', () => {
    if (!db || !confirm('背景を削除しますか？')) return;

    video.pause(); // 再読み込み前に再生位置が保存し直されないようにする

    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(MEDIA_KEY);
    store.delete(LEGACY_KEY);
    store.delete("lastTime");

    transaction.oncomplete = () => location.reload();
});

function fadeInPage() {
    document.body.style.animation = "fadeIn 0.8s ease-in-out forwards";
}

video.oncanplay = fadeInPage;

// 画面いっぱいに「cover」で描画（はみ出しは中央で切り抜き）
function drawCover(targetCtx, source, sw, sh) {
    const tw = targetCtx.canvas.width;
    const th = targetCtx.canvas.height;
    const scale = Math.max(tw / sw, th / sh);
    const w = sw * scale;
    const h = sh * scale;
    targetCtx.drawImage(source, (tw - w) / 2, (th - h) / 2, w, h);
}

async function loadStoredBackground() {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const mediaBlob = (await getValue(store, MEDIA_KEY)) || (await getValue(store, LEGACY_KEY));
    const lastTime = (await getValue(store, "lastTime")) || 0;

    if (!mediaBlob) return;

    if (mediaBlob.type.startsWith('image/')) {
        loadImageBackground(mediaBlob);
    } else {
        video.src = URL.createObjectURL(mediaBlob);
        video.currentTime = lastTime;
        volumeBox.hidden = false; // 動画のときだけ音量を出す
        applyVolume();
        startVideo();
        requestAnimationFrame(draw);
    }
}

function loadImageBackground(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        // 一度だけ1920x1080にcoverで描いておき、毎フレームはそれをコピーするだけにする
        imageLayer = document.createElement('canvas');
        imageLayer.width = canvas.width;
        imageLayer.height = canvas.height;
        drawCover(imageLayer.getContext('2d'), img, img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(url);
        fadeInPage();
        requestAnimationFrame(draw);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
}

// 描画
function draw() {
    // 1. カウントアップ（100まで）
    if (currentFadeCount < 100) {
        currentFadeCount++;
    }

    // 2. 背景を描画
    if (imageLayer) {
        ctx.drawImage(imageLayer, 0, 0);
    } else if (video.readyState >= 2 && video.videoWidth) {
        drawCover(ctx, video, video.videoWidth, video.videoHeight);
    }

    // 3. フェードイン（徐々に透明にする黒い四角）
    const opacity = 1 - (currentFadeCount / 100);

    if (opacity > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 4. 全体のオーバーレイ（背景の不透明度スライダー）
    ctx.fillStyle = `rgba(0, 0, 0, ${sliderValue})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    requestAnimationFrame(draw);
}

// 値を保持するための変数
let sliderValue = 0.5;

const slider = document.getElementById('bg-opacity');
const display = document.getElementById('valDisplay');

// スライダーの塗りつぶし位置（CSS の --val）
function paintSlider(el = slider) {
    el.style.setProperty('--val', `${el.value * 100}%`);
}

// 前回の値を復元
const OPACITY_KEY = 'bg-opacity';
const savedOpacity = Number(localStorage.getItem(OPACITY_KEY));
if (localStorage.getItem(OPACITY_KEY) !== null && savedOpacity >= 0 && savedOpacity <= 1) {
    sliderValue = savedOpacity;
    slider.value = savedOpacity;
    display.textContent = savedOpacity;
}

// 入力イベントを監視
slider.addEventListener('input', (e) => {
    sliderValue = Number(e.target.value);
    display.textContent = sliderValue;
    localStorage.setItem(OPACITY_KEY, sliderValue);
    paintSlider();
});
paintSlider();

// ---------- 動画の音量 ----------
const volumeBox = document.getElementById('bg-volume');
const volumeSlider = document.getElementById('bg-volume-slider');
const muteBtn = document.getElementById('bg-mute-btn');
const VOLUME_KEY = 'bg-volume';

// 音量は覚えておくが、開いたときは毎回ミュートから始める
const savedVolume = Number(localStorage.getItem(VOLUME_KEY));
let bgVolume = localStorage.getItem(VOLUME_KEY) !== null && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.5;
let bgMuted = true;

function applyVolume() {
    video.volume = bgVolume;
    video.muted = bgMuted;
    volumeSlider.value = bgVolume;
    volumeSlider.title = `音量 ${Math.round(bgVolume * 100)}%${bgMuted ? '（ミュート中）' : ''}`;
    volumeBox.classList.toggle('muted', bgMuted);
    paintSlider(volumeSlider);
}

function saveVolume() {
    localStorage.setItem(VOLUME_KEY, bgVolume);
    applyVolume();
}

// 音ありの自動再生はブラウザに止められることがあるので、そのときはミュートで再生して最初の操作で音を戻す
function startVideo() {
    video.play().catch(() => {
        const resume = () => {
            applyVolume();
            video.play().catch(() => {});
        };
        if (!video.muted) {
            video.muted = true;
            video.play().catch(() => {});
            window.addEventListener('pointerdown', resume, { once: true });
            window.addEventListener('keydown', resume, { once: true });
        } else {
            window.addEventListener('click', resume, { once: true });
        }
    });
}

function toggleMute() {
    bgMuted = !bgMuted;
    if (!bgMuted && bgVolume === 0) bgVolume = 0.5; // 音量0のままミュート解除しても聞こえないので戻す
    saveVolume();
    if (!bgMuted && video.src && video.paused) video.play().catch(console.error);
}

// スライダーを動かしたら音ありにする（0まで下げたらミュート）
volumeSlider.addEventListener('input', () => {
    bgVolume = Number(volumeSlider.value);
    bgMuted = bgVolume === 0;
    saveVolume();
});
muteBtn.addEventListener('click', toggleMute);
applyVolume();

const saveCurrentTime = () => {
    // 動画のときだけ再生位置を保存
    if (db && video.src && !video.paused) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(video.currentTime, "lastTime");
    }
};

// 1. 定期実行（バックアップ）
setInterval(saveCurrentTime, 5000);

// 2. ページを離れる瞬間に保存
window.addEventListener('beforeunload', saveCurrentTime);

// 3. ブラウザのタブが非表示になった時
document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveCurrentTime();
});

function getValue(store, key) {
    return new Promise(resolve => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
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
// Ctrl + Alt + Shift + M でミュート切替（動画のときのみ意味あり）
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyM') {
        toggleMute();
    }
});