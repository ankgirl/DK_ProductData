// notice_board.js — Firestore Notices/main 의 messages 배열을 읽어 #noticeBoard 영역에 표시.
// 우상단 [편집] 버튼으로 inline textarea 편집 → 저장 시 PATCH.

(function () {
    const COLLECTION = 'Notices';
    const DOC_ID     = 'main';

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => (
            { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
        ));
    }

    async function loadAndRender(board) {
        try {
            const snap = await firebase.firestore().collection(COLLECTION).doc(DOC_ID).get();
            const messages = snap.exists ? (snap.data().messages || []) : [];
            renderView(board, messages);
        } catch (e) {
            console.warn('공지 로드 실패:', e);
        }
    }

    function renderView(board, messages) {
        board.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'background:#e7f5ff; border:1px solid #74c0fc; border-radius:6px; padding:12px 16px; margin:0 0 14px; font-size:14px; color:#1864ab; position:relative;';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = '✏️ 편집';
        editBtn.style.cssText = 'position:absolute; top:8px; right:8px; padding:4px 10px; font-size:12px; border:1px solid #74c0fc; background:#fff; color:#1864ab; border-radius:4px; cursor:pointer; width:auto; margin:0;';
        editBtn.addEventListener('click', () => renderEdit(board, messages));

        const title = document.createElement('strong');
        title.style.cssText = 'display:block; margin-bottom:6px;';
        title.textContent = '📢 공지';

        const list = document.createElement('div');
        if (messages.length === 0) {
            list.innerHTML = '<div style="color:#777; font-style:italic;">(공지 없음)</div>';
        } else {
            list.innerHTML = messages.map(m => `<div style="padding:4px 0;">• ${escapeHtml(m)}</div>`).join('');
        }

        wrap.appendChild(editBtn);
        wrap.appendChild(title);
        wrap.appendChild(list);
        board.appendChild(wrap);
    }

    function renderEdit(board, messages) {
        board.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'background:#fff8e1; border:1px solid #ffd54f; border-radius:6px; padding:12px 16px; margin:0 0 14px; font-size:14px; color:#5d4037;';

        const title = document.createElement('strong');
        title.style.cssText = 'display:block; margin-bottom:6px;';
        title.textContent = '✏️ 공지 편집 — 한 줄당 한 개의 공지, 빈 줄은 무시됨';

        const ta = document.createElement('textarea');
        ta.value = messages.join('\n');
        ta.rows = Math.max(3, messages.length + 1);
        ta.style.cssText = 'width:100%; box-sizing:border-box; padding:8px; font-size:14px; font-family:inherit; border:1px solid #ffd54f; border-radius:4px; margin-bottom:8px; resize:vertical;';

        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex; gap:8px;';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = '💾 저장';
        saveBtn.style.cssText = 'padding:6px 14px; font-size:13px; border:1px solid #009879; background:#009879; color:#fff; border-radius:4px; cursor:pointer; width:auto; margin:0;';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = '취소';
        cancelBtn.style.cssText = 'padding:6px 14px; font-size:13px; border:1px solid #999; background:#fff; color:#555; border-radius:4px; cursor:pointer; width:auto; margin:0;';

        saveBtn.addEventListener('click', async () => {
            const newMessages = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
            saveBtn.disabled = true;
            saveBtn.textContent = '저장 중…';
            try {
                await firebase.firestore().collection(COLLECTION).doc(DOC_ID).set({
                    messages: newMessages,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                renderView(board, newMessages);
            } catch (e) {
                console.error('공지 저장 실패:', e);
                alert('공지 저장 실패: ' + e.message);
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 저장';
            }
        });

        cancelBtn.addEventListener('click', () => renderView(board, messages));

        btnWrap.appendChild(saveBtn);
        btnWrap.appendChild(cancelBtn);

        wrap.appendChild(title);
        wrap.appendChild(ta);
        wrap.appendChild(btnWrap);
        board.appendChild(wrap);
    }

    document.addEventListener('DOMContentLoaded', () => {
        const board = document.getElementById('noticeBoard');
        if (!board) return;
        loadAndRender(board);
    });
})();
