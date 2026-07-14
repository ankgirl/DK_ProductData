// admin_restock_scan.js — 재입고 스캔 (직원용)
//
// 흐름: 바코드 스캔 → 그 옵션 카드(이미지·옵션명·현재재고) + 수량(기본 10) → 확인 → 재고 반영.
//   · 증가 모드: 현재 Counts + 입력값,  총수량 모드: 입력값으로 교체. (개별 옵션 Counts만, 세트는 안 건드림)
//   · 아이패드 소프트키보드 회피: 바코드칸 inputmode=none(스캐너 입력만 받음), 수량은 화면 숫자패드로.
//   · 기본 10 "예약" 상태 → 첫 숫자 입력 즉시 10이 지워지고 새 값. 안 건드리면 10 저장.
//   · 다음 바코드를 스캔하면 직전 항목이 현재 수량으로 자동 확정된 뒤 새 스캔 시작(연달아 쭉).
//   · 저장은 한 건씩 즉시(FieldPath) → 유실 없음. 늘어난 재고는 네이버에도 반영(실패 무시).
//   · 재입고 이력은 RestockLogs 에 기록 → 날짜별 조회.
//
// 안전(CLAUDE.md): 필드단위 저장(다른 옵션/세트/바코드 불변), 실패 표시, 멱등(재확정 안 됨).

(function () {
    'use strict';

    const { refineBarcode, buildBarcodeIndex } = window.BarcodeUtils;
    const $ = id => document.getElementById(id);
    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const keyOf = (code, option) => code + '|' + option;
    const playDingDong = () => { const s = window.SoundFeedback; if (s) s.playDingDong(); };
    const playError = () => { const s = window.SoundFeedback; if (s) s.playError(); };

    function todayStr(d) {
        d = d || new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // ---- 상태 ----
    let allDocs = new Map();          // id -> data
    let barcodeIndex = new Map();     // 바코드 -> [{code, option}]
    const counts = new Map();         // 'code|option' -> 현재 Counts (실시간 갱신)
    let mode = 'add';                 // 'add' | 'total'
    let current = null;               // {code, option, name, img, before, barcode}
    let qty = '10';
    let primed = true;                // true면 다음 입력 시 기존 값 지우고 새로 시작
    let sessionCount = 0;
    let sid = 0;                      // 세션 목록 행 id

    // ---- Firestore 필드 단위 저장 ----
    function saveField(docId, pathSegments, value) {
        const fp = new firebase.firestore.FieldPath(...pathSegments);
        return db.collection('Products').doc(docId).update(fp, value);
    }

    // =========================================================
    // 로딩
    // =========================================================
    async function loadAll() {
        $('status').textContent = '상품 로딩 중…';
        const snap = await db.collection('Products').get();
        allDocs = new Map();
        counts.clear();
        snap.forEach(doc => {
            const d = doc.data();
            allDocs.set(doc.id, d);
            if (!doc.id.startsWith('SET_')) {
                const od = d.OptionDatas || {};
                for (const k in od) counts.set(keyOf(doc.id, k), num(od[k].Counts));
            }
        });
        barcodeIndex = buildBarcodeIndex(allDocs);
        $('status').textContent = `상품 ${allDocs.size.toLocaleString()}건 로드됨 · 바코드를 스캔하세요`;
    }

    // =========================================================
    // 바코드 해석 (본품 옵션만; 세트/문서레벨/미등록은 오류)
    // =========================================================
    // 최신 재고를 DB에서 직접 읽는다(다른 화면에서 수량을 바꿨어도 정확).
    // 페이지 로드시 스냅샷(counts)에 의존하면 stale → 옛 수량에 더해지는 사고가 나므로 매 스캔 fetch.
    async function resolveBarcode(raw) {
        const v = refineBarcode(raw);
        if (!v) return { error: '빈 값' };
        const arr = barcodeIndex.get(v) || [];
        const base = arr.filter(m => m.option && !m.code.startsWith('SET_'));
        if (!base.length) {
            const setOnly = arr.some(m => m.code.startsWith('SET_'));
            return { value: v, error: setOnly ? '세트 바코드입니다 (재입고 대상 아님)' : '등록된 옵션 바코드가 아닙니다' };
        }
        const uniqueCodes = [...new Set(base.map(m => m.code))];
        const m = base[0];
        // 최신 문서 fetch (실패 시 로드시 캐시로 폴백)
        let data;
        try {
            const snap = await db.collection('Products').doc(m.code).get();
            data = snap.exists ? snap.data() : (allDocs.get(m.code) || {});
        } catch (e) {
            console.warn('[재입고] 최신 재고 조회 실패, 캐시 사용:', e && e.message);
            data = allDocs.get(m.code) || {};
        }
        const ov = (data.OptionDatas || {})[m.option] || {};
        const before = num(ov.Counts);
        counts.set(keyOf(m.code, m.option), before); // 캐시도 최신화
        // 저장된 URL이 없는 옛 상품은 즉석 생성(공용 헬퍼) → 이미지가 뜨도록
        const disp = window.ImageUrlUtils.optionImage(data, m.option);
        return {
            value: v, code: m.code, option: m.option,
            name: disp.보여주기용옵션명 || m.option,
            img: disp.옵션이미지URL || disp.실제이미지URL || '',
            before: before,
            multi: uniqueCodes.length > 1 ? uniqueCodes : null,
        };
    }

    // =========================================================
    // 스캔
    // =========================================================
    async function onScan() {
        const inp = $('barcodeInput');
        const raw = inp.value;
        inp.value = '';
        if (!raw.trim()) return;

        // 직전 미확정 항목을 현재 수량으로 자동 확정(연달아 스캔)
        if (current) await applyCurrent();

        const r = await resolveBarcode(raw);
        if (r.error) {
            playError(); // 땡: 검색 실패/문제
            current = null;
            renderCard();
            $('scanMsg').textContent = `⛔ ${r.error} (${esc(r.value || raw)})`;
            focusBarcode();
            return;
        }
        playDingDong(); // 띵동: 검색 성공
        if (r.multi) console.warn('[재입고] 바코드 다중 셀러코드:', r.value, r.multi);
        current = { code: r.code, option: r.option, name: r.name, img: r.img, before: r.before, barcode: r.value };
        qty = '10'; primed = true;
        $('scanMsg').textContent = r.multi ? `⚠️ 같은 바코드가 여러 셀러코드에 있음 → ${r.code} 사용` : '';
        renderCard();
        focusBarcode();
    }

    // =========================================================
    // 적용 (증가 / 총수량) — Counts 필드만 저장 + 로그 + 네이버
    // =========================================================
    async function applyCurrent() {
        const c = current;
        current = null;               // 재진입/중복확정 방지(멱등)
        if (!c) return;
        const q = parseInt(qty, 10) || 0;
        if (mode === 'add' && q <= 0) { renderCard(); return; } // 더할 게 없음

        // 스캔 시점에 DB에서 직접 읽은 최신값(c.before)을 사용 → 화면에 보인 값 그대로 저장(stale 방지)
        const before = num(c.before);
        const after = mode === 'add' ? before + q : q;
        const added = after - before;

        // 낙관적 UI: 즉시 카운트/세션목록 반영
        counts.set(keyOf(c.code, c.option), after);
        sessionCount++;
        $('sessionCount').textContent = String(sessionCount);
        const rowId = 'sess_' + (++sid);
        prependSessionRow(rowId, c, before, after, added);

        try {
            await saveField(c.code, ['OptionDatas', c.option, 'Counts'], after);
        } catch (e) {
            console.error('[재입고 DB저장 실패]', c.code, c.option, e);
            counts.set(keyOf(c.code, c.option), before); // 롤백
            setRowStatus(rowId, 'fail', '⚠️ 저장실패');
            playError(); // 땡: 저장 문제
            return;
        }
        setRowStatus(rowId, 'ok', '✅ 저장');

        // 이력 기록 (best-effort)
        writeLog(c, before, after, added).catch(e => console.warn('[RestockLog 기록 실패]', e && e.message));

        // 네이버 반영 (best-effort, 실패 무시)
        pushOptionStockToSmartStore(c.code, c.option, after)
            .then(() => setRowStatus(rowId, 'ok', '✅ 저장·네이버'))
            .catch(e => console.warn('[재입고 네이버 전송 실패(무시)]', c.code, c.option, e && e.message));
    }

    function writeLog(c, before, after, added) {
        return db.collection('RestockLogs').add({
            날짜: todayStr(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            sellerCode: c.code,
            option: c.option,
            보여주기용옵션명: c.name,
            옵션이미지URL: c.img || '',
            mode: mode,
            added: added,
            before: before,
            after: after,
            바코드: c.barcode || '',
        });
    }

    // =========================================================
    // 수량 키패드
    // =========================================================
    function tapDigit(d) {
        if (!current) return;
        if (primed) { qty = d; primed = false; }
        else if (qty.length < 5) { qty = (qty === '0') ? d : qty + d; }
        if ((parseInt(qty, 10) || 0) > 10000) qty = '10000';
        renderQty();
    }
    function tapBack() { if (!current) return; qty = qty.length > 1 ? qty.slice(0, -1) : '0'; primed = false; renderQty(); }
    function tapClear() { if (!current) return; qty = '10'; primed = true; renderQty(); }
    function tapConfirm() { if (!current) return; applyCurrent().then(() => { renderCard(); focusBarcode(); }); }

    // =========================================================
    // 렌더링
    // =========================================================
    function renderCard() {
        const box = $('scanCard');
        // 확인 경고: 대기 중이면 빨갛게 깜빡이며 강조
        const warn = $('confirmWarn');
        if (warn) {
            warn.classList.toggle('pending', !!current);
            warn.innerHTML = current
                ? '⚠️ <b>확인 대기 중</b> — 마지막 제품이면 <b>[확인]</b>을 눌러 저장하세요! (다음 바코드를 찍으면 자동 저장됨)'
                : '⚠️ 마지막 제품은 스캔 후 반드시 <b>[확인]</b>을 눌러야 저장됩니다.';
        }
        if (!current) {
            box.className = 'rs-card rs-empty';
            box.innerHTML = '<div class="rs-wait">바코드를 스캔하세요</div>';
            return;
        }
        const c = current;
        const modeLabel = mode === 'add' ? '들어온 수량 (+)' : '총 수량으로 설정';
        box.className = 'rs-card';
        box.innerHTML = `
            <div class="rs-info">
                <img class="rs-img" src="${esc(c.img)}" alt="옵션" onerror="tryAlternativeExtension(this)">
                <div class="rs-meta">
                    <div class="rs-code">${esc(c.code)}</div>
                    <div class="rs-opt">${esc(c.name)}</div>
                    <div class="rs-cur">현재재고 <b>${c.before}</b></div>
                </div>
            </div>
            <div class="rs-qtybox">
                <div class="rs-qtylabel">${modeLabel}</div>
                <div id="qtyDisplay" class="rs-qty ${primed ? 'primed' : ''}">${esc(qty)}</div>
                <div class="rs-preview" id="qtyPreview"></div>
            </div>`;
        renderQty();
    }

    function renderQty() {
        const el = $('qtyDisplay');
        if (!el || !current) return;
        el.textContent = qty;
        el.classList.toggle('primed', primed);
        const q = parseInt(qty, 10) || 0;
        const before = current.before;
        const after = mode === 'add' ? before + q : q;
        const pv = $('qtyPreview');
        if (pv) pv.innerHTML = mode === 'add'
            ? `${before} <span>+ ${q}</span> → <b>${after}</b>`
            : `${before} → <b>${after}</b>`;
    }

    function prependSessionRow(rowId, c, before, after, added) {
        const tbody = $('sessionBody');
        const tr = document.createElement('tr');
        tr.id = rowId;
        const sign = added >= 0 ? '+' + added : String(added);
        tr.innerHTML = `
            <td class="rs-scol-img"><img src="${esc(c.img)}" alt="" onerror="tryAlternativeExtension(this)"></td>
            <td>${esc(c.code)}</td>
            <td>${esc(c.name)}</td>
            <td class="rs-added">${sign}</td>
            <td>${before} → <b>${after}</b></td>
            <td class="rs-status ib-saving">저장중…</td>`;
        tbody.insertBefore(tr, tbody.firstChild);
    }
    function setRowStatus(rowId, kind, text) {
        const tr = $(rowId); if (!tr) return;
        const td = tr.querySelector('.rs-status');
        if (td) { td.className = 'rs-status ib-' + kind; td.textContent = text; }
    }

    function focusBarcode() { const b = $('barcodeInput'); if (b) b.focus(); }

    // =========================================================
    // 날짜별 조회
    // =========================================================
    async function queryByDate() {
        const d = $('dateInput').value;
        if (!d) { $('dateStatus').textContent = '날짜를 선택하세요.'; return; }
        $('dateStatus').textContent = '조회 중…';
        $('dateResult').innerHTML = '';
        try {
            const snap = await db.collection('RestockLogs').where('날짜', '==', d).get();
            const rows = [];
            snap.forEach(doc => rows.push(doc.data()));
            if (!rows.length) { $('dateStatus').textContent = `${d} 재입고 기록 없음`; $('dateResult').innerHTML = ''; return; }

            // 제품(sellerCode) → 옵션(option) 그룹핑
            //  · addedSum = 그날 그 옵션에 추가한 수량 합계(여러 번 스캔 합산)
            //  · logAfter = 그날 마지막 스캔의 after (실제 최종재고 못 구할 때 폴백용)
            const products = new Map();
            for (const r of rows) {
                const code = r.sellerCode || '';
                if (!products.has(code)) products.set(code, new Map());
                const opts = products.get(code);
                const k = r.option || '';
                if (!opts.has(k)) opts.set(k, { key: k, name: r.보여주기용옵션명 || k, img: r.옵션이미지URL || '', addedSum: 0, logAfter: 0, latestTs: -1, scans: 0 });
                const o = opts.get(k);
                o.addedSum += num(r.added);
                o.scans += 1;
                const ts = (r.timestamp && r.timestamp.seconds) || 0;
                if (ts >= o.latestTs) { o.latestTs = ts; o.logAfter = num(r.after); }
                if (!o.img && r.옵션이미지URL) o.img = r.옵션이미지URL;
            }

            // 최종재고는 재입고 로그가 아니라 Products의 '현재 실제 재고'.
            // (재입고 후 판매자코드 페이지 등에서 수량을 바꿨을 수 있으므로 지금 다시 조회)
            const codes = [...products.keys()].sort((a, b) => a.localeCompare(b));
            $('dateStatus').textContent = `${d} · 현재 재고 확인 중…`;
            const liveData = new Map();
            const snaps = await Promise.all(codes.map(c => db.collection('Products').doc(c).get().catch(() => null)));
            snaps.forEach((s, i) => { if (s && s.exists) liveData.set(codes[i], s.data()); });

            const finalOf = (code, o) => {
                const od = (liveData.get(code) || {}).OptionDatas;
                if (od && od[o.key] && typeof od[o.key].Counts !== 'undefined') return { val: num(od[o.key].Counts), live: true };
                return { val: o.logAfter, live: false };
            };

            const totalAdded = rows.reduce((s, r) => s + num(r.added), 0);
            $('dateStatus').textContent = `${d} · 제품 ${products.size}개 · 스캔 ${rows.length}건 · 총 추가수량 ${totalAdded} · 최종재고=현재 실제 재고`;

            $('dateResult').innerHTML = codes.map(code => {
                const opts = [...products.get(code).values()].sort((a, b) => a.name.localeCompare(b.name));
                const prodAdded = opts.reduce((s, o) => s + o.addedSum, 0);
                const optRows = opts.map(o => {
                    const f = finalOf(code, o);
                    const mark = f.live ? '' : '<span class="muted" title="현재 재고를 못 찾아 재입고 기록값을 표시">*</span>';
                    return `<tr>
                    <td class="rs-scol-img"><img src="${esc(o.img)}" alt="" onerror="tryAlternativeExtension(this)"></td>
                    <td>${esc(o.name)}</td>
                    <td class="rs-added">+${o.addedSum}</td>
                    <td class="rs-final"><b>${f.val}</b>${mark}</td>
                    <td class="muted">${o.scans}회</td>
                </tr>`;
                }).join('');
                return `<div class="rs-prodgroup">
                    <div class="rs-prodhead">${esc(code)} <span class="muted">· 옵션 ${opts.length}개 · 오늘 +${prodAdded}</span></div>
                    <table class="rs-table">
                        <thead><tr><th>이미지</th><th>옵션</th><th>오늘 추가</th><th>최종재고</th><th>스캔</th></tr></thead>
                        <tbody>${optRows}</tbody>
                    </table>
                </div>`;
            }).join('');
        } catch (e) {
            console.error(e);
            $('dateStatus').textContent = '⚠️ 오류: ' + e.message;
        }
    }

    // =========================================================
    // 초기화
    // =========================================================
    document.addEventListener('DOMContentLoaded', () => {
        // 아이패드/브라우저 오디오 잠금 해제 (첫 사용자 제스처에서 1회)
        const unlockOnce = () => {
            if (window.SoundFeedback) window.SoundFeedback.unlock();
            document.removeEventListener('pointerdown', unlockOnce);
            document.removeEventListener('keydown', unlockOnce);
        };
        document.addEventListener('pointerdown', unlockOnce);
        document.addEventListener('keydown', unlockOnce);

        // 모드 토글
        document.querySelectorAll('input[name="rsMode"]').forEach(r =>
            r.addEventListener('change', () => { mode = r.value; renderCard(); focusBarcode(); }));

        // 바코드 입력(스캐너) — inputmode=none 이라 소프트키보드 안 뜸
        const b = $('barcodeInput');
        b.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onScan(); } });

        // 키패드 — mousedown preventDefault 로 바코드칸 포커스 유지(스캐너 계속 동작)
        document.querySelectorAll('#keypad button').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault()); // 데스크톱: 포커스 유지
            btn.addEventListener('click', () => {
                const k = btn.dataset.k;
                if (k === 'back') tapBack();
                else if (k === 'clear') tapClear();
                else if (k === 'ok') tapConfirm();
                else tapDigit(k);
                focusBarcode(); // 터치기기: 탭 후 바코드칸 재포커스 → 스캐너 계속 동작
            });
        });

        // 날짜 조회
        $('dateInput').value = todayStr();
        $('dateBtn').addEventListener('click', queryByDate);

        renderCard();
        loadAll().then(focusBarcode).catch(e => { console.error(e); $('status').textContent = '⚠️ 로드 오류: ' + e.message; });
    });
})();
