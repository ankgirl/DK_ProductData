// admin_restock_checklist.js — 재입고 체크리스트 (관리자 전용, 읽기 전용)
// 콤마로 입력한 셀러코드들을 [메인이미지 · 셀러코드 · ShopURL · 옵션별 총재고 · 체크박스] 로 표시.
// 옵션별 총재고 = 본품 옵션 Counts + 세트수량(SET_{code}.OptionDatas['옵션1'].Counts).
//   (세트 1개 = 각 옵션 1개씩 포함하므로 모든 옵션에 세트수량을 더한다.)
// 체크된 셀러코드만 하단에 콤마로 모아 복사.

(function () {
    'use strict';

    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // 입력 문자열 → 정제된 셀러코드 배열 (콤마/줄바꿈 구분, SET_ 접두어 제거, 중복 제거, 순서 유지)
    function parseCodes(raw) {
        const seen = new Set();
        const out = [];
        (raw || '').split(/[,\n]/).forEach(t => {
            let code = t.trim();
            if (!code) return;
            if (code.startsWith('SET_')) code = code.slice(4);
            if (seen.has(code)) return;
            seen.add(code);
            out.push(code);
        });
        return out;
    }

    // 메인이미지: Cafe24URL 우선, 없으면 첫 옵션 이미지 (Cafe24URL 비어있는 상품 대비)
    function mainImage(data) {
        if (data.Cafe24URL) return data.Cafe24URL;
        const od = data.OptionDatas || {};
        const first = od['옵션1'] || od[Object.keys(od)[0]] || {};
        return first.옵션이미지URL || first.실제이미지URL || '';
    }

    // 옵션별 총재고 문자열: "옵션명:총수량" 콤마 결합 (총수량 = 개별 + 세트수량)
    function optionTotals(data, setQty) {
        const od = data.OptionDatas || {};
        const keys = Object.keys(od);
        if (!keys.length) return '<span class="missing">옵션 없음</span>';
        return keys.map(k => {
            const label = od[k].보여주기용옵션명 || k;
            const total = num(od[k].Counts) + setQty;
            return `${esc(label)}:${total}`;
        }).join(', ');
    }

    function rowHTML(r) {
        const link = `search_by_seller_code.html?sellerCode=${encodeURIComponent(r.code)}`;
        if (!r.found) {
            return `<tr>
                <td class="col-img"><span class="muted">—</span></td>
                <td class="col-code">${esc(r.code)}</td>
                <td colspan="2" class="missing">⚠️ 상품을 찾을 수 없습니다</td>
                <td class="col-check"><input type="checkbox" class="rcl-cb" data-code="${esc(r.code)}"></td>
            </tr>`;
        }
        const img = r.img
            ? `<a href="${link}" target="_blank" rel="noopener"><img src="${esc(r.img)}" alt="${esc(r.code)}" loading="lazy" onerror="tryAlternativeExtension(this)"></a>`
            : '<span class="muted">없음</span>';
        const shop = r.shopUrl
            ? `<a class="shopurl" href="${esc(r.shopUrl)}" target="_blank" rel="noopener">${esc(r.shopUrl)}</a>`
            : '<span class="muted">없음</span>';
        return `<tr>
            <td class="col-img">${img}</td>
            <td class="col-code"><a href="${link}" target="_blank" rel="noopener">${esc(r.code)}</a></td>
            <td class="shopcell">${shop}</td>
            <td class="opts">${r.opts}</td>
            <td class="col-check"><input type="checkbox" class="rcl-cb" data-code="${esc(r.code)}"></td>
        </tr>`;
    }

    function updateCheckedOutput() {
        const codes = [...document.querySelectorAll('.rcl-cb:checked')].map(cb => cb.dataset.code);
        $('checkedOutput').value = codes.join(',');
        $('copyStatus').textContent = '';
    }

    async function loadOne(code) {
        const [baseSnap, setSnap] = await Promise.all([
            db.collection('Products').doc(code).get(),
            db.collection('Products').doc('SET_' + code).get(),
        ]);
        if (!baseSnap.exists) return { code, found: false };
        const data = baseSnap.data();
        const setQty = setSnap.exists
            ? Math.max(0, num(((setSnap.data().OptionDatas || {})['옵션1'] || {}).Counts))
            : 0;
        return {
            code,
            found: true,
            img: mainImage(data),
            shopUrl: data.ShopURL || '',
            opts: optionTotals(data, setQty),
        };
    }

    async function run() {
        const codes = parseCodes($('codesInput').value);
        if (!codes.length) {
            $('status').textContent = '셀러코드를 입력하세요.';
            $('result').innerHTML = '';
            $('footBox').style.display = 'none';
            return;
        }
        $('status').textContent = `조회 중... (${codes.length}건)`;
        $('result').innerHTML = '';
        try {
            const rows = await Promise.all(codes.map(loadOne));
            const missing = rows.filter(r => !r.found).length;
            const thead = `<tr>
                <th>메인이미지</th><th>셀러코드</th><th>ShopURL</th><th>옵션별 총재고 (개별+세트)</th><th>체크</th>
            </tr>`;
            $('result').innerHTML = `<table class="rcl-table">
                <thead>${thead}</thead>
                <tbody>${rows.map(rowHTML).join('')}</tbody>
            </table>`;
            $('status').textContent = `총 ${rows.length}건` + (missing ? ` · ⚠️ 미발견 ${missing}건` : '');
            $('footBox').style.display = '';
            document.querySelectorAll('.rcl-cb').forEach(cb => cb.addEventListener('change', updateCheckedOutput));
            updateCheckedOutput();
        } catch (e) {
            $('status').textContent = '⚠️ 오류: ' + e.message;
            console.error(e);
        }
    }

    function copyChecked() {
        const text = $('checkedOutput').value;
        if (!text) { $('copyStatus').textContent = '체크된 항목이 없습니다.'; return; }
        const done = () => { $('copyStatus').textContent = '✅ 복사됨!'; };
        const fail = () => {
            // 클립보드 API 실패 시 textarea 선택 방식으로 폴백
            const ta = $('checkedOutput');
            ta.removeAttribute('readonly'); ta.focus(); ta.select();
            const ok = document.execCommand && document.execCommand('copy');
            ta.setAttribute('readonly', '');
            $('copyStatus').textContent = ok ? '✅ 복사됨!' : '복사 실패 — 직접 선택해 복사하세요.';
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fail);
        } else {
            fail();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('loadBtn').addEventListener('click', run);
        $('copyBtn').addEventListener('click', copyChecked);
        // Ctrl+Enter 로도 조회
        $('codesInput').addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
        });
    });
})();
