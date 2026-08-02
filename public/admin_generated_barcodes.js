// admin_generated_barcodes.js — 생성 바코드(DK+9자리) 기록 조회 · 라벨 프린트 (관리자 전용)
//
// 흐름:
//   GeneratedBarcodes(발급 기록) + Products(현재 상태)를 함께 읽어
//   "이 바코드가 지금 어느 제품/옵션에 붙어 있고 수량이 몇 개인지"를 실시간으로 맞춰 보여준다.
//   → 매수는 기록 당시 스냅샷이 아니라 **현재 수량(개별+세트)** 기준. 재고가 바뀌어도 항상 최신.
//
// 설계 원칙(CLAUDE.md):
//  - 바코드 생성 규칙 = barcodeUtils, 라벨 인쇄 = labelPrint, 기록 IO = generatedBarcodeStore.
//    이 파일은 화면 조립만 담당(로직 중복 없음).
//  - 인쇄하면 printCount 를 누적 기록 → 다시 눌러도 값이 어긋나지 않고, 무엇을 몇 장 뽑았는지 남는다.
//  - 상품에서 사라진 기록(미연결)도 숨기지 않고 표시 — 번호 재사용을 막기 위해 기록은 지우지 않는다.

(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const { stripCategory, buildBarcodeIndex } = window.BarcodeUtils;
    const Store = window.GeneratedBarcodeStore;

    // 라벨 크기는 프린터에 물린 용지에 종속 → 브라우저에 기억. 기본값 = 현재 쓰는 라벨(50×30mm).
    const SIZE_KEY = 'dk.labelSize';
    const DEF_W = 50, DEF_H = 30;
    let ROWS = [];                        // 전체 행(필터 전)
    let VIEW = [];                        // 현재 화면에 보이는 행

    // ---- 라벨 크기 ----
    function labelSize() {
        return { W: window.LabelPrint.clampMm($('labelW').value, DEF_W), H: window.LabelPrint.clampMm($('labelH').value, DEF_H) };
    }
    function saveSize() {
        const { W, H } = labelSize();
        try { localStorage.setItem(SIZE_KEY, JSON.stringify({ W, H })); } catch (e) { /* 무시 */ }
        renderPreview();
    }
    function restoreSize() {
        try {
            const s = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
            if (s && s.W && s.H) { $('labelW').value = s.W; $('labelH').value = s.H; }
        } catch (e) { /* 무시 */ }
    }

    // ---- 미리보기 + 모듈 굵기 경고 ----
    const SAMPLE = 'DK819573167';
    function renderPreview() {
        const { W, H } = labelSize();
        const sample = (VIEW.find(r => r.sel) || VIEW[0] || {}).barcode || SAMPLE;
        $('preview').style.width = W + 'mm';
        $('preview').style.height = H + 'mm';
        $('preview').innerHTML = window.LabelPrint.barcodeLabelHTML(sample, W, H)
            .replace('class="lbl lbl-bc"', 'class="lbl"');     // 인쇄용 page-break 클래스는 화면에서 불필요
        const mm = window.LabelPrint.moduleWidthMm(sample, W);
        $('warn').textContent = mm < 0.19
            ? `⚠️ 라벨 폭 ${W}mm 로는 바코드 선이 너무 얇습니다(${mm.toFixed(3)}mm) — 인식 실패 위험. 폭을 넓히세요.`
            : '';
    }

    // ---- 행 만들기 ----
    function buildRows(genMap, allDocs) {
        const barcodeIndex = buildBarcodeIndex(allDocs);
        // 세트 수량: SET_{code}.OptionDatas.옵션1.Counts (제품당 1개, 모든 옵션이 공유 — 입고 화면과 동일 기준)
        const setCount = code => {
            const d = allDocs.get('SET_' + code);
            return d ? Math.max(0, num(((d.OptionDatas || {})['옵션1'] || {}).Counts)) : 0;
        };

        const rows = [];
        genMap.forEach((rec, barcode) => {
            const uses = barcodeIndex.get(barcode) || [];
            const use = uses.find(u => !String(u.code).startsWith('SET_')) || uses[0] || null;
            const data = use ? allDocs.get(use.code) : null;
            const ov = (data && use.option) ? ((data.OptionDatas || {})[use.option] || {}) : {};

            const linked = !!data;
            const code = linked ? use.code : (rec.sellerCode || '');
            const option = linked ? (use.option || '') : (rec.option || '');
            const indiv = linked ? Math.max(0, num(ov.Counts)) : 0;
            const setCnt = linked ? setCount(code) : 0;

            let img = '';
            if (linked && use.option && window.ImageUrlUtils) {
                const disp = window.ImageUrlUtils.optionImage(data, use.option);
                img = disp.옵션이미지URL || disp.실제이미지URL || '';
            }
            const label = (linked && ov.보여주기용옵션명) || option || '';

            rows.push({
                barcode, code, option, label, img, linked,
                cat: stripCategory(linked ? (data.소분류명 || '') : (rec.소분류명 || '')),
                name: (linked ? (data.스토어키워드네임 || data.상품명 || '') : (rec.productName || '')),
                indiv, setCnt,
                qty: indiv + setCnt,                  // 기본 매수 = 개별 + 세트 (입고 화면 '합계'와 동일)
                dateKey: rec.dateKey || '',
                printCount: num(rec.printCount),
                printedDateKey: rec.printedDateKey || '',
                sel: false,
            });
        });

        // 셀러코드 역순(최신 코드가 위) → 같은 제품 안에서는 옵션명 순.
        // 같은 제품 행이 반드시 붙어 있어야 화면에서 제품 단위로 묶어 보여줄 수 있다.
        rows.sort((a, b) =>
            String(b.code).localeCompare(String(a.code), undefined, { numeric: true }) ||
            String(a.label).localeCompare(String(b.label)));
        return rows;
    }

    // ---- 필터 ----
    function applyFilters() {
        const cat = stripCategory($('categoryInput').value.trim());
        const q = $('q').value.trim().toLowerCase();
        const period = $('periodSelect').value;
        const unprinted = $('unprintedOnly').checked;
        const showOrphan = $('showOrphan').checked;

        const todayKey = new Date().toLocaleDateString('sv-SE');
        const weekAgoKey = new Date(Date.now() - 6 * 86400000).toLocaleDateString('sv-SE');

        VIEW = ROWS.filter(r => {
            if (!showOrphan && !r.linked) return false;
            if (cat && r.cat !== cat) return false;
            if (unprinted && r.printCount > 0) return false;
            if (period === 'today' && r.dateKey !== todayKey) return false;
            if (period === '7d' && !(r.dateKey && r.dateKey >= weekAgoKey)) return false;
            if (q) {
                const hay = `${r.barcode} ${r.code} ${r.label} ${r.option} ${r.name}`.toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
        render();
    }

    // ---- 렌더 ----
    function render() {
        if (!VIEW.length) {
            $('result').innerHTML = '<p class="muted">조건에 맞는 기록이 없습니다.</p>';
            updateSelInfo();
            return;
        }
        // 제품(셀러코드)이 바뀔 때마다 헤더줄을 넣고, 블록마다 배경/테두리를 번갈아 줘서 눈으로 구분되게 한다.
        let lastCode = null, g = -1;
        const body = VIEW.map((r, i) => {
            let head = '';
            if (r.code !== lastCode) {
                lastCode = r.code; g++;
                const same = VIEW.filter(x => x.code === r.code);
                const labels = same.reduce((s, x) => s + Math.max(0, num(x.qty)), 0);
                const codeLink = r.linked
                    ? `<a href="search_by_seller_code.html?sellerCode=${encodeURIComponent(r.code)}" target="_blank" rel="noopener">${esc(r.code)}</a>`
                    : `<span class="gb-orphan">${esc(r.code || '(셀러코드 없음)')}</span>`;
                head = `<tr class="gb-prod-head gb-g${g % 2}"><td colspan="10">
                    <label class="chk"><input type="checkbox" class="gsel" data-code="${esc(r.code)}"> </label>
                    ${codeLink}
                    <span class="muted">· ${esc(r.cat)} · ${esc(r.name)} · 바코드 ${same.length}개 · 라벨 ${labels.toLocaleString()}장</span>
                </td></tr>`;
            }
            const badges =
                (r.printCount > 0
                    ? `<span class="badge badge-printed" title="누적 ${r.printCount}장 인쇄 · 최근 ${esc(r.printedDateKey)}">인쇄 ${r.printCount}</span>`
                    : '<span class="badge badge-new">미인쇄</span>') +
                (r.linked ? '' : ' <span class="badge badge-orphan" title="현재 이 바코드를 쓰는 상품이 없습니다(교체됨·삭제됨). 번호 재사용 방지를 위해 기록은 남깁니다.">미연결</span>');
            const img = r.img
                ? `<img src="${esc(r.img)}" alt="" loading="lazy" onerror="tryAlternativeExtension(this)">`
                : '<span class="muted">—</span>';
            return head + `<tr data-i="${i}" class="gb-g${g % 2}">
                <td><input type="checkbox" class="rowsel" ${r.sel ? 'checked' : ''}></td>
                <td>${img}</td>
                <td class="col-code muted">${esc(r.code)}</td>
                <td class="col-opt">${esc(r.label)}</td>
                <td class="col-bc">${esc(r.barcode)}</td>
                <td>${r.linked ? r.indiv : '<span class="muted">—</span>'}</td>
                <td>${r.linked ? (r.setCnt || '<span class="muted">0</span>') : '<span class="muted">—</span>'}</td>
                <td><input type="number" class="qty" min="0" max="2000" step="1" value="${r.qty}"></td>
                <td class="muted">${esc(r.dateKey)}</td>
                <td>${badges}</td>
            </tr>`;
        }).join('');

        $('result').innerHTML = `<table class="gb-table">
            <thead><tr>
                <th style="width:34px"></th><th style="width:66px">이미지</th><th>셀러코드</th><th>옵션명</th>
                <th>바코드</th><th style="width:58px">개별</th><th style="width:58px">세트</th>
                <th style="width:76px">매수</th><th style="width:96px">발급일</th><th style="width:110px">인쇄</th>
            </tr></thead>
            <tbody>${body}</tbody>
        </table>`;
        updateSelInfo();
    }

    function rowOf(el) { return VIEW[Number(el.closest('tr').dataset.i)]; }

    function updateSelInfo() {
        const sel = VIEW.filter(r => r.sel);
        const labels = sel.reduce((s, r) => s + Math.max(0, num(r.qty)), 0);
        $('selInfo').innerHTML = `<b>${sel.length}</b>건 선택 · 라벨 <b>${labels.toLocaleString()}</b>장`;
        $('printBtn').disabled = labels === 0;
        const box = $('selAll');
        box.checked = VIEW.length > 0 && sel.length === VIEW.length;
        box.indeterminate = sel.length > 0 && sel.length < VIEW.length;
        // 제품 헤더줄 체크박스도 그 제품의 선택 상태에 맞춘다(일부만 선택 = 중간표시)
        document.querySelectorAll('.gsel').forEach(cb => {
            const rows = VIEW.filter(r => r.code === cb.dataset.code);
            const n = rows.filter(r => r.sel).length;
            cb.checked = n > 0 && n === rows.length;
            cb.indeterminate = n > 0 && n < rows.length;
        });
        renderPreview();
    }

    // ---- 인쇄 ----
    const labelCache = new Map();   // barcode|W|H -> 라벨 HTML (같은 값 반복 시 SVG 재생성 방지)
    function labelHTML(barcode, W, H) {
        const key = `${barcode}|${W}|${H}`;
        if (!labelCache.has(key)) labelCache.set(key, window.LabelPrint.barcodeLabelHTML(barcode, W, H));
        return labelCache.get(key);
    }

    async function printSelected() {
        const sel = VIEW.filter(r => r.sel && num(r.qty) > 0);
        if (!sel.length) { alert('선택된 항목이 없거나 매수가 모두 0입니다.'); return; }

        const { W, H } = labelSize();
        const total = sel.reduce((s, r) => s + num(r.qty), 0);
        const mm = window.LabelPrint.moduleWidthMm(sel[0].barcode, W);
        if (mm < 0.19 && !confirm(`⚠️ 라벨 폭 ${W}mm 에서는 바코드 선 굵기가 ${mm.toFixed(3)}mm 로 매우 얇아\n스캐너가 못 읽을 수 있습니다.\n\n그래도 인쇄할까요?`)) return;
        if (!confirm(`라벨 ${total.toLocaleString()}장을 인쇄합니다.\n(${sel.length}종 · ${W}×${H}mm)\n\n계속할까요?`)) return;

        const labels = [];
        sel.forEach(r => { const h = labelHTML(r.barcode, W, H); for (let i = 0; i < num(r.qty); i++) labels.push(h); });

        const opened = window.LabelPrint.print({ widthMm: W, heightMm: H, title: '생성 바코드 라벨', labels });
        if (!opened) return;   // 팝업 차단 → 인쇄 안 했으므로 이력도 남기지 않음

        try {
            await Store.markPrinted(sel.map(r => ({ barcode: r.barcode, qty: num(r.qty) })));
            sel.forEach(r => { r.printCount += num(r.qty); r.printedDateKey = Store.todayKey(); });
            render();
            $('status').textContent = `🖨️ ${sel.length}종 · ${total.toLocaleString()}장 인쇄 요청 + 이력 기록 완료`;
        } catch (e) {
            console.error('[인쇄 이력 기록 실패]', e);
            $('status').textContent = '⚠️ 인쇄는 진행됐지만 이력 기록에 실패했습니다: ' + e.message;
        }
    }

    // 테스트 1장 — 스캐너가 읽는지 먼저 확인용(이력에 남기지 않음)
    function printTest() {
        const { W, H } = labelSize();
        const r = VIEW.find(x => x.sel) || VIEW[0];
        const bc = r ? r.barcode : SAMPLE;
        window.LabelPrint.print({ widthMm: W, heightMm: H, title: '라벨 테스트', labels: [labelHTML(bc, W, H)] });
        $('status').textContent = `🧪 테스트 라벨 1장(${bc}) — 스캐너로 읽히는지 확인하세요. (인쇄 이력에는 남기지 않음)`;
    }

    // ---- 이벤트 ----
    document.addEventListener('DOMContentLoaded', async () => {
        restoreSize();
        ['categoryInput', 'q'].forEach(id => $(id).addEventListener('input', applyFilters));
        ['periodSelect', 'unprintedOnly', 'showOrphan'].forEach(id => $(id).addEventListener('change', applyFilters));
        ['labelW', 'labelH'].forEach(id => $(id).addEventListener('change', saveSize));
        $('selAll').addEventListener('change', e => { VIEW.forEach(r => r.sel = e.target.checked); render(); });
        $('printBtn').addEventListener('click', printSelected);
        $('testBtn').addEventListener('click', printTest);
        $('copyBtn').addEventListener('click', async () => {
            const sel = VIEW.filter(r => r.sel);
            if (!sel.length) { alert('선택된 항목이 없습니다.'); return; }
            const ok = await window.ClipboardUtils.copyText(sel.map(r => r.barcode).join(','));
            $('status').textContent = ok ? `📋 바코드 ${sel.length}개 복사됨` : '복사 실패';
        });
        $('result').addEventListener('change', e => {
            if (e.target.classList.contains('gsel')) {           // 제품 단위 전체선택
                const code = e.target.dataset.code;
                VIEW.filter(r => r.code === code).forEach(r => r.sel = e.target.checked);
                render();
            }
            else if (e.target.classList.contains('rowsel')) { rowOf(e.target).sel = e.target.checked; updateSelInfo(); }
            else if (e.target.classList.contains('qty')) {
                const r = rowOf(e.target);
                r.qty = Math.max(0, Math.min(2000, num(e.target.value)));
                e.target.value = r.qty;
                if (r.qty > 0 && !r.sel) { r.sel = true; e.target.closest('tr').querySelector('.rowsel').checked = true; }
                updateSelInfo();
            }
        });

        try {
            $('status').textContent = '불러오는 중…';
            const [genMap, snap] = await Promise.all([Store.loadAll(), db.collection('Products').get()]);
            const allDocs = new Map();
            snap.forEach(d => allDocs.set(d.id, d.data()));
            ROWS = buildRows(genMap, allDocs);

            // 입고차수 자동완성
            const cats = [...new Set(ROWS.map(r => r.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
            $('categoryList').innerHTML = cats.map(c => `<option value="${esc(c)}"></option>`).join('');

            // 신상 입고 화면에서 ?category=71 로 넘어오면 그 차수만
            const qs = new URLSearchParams(location.search);
            if (qs.get('category')) $('categoryInput').value = qs.get('category');

            const unprinted = ROWS.filter(r => !r.printCount).length;
            $('status').textContent = `발급 기록 ${ROWS.length.toLocaleString()}건 · 미인쇄 ${unprinted.toLocaleString()}건`;
            applyFilters();
        } catch (e) {
            console.error(e);
            $('status').textContent = '⚠️ 오류: ' + e.message;
        }
    });
})();
