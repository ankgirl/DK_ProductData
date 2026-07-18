// batchScanShared.js — "바코드 여러 개 스캔 → 목록 → 전체 순차 처리 → 셀러코드 복사" 공용 로직.
// 판매중지(disable_by_barcode) / 취소·반품(cancel_return_scan) 페이지가 공유한다. (로직 복사 방지)
// 각 페이지는 목록 항목(item) 모양과 항목별 처리(action)만 다르게 주입한다.

// HTML 이스케이프
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 클립보드 복사 (https면 navigator.clipboard, 아니면 execCommand fallback)
export async function copyText(text) {
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

// 복사 + 버튼 라벨 잠깐 바꿔 피드백 + (선택)메시지 표시. ok 여부 반환.
export async function copyWithFeedback(btn, text, opts = {}) {
    const { restoreLabel = btn.textContent, doneLabel = '복사됨!', failLabel = '복사 실패',
            setMsg, okMsg, failMsg } = opts;
    const ok = await copyText(text);
    btn.textContent = ok ? doneLabel : failLabel;
    if (typeof setMsg === 'function') setMsg(ok ? (okMsg || '') : (failMsg || ''), ok ? '#1a7a1a' : '#c0392b');
    setTimeout(() => { btn.textContent = restoreLabel; }, 1200);
    return ok;
}

// 상태 배지 갱신 (item.els.statusCell 에 그림). status가 "실패..."면 배지 클래스는 '실패'로 매핑.
// (배지 스타일 .status-badge / .status-대기·처리중·완료·실패 는 각 페이지 CSS가 정의)
export function setRowStatus(item, status) {
    item.status = status;
    const cell = item.els && item.els.statusCell;
    if (!cell) return;
    const base = status.startsWith('실패') ? '실패' : status;
    cell.innerHTML = `<span class="status-badge status-${base}">${esc(status)}</span>`;
}

// 목록을 하나씩 순차 처리(멱등: skipIf(item)==true 면 건너뜀 — 이미 완료 등).
// 각 항목: setRowStatus(처리중) → action(item) → 성공이면 '완료', 실패면 '실패: 메시지'.
// onProgress(done, total) 로 진행상황을 알린다. 반환: { success, fail, failed[], pendingCount }.
export async function runBatchSequential(items, { skipIf, action, onProgress } = {}) {
    const pending = items.filter(it => !(skipIf && skipIf(it)));
    let success = 0, fail = 0, done = 0;
    const failed = [];
    for (const item of items) {
        if (skipIf && skipIf(item)) continue;
        setRowStatus(item, '처리중');
        done++;
        if (typeof onProgress === 'function') onProgress(done, pending.length);
        try {
            await action(item);
            setRowStatus(item, '완료');
            success++;
        } catch (e) {
            console.error('[batchScan] 처리 실패:', e);
            setRowStatus(item, '실패: ' + (e.message || '오류'));
            failed.push(item);
            fail++;
        }
    }
    return { success, fail, failed, pendingCount: pending.length };
}
