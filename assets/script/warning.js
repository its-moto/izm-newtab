// =====================================
// 現在地の気象警報・注意報（気象庁）
// weather.js で位置情報を取得したあと initWarnings(lat, lon) が呼ばれる
// =====================================

const GSI_REVERSE_URL = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';
const JMA_AREA_URL = 'https://www.jma.go.jp/bosai/common/const/area.json';
const JMA_WARNING_URL = 'https://www.jma.go.jp/bosai/warning/data/r8/';
const WARNING_REFRESH_MS = 10 * 60000;

// 2026年5月の気象庁の変更後のコード（氾濫警報は未対応）
const WARNING_NAMES = {
  '02': '暴風雪警報', '03': '大雨警報', '04': '洪水警報', '05': '暴風警報',
  '06': '大雪警報', '07': '波浪警報', '08': '高潮警報', '09': '土砂災害警報',
  '10': '大雨注意報', '12': '大雪注意報', '13': '風雪注意報', '14': '雷注意報',
  '15': '強風注意報', '16': '波浪注意報', '17': '融雪注意報', '18': '洪水注意報',
  '19': '高潮注意報', '20': '濃霧注意報', '21': '乾燥注意報', '22': 'なだれ注意報',
  '23': '低温注意報', '24': '霜注意報', '25': '着氷注意報', '26': '着雪注意報',
  '29': '土砂災害注意報',
  '32': '暴風雪特別警報', '33': '大雨特別警報', '35': '暴風特別警報', '36': '大雪特別警報',
  '37': '波浪特別警報', '38': '高潮特別警報', '39': '土砂災害特別警報',
  '43': '大雨危険警報', '48': '高潮危険警報', '49': '土砂災害危険警報',
};

// 重い順（並べ替えと色分けに使う）
const WARNING_LEVELS = [
  { suffix: '特別警報', className: 'special' },
  { suffix: '危険警報', className: 'danger' },
  { suffix: '警報', className: 'warning' },
  { suffix: '注意報', className: 'advisory' },
];

const warningAreaEl = document.getElementById('warning-area');
const warningListEl = document.getElementById('warning-list');

// ---------- 地域コードの特定 ----------
// 国土地理院の市区町村コード（5桁）→ 気象庁の市町村コード（7桁、複数のことがある）
// 政令市の区は気象庁では市単位なので、末尾を0にして市のコードを探す（27127 大阪市北区 → 27100 大阪市）。
// 横浜市のように「北部」「南部」に分かれている市は、区からどちらか分からないので両方を対象にする
function findClass20Codes(area, muniCd) {
  const candidates = [muniCd, muniCd.slice(0, 4) + '0', muniCd.slice(0, 3) + '00'];
  for (const c of candidates) {
    const codes = Object.keys(area.class20s).filter(k => k.startsWith(c));
    if (codes.length > 0) return codes;
  }
  return [];
}

async function resolveWarningArea(lat, lon) {
  const geo = await (await fetch(`${GSI_REVERSE_URL}?lat=${lat}&lon=${lon}`)).json();
  const muniCd = geo.results?.muniCd;
  if (!muniCd) return null;

  const area = await (await fetch(JMA_AREA_URL)).json();
  const class20s = findClass20Codes(area, muniCd.padStart(5, '0'));
  if (class20s.length === 0) return null;

  // 市町村 → class15 → class10 → 府県予報区（office）とたどる
  const class15 = area.class20s[class20s[0]].parent;
  const class10 = area.class15s[class15].parent;
  const office = area.class10s[class10].parent;
  const name = class20s.length === 1
    ? area.class20s[class20s[0]].name
    : area.class20s[class20s[0]].name.replace(/(北部|南部|東部|西部)$/, '');
  return { class20s, office, name };
}

// ---------- 警報・注意報の取得 ----------
async function loadWarnings(target) {
  try {
    const res = await fetch(`${JMA_WARNING_URL}${target.office}.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();

    const codes = new Set();
    data.forEach(d => (d.warning?.class20Items || [])
      .filter(item => target.class20s.includes(item.areaCode))
      .forEach(item => item.kinds.forEach(k => {
        if (k.code && (k.status === '発表' || k.status === '継続')) codes.add(k.code);
      })));

    renderWarnings([...codes].map(code => WARNING_NAMES[code] || `不明な警報(${code})`));
  } catch (e) {
    console.error('Warning load error:', e);
  }
}

// ---------- 表示 ----------
function warningLevel(name) {
  const i = WARNING_LEVELS.findIndex(l => name.endsWith(l.suffix));
  return i === -1 ? WARNING_LEVELS.length : i;
}

function renderWarnings(names) {
  warningListEl.replaceChildren();
  if (names.length === 0) {
    warningListEl.textContent = '警報・注意報なし';
    warningListEl.classList.add('none');
    return;
  }
  warningListEl.classList.remove('none');

  names.sort((a, b) => warningLevel(a) - warningLevel(b)).forEach(name => {
    const level = WARNING_LEVELS[warningLevel(name)];
    const badge = document.createElement('span');
    badge.className = `warning-badge ${level ? level.className : 'warning'}`;
    badge.textContent = level ? name.slice(0, -level.suffix.length) : name; // 「大雨注意報」→「大雨」
    badge.title = name;
    warningListEl.appendChild(badge);
  });
}

async function initWarnings(lat, lon) {
  try {
    const target = await resolveWarningArea(lat, lon);
    if (!target) {
      warningListEl.textContent = '地域を特定できません';
      return;
    }
    warningAreaEl.textContent = target.name;
    await loadWarnings(target);
    setInterval(() => loadWarnings(target), WARNING_REFRESH_MS);
  } catch (e) {
    console.error('Warning area error:', e);
    warningListEl.textContent = '取得エラー';
  }
}
