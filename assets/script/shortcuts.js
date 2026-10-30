// =====================================
// ショートカット編集（最大9個・ドラッグ&ドロップで並べ替え）
// =====================================
(() => {
    const MAX = 9;
    const STORAGE_KEY = 'shortcuts';
    const NAME_MAX_LENGTH = 8;

    const DEFAULTS = [
        { name: 'GitHub', url: 'https://github.com' },
        { name: 'Discord', url: 'https://discord.com/channels/@me' },
        { name: 'Gemini', url: 'https://gemini.google.com/app' }
    ];

    const shortcutBox = document.getElementById('shortcut-box');

    // ---------- 保存・読み込み ----------
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw === null) return DEFAULTS.map(s => ({ ...s }));
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) throw new Error('invalid');
            return data
                .filter(s => s && typeof s.name === 'string' && typeof s.url === 'string')
                .slice(0, MAX);
        } catch {
            return DEFAULTS.map(s => ({ ...s }));
        }
    }

    function save(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    // ---------- URLの検証 ----------
    // スキームが無ければ https:// を補い、http/https 以外（javascript: など）は拒否
    function normalizeUrl(raw) {
        let text = raw.trim();
        if (!text) return null;
        if (!/^[a-z][a-z0-9+.\-]*:/i.test(text)) text = 'https://' + text;
        try {
            const u = new URL(text);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
            return u.href;
        } catch {
            return null;
        }
    }

    // Chrome が覚えているサイトのアイコンを使う（manifest の favicon 権限が必要）
    // 外部に問い合わせないので、アイコンがないサイトでもコンソールに 404 が出ない（その場合は地球儀のアイコン）
    function faviconUrl(url) {
        if (typeof chrome === 'undefined' || !chrome.runtime?.id) return '';
        return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
    }

    // ---------- ショートカットバーの描画 ----------
    function render(list) {
        shortcutBox.replaceChildren();
        list.forEach(({ name, url }) => {
            const a = document.createElement('a');
            a.className = 'shortcut-icon';
            a.href = url;

            const img = document.createElement('img');
            img.alt = '';
            try { img.src = faviconUrl(url); } catch { /* 無効URLはアイコン無し */ }

            const span = document.createElement('span');
            span.textContent = name;

            a.append(img, span);
            shortcutBox.appendChild(a);
        });
        if (list.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'sc-empty';
            empty.textContent = 'ショートカットなし';
            shortcutBox.appendChild(empty);
        }
        shortcutBox.appendChild(editBtn); // replaceChildrenで消えるので毎回付け直す
        Boot.popIn(shortcutBox, [...shortcutBox.children], 45); // アイコンを順番に出す（boot.js）
    }

    // ---------- 編集ボタン ----------
    const editBtn = document.createElement('button');
    editBtn.id = 'sc-edit-btn';
    editBtn.textContent = '編集';

    // ---------- ポップアップ ----------
    const modal = document.createElement('div');
    modal.id = 'sc-modal';
    modal.hidden = true;
    modal.innerHTML = `
        <div id="sc-dialog">
            <div id="sc-title">ショートカット編集 <span id="sc-count"></span></div>
            <div id="sc-hint">≡ をドラッグして並べ替え</div>
            <div id="sc-list"></div>
            <div id="sc-error"></div>
            <div id="sc-actions">
                <button id="sc-add">＋ 追加</button>
                <button id="sc-reset">初期化</button>
                <span class="sc-spacer"></span>
                <button id="sc-cancel">キャンセル</button>
                <button id="sc-save">保存</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const dialog = modal.querySelector('#sc-dialog');
    const listEl = modal.querySelector('#sc-list');
    const countEl = modal.querySelector('#sc-count');
    const errorEl = modal.querySelector('#sc-error');
    const addBtn = modal.querySelector('#sc-add');

    function rows() {
        return [...listEl.querySelectorAll('.sc-row')];
    }

    function updateCount() {
        const n = rows().length;
        countEl.textContent = `${n} / ${MAX}`;
        addBtn.disabled = n >= MAX;
    }

    function setError(msg) {
        errorEl.textContent = msg || '';
    }

    function updateRowIcon(img, urlInput) {
        const url = normalizeUrl(urlInput.value);
        if (url) {
            img.src = faviconUrl(url);
            img.style.visibility = 'visible';
        } else {
            img.removeAttribute('src');
            img.style.visibility = 'hidden';
        }
    }

    function addRow(item = { name: '', url: '' }) {
        const row = document.createElement('div');
        row.className = 'sc-row';

        const handle = document.createElement('span');
        handle.className = 'sc-handle';
        handle.textContent = '≡';
        handle.title = 'ドラッグで並べ替え';

        const icon = document.createElement('img');
        icon.className = 'sc-fav';
        icon.alt = '';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'sc-name';
        nameInput.placeholder = '名前';
        nameInput.maxLength = NAME_MAX_LENGTH;
        nameInput.value = item.name;

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'sc-url';
        urlInput.placeholder = 'https://...';
        urlInput.value = item.url;

        const del = document.createElement('button');
        del.className = 'sc-del';
        del.textContent = '×';
        del.title = '削除';

        row.append(handle, icon, nameInput, urlInput, del);
        listEl.appendChild(row);

        updateRowIcon(icon, urlInput);
        urlInput.addEventListener('change', () => updateRowIcon(icon, urlInput));
        [nameInput, urlInput].forEach(inp =>
            inp.addEventListener('input', () => inp.classList.remove('invalid'))
        );

        del.addEventListener('click', () => {
            row.remove();
            setError('');
            updateCount();
        });

        // ハンドルを掴んだときだけドラッグ可能にする（入力欄の文字選択と干渉させない）
        handle.addEventListener('mousedown', () => { row.draggable = true; });
        row.addEventListener('dragstart', (e) => {
            dragging = row;
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });
        row.addEventListener('dragend', () => {
            row.draggable = false;
            row.classList.remove('dragging');
            dragging = null;
        });

        updateCount();
        return row;
    }

    // ---------- ドラッグ&ドロップ ----------
    let dragging = null;

    function rowAfterCursor(y) {
        return rows()
            .filter(r => r !== dragging)
            .find(r => {
                const box = r.getBoundingClientRect();
                return y < box.top + box.height / 2;
            }) || null;
    }

    listEl.addEventListener('dragover', (e) => {
        if (!dragging) return;
        e.preventDefault();
        const after = rowAfterCursor(e.clientY);
        if (dragging.nextElementSibling === after) return; // 位置が変わらないなら何もしない
        listEl.insertBefore(dragging, after);
    });
    listEl.addEventListener('drop', (e) => e.preventDefault());

    // ハンドルを押しただけでドラッグしなかった場合は元に戻す
    modal.addEventListener('mouseup', () => rows().forEach(r => { r.draggable = false; }));

    // ---------- 開く・閉じる ----------
    function openModal() {
        listEl.replaceChildren();
        setError('');
        load().forEach(addRow);
        updateCount();
        modal.hidden = false;
        Modal.animate(dialog, 'anim-open'); // 開くアニメーション（modal.js）
    }

    let closing = false;
    async function closeModal() {
        if (closing) return;
        closing = true;
        modal.classList.add('closing');
        await Modal.animate(dialog, 'anim-close', () => { modal.hidden = true; });
        modal.classList.remove('closing');
        closing = false;
    }

    editBtn.addEventListener('click', openModal);
    modal.querySelector('#sc-cancel').addEventListener('click', closeModal);

    // 背景（暗い部分）をクリックで閉じる。ドラッグ選択が外で終わった場合は閉じない
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (!modal.hidden && e.key === 'Escape') closeModal();
    });

    // ---------- 追加・初期化・保存 ----------
    addBtn.addEventListener('click', () => {
        if (rows().length >= MAX) return;
        const row = addRow();
        row.querySelector('.sc-name').focus();
        listEl.scrollTop = listEl.scrollHeight;
    });

    modal.querySelector('#sc-reset').addEventListener('click', () => {
        if (!confirm('初期のショートカットに戻しますか？\n（「保存」を押すまで確定しません）')) return;
        listEl.replaceChildren();
        setError('');
        DEFAULTS.forEach(addRow);
        updateCount();
    });

    function saveFromRows() {
        const result = [];
        for (const [i, row] of rows().entries()) {
            const nameInput = row.querySelector('.sc-name');
            const urlInput = row.querySelector('.sc-url');
            const name = nameInput.value.trim();
            const rawUrl = urlInput.value.trim();

            if (!name && !rawUrl) continue; // 空行は無視

            const url = normalizeUrl(rawUrl);
            if (!url) {
                urlInput.classList.add('invalid');
                urlInput.focus();
                setError(`${i + 1}行目: URLが正しくありません（http/httpsのみ）`);
                return;
            }
            result.push({ name: name || new URL(url).hostname.slice(0, NAME_MAX_LENGTH), url });
        }

        save(result);
        render(result);
        closeModal();
    }

    modal.querySelector('#sc-save').addEventListener('click', saveFromRows);
    listEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') saveFromRows();
    });

    // ---------- 初期表示 ----------
    render(load());
})();