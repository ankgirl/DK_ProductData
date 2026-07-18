// clipboardUtils.js — 공용 클립보드 복사 유틸 (셀러코드 복사 버튼 등)
//
// 여러 관리자 페이지에서 '복사'/'+세트' 버튼과 복사 로직이 중복 구현되어 있어 공용화.
// (CLAUDE.md: 같은 로직은 복사하지 않고 공용 함수로 추출)
//
// 사용:
//   1) HTML: <script src="./clipboardUtils.js?v=1"></script>
//   2) 버튼 HTML 생성: ClipboardUtils.copyButtonsHTML(code, hasSet)
//   3) 클릭 위임 부착(결과 컨테이너에 1회): ClipboardUtils.bindCopyButtons(document.getElementById('result'))
//   .copy-btn / .copy-btn.copied 스타일은 각 페이지 CSS에 있어야 함.

(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // 클립보드 복사 (https에선 navigator.clipboard, 아니면 execCommand fallback)
    async function copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) { /* fallback 시도 */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) { return false; }
    }

    // .copy-btn(data-copy="복사할문자열") 클릭을 위임 처리. 복사 후 잠깐 '복사됨' 표시.
    async function handleCopyClick(e) {
        const btn = e.target.closest('.copy-btn');
        if (!btn) return;
        const ok = await copyText(btn.getAttribute('data-copy') || '');
        const orig = btn.dataset.label || btn.textContent;
        btn.dataset.label = orig;
        btn.textContent = ok ? '복사됨' : '실패';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
    }

    // 컨테이너(기본 document)에 .copy-btn 위임 리스너를 1회만 부착. 동적으로 다시 그려도 재부착 불필요.
    function bindCopyButtons(container) {
        const el = container || document;
        if (el.__copyBtnBound) return;
        el.__copyBtnBound = true;
        el.addEventListener('click', handleCopyClick);
    }

    // 셀러코드 복사 버튼 HTML. hasSet(=SET_{code} 문서 존재)이면 '+세트' 버튼(콤마로 이어붙임)도 추가.
    function copyButtonsHTML(code, hasSet) {
        const single = `<button type="button" class="copy-btn" data-copy="${esc(code)}" title="셀러코드 복사">복사</button>`;
        const withSet = hasSet
            ? `<button type="button" class="copy-btn" data-copy="${esc(code)},SET_${esc(code)}" title="셀러코드 + 세트 셀러코드(콤마 연결) 복사">+세트</button>`
            : '';
        return single + withSet;
    }

    window.ClipboardUtils = { copyText, handleCopyClick, bindCopyButtons, copyButtonsHTML };
})();
