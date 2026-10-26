// 秒数を「2時間15分」「45分」の形にする
function formatDuration(sec) {
    const totalMin = Math.round(sec / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

// 充電中は満充電まで、放電中は残り時間（不明なときは Infinity が返る）
function describeBatteryTime(battery) {
    if (battery.charging) {
        if (battery.level >= 1 || battery.chargingTime === 0) return "満充電";
        return Number.isFinite(battery.chargingTime)
            ? `満充電まで${formatDuration(battery.chargingTime)}`
            : "計算中...";
    }
    return Number.isFinite(battery.dischargingTime)
        ? `残り${formatDuration(battery.dischargingTime)}`
        : "計算中...";
}

async function updateBatteryInfo() {
    // Battery APIがサポートされているか確認
    if (!navigator.getBattery) {
        document.getElementById('level').innerText = "非対応";
        document.getElementById('status').innerText = "お使いのブラウザはBattery APIをサポートしていません。";
        return;
    }

    // バッテリーオブジェクトを取得
    const battery = await navigator.getBattery();

    function displayInfo() {
        // 可読性と再利用性を高める書き方の例
        const levelPercent = Math.round(battery.level * 100);
        const indicator = document.getElementById('battery-indicator');

        // 文字列として%を付与
        const percentStr = `${levelPercent}%`;

        document.getElementById('level').innerText = percentStr;
        indicator.style.background = `linear-gradient(to right, var(--main-color) ${percentStr}, transparent ${percentStr})`;

        // 充電中かどうかの判定
        const chargingStatus = battery.charging ? "充電中" : "放電中";
        document.getElementById('status').innerText = chargingStatus;

        // 残り時間
        document.getElementById('battery-time').innerText = describeBatteryTime(battery);
    }

    // 初期表示
    displayInfo();

    // 状態が変化した時のイベントリスナー
    battery.addEventListener('levelchange', displayInfo); // 残量変化
    battery.addEventListener('chargingchange', displayInfo); // 充電器の接続・切断
    battery.addEventListener('dischargingtimechange', displayInfo); // 残り時間の変化
    battery.addEventListener('chargingtimechange', displayInfo); // 満充電までの時間の変化
}

updateBatteryInfo();