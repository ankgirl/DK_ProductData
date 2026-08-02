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
//
// 🎲 바코드 생성(DK+9자리):
//  - 제조사 바코드가 전 옵션 동일해 옵션 구분이 안 되는 제품용. 우리 번호를 발급해 라벨을 붙인다.
//  - 생성 → GeneratedBarcodes에 먼저 기록(번호 선점) → 기존 저장 경로(saveBarcode)로 그대로 저장.
//    스캔과 완전히 같은 경로라 중복검사·실패 재시도·자동 이동이 전부 그대로 적용된다.
//  - 라벨 인쇄는 admin_generated_barcodes.html 에서(수량만큼).

(function () {
    'use strict';

    const { refineBarcode, validateCountInput, stripCategory, buildBarcodeIndex, isReservedBarcode,
        generateDkBarcode } = window.BarcodeUtils;

    const $ = id => document.getElementById(id);
    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- 상태 ----
    let allDocs = new Map();        // id -> data (본품+세트 전부)
    let barcodeIndex = new Map();   // 바코드 -> [{code, option}] (중복검사용, 본품 옵션만 관리)
    let barcodeInputs = [];         // 화면의 바코드 input들(포커스 순회용, 렌더 순서)
    let generatedSet = new Set();   // 지금까지 발급한 DK 바코드 전체(GeneratedBarcodes) — 재발급 방지 + 🆕 표시
    let genLoadError = null;        // 발급 기록을 못 읽었을 때의 사유. 이 경우 🎲 생성만 막고 스캔 등록은 계속 쓸 수 있게 한다.
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
        const gen = document.querySelectorAll('tr.ib-gen-row').length;
        $('progress').textContent = `바코드 등록: ${done} / ${total}` + (gen ? ` · 🆕 생성 ${gen}건` : '')
            + (genLoadError ? ` · ⚠️ 발급기록을 읽지 못해 🎲 생성이 잠겼습니다 (${genLoadError}) — 스캔 등록은 정상` : '');
        // 생성분이 있으면 라벨 인쇄 링크를 눈에 띄게(수량만큼 뽑는 화면으로 이동)
        const link = $('printLink');
        if (link) {
            link.style.display = gen ? '' : 'none';
            link.textContent = `🖨️ 생성 바코드 기록·라벨 프린트 (${gen}건)`;
        }
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

            const emptyCount = entries.filter(([, ov]) => !String(ov.바코드 || '').trim()).length;
            const genAllBtn = (emptyCount && !genLoadError)
                ? `<button type="button" class="ib-genall" data-code="${esc(code)}" title="이 제품의 빈 옵션 전부에 새 바코드(DK+9자리)를 발급하고 저장합니다. 제조사 바코드가 전 옵션 동일할 때 사용.">🎲 빈 옵션 전체 생성 ${emptyCount}개</button>`
                : '';
            const header = `<tr class="ib-prod-head"><td colspan="9">
                <a href="search_by_seller_code.html?sellerCode=${encodeURIComponent(code)}" target="_blank" rel="noopener">${esc(code)}</a>
                <span class="muted">· ${esc(p.소분류명 || '')} · 옵션 ${entries.length}개${hasSet ? ' · 세트有' : ''}</span>
                ${genAllBtn}
            </td></tr>`;

            const pname = p.스토어키워드네임 || p.상품명 || '';
            const optRows = entries.map(([optKey, ov]) => {
                const rid = ridx++;
                // 저장된 URL이 없는 옛 상품은 즉석 생성(공용 헬퍼) → 이미지가 뜨도록
                const disp = window.ImageUrlUtils.optionImage(p, optKey);
                const label = disp.보여주기용옵션명 || optKey;
                const cnt = num(ov.Counts);
                const existBc = String(ov.바코드 || '').trim();
                const registered = existBc ? '1' : '';
                const isGen = existBc && generatedSet.has(existBc);   // 이전에 우리가 발급한 번호 → 🆕
                const setCell = hasSet
                    ? `<input type="number" class="ib-set" data-code="${esc(code)}" min="0" step="1" inputmode="numeric" value="${setCount}" data-prev="${setCount}">`
                    : `<span class="muted">없음</span>`;
                return `<tr data-code="${esc(code)}" data-option="${esc(optKey)}" data-ridx="${rid}" data-hasset="${hasSet ? '1' : ''}"
                        data-cat="${esc(p.소분류명 || '')}" data-pname="${esc(pname)}"${isGen ? ' class="ib-gen-row"' : ''}>
                    <td class="ib-imgcell"><img src="${esc(disp.옵션이미지URL || '')}" alt="옵션" loading="lazy" onerror="tryAlternativeExtension(this)"></td>
                    <td class="ib-imgcell"><img src="${esc(disp.실제이미지URL || '')}" alt="실제" loading="lazy" onerror="tryAlternativeExtension(this)"></td>
                    <td class="ib-opt">${esc(label)}</td>
                    <td><input type="number" class="ib-count" min="0" step="1" inputmode="numeric" value="${cnt}" data-prev="${cnt}"></td>
                    <td>${setCell}</td>
                    <td class="ib-total">${cnt + setCount}</td>
                    <td class="ib-exist">${isGen ? '<span class="ib-newbadge" title="이 화면에서 발급한 바코드 — 라벨 인쇄 대상">🆕</span>' : ''}${esc(existBc)}</td>
                    <td><div class="ib-bcwrap">
                        <input type="text" class="ib-barcode" data-registered="${registered}" data-current="${esc(existBc)}" placeholder="스캔">
                        ${genLoadError ? '' : '<button type="button" class="ib-gen" title="새 바코드 생성(DK+9자리) — 만들어서 바로 저장합니다">🎲</button>'}
                    </div></td>
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
        bindGenButtons();

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

    // advance=false 면 저장만 하고 포커스를 옮기지 않는다(전체 생성처럼 여러 건을 연속 처리할 때).
    // 반환값: 저장(또는 이미 같은 값이라 생략)에 성공했으면 true.
    async function saveBarcode(inp, advance) {
        const move = advance !== false;
        const raw = inp.value;
        const value = refineBarcode(raw);
        const tr = inp.closest('tr');
        const code = tr.dataset.code;
        const option = tr.dataset.option;
        const statusTd = $qs(tr, '.ib-status');

        if (value === '') { setStatus(statusTd, 'fail', '빈 값'); return false; }

        // 예약(특수 명령) 바코드 등록 금지 — 경고 후 멈춤(저장·이동 안 함).
        //   1111111111/5555555555/9999999999 는 주문처리 명령용이라 상품 바코드로 쓰면 오작동.
        if (isReservedBarcode(value)) {
            setStatus(statusTd, 'dup', '⛔ 예약코드');
            inp.classList.add('ib-invalid');
            alert(`⛔ 예약된 특수 바코드입니다\n\n입력: ${value}\n\n이 값(1111111111 / 5555555555 / 9999999999)은 주문처리 명령용이라\n상품 바코드로 등록할 수 없습니다. 저장하지 않았습니다.`);
            inp.select();
            return false;
        }

        // 중복 검사 — 다른 셀러코드/옵션이 이미 쓰는 바코드면 경고 후 멈춤(저장·이동 안 함).
        const dup = findDuplicate(value, code, option);
        if (dup) {
            setStatus(statusTd, 'dup', '⛔ 중복');
            inp.classList.add('ib-invalid');
            alert(`⛔ 중복 바코드\n\n입력: ${value}\n이미 사용 중: ${dup.code}${dup.option ? ` [${dup.option}]` : ' (본품)'}\n\n저장하지 않았습니다. 바코드를 확인하세요.`);
            inp.select();
            return false;
        }
        inp.classList.remove('ib-invalid');

        const oldBc = inp.dataset.current || '';
        if (value === oldBc) {
            // 이미 같은 값 — 저장 생략하고 이동만(멱등)
            markRegistered(inp, statusTd);
            if (move) advanceFrom(inp);
            return true;
        }

        setStatus(statusTd, 'saving', '저장중…');
        inp.value = value; // 정제된 값으로 표시
        try {
            await saveField(code, ['OptionDatas', option, '바코드'], value);
            reindexBarcode(code, option, oldBc, value);
            inp.dataset.current = value;
            setExistCell(tr, value);                   // 기존바코드 칸 갱신(🆕 배지 유지)
            retry.delete(tr.dataset.ridx);
            markRegistered(inp, statusTd);
            if (move) advanceFrom(inp);
            return true;
        } catch (err) {
            console.error('[바코드 저장 실패]', code, option, err);
            setStatus(statusTd, 'fail', '⚠️ 실패(클릭 재시도)');
            retry.set(tr.dataset.ridx, () => saveBarcode(inp));
            return false;
        }
    }

    // 기존바코드 칸 = (우리가 발급한 값이면) 🆕 + 값
    function setExistCell(tr, value) {
        const td = $qs(tr, '.ib-exist');
        const isGen = value && generatedSet.has(value);
        td.innerHTML = (isGen ? '<span class="ib-newbadge" title="이 화면에서 발급한 바코드 — 라벨 인쇄 대상">🆕</span>' : '') + esc(value || '');
        tr.classList.toggle('ib-gen-row', !!isGen);
    }

    // =========================================================
    // 🎲 바코드 생성 (DK+9자리) — 생성 → 기록(선점) → 기존 저장 경로로 저장
    // =========================================================
    // #result 는 재조회해도 남아 있는 요소라 위임 리스너를 1회만 붙인다(조회할 때마다 붙이면 중복 실행됨).
    function bindGenButtons() {
        const root = $('result');
        if (root.__genBound) return;
        root.__genBound = true;
        root.addEventListener('click', e => {
            const one = e.target.closest('.ib-gen');
            if (one) { generateFor($qs(one.closest('tr'), '.ib-barcode')); return; }
            const all = e.target.closest('.ib-genall');
            if (all) generateAllFor(all.dataset.code, all);
        });
    }

    async function generateFor(inp, advance) {
        const tr = inp.closest('tr');
        const statusTd = $qs(tr, '.ib-status');
        const code = tr.dataset.code, option = tr.dataset.option;
        const btn = $qs(tr, '.ib-gen');
        if (btn) btn.disabled = true;
        try {
            setStatus(statusTd, 'saving', '생성중…');
            // 상품에 쓰이는 값 + 지금까지 발급한 값 모두 피해서 뽑는다
            const value = generateDkBarcode(v => barcodeIndex.has(v) || generatedSet.has(v));
            // 상품에 저장하기 전에 먼저 기록 → 다른 화면/사람이 같은 번호를 뽑지 못하게 선점
            await window.GeneratedBarcodeStore.reserve({
                barcode: value,
                sellerCode: code,
                option,
                소분류명: tr.dataset.cat || '',
                productName: tr.dataset.pname || '',
                count: num($qs(tr, '.ib-total')?.textContent),   // 생성 시점 수량(개별+세트) 스냅샷
                source: '생성',
            });
            generatedSet.add(value);
            inp.value = value;
            const ok = await saveBarcode(inp, advance);          // 스캔과 동일 경로
            updateProgress();
            return ok;
        } catch (e) {
            console.error('[바코드 생성 실패]', code, option, e);
            setStatus(statusTd, 'fail', '⚠️ 생성 실패(클릭 재시도)');
            retry.set(tr.dataset.ridx, () => generateFor(inp, advance));
            alert(`⚠️ 바코드 생성 실패 — 저장하지 않았습니다\n\n${code} [${option}]\n${e.message}`);
            return false;
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // 제품의 빈 옵션 전체에 순차 생성. (제조사 바코드가 전 옵션 동일한 제품용)
    async function generateAllFor(code, btn) {
        const rows = emptyRowsOf(code);
        if (!rows.length) { alert(`${code} — 바코드가 비어 있는 옵션이 없습니다.`); return; }
        if (!confirm(`${code}\n\n빈 옵션 ${rows.length}개에 새 바코드(DK+9자리)를 발급하고 즉시 저장합니다.\n계속할까요?`)) return;

        bulkRunning = true;
        if (btn) btn.disabled = true;
        let ok = 0, fail = 0;
        for (let i = 0; i < rows.length; i++) {
            if (btn) btn.textContent = `🎲 생성중… ${i + 1}/${rows.length}`;
            const done = await generateFor($qs(rows[i], '.ib-barcode'), false);
            done ? ok++ : fail++;
        }
        bulkRunning = false;
        if (btn) btn.disabled = false;
        refreshGenAllBtn(code);      // 남은 수로 갱신(다 채웠으면 버튼 제거)
        updateProgress();
        // 다음 빈 옵션으로 이동(있으면)
        const next = barcodeInputs.find(i => i.dataset.registered !== '1');
        if (next) { next.focus(); next.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        alert(`${code} 바코드 생성 완료\n\n성공 ${ok}건${fail ? `\n실패 ${fail}건 — 해당 행 상태칸을 눌러 재시도하세요.` : ''}`);
    }

    function markRegistered(inp, statusTd) {
        inp.dataset.registered = '1';
        setStatus(statusTd, 'ok', '✅');
        updateProgress();
        refreshGenAllBtn(inp.closest('tr').dataset.code);
    }

    // 제품 헤더의 '빈 옵션 전체 생성 N개' 버튼을 실제 남은 수로 갱신(다 차면 제거).
    // 스캔 등록·생성 어느 쪽으로 채워도 숫자가 실제와 어긋나지 않게 한 곳에서 처리.
    let bulkRunning = false;   // 전체 생성 중에는 이 버튼을 진행률 표시로 쓰므로 건드리지 않는다
    function refreshGenAllBtn(code) {
        if (bulkRunning || !code) return;
        const btn = document.querySelector(`.ib-genall[data-code="${cssEsc(code)}"]`);
        if (!btn) return;
        const left = emptyRowsOf(code).length;
        if (!left) btn.remove();
        else btn.textContent = `🎲 빈 옵션 전체 생성 ${left}개`;
    }

    // 그 제품에서 아직 바코드가 비어 있는 행들
    function emptyRowsOf(code) {
        return Array.from(document.querySelectorAll(`tr[data-code="${cssEsc(code)}"]`))
            .filter(tr => { const i = $qs(tr, '.ib-barcode'); return i && i.dataset.registered !== '1'; });
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
            // 상품 + 발급 기록을 함께 로드(발급 기록은 재발급 방지 + 🆕 표시에 필요).
            // 발급 기록을 못 읽으면 '이미 쓴 번호'를 알 수 없어 재발급 위험 → 생성 기능만 잠그고
            // 스캔 등록/수량 수정은 그대로 쓸 수 있게 한다. (조용히 넘어가지 않고 상단에 사유 표시)
            genLoadError = null;
            const [snap, genMap] = await Promise.all([
                db.collection('Products').get(),
                window.GeneratedBarcodeStore.loadAll().catch(err => {
                    console.error('[발급 기록 로드 실패]', err);
                    genLoadError = err.message || String(err);
                    return new Map();
                }),
            ]);
            allDocs = new Map();
            snap.forEach(doc => allDocs.set(doc.id, doc.data()));
            barcodeIndex = buildBarcodeIndex(allDocs);
            generatedSet = new Set(genMap.keys());
            const link = $('printLink');
            if (link) link.href = `admin_generated_barcodes.html?category=${encodeURIComponent(input)}`;

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
