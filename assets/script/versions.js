// バージョンは manifest.json の "version" だけで管理する
// 更新内容は version.json の "message" に書く（GitHub の main にあるものを最新版として見る）
const currentVersion = chrome.runtime?.getManifest?.()?.version;
document.getElementById('version-info').textContent = `Version ${currentVersion || '--'}`;

const REPO_URL = 'https://github.com/its-moto/izm-newtab';
const LATEST_JSON_URL = 'https://raw.githubusercontent.com/its-moto/izm-newtab/main/version.json';
const LATEST_ZIP_URL = `${REPO_URL}/archive/refs/heads/main.zip`;
const LAST_VERSION_KEY = 'last-version'; // 前回開いたときのバージョン（更新できたかの確認用）

// "1.10.0" と "1.9.2" のような比較もできるよう、数字ごとに比べる（a が新しければ正）
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// 更新内容（改行区切り）を箇条書きにする
function renderChanges(listEl, message) {
  listEl.replaceChildren(...(message || '').split('\n').filter(Boolean).map(line => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  }));
}

// ---------- 新しいバージョンのお知らせ ----------
const statusDiv = document.getElementById('update-status');
const panel = document.getElementById('update-panel');

async function checkUpdate() {
  if (!currentVersion) return;

  try {
    const response = await fetch(LATEST_JSON_URL, { cache: 'no-store' });
    const data = await response.json();

    // GitHub のほうが新しいときだけ知らせる（手元で先に上げたバージョンでは出さない）
    if (compareVersions(data.version, currentVersion) <= 0) return;

    statusDiv.innerHTML = `新しいバージョン (${data.version}) があります！<br>クリックで更新方法を表示`;
    statusDiv.classList.add('available');
    updateColor();

    document.getElementById('update-versions').textContent = `v${currentVersion} → v${data.version}`;
    renderChanges(document.getElementById('update-changes'), data.message);
  } catch (error) {
    console.error('アップデートチェックに失敗しました:', error);
  }
}

statusDiv.addEventListener('click', () => {
  if (statusDiv.classList.contains('available')) panel.hidden = !panel.hidden;
});
document.getElementById('update-close-btn').addEventListener('click', () => { panel.hidden = true; });

// 最新版のZIPをダウンロード（downloads 権限がなければブラウザで開く）
document.getElementById('update-download-btn').addEventListener('click', () => {
  if (chrome.downloads) {
    chrome.downloads.download({ url: LATEST_ZIP_URL, filename: 'izm-newtab-latest.zip' });
  } else {
    window.open(LATEST_ZIP_URL, '_blank');
  }
});

// 上書きしたファイルを読み込み直す（chrome://extensions の再読み込みと同じ）
document.getElementById('update-reload-btn').addEventListener('click', () => {
  if (chrome.runtime?.reload) chrome.runtime.reload();
  else location.reload();
});

// ---------- 更新できたときのお知らせ ----------
// 前回と違うバージョンで開かれたら、手元の version.json の内容を一度だけ見せる
async function showUpdatedNotice() {
  if (!currentVersion) return;
  const last = localStorage.getItem(LAST_VERSION_KEY);
  localStorage.setItem(LAST_VERSION_KEY, currentVersion);
  if (!last || compareVersions(currentVersion, last) <= 0) return;

  try {
    const data = await (await fetch('version.json')).json();
    const toast = document.getElementById('updated-toast');
    document.getElementById('updated-title').textContent = `v${currentVersion} に更新しました`;
    renderChanges(document.getElementById('updated-changes'), data.message);
    toast.hidden = false;
    toast.addEventListener('click', () => { toast.hidden = true; });
    setTimeout(() => { toast.hidden = true; }, 15000);
  } catch (error) {
    console.error('更新内容の読み込みに失敗しました:', error);
  }
}

let colorint = Math.floor(Math.random() * 360);
let colorIncrement = 1;
if(Math.random() < 0.2) colorIncrement = 20;

// 虹色のアニメーションは更新のお知らせが出ているときだけ動かす
function updateColor() {
  colorint += colorIncrement;
  statusDiv.style.color = `hsl(${colorint % 360}, 100%, 50%)`;
  requestAnimationFrame(updateColor);
}

// ポップアップが開いた時に実行
document.addEventListener('DOMContentLoaded', () => {
  checkUpdate();
  showUpdatedNotice();
});
