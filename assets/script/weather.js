/**
 * 設定：東京都 付近の座標
 * 場所を変える場合は緯度経度を書き換えてください
 */
let lat = 35.4122; // 緯度
let lon = 139.413; // 経度

navigator.geolocation.getCurrentPosition(
    (position) => {
        lat = position.coords.latitude;
        lon = position.coords.longitude;

        console.log("緯度:", lat);
        console.log("経度:", lon);
        console.log("精度:", position.coords.accuracy, "m");
        initWeather();
    },
    (error) => {
        console.error("位置情報の取得に失敗:", error.message);
        initWeather(); // 位置情報が取得できない場合でも天気を初期化
    },
    {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
    }
);

function initWeather() {
    
    const WEATHER_CONFIG = {
        LAT: lat,
        LON: lon,
        CITY_NAME: "現在地", // 都市名（任意）
        INTERVAL: "hourly" // "hourly" で1時間ごと取得
    };
    // Open-MeteoのURL（1時間ごとの天気・気温・降水確率をリクエスト）
    const API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_CONFIG.LAT}&longitude=${WEATHER_CONFIG.LON}&hourly=temperature_2m,precipitation_probability,weathercode,is_day&timezone=Asia%2FTokyo`;


    // 天気コードをアイコンと文字に変換（WMO の全コード）
    // night: 夜のときのアイコン（晴れ系のみ）
    function getWeatherInfo(code, isDay = 1) {
        const table = {
            0: { icon: "☀️", night: "🌙", desc: "快晴" },
            1: { icon: "🌤️", night: "🌙", desc: "晴れ" },
            2: { icon: "⛅", night: "☁️", desc: "時々曇り" },
            3: { icon: "☁️", desc: "曇り" },
            45: { icon: "🌫️", desc: "霧" },
            48: { icon: "🌫️", desc: "霧（着氷）" },
            51: { icon: "🌦️", desc: "霧雨（弱）" },
            53: { icon: "🌦️", desc: "霧雨" },
            55: { icon: "🌧️", desc: "霧雨（強）" },
            56: { icon: "🌧️", desc: "着氷性の霧雨" },
            57: { icon: "🌧️", desc: "着氷性の霧雨（強）" },
            61: { icon: "🌧️", desc: "小雨" },
            63: { icon: "🌧️", desc: "雨" },
            65: { icon: "🌧️", desc: "大雨" },
            66: { icon: "🌧️", desc: "着氷性の雨" },
            67: { icon: "🌧️", desc: "着氷性の雨（強）" },
            71: { icon: "🌨️", desc: "小雪" },
            73: { icon: "❄️", desc: "雪" },
            75: { icon: "❄️", desc: "大雪" },
            77: { icon: "🌨️", desc: "霧雪" },
            80: { icon: "🌦️", desc: "にわか雨" },
            81: { icon: "🌧️", desc: "にわか雨（強）" },
            82: { icon: "⛈️", desc: "激しいにわか雨" },
            85: { icon: "🌨️", desc: "にわか雪" },
            86: { icon: "❄️", desc: "にわか雪（強）" },
            95: { icon: "⛈️", desc: "雷雨" },
            96: { icon: "⛈️", desc: "雷雨（ひょう）" },
            99: { icon: "⛈️", desc: "雷雨（強いひょう）" },
        };
        const info = table[code];
        if (!info) return { icon: "🌡️", desc: `不明（${code}）` };
        return { icon: !isDay && info.night ? info.night : info.icon, desc: info.desc };
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
            const currentInfo = getWeatherInfo(hourly.weathercode[idx], hourly.is_day?.[idx] ?? 1);
            // 天気の演出（weatherfx.js）に今の天気を知らせる
            window.dispatchEvent(new CustomEvent('weather-now', { detail: { code: hourly.weathercode[idx], isDay: hourly.is_day?.[idx] ?? 1 } }));
            document.getElementById('city-name').textContent = WEATHER_CONFIG.CITY_NAME;
            document.getElementById('main-icon').textContent = currentInfo.icon;
            document.getElementById('main-temp').textContent = Math.round(hourly.temperature_2m[idx]);
            document.getElementById('main-desc').textContent = currentInfo.desc;

            // --- 2時間ごとの予報を表示 (24時間分) ---
            const list = document.getElementById('forecast-list');
            list.innerHTML = '';

            for (let i = idx; i < idx + 24; i += 2) { // 2時間おきにループ
                if (!hourly.time[i]) break;

                const date = new Date(hourly.time[i]);
                const hour = date.getHours() + "時";
                const info = getWeatherInfo(hourly.weathercode[i], hourly.is_day?.[i] ?? 1);
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
            // 読み込めたら、今の天気と予報を順番に出す（boot.js）
            Boot.popIn(document.getElementById('weather-box'), [document.getElementById('main-icon'), ...list.children], 35);

        } catch (e) {
            console.error("Weather load error:", e);
            document.getElementById('main-desc').textContent = "取得エラー";
        }
    }

    updateWeather();
    initWarnings(WEATHER_CONFIG.LAT, WEATHER_CONFIG.LON); // warning.js
}