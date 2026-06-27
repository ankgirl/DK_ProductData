// admin_search_by_name.js — 상품명 부분일치 검색 (관리자 전용, 읽기 전용)
// 이름 일부만 입력해도 대소문자 무시 부분일치로 검색. 표시: [이미지 · 이름 · 셀러코드].

(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let DOCS = null; // [{ code, name, img, hasSet }]  (SET_ 제외)

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

    async function onCopyClick(e) {
        const btn = e.target.closest('.copy-btn');
        if (!btn) return;
        const ok = await copyText(btn.getAttribute('data-copy') || '');
        const orig = btn.dataset.label || btn.textContent;
        btn.dataset.label = orig;
        btn.textContent = ok ? '복사됨' : '실패';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
    }

    // 셀러코드 복사 버튼들. 세트(SET_) 문서가 있는 상품만 '+세트' 버튼 추가.
    function copyBtns(r) {
        const single = `<button type="button" class="copy-btn" data-copy="${esc(r.code)}" title="셀러코드 복사">복사</button>`;
        const withSet = r.hasSet
            ? `<button type="button" class="copy-btn" data-copy="${esc(r.code)},SET_${esc(r.code)}" title="셀러코드 + 세트 셀러코드(콤마 연결) 복사">+세트</button>`
            : '';
        return single + withSet;
    }

    // 메인이미지: Cafe24URL 우선, 없으면 첫 옵션 이미지 (Cafe24URL 비어있는 상품 대비)
    function mainImage(data) {
        if (data.Cafe24URL) return data.Cafe24URL;
        const od = data.OptionDatas || {};
        const first = od['옵션1'] || od[Object.keys(od)[0]] || {};
        return first.옵션이미지URL || first.실제이미지URL || '';
    }

    // 일치 부분 하이라이트 (esc 후 안전한 텍스트에 <mark> 삽입)
    function highlight(name, q) {
        const safe = esc(name);
        if (!q) return safe;
        const idx = name.toLowerCase().indexOf(q.toLowerCase());
        if (idx < 0) return safe;
        return esc(name.slice(0, idx)) + '<mark>' + esc(name.slice(idx, idx + q.length)) + '</mark>' + esc(name.slice(idx + q.length));
    }

    function render(rows, q) {
        if (!rows.length) {
            $('result').innerHTML = '<p class="muted">일치하는 상품이 없습니다.</p>';
            return;
        }
        const link = code => `search_by_seller_code.html?sellerCode=${encodeURIComponent(code)}`;
        const body = rows.map(r => {
            const img = r.img
                ? `<a href="${link(r.code)}" target="_blank" rel="noopener"><img src="${esc(r.img)}" alt="${esc(r.code)}" loading="lazy" onerror="tryAlternativeExtension(this)"></a>`
                : '<span class="muted">없음</span>';
            return `<tr>
                <td class="col-img">${img}</td>
                <td>${highlight(r.name, q)}</td>
                <td class="col-code"><a href="${link(r.code)}" target="_blank" rel="noopener">${esc(r.code)}</a></td>
                <td class="col-copy">${copyBtns(r)}</td>
            </tr>`;
        }).join('');
        $('result').innerHTML = `<table class="nm-table">
            <thead><tr><th>이미지</th><th>이름</th><th>셀러코드</th><th>복사</th></tr></thead>
            <tbody>${body}</tbody>
        </table>`;
    }

    function search() {
        const q = $('nameInput').value.trim();
        if (!q) { $('status').textContent = '검색어를 입력하세요.'; $('result').innerHTML = ''; return; }
        if (!DOCS) { $('status').textContent = '아직 로딩 중입니다. 잠시 후 다시 시도하세요.'; return; }
        const ql = q.toLowerCase();
        const rows = DOCS.filter(d => d.name.toLowerCase().includes(ql))
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        $('status').textContent = `${rows.length}건 일치`;
        render(rows, q);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        $('searchBtn').addEventListener('click', search);
        $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
        $('result').addEventListener('click', onCopyClick); // 복사 버튼(동적 생성) 위임 처리
        try {
            $('status').textContent = '상품 데이터 불러오는 중...';
            const snap = await db.collection('Products').get();
            const items = [];
            const setCodes = new Set(); // 존재하는 SET_ 문서 id 모음 → 세트 보유 여부 판정용
            snap.forEach(d => {
                if (d.id.startsWith('SET_')) { setCodes.add(d.id); return; } // 세트는 본품과 이름 중복 → 목록 제외, 존재만 기록
                const data = d.data();
                // Products 의 상품 이름 필드는 '스토어키워드네임' (상품명은 주문 쪽 필드라 비어있음)
                items.push({ code: d.id, name: data.스토어키워드네임 || data.상품명 || '', img: mainImage(data) });
            });
            items.forEach(it => { it.hasSet = setCodes.has('SET_' + it.code); });
            DOCS = items;
            $('status').textContent = `상품 ${DOCS.length.toLocaleString()}건 로드 완료 · 검색어를 입력하세요.`;
            $('nameInput').focus();
        } catch (e) {
            $('status').textContent = '⚠️ 오류: ' + e.message;
            console.error(e);
        }
    });
})();
