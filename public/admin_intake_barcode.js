// admin_intake_barcode.js — 신상 입고 일괄 바코드/수량 등록 (관리자 전용)
//
// 흐름:
//   입고차수(예: 71) 입력 → 그 차수 "본품" 전 제품·전 옵션을 한 표로 펼침
//   → 옵션마다 [옵션이미지 · 실제이미지 · 개별수량 · 세트수량 · 합계 · 기존바코드 · 바코드입력 · 상태]
//   → 바코드 스캔(Enter)마다 그 옵션의 '바코드' 필드 하나만 즉시 저장 + 다음 "빈" 옵션으로 자동 포커스
//   → 개별/세트 수량도 실 재고와 다르면 그 자리에서 수정(칸을 벗어나면 즉시 저장), 해당 필드 하나만 갱신
//
// 안전 원칙(CLAUDE.md):
//  - 필드 단위 저장(FieldPath) → Counts/바코드 서로 안 건드림, 다른 옵션도 안 건드림.
//  - 한 건씩 즉시 저장 → 새로고침/이탈해도 이미 찍은 건 DB에 남음(유실 방지). 저장버튼 없음.
//  - 실패는 silent pass 금지 → 상태칸에 ⚠️ 표시 + 클릭 재시도, 포커스 이동 안 함.
//  - 멱등 → 같은 옵션 다시 찍으면 그 값으로 덮어쓸 뿐 중복/오염 없음.
//
// 결정된 정책:
//  - 자동 포커스 이동: "빈(미등록) 옵션만", 제품 경계를 넘어 그 차수 전체를 순회.
//  - 중복 바코드(다른 셀러코드/옵션에 이미 쓰인 값): 경고 후 멈춤(저장·이동 안 함).
//  - 세트(SET_) 상품의 바코드는 이 화면에서 다루지 않음(세트는 수량 합산에만 사용).

(function () {
    'use strict';

    const { refineBarcode, validateCountInput, stripCategory, buildBarcodeIndex, isReservedBarcode } = window.BarcodeUtils;

    const $ = id => document.getElementById(id);
    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- 상태 ----
    let allDocs = new Map();        // id -> data (본품+세트 전부)
    let barcodeIndex = new Map();   // 바코드 -> [{code, option}] (중복검사용, 본품 옵션만 관리)
    let barcodeInputs = [];         // 화면의 바코드 input들(포커스 순회용, 렌더 순서)
    const retry = new Map();        // ridx -> 실패한 DB저장 재시도 함수 (상태칸 클릭 시 실행)

    // 인덱스에서 (code,option)의 옛 바코드 제거 후 새 바코드 등록 (저장 성공 시 호출)
    function reindexBarcode(code, option, oldBc, newBc) {
        const rm = (bc) => {
            const v = String(bc || '').trim();
            if (!v || !barcodeIndex.has(v)) return;
            const arr = barcodeIndex.get(v).filter(e => !(e.code === code && e.option === option));
            if (arr.length) barcodeIndex.set(v, arr); else barcodeIndex.delete(v);
        };
        rm(oldBc);
        const nv = String(newBc || '').trim();
        if (nv) {
            if (!barcodeIndex.has(nv)) barcodeIndex.set(nv, []);
            barcodeIndex.get(nv).push({ code, option });
        }
    }

    // 다른 (code,option)이 이 바코드를 이미 쓰는지 → 첫 충돌 반환(없으면 null)
    function findDuplicate(barcode, selfCode, selfOption) {
        const arr = barcodeIndex.get(String(barcode || '').trim());
        if (!arr) return null;
        return arr.find(e => !(e.code === selfCode && e.option === selfOption)) || null;
    }

    // ---- Firestore 필드 단위 저장 (해당 leaf 하나만; 다른 값 불변) ----
    function saveField(docId, pathSegments, value) {
        const fp = new firebase.firestore.FieldPath(...pathSegments);
        return db.collection('Products').doc(docId).update(fp, value);
    }

    // ---- 옵션 정렬: 보여주기용옵션명 기준(기존 화면과 동일) ----
    function sortedOptionEntries(data) {
        const od = data.OptionDatas || {};
        return Object.entries(od).sort(([ak, av], [bk, bv]) => {
            const a = av.보여주기용옵션명 || ak || '';
            const b = bv.보여주기용옵션명 || bk || '';
            return a.localeCompare(b);
        });
    }

    // ---- 진행 카운터 ----
    function updateProgress() {
        const total = barcodeInputs.length;
        const done = barcodeInputs.filter(inp => inp.dataset.registered === '1').length;
        $('progress').textContent = `바코드 등록: ${done} / ${total}`;
    }

    // ---- 상태칸 표시 ----
    function setStatus(td, kind, text) {
        // kind: saving | ok | fail | dup
        td.className = 'ib-status ib-' + kind;
        td.textContent = text;
    }

    // ---- 합계 갱신 ----
    function recomputeTotal(tr) {
        const cnt = num($qs(tr, '.ib-count')?.value);
        const setInp = $qs(tr, '.ib-set');
        const setVal = setInp ? num(setInp.value) : 0;
        const totalCell = $qs(tr, '.ib-total');
        if (totalCell) totalCell.textContent = cnt + setVal;
    }
    const $qs = (root, sel) => root.querySelector(sel);

    // =========================================================
    // 렌더링
    // =========================================================
    function render(products) {
        barcodeInputs = [];
        let ridx = 0;
        const rowsHTML = products.map(p => {
            const code = p.SellerCode;
            const setDoc = allDocs.get('SET_' + code);
            const hasSet = !!setDoc;
            const setCount = hasSet ? Math.max(0, num(((setDoc.OptionDatas || {})['옵션1'] || {}).Counts)) : 0;
            const entries = sortedOptionEntries(p);

            const header = `<tr class="ib-prod-head"><td colspan="9">
                <a href="search_by_seller_code.html?sellerCode=${encodeURIComponent(code)}" target="_blank" rel="noopener">${esc(code)}</a>
                <span class="muted">· ${esc(p.소분류명 || '')} · 옵션 ${entries.length}개${hasSet ? ' · 세트有' : ''}</span>
            </td></tr>`;

            const optRows = entries.map(([optKey, ov]) => {
                const rid = ridx++;
                // 저장된 URL이 없는 옛 상품은 즉석 생성(공용 헬퍼) → 이미지가 뜨도록
                const disp = window.ImageUrlUtils.optionImage(p, optKey);
                const label = disp.보여주기용옵션명 || optKey;
                const cnt = num(ov.Counts);
                const existBc = String(ov.바코드 || '').trim();
                const registered = existBc ? '1' : '';
                const setCell = hasSet
                    ? `<input type="number" class="ib-set" data-code="${esc(code)}" min="0" step="1" inputmode="numeric" value="${setCount}" data-prev="${setCount}">`
                    : `<span class="muted">없음</span>`;
                return `<tr data-code="${esc(code)}" data-option="${esc(optKey)}" data-ridx="${rid}" data-hasset="${hasSet ? '1' : ''}">
                    <td class="ib-imgcell"><img src="${esc(disp.옵션이미지URL || '')}" alt="옵션" loading="lazy" onerror="tryAlternativeExtension(this)"></td>
                    <td class="ib-imgcell"><img src="${esc(disp.실제이미지URL || '')}" alt="실제" loading="lazy" onerror="tryAlternativeExtension(this)"></td>
                    <td class="ib-opt">${esc(label)}</td>
                    <td><input type="number" class="ib-count" min="0" step="1" inputmode="numeric" value="${cnt}" data-prev="${cnt}"></td>
                    <td>${setCell}</td>
                    <td class="ib-total">${cnt + setCount}</td>
                    <td class="ib-exist">${esc(existBc)}</td>
                    <td><input type="text" class="ib-barcode" data-registered="${registered}" data-current="${esc(existBc)}" placeholder="스캔"></td>
                    <td class="ib-status"></td>
                </tr>`;
            }).join('');

            return header + optRows;
        }).join('');

        $('result').innerHTML = `<table class="ib-table">
            <colgroup>
                <col class="c-img"><col class="c-img"><col class="c-opt">
                <col class="c-cnt"><col class="c-cnt"><col class="c-total">
                <col class="c-exist"><col class="c-bc"><col class="c-status">
            </colgroup>
            <thead><tr>
                <th>옵션이미지</th><th>실제이미지</th><th>옵션명</th>
                <th>개별수량</th><th>세트수량</th><th>합계</th>
                <th>기존바코드</th><th>바코드 입력</th><th>상태</th>
            </tr></thead>
            <tbody>${rowsHTML}</tbody>
        </table>`;

        // 이벤트 바인딩
        barcodeInputs = Array.from(document.querySelectorAll('.ib-barcode'));
        barcodeInputs.forEach((inp, i) => {
            inp.dataset.pos = i;
            inp.addEventListener('keydown', onBarcodeKeydown);
        });
        document.querySelectorAll('.ib-count').forEach(inp => inp.addEventListener('change', onCountChange));
        document.querySelectorAll('.ib-set').forEach(inp => inp.addEventListener('change', onSetChange));
        // 수량칸 실시간 검증(빨간 표시)
        document.querySelectorAll('.ib-count, .ib-set').forEach(inp =>
            inp.addEventListener('input', () => {
                const v = validateCountInput(inp.value);
                inp.classList.toggle('ib-invalid', !v.ok);
                inp.title = v.ok ? '' : v.reason;
            }));
        // 상태칸 클릭 = 실패한 DB저장 재시도 (바코드/개별수량/세트수량 무엇이든)
        document.querySelectorAll('.ib-status').forEach(td =>
            td.addEventListener('click', () => {
                if (!td.classList.contains('ib-fail')) return;
                const fn = retry.get(td.closest('tr').dataset.ridx);
                if (fn) fn();
            }));

        updateProgress();
        // 첫 빈 옵션으로 포커스
        const first = barcodeInputs.find(inp => inp.dataset.registered !== '1');
        if (first) first.focus();
    }

    // =========================================================
    // 바코드 스캔 처리
    // =========================================================
    function onBarcodeKeydown(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        saveBarcode(e.target);
    }

    async function saveBarcode(inp) {
        const raw = inp.value;
        const value = refineBarcode(raw);
        const tr = inp.closest('tr');
        const code = tr.dataset.code;
        const option = tr.dataset.option;
        const statusTd = $qs(tr, '.ib-status');

        if (value === '') { setStatus(statusTd, 'fail', '빈 값'); return; }

        // 예약(특수 명령) 바코드 등록 금지 — 경고 후 멈춤(저장·이동 안 함).
        //   1111111111/5555555555/9999999999 는 주문처리 명령용이라 상품 바코드로 쓰면 오작동.
        if (isReservedBarcode(value)) {
            setStatus(statusTd, 'dup', '⛔ 예약코드');
            inp.classList.add('ib-invalid');
            alert(`⛔ 예약된 특수 바코드입니다\n\n입력: ${value}\n\n이 값(1111111111 / 5555555555 / 9999999999)은 주문처리 명령용이라\n상품 바코드로 등록할 수 없습니다. 저장하지 않았습니다.`);
            inp.select();
            return;
        }

        // 중복 검사 — 다른 셀러코드/옵션이 이미 쓰는 바코드면 경고 후 멈춤(저장·이동 안 함).
        const dup = findDuplicate(value, code, option);
        if (dup) {
            setStatus(statusTd, 'dup', '⛔ 중복');
            inp.classList.add('ib-invalid');
            alert(`⛔ 중복 바코드\n\n입력: ${value}\n이미 사용 중: ${dup.code}${dup.option ? ` [${dup.option}]` : ' (본품)'}\n\n저장하지 않았습니다. 바코드를 확인하세요.`);
            inp.select();
            return;
        }
        inp.classList.remove('ib-invalid');

        const oldBc = inp.dataset.current || '';
        if (value === oldBc) {
            // 이미 같은 값 — 저장 생략하고 이동만(멱등)
            markRegistered(inp, statusTd);
            advanceFrom(inp);
            return;
        }

        setStatus(statusTd, 'saving', '저장중…');
        inp.value = value; // 정제된 값으로 표시
        try {
            await saveField(code, ['OptionDatas', option, '바코드'], value);
            reindexBarcode(code, option, oldBc, value);
            inp.dataset.current = value;
            $qs(tr, '.ib-exist').textContent = value;   // 기존바코드 칸 갱신
            retry.delete(tr.dataset.ridx);
            markRegistered(inp, statusTd);
            advanceFrom(inp);
        } catch (err) {
            console.error('[바코드 저장 실패]', code, option, err);
            setStatus(statusTd, 'fail', '⚠️ 실패(클릭 재시도)');
            retry.set(tr.dataset.ridx, () => saveBarcode(inp));
        }
    }

    function markRegistered(inp, statusTd) {
        inp.dataset.registered = '1';
        setStatus(statusTd, 'ok', '✅');
        updateProgress();
    }

    // "빈(미등록) 옵션만" 순회하며 다음 포커스 대상 찾기 (제품 경계 넘어 전체, 끝나면 앞으로 wrap)
    function advanceFrom(inp) {
        const start = Number(inp.dataset.pos);
        const n = barcodeInputs.length;
        for (let step = 1; step <= n; step++) {
            const cand = barcodeInputs[(start + step) % n];
            if (cand.dataset.registered !== '1') { cand.focus(); cand.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
        }
        // 남은 빈 옵션 없음 → 완료
        inp.blur();
        $('progress').textContent += ' · ✅ 모두 등록 완료';
    }

    // =========================================================
    // 수량 수정 (개별 / 세트) — 필드 하나만 저장
    // =========================================================
    // 개별수량: 입력 검증 → Firestore 저장 → (성공 시) 네이버에 그 옵션만 반영.
    // 네이버 전송은 best-effort로 실패 응답은 무시(콘솔 경고만) — 미등록 신상 등.
    async function onCountChange(e) {
        const inp = e.target;
        const tr = inp.closest('tr');
        const statusTd = $qs(tr, '.ib-status');
        const prev = inp.dataset.prev;

        const v = validateCountInput(inp.value);
        if (!v.ok || v.value === null) {
            alert(`⚠️ 개별수량 입력 오류 — 저장하지 않았습니다\n\n입력값: ${inp.value}\n사유: ${v.ok ? '빈 값' : v.reason}`);
            inp.value = prev; inp.classList.remove('ib-invalid'); return;
        }
        if (String(v.value) === String(prev)) return; // 변화 없음
        await saveCount(tr, statusTd, tr.dataset.code, tr.dataset.option, v.value);
    }

    async function saveCount(tr, statusTd, code, option, value) {
        setStatus(statusTd, 'saving', '수량 저장중…');
        try {
            await saveField(code, ['OptionDatas', option, 'Counts'], value);
        } catch (err) {
            console.error('[개별수량 DB저장 실패]', code, option, err);
            setStatus(statusTd, 'fail', '⚠️ 수량 저장 실패(클릭 재시도)');
            retry.set(tr.dataset.ridx, () => saveCount(tr, statusTd, code, option, value));
            return;
        }
        $qs(tr, '.ib-count').dataset.prev = String(value);
        recomputeTotal(tr);
        retry.delete(tr.dataset.ridx);
        setStatus(statusTd, 'ok', '✅ 수량');
        // 네이버 반영 (best-effort, 실패 무시)
        pushOptionStockToSmartStore(code, option, value)
            .then(() => setStatus(statusTd, 'ok', '✅ 수량·네이버'))
            .catch(err => console.warn('[개별수량 네이버 전송 실패(무시)]', code, option, err && err.message));
    }

    // 세트수량은 SET_{code}.OptionDatas.옵션1.Counts (제품당 1개, 모든 옵션 행이 공유)
    async function onSetChange(e) {
        const inp = e.target;
        const tr = inp.closest('tr');
        const statusTd = $qs(tr, '.ib-status');
        const prev = inp.dataset.prev;

        const v = validateCountInput(inp.value);
        if (!v.ok || v.value === null) {
            alert(`⚠️ 세트수량 입력 오류 — 저장하지 않았습니다\n\n입력값: ${inp.value}\n사유: ${v.ok ? '빈 값' : v.reason}`);
            inp.value = prev; inp.classList.remove('ib-invalid'); return;
        }
        if (String(v.value) === String(prev)) return;
        await saveSet(tr, statusTd, tr.dataset.code, v.value);
    }

    async function saveSet(tr, statusTd, code, value) {
        setStatus(statusTd, 'saving', '세트 저장중…');
        try {
            await saveField('SET_' + code, ['OptionDatas', '옵션1', 'Counts'], value);
        } catch (err) {
            console.error('[세트수량 DB저장 실패]', code, err);
            setStatus(statusTd, 'fail', '⚠️ 세트 저장 실패(클릭 재시도)');
            retry.set(tr.dataset.ridx, () => saveSet(tr, statusTd, code, value));
            return;
        }
        // 같은 제품의 모든 세트 input 동기화 + 합계 재계산 + 캐시 갱신
        document.querySelectorAll(`.ib-set[data-code="${cssEsc(code)}"]`).forEach(si => {
            si.value = value; si.dataset.prev = String(value);
            recomputeTotal(si.closest('tr'));
        });
        const sd = allDocs.get('SET_' + code);
        if (sd && sd.OptionDatas && sd.OptionDatas['옵션1']) sd.OptionDatas['옵션1'].Counts = value;
        retry.delete(tr.dataset.ridx);
        setStatus(statusTd, 'ok', '✅ 세트');
        // 네이버 반영 (best-effort, 실패 무시)
        pushSetStockToSmartStore(code, value)
            .then(() => setStatus(statusTd, 'ok', '✅ 세트·네이버'))
            .catch(err => console.warn('[세트수량 네이버 전송 실패(무시)]', code, err && err.message));
    }

    // CSS 선택자용 이스케이프(셀러코드에 특수문자 대비)
    function cssEsc(s) {
        return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\\]]/g, '\\$&');
    }

    // =========================================================
    // 조회
    // =========================================================
    async function run() {
        const input = $('categoryInput').value.trim();
        if (!input) { $('status').textContent = '입고차수를 입력하세요. (예: 71)'; return; }
        $('status').textContent = '전체 상품 로딩 중…';
        $('result').innerHTML = '';
        $('progress').textContent = '';
        try {
            const snap = await db.collection('Products').get();
            allDocs = new Map();
            snap.forEach(doc => allDocs.set(doc.id, doc.data()));
            barcodeIndex = buildBarcodeIndex(allDocs);

            // 본품(SET_ 아님) 중 stripCategory(소분류명) === 입력값
            const products = [];
            for (const [id, data] of allDocs) {
                if (id.startsWith('SET_')) continue;
                if (stripCategory(data.소분류명) === input) products.push({ ...data, SellerCode: data.SellerCode || id });
            }
            products.sort((a, b) => String(a.SellerCode).localeCompare(String(b.SellerCode)));

            if (!products.length) {
                $('status').textContent = `'${input}차' 본품이 없습니다.`;
                return;
            }
            const optCount = products.reduce((s, p) => s + Object.keys(p.OptionDatas || {}).length, 0);
            $('status').textContent = `${input}차 · 제품 ${products.length}개 · 옵션 ${optCount}개`;
            render(products);
        } catch (e) {
            console.error(e);
            $('status').textContent = '⚠️ 오류: ' + e.message;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('loadBtn').addEventListener('click', run);
        $('categoryInput').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); run(); }
        });
        $('categoryInput').focus();
    });
})();
