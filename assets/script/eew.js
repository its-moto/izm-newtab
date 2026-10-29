// =====================================
// 地震情報（過去の一覧: 気象庁 / 緊急地震速報: Wolfx JMA EEW API）
// =====================================

const JMA_DATA_URL = 'https://www.jma.go.jp/bosai/quake/data/';
const EEW_WS_URL = 'wss://ws-api.wolfx.jp/jma_eew';
const EEW_LATEST_URL = 'https://api.wolfx.jp/jma_eew.json';
const EEW_FILTER_KEY = 'eew-min-intensity';
const EEW_DISPLAY_MAX = 10;
// 緊急地震速報は発表からこの分数のあいだ一覧の一番上に強調表示する
const EEW_ACTIVE_MIN = 3;
const EEW_RECONNECT_MS = 5000;
const JMA_REFRESH_MS = 60000;
const INTENSITY_RANK = ['0', '1', '2', '3', '4', '5弱', '5強', '6弱', '6強', '7'];

const eewBox = document.getElementById('eew-box');
const eewListEl = document.getElementById('eew-list');
const eewFilterEl = document.getElementById('eew-filter');

let quakes = [];       // 気象庁の地震情報（地震ごとにまとめたもの、新しい順）
let latestEew = null;  // 最後に受信した緊急地震速報
const originTimes = new Map(); // 詳細JSONのファイル名 → 発生時刻（ファイルは更新されないので使い回す）

// ---------- 整形 ----------
// "2026/10/29 08:15:01"（日本時間）→ ミリ秒
function parseJst(str) {
  return new Date(str.replace(/\//g, '-').replace(' ', 'T') + '+09:00').getTime();
}

// "5-" "5+" 形式が来ても「5弱」「5強」で表示する
function formatIntensity(str) {
  if (!str) return '不明';
  return String(str).replace('-', '弱').replace('+', '強');
}

// 震度を 0〜9 の段階に変換（不明は -1）
function intensityRank(str) {
  return INTENSITY_RANK.indexOf(formatIntensity(str));
}

function formatEewTime(ms, withSeconds = false) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  const sec = withSeconds ? `:${pad(d.getSeconds())}` : '';
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}${sec}`;
}

// 気象庁の座標 "+43.1+144.5-120000/" の末尾（メートル）から深さを取り出す
function formatDepth(cod) {
  const m = /^[+-][\d.]+[+-][\d.]+([+-]\d+)\/?$/.exec(cod || '');
  if (!m) return '不明';
  const km = Math.abs(Number(m[1])) / 1000;
  return km === 0 ? 'ごく浅い' : `${km}km`;
}

function isEewActive(eew) {
  return eew && Date.now() - parseJst(eew.AnnouncedTime) < EEW_ACTIVE_MIN * 60000;
}

// ---------- 気象庁の地震情報 ----------
// 1つの地震に「震度速報」「震源に関する情報」「震源・震度情報」などが別々に並ぶので、
// 地震ID（eid）ごとに新しい情報を優先してまとめる
function groupJmaList(list) {
  const byId = new Map();
  list.forEach(e => {
    if (!e.eid || !e.at || !(e.anm || e.maxi)) return;
    const q = byId.get(e.eid) || { eid: e.eid, time: Date.parse(e.at) };
    // 震源の載っている情報の詳細JSONから発生時刻を取る（一覧の at は検知時刻）
    if (!q.place && e.anm) q.json = e.json;
    q.place ||= e.anm;
    q.maxi ||= e.maxi;
    q.mag ||= e.mag;
    q.cod ||= e.cod;
    byId.set(e.eid, q);
  });
  return [...byId.values()].sort((a, b) => b.time - a.time);
}

async function loadJmaList() {
  try {
    const res = await fetch(JMA_DATA_URL + 'list.json', { cache: 'no-store' });
    if (!res.ok) return;
    quakes = groupJmaList(await res.json());
    renderEew();
    await loadOriginTimes(quakes.slice(0, EEW_DISPLAY_MAX * 3));
    renderEew();
  } catch (e) {
    console.error('JMA quake list load error:', e);
  }
}

// 気象庁の発生時刻は分単位まで（秒は出ない）
async function loadOriginTimes(list) {
  await Promise.all(list.map(async q => {
    if (!q.json || originTimes.has(q.json)) return;
    try {
      const res = await fetch(JMA_DATA_URL + q.json);
      if (!res.ok) return;
      const origin = (await res.json()).Body?.Earthquake?.OriginTime;
      if (origin) originTimes.set(q.json, Date.parse(origin));
    } catch {
      // 取れなければ一覧の時刻のまま
    }
  }));
}

// ---------- 表示 ----------
// time は区切り線の中に出す。rows: [ラベル, 値] の配列（2列ずつ並ぶ）。title があれば区切り線の下に1行で出す
function appendEewItem(time, title, rows, className) {
  const item = document.createElement('div');
  item.className = `eew-item ${className}`;
  const sep = document.createElement('div');
  sep.className = 'eew-sep';
  sep.textContent = time;
  item.appendChild(sep);
  if (title) {
    const t = document.createElement('div');
    t.className = 'eew-title';
    t.textContent = title;
    item.appendChild(t);
  }
  rows.forEach(([label, value]) => {
    const l = document.createElement('span');
    l.className = 'eew-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = `：${value}`;
    item.append(l, v);
  });
  eewListEl.appendChild(item);
}

function renderEew() {
  const minRank = Number(eewFilterEl.value);
  const passes = maxi => minRank === 0 || intensityRank(maxi) >= minRank;

  const eew = isEewActive(latestEew) && passes(latestEew.MaxIntensity) ? latestEew : null;
  const list = quakes
    .filter(q => passes(q.maxi) && !(eew && q.eid === eew.EventID))
    .slice(0, EEW_DISPLAY_MAX - (eew ? 1 : 0));

  eewBox.classList.toggle('active', !!eew && !eew.isCancel);
  eewBox.classList.toggle('warn', !!eew && eew.isWarn && !eew.isCancel);

  eewListEl.replaceChildren();

  if (eew) {
    const kind = eew.isCancel ? '取消' : eew.isWarn ? '警報' : '予報';
    const serial = eew.isFinal ? '最終報' : `第${eew.Serial}報`;
    const tags = [eew.isTraining && '訓練', eew.isAssumption && '仮定震源'].filter(Boolean);
    appendEewItem(`${formatEewTime(parseJst(eew.OriginTime), true)} 発生`,
      `緊急地震速報（${kind}） ${serial}${tags.length ? ` ${tags.join('・')}` : ''}`, [
        ['場所', eew.Hypocenter],
        ['震度', `${formatIntensity(eew.MaxIntensity)}（予測）`],
        ['M', eew.Magnitude ?? eew.Magunitude],
        ['深さ', `${eew.Depth}km`],
      ], 'current');
  }

  list.forEach(q => {
    const origin = originTimes.get(q.json);
    appendEewItem(`${formatEewTime(origin ?? q.time)} ${origin ? '発生' : '検知'}`, null, [
      ['場所', q.place || '調査中'],
      ['震度', formatIntensity(q.maxi)],
      ['M', q.mag || '不明'],
      ['深さ', formatDepth(q.cod)],
    ], '');
  });

  if (!eew && list.length === 0) {
    eewListEl.textContent = quakes.length === 0 ? '取得中...' : '該当する地震はありません';
  }
}

// ---------- 緊急地震速報の受信 ----------
function handleEew(data) {
  if (!data || !data.EventID || !data.AnnouncedTime) return;
  latestEew = data;
  renderEew();
}

async function loadLatestEew() {
  try {
    const res = await fetch(EEW_LATEST_URL, { cache: 'no-store' });
    if (res.ok) handleEew(await res.json());
  } catch (e) {
    console.error('EEW load error:', e);
  }
}

function connectEew() {
  const ws = new WebSocket(EEW_WS_URL);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'jma_eew') handleEew(data);
    } catch {
      // ハートビート等は無視
    }
  };

  ws.onclose = () => setTimeout(connectEew, EEW_RECONNECT_MS);
}

// ---------- 起動時の処理 ----------
eewFilterEl.value = localStorage.getItem(EEW_FILTER_KEY) || '0';
eewFilterEl.addEventListener('change', () => {
  localStorage.setItem(EEW_FILTER_KEY, eewFilterEl.value);
  renderEew();
});

renderEew();
loadJmaList();
loadLatestEew();
connectEew();
setInterval(loadJmaList, JMA_REFRESH_MS);
setInterval(renderEew, 10000); // 速報の強調表示→通常表示への切り替え
