// copyableAlert.js — 복사 가능한 공용 알림 모달 (window.showCopyableAlert)
//
// 브라우저 기본 alert() 창은 본문 텍스트를 선택·복사할 수 없어 불편하다(에러 상세 등).
// 이 모달은 본문을 선택 가능하게 보여주고 '📋 복사' 버튼으로 전체를 클립보드에 담는다.
// 자체 완결형: 스타일·복사 로직을 안에 포함 → 어느 페이지에서든 <script> 하나로 사용.
//
// 사용:  await showCopyableAlert('메시지', { title: '알림' });   // '확인' 누르면 resolve
//        showCopyableAlert(msg);                                  // 반환값 무시해도 됨
// (기존 alert 대체용. confirm() 처럼 취소가 필요한 곳에는 쓰지 않음.)

(function () {
    'use strict';

    function ensureStyle() {
        if (document.getElementById('copyableAlertStyle')) return;
        const s = document.createElement('style');
        s.id = 'copyableAlertStyle';
        s.textContent = `
.ca-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999;}
.ca-box{background:#fff;color:#222;max-width:min(560px,92vw);max-height:82vh;display:flex;flex-direction:column;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.35);overflow:hidden;}
.ca-title{padding:12px 16px;font-weight:700;font-size:1.02em;background:#3a2b4d;color:#fff;}
.ca-body{padding:14px 16px;overflow:auto;}
.ca-msg{margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:.95em;line-height:1.5;user-select:text;-webkit-user-select:text;cursor:text;}
.ca-actions{display:flex;gap:8px;justify-content:flex-end;padding:10px 16px;border-top:1px solid #eee;}
.ca-btn{padding:8px 16px;font-size:.92em;cursor:pointer;border-radius:6px;border:1px solid #b9a7d4;background:#efe9f7;color:#2b2140;}
.ca-btn:hover{background:#e2d8f1;}
.ca-btn.ca-copy.copied{background:#b9e6b9;border-color:#7fc97f;}
.ca-btn.ca-ok{background:#3a2b4d;color:#fff;border-color:#3a2b4d;font-weight:600;}
.ca-btn.ca-ok:hover{background:#4c3a63;}`;
        document.head.appendChild(s);
    }

    async function copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
        } catch (e) { /* fallback */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy'); document.body.removeChild(ta);
            return ok;
        } catch (e) { return false; }
    }

    // message: 문자열. options.title: 제목(기본 '알림'). Promise<void> 반환(확인 시 resolve).
    function showCopyableAlert(message, options) {
        const opt = options || {};
        const msg = String(message == null ? '' : message);
        ensureStyle();
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'ca-overlay';

            const box = document.createElement('div');
            box.className = 'ca-box';

            const title = document.createElement('div');
            title.className = 'ca-title';
            title.textContent = opt.title || '알림';

            const body = document.createElement('div');
            body.className = 'ca-body';
            const pre = document.createElement('pre');
            pre.className = 'ca-msg';
            pre.textContent = msg; // textContent → XSS 안전, 개행 유지
            body.appendChild(pre);

            const actions = document.createElement('div');
            actions.className = 'ca-actions';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'ca-btn ca-copy';
            copyBtn.textContent = '📋 복사';
            const okBtn = document.createElement('button');
            okBtn.className = 'ca-btn ca-ok';
            okBtn.textContent = '확인';
            actions.appendChild(copyBtn);
            actions.appendChild(okBtn);

            box.appendChild(title); box.appendChild(body); box.appendChild(actions);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            function close() {
                document.removeEventListener('keydown', onKey);
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve();
            }
            function onKey(e) {
                if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); }
            }

            copyBtn.addEventListener('click', async () => {
                const ok = await copyText(msg);
                copyBtn.textContent = ok ? '복사됨' : '복사 실패';
                copyBtn.classList.add('copied');
                setTimeout(() => { copyBtn.textContent = '📋 복사'; copyBtn.classList.remove('copied'); }, 1200);
            });
            okBtn.addEventListener('click', close);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(); }); // 바깥 클릭 닫기
            document.addEventListener('keydown', onKey);

            okBtn.focus();
        });
    }

    window.showCopyableAlert = showCopyableAlert;
})();
