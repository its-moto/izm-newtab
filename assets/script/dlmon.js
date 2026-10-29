// =====================================
// 保存データの使用量・ダウンロードの進み具合（システムの下）
// ダウンロードは chrome.downloads を使用（manifestの permissions に downloads が必要）
// =====================================
(() => {
    const STORAGE_REFRESH_MS = 30000;
    const DL_REFRESH_MS = 1000;
    const DL_SHOW_MAX = 3;              // 表示する件数
    const DL_DONE_SHOW_MS = 30 * 60000; // 完了したものはこの時間だけ表示しておく
    const GAP_PX = 15;                  // システムパネルとの間隔

    const box = document.getElementById('dl-box');
    const sysBox = document.getElementById('sys-box');
    const storageValue = document.getElementById('storage-value');
    const storageFill = document.getElementById('storage-fill');
    const storageDetail = document.getElementById('storage-detail');
    const dlSummary = document.getElementById('dl-summary');
    const dlList = document.getElementById('dl-list');

    // 前回の受信バイト数（速度の計算用） id → { bytes, time, speed }
    const prev = new Map();

    function formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
        return `${bytes.toFixed(i === 0 || bytes >= 100 ? 0 : 1)}${units[i]}`;
    }

    function formatDuration(sec) {
        if (!Number.isFinite(sec) || sec < 0) return '--';
        if (sec < 60) return `残り${Math.ceil(sec)}秒`;
        if (sec < 3600) return `残り${Math.ceil(sec / 60)}分`;
        return `残り${Math.floor(sec / 3600)}時間${Math.ceil((sec % 3600) / 60)}分`;
    }

    // システムパネルの高さが変わっても、すぐ下に付いていくようにする
    function followSysBox() {
        box.style.top = `${sysBox.offsetTop + sysBox.offsetHeight + GAP_PX}px`;
    }

    // ---------- 保存データ ----------
    async function updateStorage() {
        if (!navigator.storage?.estimate) {
            storageValue.textContent = '--';
            return;
        }
        try {
            const { usage, quota, usageDetails } = await navigator.storage.estimate();
            storageValue.textContent = formatBytes(usage);
            storageFill.style.width = `${Math.min(100, (usage / quota) * 100)}%`;
            // IndexedDB には背景の動画・画像が入っている（bg.js）
            const idb = usageDetails?.indexedDB;
            storageDetail.textContent =
                `${idb !== undefined ? `背景など ${formatBytes(idb)} / ` : ''}上限 ${formatBytes(quota)}`;
        } catch (e) {
            console.error('Storage estimate error:', e);
            storageValue.textContent = '取得エラー';
        }
    }

    // ---------- ダウンロード ----------
    const hasDownloads = typeof chrome !== 'undefined' && chrome.downloads;

    function fileName(item) {
        const path = item.filename || item.finalUrl || item.url || '';
        return decodeURIComponent(path.split(/[\\/]/).pop().split('?')[0]) || '(名前未定)';
    }

    function measureSpeed(item) {
        const now = performance.now();
        const p = prev.get(item.id);
        let speed = p ? p.speed : 0;
        if (p && now > p.time) {
            const current = ((item.bytesReceived - p.bytes) / (now - p.time)) * 1000;
            speed = p.speed ? p.speed * 0.7 + current * 0.3 : current; // ふらつかないよう平均をとる
        }
        prev.set(item.id, { bytes: item.bytesReceived, time: now, speed });
        return item.paused ? 0 : speed;
    }

    function renderItem(item) {
        const el = document.createElement('div');
        el.className = 'dl-item';

        const name = document.createElement('div');
        name.className = 'dl-name';
        name.textContent = fileName(item);
        name.title = item.filename || item.url;

        const bar = document.createElement('div');
        bar.className = 'dl-progress';
        const fill = document.createElement('div');
        fill.className = 'dl-progress-fill';
        bar.appendChild(fill);

        const meta = document.createElement('div');
        meta.className = 'dl-meta';
        const left = document.createElement('span');
        const right = document.createElement('span');
        meta.append(left, right);

        const total = item.totalBytes > 0 ? item.totalBytes : item.fileSize;
        if (item.state === 'in_progress') {
            const speed = measureSpeed(item);
            const percent = total > 0 ? (item.bytesReceived / total) * 100 : 0;
            fill.style.width = `${percent}%`;
            left.textContent = total > 0
                ? `${formatBytes(item.bytesReceived)} / ${formatBytes(total)}`
                : formatBytes(item.bytesReceived);
            if (item.paused) {
                el.classList.add('paused');
                right.textContent = '一時停止中';
            } else {
                right.textContent = `${formatBytes(speed)}/s ${total > 0 && speed > 0 ? formatDuration((total - item.bytesReceived) / speed) : ''}`;
            }
        } else {
            el.classList.add('done');
            fill.style.width = '100%';
            left.textContent = total > 0 ? formatBytes(total) : '';
            right.textContent = item.state === 'complete' ? '完了' : `中断（${item.error || '不明'}）`;
            prev.delete(item.id);
        }

        el.append(name, bar, meta);
        return el;
    }

    async function updateDownloads() {
        if (document.hidden) return;
        try {
            const items = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 20 });
            const now = Date.now();
            const active = items.filter(i => i.state === 'in_progress');
            const recentDone = items.filter(i => i.state !== 'in_progress' &&
                now - Date.parse(i.endTime || i.startTime) < DL_DONE_SHOW_MS);
            const shown = [...active, ...recentDone].slice(0, DL_SHOW_MAX);

            dlSummary.textContent = active.length > 0 ? `${active.length}件進行中` : '';
            dlList.replaceChildren(...shown.map(renderItem));
            if (shown.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'dl-empty';
                empty.textContent = '進行中のダウンロードはありません';
                dlList.appendChild(empty);
            }
        } catch (e) {
            console.error('Downloads error:', e);
        }
    }

    // ---------- 起動時の処理 ----------
    followSysBox();
    new ResizeObserver(followSysBox).observe(sysBox);

    updateStorage();
    setInterval(updateStorage, STORAGE_REFRESH_MS);

    if (hasDownloads) {
        updateDownloads();
        setInterval(updateDownloads, DL_REFRESH_MS);
    } else {
        dlList.textContent = '拡張機能として読み込み、downloads 権限を許可してください';
        dlList.className = 'dl-empty';
    }
})();
