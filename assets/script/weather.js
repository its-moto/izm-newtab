/**
 * 設定：高知工科大学（香美キャンパス）付近の座標
 * 場所を変える場合は緯度経度を書き換えてください
 */
const WEATHER_CONFIG = {
    LAT: 33.604,
    LON: 133.686,
    CITY_NAME: "現在地", // 都市名（任意）
    INTERVAL: "hourly" // "hourly" で1時間ごと取得
};

// Open-MeteoのURL（1時間ごとの天気・気温・降水確率をリクエスト）
const API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_CONFIG.LAT}&longitude=${WEATHER_CONFIG.LON}&hourly=temperature_2m,precipitation_probability,weathercode&timezone=Asia%2FTokyo`;

// 天気コードをアイコンと文字に変換（WMO準拠）
function getWeatherInfo(code) {
    const table = {
        0:  { icon: "☀️", desc: "快晴" },
        1:  { icon: "🌤️", desc: "晴れ" },
        2:  { icon: "⛅", desc: "時々曇り" },
        3:  { icon: "☁️", desc: "曇り" },
        45: { icon: "🌫️", desc: "霧" },
        51: { icon: "🌦️", desc: "小雨" },
        61: { icon: "☔", desc: "雨" },
        71: { icon: "❄️", desc: "雪" },
        80: { icon: "🌦️", desc: "にわか雨" },
        95: { icon: "⛈️", desc: "雷雨" }
    };
    return table[code] || { icon: "🌡️", desc: "不明" };
}

async function updateWeather() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        const hourly = data.hourly;

        // 現在の時刻に一番近いインデックスを探す
        const now = new Date();
        const currentHourIndex = hourly.time.findIndex(t => new Date(t) > now) - 1;
        const idx = currentHourIndex < 0 ? 0 : currentHourIndex;

        // --- 現在の天気を表示 ---
        const currentInfo = getWeatherInfo(hourly.weathercode[idx]);
        document.getElementById('city-name').textContent = WEATHER_CONFIG.CITY_NAME;
        document.getElementById('main-icon').textContent = currentInfo.icon;
        document.getElementById('main-temp').textContent = Math.round(hourly.temperature_2m[idx]);
        document.getElementById('main-desc').textContent = currentInfo.desc;

        // --- 3時間ごとの予報を表示 (24時間分) ---
        const list = document.getElementById('forecast-list');
        list.innerHTML = '';

        for (let i = idx; i < idx + 24; i += 2) { // 2時間おきにループ
            if (!hourly.time[i]) break;
            
            const date = new Date(hourly.time[i]);
            const hour = date.getHours() + "時";
            const info = getWeatherInfo(hourly.weathercode[i]);
            const temp = Math.round(hourly.temperature_2m[i]);
            const pop = hourly.precipitation_probability[i];

            const item = document.createElement('div');
            item.className = 'hour-item'; // CSSでスタイル調整してください
            item.style.textAlign = 'center';
            item.style.minWidth = '60px';
            item.innerHTML = `
                <div style="font-size: 12px; color: #888;">${hour}</div>
                <div style="font-size: 20px; margin: 4px 0;">${info.icon}</div>
                <div style="font-weight: bold;">${temp}°</div>
                <div style="font-size: 10px; color: inherit;">${pop}%</div>
            `;
            list.appendChild(item);
        }

    } catch (e) {
        console.error("Weather load error:", e);
        document.getElementById('main-desc').textContent = "取得エラー";
    }
}

// 実行
updateWeather();