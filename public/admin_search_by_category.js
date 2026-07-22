// admin_search_by_category.js — 소분류명으로 '변경 전(기존) 셀러코드' 찾기 (관리자 전용, 읽기 전용)
//
// 배경: 셀러코드를 바꿔도 이미지 URL 은 원래 위치로 고정된다(이미지 URL 고정 정책).
//   저장된 옵션이미지URL:  https://.../1688/{입고차수}/{원래셀러코드}/option/{원래셀러코드}%20sku...
//   → 이미지에 박힌 코드 ≠ 현재 문서 코드  이면 '셀러코드가 바뀐 적 있는 제품'.
// 이 단서로 변경 이력이 따로 없어도 소급해서 기존 코드를 복구한다.
// 추가로, 앞으로의 변경은 SellerCodeChangeLog(aGlobalMain.changeSellerCodeAtomic)에 기록되므로
// '오늘/최근 7일 변경분'을 정확히 필터할 수 있다(이미지 추정과 병행).

(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // 저장된 소분류명 / 입력값을 같은 규칙으로 정규화 ("차입고" 제거 + trim)
    const normCategory = s => String(s == null ? '' : s).replace('차입고', '').trim();

    let DOCS = null;   // [{ code, name, img, cat, oldCode, hasSet }]  (SET_ 제외)
    let LOGMAP = null; // newSellerCode -> dateKey (있으면 정확한 변경일)
    let LAST_CHANGED = []; // 현재 화면에 표시된 '변경된' 행들(라벨 프린트 대상)

    // 이미지 URL 경로에서 원래(변경 전) 셀러코드 추출.
    //   .../1688/{입고차수}/{셀러코드}/(option|real)/...  → 두번째 세그먼트가 셀러코드
    function extractOldCodeFromURL(url) {
        if (!url) return null;
        const m = String(url).match(/\/1688\/[^/]+\/([^/]+)\/(?:option|real)\//);
        if (m) return decodeURIComponent(m[1]);
        // real/option 세그먼트가 없는 변형 대비(대표이미지 등): .../1688/{입고차수}/{셀러코드}/...
        const m2 = String(url).match(/\/1688\/[^/]+\/([^/]+)\//);
        return m2 ? decodeURIComponent(m2[1]) : null;
    }

    // 상품의 저장된 이미지 URL들에서 원래 셀러코드를 추출(첫 유효값). 없으면 null.
    function oldCodeOf(data) {
        const od = data.OptionDatas || {};
        for (const k of Object.keys(od)) {
            const code = extractOldCodeFromURL(od[k].옵션이미지URL || od[k].실제이미지URL);
            if (code) return code;
        }
        return extractOldCodeFromURL(data.Cafe24URL); // fallback (대표이미지가 같은 규칙일 때)
    }

    // 메인이미지: Cafe24URL 우선, 없으면 첫 옵션 이미지 (Cafe24URL 비어있는 상품 대비)
    function mainImage(data) {
        if (data.Cafe24URL) return data.Cafe24URL;
        const od = data.OptionDatas || {};
        const first = od['옵션1'] || od[Object.keys(od)[0]] || {};
        return first.옵션이미지URL || first.실제이미지URL || '';
    }

    // 셀러코드 라벨 프린트 — 라벨(용지) 1장당 현재(변경 후) 셀러코드 1개. 세트(SET_)는 프린트하지 않음.
    // 라벨 크기는 mm 입력값(labelW×labelH)에 맞춰 @page 로 지정 → 라벨프린터에 딱 맞게 출력.
    function printLabels(rows) {
        const codes = rows.map(r => r.code).filter(Boolean); // 현재 코드만(세트 제외 — 애초에 r.code에 SET_ 없음)
        if (!codes.length) { alert('프린트할 셀러코드가 없습니다.'); return; }
        const W = Math.max(10, Math.min(200, parseInt($('labelW').value, 10) || 50)); // 가로
        const H = Math.max(10, Math.min(200, parseInt($('labelH').value, 10) || 30)); // 세로

        // 가장 긴 코드가 한 줄에 들어가도록 라벨 폭 기준으로 글자 크기(mm) 산정(모노스페이스 ≈ 0.6em 폭).
        const fitFont = code => {
            const usable = Math.max(5, W - 3);
            const fs = usable / (0.62 * Math.max(code.length, 1));
            return Math.max(2.6, Math.min(9, fs)).toFixed(2);
        };

        const labelsHTML = codes.map(c =>
            `<div class="lbl"><span style="font-size:${fitFont(c)}mm">${esc(c)}</span></div>`
        ).join('');

        const w = window.open('', '_blank');
        if (!w) { alert('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해주세요.'); return; }
        w.document.write(
            '<html><head><meta charset="utf-8"><title>셀러코드 라벨</title><style>' +
            `@page{size:${W}mm ${H}mm;margin:0;}` +
            'html,body{margin:0;padding:0;}' +
            `.lbl{width:${W}mm;height:${H}mm;box-sizing:border-box;padding:1mm;` +
            'display:flex;align-items:center;justify-content:center;text-align:center;' +
            'page-break-after:always;break-after:page;overflow:hidden;}' +
            '.lbl span{font-family:"Consolas","Malgun Gothic",monospace;font-weight:700;' +
            'letter-spacing:-0.2px;line-height:1.05;word-break:break-all;}' +
            '.lbl:last-child{page-break-after:auto;break-after:auto;}' +
            '</style></head><body>' + labelsHTML + '</body></html>'
        );
        w.document.close(); w.focus();
        setTimeout(() => w.print(), 300);
    }

    function render(rows) {
        if (!rows.length) {
            $('result').innerHTML = '<p class="muted">조건에 맞는 제품이 없습니다.</p>';
            return;
        }
        const link = code => `search_by_seller_code.html?sellerCode=${encodeURIComponent(code)}`;
        const changedRows = rows.filter(r => r.changed);
        LAST_CHANGED = changedRows; // 라벨 프린트 대상 보관
        // 세트(SET_) 보유 제품은 세트 코드도 같이 포함. 창고에서 세트 물건은 옛 세트코드(SET_{옛코드})로 찾음.
        const expand = (getCode) => changedRows.flatMap(r => r.hasSet ? [getCode(r), `SET_${getCode(r)}`] : [getCode(r)]);
        const oldAll = expand(r => r.oldCode).join(',');   // 창고 픽리스트(기존 코드 + 세트)
        const newAll = expand(r => r.code).join(',');      // 이동 목적지(현재 코드 + 세트)
        const setCount = changedRows.filter(r => r.hasSet).length;
        const setNote = setCount ? ` (세트 ${setCount}개 포함)` : '';

        const toolbar = changedRows.length ? `<div class="toolbar">
            <button type="button" class="copy-all-btn copy-btn" data-copy="${esc(oldAll)}" title="변경 전 기존 셀러코드 전체 복사(세트 포함, 창고에서 찾을 목록)">📋 기존 셀러코드 ${changedRows.length}개 복사${setNote}</button>
            <button type="button" class="copy-btn" data-copy="${esc(newAll)}" title="현재(새) 셀러코드 전체 복사(세트 포함, 옮겨갈 위치)">현재 셀러코드 ${changedRows.length}개 복사${setNote}</button>
            <button type="button" id="printLabelsBtn" class="copy-all-btn" title="현재(변경 후) 셀러코드를 라벨 1장당 1개씩 프린트 · 세트 제외">🖨️ 셀러코드 라벨 프린트 ${changedRows.length}개</button>
        </div>` : '';

        const body = rows.map(r => {
            const img = r.img
                ? `<a href="${link(r.code)}" target="_blank" rel="noopener"><img src="${esc(r.img)}" alt="${esc(r.code)}" loading="lazy" onerror="tryAlternativeExtension(this)"></a>`
                : '<span class="muted">없음</span>';
            const oldCell = r.changed
                ? `<span class="old-code">${esc(r.oldCode)}</span>` +
                  (r.logDate ? `<span class="badge-log" title="변경 이력 기록됨">${esc(r.logDate)}</span>` : '<span class="badge-guess" title="이미지 URL로 추정(정확한 변경일 없음)">추정</span>') +
                  `<div>${ClipboardUtils.copyButtonsHTML(r.oldCode, r.hasSet)}</div>`
                : '<span class="muted">변경이력 없음</span>';
            return `<tr>
                <td class="col-img">${img}</td>
                <td>${esc(r.name)}</td>
                <td class="col-code">${oldCell}</td>
                <td class="arrow">→</td>
                <td class="col-code new-code"><a href="${link(r.code)}" target="_blank" rel="noopener">${esc(r.code)}</a></td>
                <td class="col-copy">${ClipboardUtils.copyButtonsHTML(r.code, r.hasSet)}</td>
            </tr>`;
        }).join('');

        $('result').innerHTML = toolbar + `<table class="nm-table">
            <thead><tr><th>이미지</th><th>이름</th><th>기존(변경전) 셀러코드</th><th></th><th>현재 셀러코드</th><th>복사</th></tr></thead>
            <tbody>${body}</tbody>
        </table>`;
    }

    function search() {
        if (!DOCS) { $('status').textContent = '아직 로딩 중입니다. 잠시 후 다시 시도하세요.'; return; }
        const cat = normCategory($('categoryInput').value.trim());
        const changedOnly = $('changedOnly').checked;
        const period = $('periodSelect').value;

        // 기간 필터용 경계(로컬 KST 기준 YYYY-MM-DD 문자열 비교)
        const todayKey = new Date().toLocaleDateString('sv-SE');
        const weekAgoKey = new Date(Date.now() - 6 * 86400000).toLocaleDateString('sv-SE');

        let rows = DOCS.filter(d => !cat || d.cat === cat);
        rows = rows.map(d => {
            const changed = !!d.oldCode && d.oldCode !== d.code;
            const logDate = LOGMAP ? (LOGMAP.get(d.code) || null) : null;
            return { ...d, changed, logDate };
        });

        if (changedOnly) rows = rows.filter(r => r.changed);

        // 기간 필터: '오늘/7일'은 이력(logDate)이 있는 변경분에만 적용(이미지 추정은 날짜가 없어 제외)
        if (period === 'today') rows = rows.filter(r => r.logDate === todayKey);
        else if (period === '7d') rows = rows.filter(r => r.logDate && r.logDate >= weekAgoKey);

        rows.sort((a, b) => (a.oldCode || a.code).localeCompare(b.oldCode || b.code, undefined, { numeric: true }));

        const changedCount = rows.filter(r => r.changed).length;
        $('status').textContent = period === 'all'
            ? `${rows.length}건 (변경됨 ${changedCount}건)`
            : `${rows.length}건 (해당 기간 이력 기준)`;
        render(rows);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        $('searchBtn').addEventListener('click', search);
        $('categoryInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
        $('periodSelect').addEventListener('change', search);
        $('changedOnly').addEventListener('change', search);
        ClipboardUtils.bindCopyButtons($('result')); // 복사 버튼(동적 생성) 위임 처리
        $('result').addEventListener('click', e => { // 라벨 프린트 버튼(동적 생성) 위임 처리
            if (e.target.closest('#printLabelsBtn')) printLabels(LAST_CHANGED);
        });
        try {
            $('status').textContent = '상품 데이터 불러오는 중...';
            const [snap, logSnap] = await Promise.all([
                db.collection('Products').get(),
                db.collection('SellerCodeChangeLog').get().catch(() => null), // 이력 없어도 동작
            ]);

            const items = [];
            const setCodes = new Set(); // 존재하는 SET_ 문서 id → 세트 보유 판정용
            snap.forEach(d => {
                if (d.id.startsWith('SET_')) { setCodes.add(d.id); return; }
                const data = d.data();
                items.push({
                    code: d.id,
                    name: data.스토어키워드네임 || data.상품명 || '',
                    img: mainImage(data),
                    cat: normCategory(data.소분류명),
                    oldCode: oldCodeOf(data),
                });
            });
            items.forEach(it => { it.hasSet = setCodes.has('SET_' + it.code); });
            DOCS = items;

            // 변경 이력: 현재(새) 셀러코드 → 가장 최근 변경일(dateKey)
            LOGMAP = new Map();
            if (logSnap) {
                logSnap.forEach(d => {
                    const g = d.data();
                    if (!g.newSellerCode || !g.dateKey) return;
                    const prev = LOGMAP.get(g.newSellerCode);
                    if (!prev || g.dateKey > prev) LOGMAP.set(g.newSellerCode, g.dateKey);
                });
            }

            // 소분류명 자동완성(datalist)
            const cats = [...new Set(items.map(it => it.cat).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
            $('categoryList').innerHTML = cats.map(c => `<option value="${esc(c)}"></option>`).join('');

            const changedTotal = items.filter(it => it.oldCode && it.oldCode !== it.code).length;
            $('status').textContent = `상품 ${DOCS.length.toLocaleString()}건 · 이미지상 변경 감지 ${changedTotal}건 · 이력 ${LOGMAP.size}건 로드 완료`;
            $('categoryInput').focus();
        } catch (e) {
            $('status').textContent = '⚠️ 오류: ' + e.message;
            console.error(e);
        }
    });
})();
