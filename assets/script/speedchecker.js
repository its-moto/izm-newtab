// =====================================
// 回線速度チェッカー（結果を記憶・手動再計測・履歴グラフ）
// =====================================

const SPEED_STORAGE_KEY = 'speed-history';
const HISTORY_MAX = 10;
// 保存済みの結果がこの分数より古ければ、タブを開いたときに自動で再計測する。
// 0 なら自動計測しない（結果が1件も無い初回だけ自動計測）
const AUTO_MEASURE_AFTER_MIN = 0;

let isTestRunning = false;

const numEl = document.getElementById('speed-num');
const unitEl = document.getElementById('speed-unit');
const metaEl = document.getElementById('speed-meta');
const chartEl = document.getElementById('speed-chart');
const statsEl = document.getElementById('speed-stats');
const statusEl = document.getElementById('speed-display'); // 計測中の進捗表示
const runBtn = document.getElementById('speed-run-btn');
const clearBtn = document.getElementById('speed-clear-btn');

// ---------- 履歴の保存・読み込み ----------
function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(SPEED_STORAGE_KEY));
    if (!Array.isArray(data)) return [];
    return data
      .filter(e => e && Number.isFinite(e.mbps) && Number.isFinite(e.time))
      .slice(-HISTORY_MAX);
  } catch {
    return [];
  }
}

function pushHistory(entry) {
  const history = loadHistory();
  history.push(entry);
  localStorage.setItem(SPEED_STORAGE_KEY, JSON.stringify(history.slice(-HISTORY_MAX)));
}

function clearHistory() {
  if (!confirm('回線速度の記録をすべて消去しますか？')) return;
  localStorage.removeItem(SPEED_STORAGE_KEY);
  renderSpeed();
}

// ---------- 表示 ----------
function formatSpeed(mbps) {
  if (mbps < 0.7) return { num: (mbps * 1000).toFixed(2), unit: 'kbps' };
  return { num: mbps.toFixed(2), unit: 'Mbps' };
}

function formatAgo(ms) {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  return `${Math.floor(hour / 24)}日前`;
}

function formatDateTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function renderSpeed() {
  const history = loadHistory();
  chartEl.replaceChildren();

  if (history.length === 0) {
    numEl.textContent = '--';
    unitEl.textContent = '';
    metaEl.textContent = '未計測';
    statsEl.textContent = '';
    return;
  }

  const last = history[history.length - 1];
  const { num, unit } = formatSpeed(last.mbps);
  numEl.textContent = num;
  unitEl.textContent = unit;
  metaEl.textContent = `${formatDateTime(last.time)}（${formatAgo(last.time)}）`;

  // 履歴の棒グラフ（最大値を100%として高さを決める）
  const max = Math.max(...history.map(e => e.mbps));
  history.forEach(e => {
    const bar = document.createElement('div');
    bar.className = 'speed-bar';
    bar.style.height = `${Math.max(4, (e.mbps / max) * 100)}%`;
    const f = formatSpeed(e.mbps);
    bar.title = `${formatDateTime(e.time)}  ${f.num} ${f.unit}`;
    chartEl.appendChild(bar);
  });

  const avg = history.reduce((sum, e) => sum + e.mbps, 0) / history.length;
  const a = formatSpeed(avg);
  statsEl.textContent = `直近${history.length}回の平均 ${a.num} ${a.unit}`;
}

function setRunning(running) {
  runBtn.disabled = running;
  clearBtn.disabled = running;
  runBtn.textContent = running ? '計測中...' : '↻ 再計測';
}

/**
 * 高精度な回線速度測定（メイン処理）
 */
async function measureSpeedPrecise() {
  if (isTestRunning) return;
  isTestRunning = true;
  setRunning(true);

  const display = statusEl;
  const TIMEOUT_MS = 60000;

  try {
    // =====================================
    // ステージ1: 1MBのデータで標準テスト
    // =====================================
    const SIZE_1MB = 1048576;
    let result = await runTestSuite(SIZE_1MB, 1, 5, TIMEOUT_MS, display);

    // =====================================
    // ステージ2: 100Mbps超えなら大容量データで再テスト
    // =====================================
    if (result.average > 100) {
      display.innerText = "高速回線を検知。高精度計測に移行中...";
      await sleep(1000); // サーバーと回線を少し休ませる

      // 50MBのデータで再計測（データが大きいため回数は3回に減らす）
      const SIZE_50MB = 52428800;
      const highSpeedResult = await runTestSuite(SIZE_50MB, 0, 3, TIMEOUT_MS, display);

      // 再計測に成功したら結果を上書き
      if (highSpeedResult) {
        result = highSpeedResult;
      }
    }

    // =====================================
    // ステップ3: 結果を保存して表示
    // =====================================
    pushHistory({ mbps: result.average, median: result.median, time: Date.now() });
    display.innerText = '';
    renderSpeed();

    console.log('=== 回線速度計測結果（詳細） ===');
    console.log(`平均値: ${result.average.toFixed(2)} Mbps`);
    console.log(`中央値: ${result.median.toFixed(2)} Mbps`);
    console.log(`範囲: ${result.min} - ${result.max} Mbps`);
    console.log(`全測定値:`, result.results.map(r => r.toFixed(2)));

  } catch (e) {
    console.error("Speed test error:", e);
    display.innerText = "エラー：計測失敗";
  } finally {
    isTestRunning = false;
    setRunning(false);
  }
}

/**
 * 指定したデータサイズ・回数でテストスイートを実行する
 */
async function runTestSuite(bytes, warmupRuns, actualRuns, timeoutMs, display) {
  const testUrl = `https://speed.cloudflare.com/__down?bytes=${bytes}`;
  const mbText = (bytes / 1048576).toFixed(0);

  // ウォームアップ測定
  if (warmupRuns > 0) {
    display.innerText = `ウォームアップ中 (${mbText}MB)...`;
    for (let i = 0; i < warmupRuns; i++) {
      await performSpeedTest(testUrl, timeoutMs, true);
    }
  }

  const results = [];
  // 本測定
  for (let i = 1; i <= actualRuns; i++) {
    display.innerText = `計測中 (${mbText}MB) ... (${i}/${actualRuns})`;

    const speedMbps = await performSpeedTest(testUrl, timeoutMs, false);
    if (speedMbps !== null) {
      results.push(speedMbps);
    }

    if (i < actualRuns) {
      await sleep(500);
    }
  }

  if (results.length === 0) {
    throw new Error("すべての計測がタイムアウトまたは失敗しました");
  }

  // 統計処理
  results.sort((a, b) => a - b);
  const median = results[Math.floor(results.length / 2)];
  const average = (results.reduce((a, b) => a + b, 0) / results.length);
  const min = results[0].toFixed(2);
  const max = results[results.length - 1].toFixed(2);

  return { average, median, min, max, results };
}

/**
 * 単一の速度テスト実行
 */
async function performSpeedTest(testUrl, timeoutMs, isWarmup) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startTime = performance.now();

    const response = await fetch(testUrl, {
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const reader = response.body.getReader();
    let loadedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        loadedBytes += value.byteLength;
      }
    } finally {
      reader.cancel();
    }

    const endTime = performance.now();
    clearTimeout(timeoutId);

    const durationSeconds = (endTime - startTime) / 1000;
    const bitsLoaded = loadedBytes * 8;
    const speedMbps = (bitsLoaded / durationSeconds / 1_000_000);

    if (!isWarmup) {
      console.log(`測定: ${speedMbps.toFixed(2)} Mbps (${loadedBytes} bytes in ${durationSeconds.toFixed(3)}s)`);
    }

    return speedMbps;

  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('Timeout: 計測時間超過');
    } else {
      console.error('Test error:', e.message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- 起動時の処理 ----------
runBtn.addEventListener('click', measureSpeedPrecise);
clearBtn.addEventListener('click', clearHistory);

renderSpeed();
setInterval(() => { if (!isTestRunning) renderSpeed(); }, 30000); // 「○分前」を更新

const lastEntry = loadHistory().slice(-1)[0];
const isStale = lastEntry && AUTO_MEASURE_AFTER_MIN > 0 &&
  Date.now() - lastEntry.time > AUTO_MEASURE_AFTER_MIN * 60000;

if (!lastEntry || isStale) {
  measureSpeedPrecise(); // 初回（または設定した期間を過ぎたとき）だけ自動計測
}