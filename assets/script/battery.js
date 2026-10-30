// =====================================
// バッテリー表示
// 残り時間は Battery API の値を使い、出ない（Infinity の）ときは残量の減り方から自分で推定する
// =====================================

const BATTERY_SAMPLES_KEY = 'battery-samples';
const BATTERY_SEEN_KEY = 'battery-seen';   // 一度でもバッテリーで動いている様子を見たか
const BATTERY_LOW = 0.2;              // これ以下で警告表示
const ESTIMATE_WINDOW_MS = 60 * 60000; // 推定に使う期間（直近1時間）
const ESTIMATE_MIN_DROP = 0.02;       // 推定に必要な残量の変化（2%）

// 秒数を「2時間15分」「45分」の形にする
function formatDuration(sec) {
    const totalMin = Math.round(sec / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

// ---------- 自前の推定 ----------
// 新しいタブは開いている時間が短いので、残量の記録は localStorage に残してタブをまたいで使う
function loadSamples() {
    try {
        const data = JSON.parse(localStorage.getItem(BATTERY_SAMPLES_KEY));
        return data && Array.isArray(data.points) ? data : null;
    } catch {
        return null;
    }
}

function recordSample(battery) {
    let data = loadSamples();
    // 充電⇔放電が切り替わったら記録をやり直す
    if (!data || data.charging !== battery.charging) data = { charging: battery.charging, points: [] };

    const now = Date.now();
    const last = data.points[data.points.length - 1];
    if (!last || last.level !== battery.level) data.points.push({ time: now, level: battery.level });
    data.points = data.points.filter(p => now - p.time < ESTIMATE_WINDOW_MS);
    localStorage.setItem(BATTERY_SAMPLES_KEY, JSON.stringify(data));
    return data;
}

// 直近1時間の残量の変化から、満充電まで／空になるまでの秒数を出す（足りなければ null）
function estimateSeconds(battery, data) {
    const first = data.points[0];
    if (!first) return null;
    const change = Math.abs(battery.level - first.level);
    const elapsed = (Date.now() - first.time) / 1000;
    if (change < ESTIMATE_MIN_DROP || elapsed <= 0) return null;
    const perSec = change / elapsed;
    return battery.charging ? (1 - battery.level) / perSec : battery.level / perSec;
}

// 充電中は満充電まで、放電中は残り時間
function describeBatteryTime(battery, data) {
    if (battery.charging && (battery.level >= 1 || battery.chargingTime === 0)) return "満充電";

    const apiSec = battery.charging ? battery.chargingTime : battery.dischargingTime;
    const prefix = battery.charging ? "満充電まで" : "残り";
    if (Number.isFinite(apiSec)) return `${prefix}${formatDuration(apiSec)}`;
    
    const est = estimateSeconds(battery, data);
    if (est !== null) return `${prefix}約${formatDuration(est)}`;
    return battery.charging ? "充電速度を計測中..." : "減り方を計測中...";
}

// ---------- バッテリーのない PC ----------
// デスクトップ PC でも Battery API は「100%・充電中・満充電まで0秒」を返すので、それで見分ける
// ノート PC が満充電でつながっているときも同じ値になるため、一度でも減ったり放電したりしたのを見たら以後はバッテリーありとして扱う
function looksLikeNoBattery(battery) {
    const seen = localStorage.getItem(BATTERY_SEEN_KEY) === '1';
    const full = battery.charging && battery.level >= 1 && battery.chargingTime === 0 &&
        !Number.isFinite(battery.dischargingTime);
    if (!full && !seen) localStorage.setItem(BATTERY_SEEN_KEY, '1');
    return full && !seen;
}

// ---------- 表示 ----------
async function updateBatteryInfo() {
    // Battery APIがサポートされているか確認
    if (!navigator.getBattery) {
        document.getElementById('level').innerText = "非対応";
        document.getElementById('status').innerText = "お使いのブラウザはBattery APIをサポートしていません。";
        return;
    }

    // バッテリーオブジェクトを取得
    const battery = await navigator.getBattery();
    const box = document.getElementById('battery-box');
    const fill = document.getElementById('battery-fill');

    function displayInfo() {
        const noBattery = looksLikeNoBattery(battery);
        box.classList.toggle('ac', noBattery);
        if (noBattery) {
            box.classList.remove('charging', 'low');
            document.getElementById('level').innerText = 'AC電源';
            document.getElementById('status').innerText = 'バッテリーなし';
            document.getElementById('battery-time').innerText = 'コンセントから給電中';
            return;
        }

        const levelPercent = Math.round(battery.level * 100);
        document.getElementById('level').innerText = `${levelPercent}%`;
        fill.style.width = `${levelPercent}%`;

        // 充電中は光が流れる・残り少ないと赤く点滅（CSS側でアニメーション）
        box.classList.toggle('charging', battery.charging);
        box.classList.toggle('low', !battery.charging && battery.level <= BATTERY_LOW);

        document.getElementById('status').innerText = battery.charging ? "充電中" : "放電中";

        const data = recordSample(battery);
        document.getElementById('battery-time').innerText = describeBatteryTime(battery, data);
    }

    // 初期表示（0%から伸びるアニメーションを見せるため1フレーム待つ）
    requestAnimationFrame(displayInfo);

    // 状態が変化した時のイベントリスナー
    battery.addEventListener('levelchange', displayInfo); // 残量変化
    battery.addEventListener('chargingchange', displayInfo); // 充電器の接続・切断
    battery.addEventListener('dischargingtimechange', displayInfo); // 残り時間の変化
    battery.addEventListener('chargingtimechange', displayInfo); // 満充電までの時間の変化
    setInterval(displayInfo, 60000); // 推定の残り時間を更新
}

updateBatteryInfo();
