// admin_search_by_name.js — 상품명 부분일치 검색 (관리자 전용, 읽기 전용)
// 이름 일부만 입력해도 대소문자 무시 부분일치로 검색. 표시: [이미지 · 이름 · 셀러코드].

(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let DOCS = null; // [{ code, name, img }]  (SET_ 제외)

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
            </tr>`;
        }).join('');
        $('result').innerHTML = `<table class="nm-table">
            <thead><tr><th>이미지</th><th>이름</th><th>셀러코드</th></tr></thead>
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
        try {
            $('status').textContent = '상품 데이터 불러오는 중...';
            const snap = await db.collection('Products').get();
            DOCS = [];
            snap.forEach(d => {
                if (d.id.startsWith('SET_')) return; // 세트는 본품과 이름 중복 → 제외
                const data = d.data();
                // Products 의 상품 이름 필드는 '스토어키워드네임' (상품명은 주문 쪽 필드라 비어있음)
                DOCS.push({ code: d.id, name: data.스토어키워드네임 || data.상품명 || '', img: mainImage(data) });
            });
            $('status').textContent = `상품 ${DOCS.length.toLocaleString()}건 로드 완료 · 검색어를 입력하세요.`;
            $('nameInput').focus();
        } catch (e) {
            $('status').textContent = '⚠️ 오류: ' + e.message;
            console.error(e);
        }
    });
})();
