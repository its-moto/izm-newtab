async function checkUpdate() {
  const currentVersion = chrome.runtime?.getManifest?.()?.version || "1.0.0";
  const githubUrl = 'https://raw.githubusercontent.com/its-moto/izm-newtab/main/version.json';

  try {
    const response = await fetch(githubUrl);
    const data = await response.json();

    if (data.version !== currentVersion) {
      // HTML要素にメッセージを表示
      const statusDiv = document.getElementById('update-status');
      statusDiv.innerHTML = `
          <a href="https://github.com/its-moto/izm-newtab" target="_blank" style="text-decoration: none; color: inherit;">
          新しいバージョン (${data.version}) があります！<br>
          GitHubから最新版を取得してください</a>
      `;

    }
  } catch (error) {
    console.error('アップデートチェックに失敗しました:', error);
  }
}

let colorint = 0;
function updateColor() {
  colorint += 1;
  document.getElementById('update-status').style.color = `hsl(${colorint % 360}, 100%, 50%)`;
  requestAnimationFrame(updateColor);
}
updateColor();

// ポップアップが開いた時に実行
document.addEventListener('DOMContentLoaded', checkUpdate);