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
    }

    // 初期表示
    displayInfo();

    // 状態が変化した時のイベントリスナー
    battery.addEventListener('levelchange', displayInfo); // 残量変化
    battery.addEventListener('chargingchange', displayInfo); // 充電器の接続・切断
}

updateBatteryInfo();