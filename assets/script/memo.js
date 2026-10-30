// =====================================
// メモ（回線速度の下）
// ・タブで何枚か切り替えられる（ダブルクリックで名前を変える）
// ・「- [ ] やること」と書くとチェックボックスになる。[文字](URL) や https://… はリンクになる
// ・書いたら自動で保存（localStorage）
// =====================================
const Memo = (() => {
    const STORAGE_KEY = 'memo-notes';
    const MAX_TABS = 5;
    const GAP_PX = 15; // 回線速度パネルとの間隔

    const box = document.getElementById('memo-box');
    const speedBox = document.getElementById('speed-box');
    const tabsEl = document.getElementById('memo-tabs');
    const view = document.getElementById('memo-view');
    const input = document.getElementById('memo-input');
    const editBtn = document.getElementById('memo-edit-btn');
    const deleteBtn = document.getElementById('memo-delete-btn');

    let data = load();
    let editing = false;
    let saveTimer = null;

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && Array.isArray(saved.notes) && saved.notes.length > 0) return saved;
        } catch { /* 壊れていたら作り直す */ }
        return { active: 0, notes: [{ name: 'メモ', text: '' }] };
    }

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* 保存できなくても続ける */ }
    }

    const current = () => data.notes[data.active];

    // ---------- 表示 ----------
    const TASK = /^(\s*)[-*] \[( |x|X)\] ?(.*)$/;
    const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;

    // [文字](URL) と https://… をリンクにして parent に入れる（innerHTML は使わない）
    function appendInline(parent, text) {
        let last = 0;
        for (const m of text.matchAll(LINK)) {
            if (m.index > last) parent.append(text.slice(last, m.index));
            const a = document.createElement('a');
            a.href = m[2] || m[3];
            a.textContent = m[1] || m[3];
            a.target = '_blank';
            a.rel = 'noopener';
            parent.append(a);
            last = m.index + m[0].length;
        }
        if (last < text.length) parent.append(text.slice(last));
    }

    function renderView() {
        view.replaceChildren();
        const text = current().text;
        if (!text.trim()) {
            const empty = document.createElement('div');
            empty.className = 'memo-empty';
            empty.textContent = 'クリックして書く（- [ ] でチェックリスト）';
            view.appendChild(empty);
            return;
        }
        text.split('\n').forEach((line, i) => {
            const row = document.createElement('div');
            const task = line.match(TASK);
            if (task) {
                const done = task[2] !== ' ';
                row.className = `memo-task${done ? ' done' : ''}`;
                row.style.paddingLeft = `${task[1].length * 0.5}em`;
                const check = document.createElement('input');
                check.type = 'checkbox';
                check.checked = done;
                check.addEventListener('change', () => toggleTask(i));
                const label = document.createElement('span');
                appendInline(label, task[3]);
                row.append(check, label);
            } else {
                row.className = 'memo-line';
                if (line.trim()) appendInline(row, line); else row.innerHTML = '&nbsp;';
            }
            view.appendChild(row);
        });
    }

    // チェックを付け外ししたら、元の文章の [ ] / [x] を書き換える
    function toggleTask(lineIndex) {
        const lines = current().text.split('\n');
        lines[lineIndex] = lines[lineIndex].replace(/\[( |x|X)\]/, m => (m === '[ ]' ? '[x]' : '[ ]'));
        current().text = lines.join('\n');
        save();
        renderView();
    }

    function renderTabs() {
        tabsEl.replaceChildren(...data.notes.map((note, i) => {
            const tab = document.createElement('button');
            tab.className = `memo-tab${i === data.active ? ' active' : ''}`;
            tab.textContent = note.name;
            tab.title = 'クリックで切り替え / ダブルクリックで名前を変更';
            tab.addEventListener('click', () => switchTo(i));
            tab.addEventListener('dblclick', () => rename(tab, i));
            return tab;
        }));
        if (data.notes.length < MAX_TABS) {
            const add = document.createElement('button');
            add.className = 'memo-tab memo-add';
            add.textContent = '+';
            add.title = 'メモを追加';
            add.addEventListener('click', addTab);
            tabsEl.appendChild(add);
        }
        deleteBtn.hidden = !editing || data.notes.length <= 1;
    }

    function render() {
        renderTabs();
        renderView();
    }

    // ---------- 操作 ----------
    function switchTo(i) {
        if (editing) finishEdit();
        data.active = i;
        save();
        render();
    }

    function addTab() {
        data.notes.push({ name: `メモ${data.notes.length + 1}`, text: '' });
        switchTo(data.notes.length - 1);
        startEdit();
    }

    // タブ名をその場で書き換える（Enter かフォーカスが外れたら決定）
    function rename(tab, i) {
        tab.contentEditable = 'true';
        tab.focus();
        document.getSelection().selectAllChildren(tab);
        const finish = () => {
            tab.contentEditable = 'false';
            data.notes[i].name = tab.textContent.trim().slice(0, 12) || data.notes[i].name;
            save();
            renderTabs();
        };
        tab.addEventListener('blur', finish, { once: true });
        tab.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); tab.blur(); }
        });
    }

    function startEdit() {
        editing = true;
        input.value = current().text;
        input.hidden = false;
        view.hidden = true;
        editBtn.textContent = '完了';
        renderTabs();
        input.focus();
    }

    function finishEdit() {
        editing = false;
        clearTimeout(saveTimer);
        current().text = input.value;
        save();
        input.hidden = true;
        view.hidden = false;
        editBtn.textContent = '編集';
        render();
    }

    editBtn.addEventListener('click', () => (editing ? finishEdit() : startEdit()));
    deleteBtn.addEventListener('click', () => {
        if (data.notes.length <= 1 || !confirm(`「${current().name}」を削除しますか？`)) return;
        data.notes.splice(data.active, 1);
        data.active = Math.max(0, data.active - 1);
        editing = false;
        input.hidden = true;
        view.hidden = false;
        editBtn.textContent = '編集';
        save();
        render();
    });

    // 書いている途中も少し間をおいて保存する
    input.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            current().text = input.value;
            save();
        }, 300);
    });
    // Esc か Ctrl+Enter で編集を終える
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) {
            e.preventDefault();
            finishEdit();
        }
    });
    // 文字のところ（リンクやチェックボックス以外）をクリックしても編集を始める
    view.addEventListener('click', e => {
        if (e.target.closest('a, input')) return;
        startEdit();
    });

    // 回線速度パネルの高さが変わっても、すぐ下に付いていく
    function followSpeedBox() {
        box.style.top = `${speedBox.offsetTop + speedBox.offsetHeight + GAP_PX}px`;
    }
    followSpeedBox();
    new ResizeObserver(followSpeedBox).observe(speedBox);

    render();

    return {
        // 背景鑑賞モードのログ用：全部のメモのチェックリストの数
        taskCounts() {
            let open = 0;
            let done = 0;
            data.notes.forEach(note => note.text.split('\n').forEach(line => {
                const task = line.match(TASK);
                if (task) task[2] === ' ' ? open++ : done++;
            }));
            return { open, done };
        },
    };
})();
