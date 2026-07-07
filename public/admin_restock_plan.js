// admin_restock_plan.js — 품절 보정 재입고 계획 (읽기 전용 분석)
//
// 모델: "율(rate) 기반 소진 대체". 분석기간의 소진을 '커버기간(기본 2주)당' 율로 환산해 되채운다.
//   발주 = (커버기간당 소진, 품절보정) × 안전계수 × 원가.
//   → 분석기간을 길게 잡아도 '율'이라 발주 금액이 커지지 않음(평균만 안정화).
//
// 품절 보정(+캡): 판매율을 '전체 일수'가 아니라 '재고 있던 날수'로 나눠 재고 있을 때 속도를 반영.
//   rateTotal  = 총판매 / 분석일수                 (품절 0 포함 → 눌린 값)
//   재고보유일 = (현재 품절 & 판매≥MIN) 이면 관측 판매구간(첫 판매~마지막 판매)으로 근사, 그 뒤는 품절기간.
//              그 외(재고 남음 or 판매 미미)는 분석일수 전체 → 보정 없음.
//   rateActive = 총판매 / 재고보유일
//   판매율/일   = min(rateActive, rateTotal × 상한)   (상한으로 과잉발주 방지)
//   → 신상 당일완판(1/19 입고 당일 10개)은 구간=1일 → 초고속으로 잡힘. "오래 남던 재고 마지막 1개"는
//     1개라 MIN 미달로 보정 안 됨. 재고 남은 상품은 애초에 보정 안 함.
//     ※ 정확한 재고보유일은 일일 StockSnapshots(수집 중)로 실측 → 앞으로는 근사 아닌 실측.
//
// 스냅샷(정확모드): StockSnapshots로 분석기간 '재고 있던 날수'를 실측하면 그걸로 나눔(근사보다 정확).
// 소진 = 판매 + 서비스(사은품). 현재고는 빼지 않음(빠진 만큼 되채움) → '재고여유'로만 참고 표시.
// 분석기간 중 판매 0 품목은 완전 제외(금액 미포함).
// 재입고 추천 제외(단종 등): AdminConfig/restockPause. 표의 🚫로 토글, 복원 가능.

(function () {
    'use strict';

    const DAY = 86400000;
    const TABLE_CAP = 400;
    const MIN_SOLD_UPLIFT = 2; // 품절 보정 적용 최소 판매수량(1개=마지막 재고 소진 등 표본부족 → 보정 안 함)
    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const cnt = n => Math.round(num(n)).toLocaleString('ko-KR');
    const won = n => Math.round(num(n)).toLocaleString('ko-KR') + '원';
    const classifyRoom = b => (b || '').startsWith('room_') ? '방꾸미기' : '다꾸';
    const baseOf = sc => (sc && sc.startsWith('SET_')) ? sc.slice(4) : (sc || '');
    const $ = id => document.getElementById(id);
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const pad2 = n => String(n).padStart(2, '0');
    const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

    let STOCK = null;
    let ORDERS = [];
    let SNAPS = [];
    let EXCLUDE = new Set();
    let PAUSE = new Set();
    let LOADED_FROM = Infinity;
    let lastRows = [], lastCat = null, lastSafety = 1.3, lastNewPct = 0, lastCover = 2;
    let CHECKED = new Set(); // 복사 대상 체크된 셀러코드
    let sortKey = 'adjKRW', sortDir = 'desc';
    let busy = false;

    // ---------- 로드 ----------
    async function loadSet(docId) {
        const s = await db.collection('AdminConfig').doc(docId).get();
        return new Set(s.exists ? (s.data().sellerCodes || []) : []);
    }
    async function savePause() {
        await db.collection('AdminConfig').doc('restockPause').set({ sellerCodes: [...PAUSE] });
    }
    async function loadStock() {
        const snap = await db.collection('Products').get();
        const m = new Map(); const sets = [];
        snap.forEach(d => {
            const id = d.id, data = d.data();
            if (id.startsWith('SET_')) { sets.push({ id, data }); return; }
            const od = data.OptionDatas || {};
            let q = 0, n = 0; for (const k in od) { q += num(od[k].Counts); n++; }
            const optN = (data.GroupOptions || '').split(',').map(s => s.trim()).filter(Boolean).length || n;
            m.set(id, {
                baseQty: q, setQty: 0, optN, cost: num(data.원가),
                name: data.상품명 || '', cls: classifyRoom(id),
                img: data.Cafe24URL || data.대표이미지 || data.ImageURL || '',
                shopUrl: data.ShopURL || ''
            });
        });
        for (const { id, data } of sets) {
            const info = m.get(id.slice(4)); if (!info) continue;
            const opt1 = (data.OptionDatas || {})['옵션1'] || {};
            info.setQty += Math.max(0, num(opt1.Counts)) * info.optN;
        }
        for (const info of m.values()) info.onhand = info.baseQty + info.setQty;
        return m;
    }
    async function loadOrders(fromDate) {
        const snap = await db.collection('CompletedOrders').where('주문처리날짜', '>=', fromDate).get();
        const arr = [];
        snap.forEach(doc => {
            const o = doc.data(); const dt = o.주문처리날짜; if (!dt) return;
            const date = dt.toDate ? dt.toDate() : new Date(dt);
            const items = [];
            const po = o.ProductOrders || {};
            for (const k in po) items.push({ base: baseOf(po[k].SellerCode || ''), qty: num(po[k].상품수량) });
            const svc = [];
            const ps = o.ProductService;
            if (Array.isArray(ps)) ps.forEach(s => { const b = baseOf(s.SellerCode || ''); if (b) svc.push({ base: b }); });
            arr.push({ date, items, svc });
        });
        return arr;
    }
    async function loadSnaps(fromStr) {
        try {
            const snap = await db.collection('StockSnapshots').where('날짜', '>=', fromStr).get();
            const arr = [];
            snap.forEach(doc => { const o = doc.data(); if (o && o.날짜) arr.push({ d: o.날짜, stock: o.재고 || {} }); });
            return arr;
        } catch (e) { console.warn('[StockSnapshots] 로드 생략:', e.message); return []; }
    }
    async function ensureLoaded(neededMs) {
        if (neededMs >= LOADED_FROM) return;
        const from = new Date(neededMs); from.setDate(from.getDate() - 3);
        $('status').textContent = `주문/재고 데이터 불러오는 중... (${dstr(from)} ~)`;
        const [orders, snaps] = await Promise.all([loadOrders(from), loadSnaps(dstr(from))]);
        ORDERS = orders; SNAPS = snaps; LOADED_FROM = +from;
        const mode = SNAPS.length ? `재고스냅샷 ${SNAPS.length}일치(정확모드 가능)` : '재고스냅샷 없음 → 추정모드';
        $('status').textContent = `본품 ${STOCK.size.toLocaleString()}건 · 주문 ${ORDERS.length.toLocaleString()}건 · ${mode}`;
    }

    // ---------- 메인 계산 ----------
    async function compute() {
        if (busy) return; busy = true;
        try {
            const aStartV = $('analysisStart').value, aEndV = $('analysisEnd').value;
            const coverWeeks = Math.max(0.5, num($('coverWeeks').value) || 2);
            const safety = Math.max(1, num($('safety').value) || 1.3);
            const cap = Math.max(1, num($('cap').value) || 3);
            const newPct = Math.max(0, num($('newPct').value));

            const today = new Date(); today.setHours(0, 0, 0, 0);
            const lookStart = aStartV ? new Date(aStartV + 'T00:00:00') : new Date(today.getTime() - 14 * DAY);
            const lookEndExcl = new Date((aEndV ? new Date(aEndV + 'T00:00:00') : today).getTime() + DAY);
            if (+lookEndExcl <= +lookStart) {
                $('warnBox').innerHTML = '<div class="rp-note">⚠️ 분석 시작일이 끝일보다 늦습니다. 날짜를 확인하세요.</div>';
                $('catCards').innerHTML = ''; $('result').innerHTML = ''; $('summary').innerHTML = ''; return;
            }
            const rangeDays = Math.round((+lookEndExcl - +lookStart) / DAY);
            const cycleDays = coverWeeks * 7;
            await ensureLoaded(+lookStart);

            $('warnBox').innerHTML = '';
            $('periodInfo').innerHTML =
                `분석기간 <strong>${dstr(lookStart)} ~ ${dstr(new Date(lookEndExcl - DAY))}</strong>(${rangeDays}일, 판매 0 품목 제외) `
                + `· 발주 커버 <strong>${coverWeeks}주</strong> · 안전계수 ${safety} · 상한 ×${cap}`;

            // 분석기간 내 품목별 판매(일별) + 서비스 집계
            const ls = +lookStart, le = +lookEndExcl;
            const agg = new Map(); // base -> {sold, service, days:Set}
            const getA = b => { let a = agg.get(b); if (!a) { a = { sold: 0, service: 0, days: new Set(), firstDay: Infinity, lastDay: -1 }; agg.set(b, a); } return a; };
            for (const o of ORDERS) {
                const t = +o.date; if (t < ls || t >= le) continue;
                const dk = Math.floor((t - ls) / DAY);
                for (const it of o.items) { if (!it.base || it.qty <= 0) continue; const a = getA(it.base); a.sold += it.qty; a.days.add(dk); if (dk > a.lastDay) a.lastDay = dk; if (dk < a.firstDay) a.firstDay = dk; }
                for (const s of o.svc) { if (!s.base) continue; getA(s.base).service += 1; }
            }

            // 스냅샷: 분석기간 내 품목별 재고>0 일수 비율
            const stockDays = new Map(); // base -> {inStock, snaps}
            const lsStr = dstr(lookStart), leStr = dstr(lookEndExcl);
            for (const s of SNAPS) {
                if (s.d < lsStr || s.d >= leStr) continue;
                for (const b in s.stock) {
                    let x = stockDays.get(b); if (!x) { x = { inStock: 0, snaps: 0 }; stockDays.set(b, x); }
                    x.snaps++; if (num(s.stock[b]) > 0) x.inStock++;
                }
            }
            const snapMinCover = Math.max(3, Math.floor(rangeDays * 0.5));

            const rows = [];
            for (const [base, info] of STOCK) {
                if (EXCLUDE.has(base)) continue;          // 판매중지/가상 → 완전 제외
                const a = agg.get(base);
                const sold = a ? a.sold : 0;
                if (sold <= 0) continue;                  // 분석기간 판매 0 → 완전 제외
                const paused = PAUSE.has(base);           // 🚫 추천 제외 → 표엔 보이되 예산에서만 뺌
                const activeDays = a ? a.days.size : 0;
                const service = a ? a.service : 0;

                const rateTotal = sold / rangeDays;
                // 품절 보정: "재고 있던 날수"로 나눠 재고 있을 때 속도를 반영.
                //  · 정확: 스냅샷의 실제 재고보유일(날마다 재고>0 였던 날수).
                //  · 추정: 현재 품절(onhand≤0)·판매 유의미(≥MIN)한 것만, 관측된 판매구간(첫 판매~마지막 판매)을
                //          재고보유일로 근사. 그 뒤는 품절기간. → 신상 당일완판(C)은 구간=1일이라 초고속으로 잡힘,
                //          "오래 남던 재고 마지막 1개"는 1개라 MIN 미달로 보정 안 됨.
                //  · 그 외(재고 남음 or 판매 미미): 보정 없음(rateTotal 그대로).
                let inStockDays, method = 'est';
                const sd = stockDays.get(base);
                if (sd && sd.snaps >= snapMinCover && sold >= MIN_SOLD_UPLIFT) {
                    inStockDays = Math.max(1, (sd.inStock / sd.snaps) * rangeDays); method = 'exact';
                } else if (info.onhand <= 0 && sold >= MIN_SOLD_UPLIFT) {
                    inStockDays = Math.max(1, a.lastDay - a.firstDay + 1); // 첫 판매~마지막 판매 구간 = 재고보유 근사
                } else {
                    inStockDays = rangeDays; // 재고 남음 or 판매 미미 → 보정 없음
                }
                const rateActive = sold / inStockDays;
                const ratePerDay = Math.min(rateActive, rateTotal * cap); // 상한 캡
                const U = rateTotal > 0 ? ratePerDay / rateTotal : 1;
                let note = '';
                if (method === 'exact') note = '재고일수 실측';
                else if (U > 1.05) note = (ratePerDay >= rateTotal * cap - 1e-9) ? '품절추정·상한' : '품절추정';

                const salesCycle = ratePerDay * cycleDays;              // 커버기간 판매수요(품절보정)
                const serviceCycle = (service / rangeDays) * cycleDays; // 커버기간 서비스 소진
                const adjConsumed = salesCycle + serviceCycle;
                if (adjConsumed <= 0) continue;
                const basicCycle = rateTotal * cycleDays + serviceCycle; // 품절보정 전 소진

                const cost = info.cost;
                const reorderAdjQty = Math.ceil(adjConsumed * safety);
                const reorderBasicQty = Math.ceil(basicCycle * safety);
                const soldKRW = rateTotal * cycleDays * cost;                       // 커버기간 환산 실판매(원가)
                const unsoldKRW = Math.max(0, ratePerDay - rateTotal) * cycleDays * cost; // 품절로 못 판 추정(원가)
                const serviceKRW = serviceCycle * cost;
                const adjConsumedKRW = adjConsumed * cost;
                const recCycle = adjConsumed * safety;
                const cover = recCycle > 0 ? info.onhand / recCycle : 0;
                rows.push({
                    base, name: info.name, img: info.img, cls: info.cls, shopUrl: info.shopUrl,
                    sold, activeDays, inStockDays, rangeDays, service, U, method, note,
                    onhand: info.onhand, baseQty: info.baseQty, setQty: info.setQty,
                    cost, noCost: cost <= 0,
                    soldKRW, unsoldKRW, serviceKRW, adjConsumedKRW, onhandKRW: info.onhand * cost,
                    reorderAdjQty, reorderBasicQty,
                    adjKRW: reorderAdjQty * cost, basicKRW: reorderBasicQty * cost,
                    cover, overstock: cover >= 1, paused
                });
            }

            const cat = {};
            for (const cls of ['방꾸미기', '다꾸']) {
                const r = rows.filter(x => x.cls === cls && !x.paused); // 제외(단종)는 예산 집계에서 뺌
                const sum = f => r.reduce((s, x) => s + f(x), 0);
                cat[cls] = {
                    soldKRW: sum(x => x.soldKRW), unsoldKRW: sum(x => x.unsoldKRW),
                    serviceKRW: sum(x => x.serviceKRW), adjConsumedKRW: sum(x => x.adjConsumedKRW),
                    onhandKRW: sum(x => x.onhandKRW), adjBudget: sum(x => x.adjKRW), basicBudget: sum(x => x.basicKRW),
                    adjBudgetExcl: sum(x => x.overstock ? 0 : x.adjKRW),
                    reQty: sum(x => x.reorderAdjQty), items: r.length,
                    overstockItems: r.filter(x => x.overstock).length, noCost: r.some(x => x.noCost),
                };
            }
            lastCat = cat; lastSafety = safety; lastNewPct = newPct; lastCover = coverWeeks;
            render(rows);
        } catch (e) {
            $('status').textContent = '⚠️ 계산 오류: ' + e.message; console.error(e);
        } finally { busy = false; }
    }

    // ---------- 렌더 ----------
    function catCard(cls, klass) {
        const a = lastCat[cls];
        const withNew = a.adjBudget * (1 + lastNewPct / 100);
        return `<div class="cat-card ${klass}">
            <h2>${cls}</h2>
            <div class="amt-label">권장 발주 · ${lastCover}주 커버 (원가, 안전계수 ×${lastSafety})</div>
            <div class="amt">${won(a.adjBudget)}</div>
            ${lastNewPct > 0 ? `<div class="line"><span>+ 신상 여유 ${lastNewPct}% 포함</span><b>${won(withNew)}</b></div>` : ''}
            <hr class="cc-hr">
            <div class="line"><span>판매 소진 (원가)</span><span>${won(a.soldKRW)}</span></div>
            <div class="line"><span>품절로 못 판 추정 (원가)</span><span class="uplift">+${won(a.unsoldKRW)}</span></div>
            <div class="line"><span>서비스 출고 (원가)</span><span>+${won(a.serviceKRW)}</span></div>
            <div class="line"><span>= 총 소진 (품절보정)</span><b>${won(a.adjConsumedKRW)}</b></div>
            <hr class="cc-hr">
            <div class="line muted2"><span>권장 발주 수량</span><span>${cnt(a.reQty)}개 · ${a.items}품목</span></div>
            <div class="line muted2"><span>참고: 현재고 (원가)</span><span>${won(a.onhandKRW)}</span></div>
            <div class="line muted2"><span>재고 여유 많은 품목 제외 시</span><span>${won(a.adjBudgetExcl)}${a.overstockItems ? ` (${a.overstockItems}품목 제외)` : ''}</span></div>
            ${a.noCost ? '<div class="line"><span class="tag warn">원가미입력 품목 있음 → 금액 과소</span></div>' : ''}
        </div>`;
    }
    function render(rows) {
        lastRows = rows;
        // 기본 체크 = 실제 발주 대상(제외 아님 · 재고여유 적음). 재계산 때마다 초기화.
        CHECKED = new Set(rows.filter(r => !r.paused && !r.overstock).map(r => r.base));
        $('catCards').innerHTML = catCard('방꾸미기', 'room') + catCard('다꾸', 'daku');
        renderPausePanel();
        renderTable();
    }
    function sortRows(rows) {
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const x = a[sortKey], y = b[sortKey];
            if (typeof x === 'string') return String(x).localeCompare(String(y)) * dir;
            return (x - y) * dir;
        });
    }
    function renderPausePanel() {
        const codes = [...PAUSE].sort();
        $('pausePanel').innerHTML = `<details>
            <summary class="muted">🚫 재입고 추천 제외(단종·거래처 재고없음) <strong>${codes.length}건</strong> — 클릭하여 관리</summary>
            <div class="pause-list">${codes.length
                ? codes.map(c => `<span class="pause-chip">${c}<a href="#" class="restore" data-c="${c}" title="다시 추천에 포함">↩︎복원</a></span>`).join('')
                : '<span class="muted">제외된 품목 없음. 표에서 🚫 버튼으로 추가하세요.</span>'}</div>
        </details>`;
        document.querySelectorAll('.restore').forEach(el => {
            el.onclick = async e => { e.preventDefault(); if (busy) return; PAUSE.delete(el.dataset.c); await savePause(); await compute(); };
        });
    }
    function copyLabel() { return `선택 복사 (${CHECKED.size}개)`; }
    function renderTable() {
        const hideOver = $('showAll') && $('showAll').checked;
        // 재고여유 많은 품목 숨기기(체크 시). 단, 제외(단종) 표시 항목은 항상 보여줌.
        const visible = sortRows(lastRows.filter(r => r.paused || !(hideOver && r.overstock)));
        const shown = visible.slice(0, TABLE_CAP);
        const truncated = visible.length - shown.length;
        const activeRows = lastRows.filter(r => !r.paused);
        const overCnt = activeRows.filter(r => r.overstock).length;
        const pausedCnt = lastRows.length - activeRows.length;
        $('summary').innerHTML = `권장 발주 <strong>${activeRows.length}품목</strong> `
            + `<span class="muted">(재고여유 많은 ${overCnt}품목${hideOver ? ' 숨김' : '은 회색'}${pausedCnt ? ` · 제외 ${pausedCnt}품목` : ''})</span>`
            + `<button class="copybtn" id="copyBtn">${copyLabel()}</button>`
            + (truncated > 0 ? `<span class="rp-note" style="display:inline-block;margin-left:8px;">표는 상위 ${TABLE_CAP}개만 표시</span>` : '');

        if (!lastRows.length) { $('result').innerHTML = '<p class="muted">수요가 감지된 품목이 없습니다. 분석기간을 조정해 보세요.</p>'; return; }
        if (!visible.length) { $('result').innerHTML = '<p class="muted">표시할 품목이 없습니다. (체크 해제 시 전체 표시)</p>'; return; }

        const COLS = [
            { key: 'base', label: '셀러코드' }, { key: null, label: '🔗' }, { key: 'name', label: '이미지' }, { key: 'cls', label: '분류' },
            { key: 'sold', label: '기간판매' }, { key: 'inStockDays', label: '재고보유일' }, { key: 'service', label: '서비스' },
            { key: 'U', label: '업리프트' }, { key: 'onhand', label: '현재고' }, { key: 'cover', label: '재고여유' },
            { key: 'reorderAdjQty', label: '권장발주(개)' }, { key: 'adjKRW', label: '발주금액(원가)' },
            { key: 'method', label: '방법' }, { key: null, label: '제외' },
        ];
        const arrow = k => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        const thead = `<th style="text-align:center;"><input type="checkbox" id="chkAll" title="보이는 항목 전체 선택/해제"></th>`
            + COLS.map(c => c.key ? `<th data-key="${c.key}">${c.label}${arrow(c.key)}</th>` : `<th>${c.label}</th>`).join('');
        const body = shown.map(r => {
            const upTxt = r.U > 1.01 ? `<span class="up">×${r.U.toFixed(2)}</span>` : `×${r.U.toFixed(2)}`;
            const tag = r.method === 'exact' ? '<span class="tag exact">정확</span>' : '<span class="tag est">추정</span>';
            const noteHtml = r.note ? ` <span class="muted">${r.note}</span>` : '';
            const coverTxt = r.overstock ? `<span class="tag suff">${r.cover.toFixed(1)}배</span>` : `${r.cover.toFixed(1)}배`;
            const rowCls = [r.paused ? 'paused' : '', r.overstock ? 'sufficient' : ''].filter(Boolean).join(' ');
            const excBtn = r.paused
                ? `<button class="exbtn restore-inline" data-c="${r.base}" title="다시 추천에 포함">↩︎</button>`
                : `<button class="exbtn" data-c="${r.base}" title="단종/거래처 재고없음 → 추천에서 제외(복원 가능)">🚫</button>`;
            return `<tr class="${rowCls}">
                <td style="text-align:center;"><input type="checkbox" class="cpchk" data-c="${r.base}" ${CHECKED.has(r.base) ? 'checked' : ''}></td>
                <td><a href="search_by_seller_code.html?sellerCode=${encodeURIComponent(r.base)}" target="_blank" rel="noopener">${r.base}</a></td>
                <td style="text-align:center;">${r.shopUrl ? `<a class="shoplink" href="${r.shopUrl}" target="_blank" rel="noopener" title="쇼핑몰 페이지 열기">🔗</a>` : ''}</td>
                <td><a href="search_by_seller_code.html?sellerCode=${encodeURIComponent(r.base)}" target="_blank" rel="noopener" title="${(r.name || '').replace(/"/g, '&quot;')}">${r.img ? `<img src="${r.img}" alt="${r.base}" style="width:44px;height:44px;object-fit:cover;border-radius:4px;" loading="lazy" onerror="tryAlternativeExtension(this)">` : '<span class="muted">-</span>'}</a></td>
                <td>${r.cls}</td>
                <td>${cnt(r.sold)}</td>
                <td>${r.inStockDays < r.rangeDays ? `<strong>${cnt(r.inStockDays)}</strong>` : cnt(r.inStockDays)}/${cnt(r.rangeDays)}일</td>
                <td>${r.service ? cnt(r.service) : '<span class="muted">0</span>'}</td>
                <td>${upTxt}</td>
                <td>${cnt(r.onhand)}${r.setQty ? ` <span class="muted">(본${cnt(r.baseQty)}+세트${cnt(r.setQty)})</span>` : ''}</td>
                <td>${coverTxt}</td>
                <td><strong>${cnt(r.reorderAdjQty)}</strong></td>
                <td><strong>${r.noCost ? '<span class="tag warn">원가미입력</span>' : won(r.adjKRW)}</strong></td>
                <td>${r.paused ? '<span class="tag warn">제외됨</span> ' : ''}${tag}${noteHtml}</td>
                <td style="text-align:center;">${excBtn}</td>
            </tr>`;
        }).join('');
        $('result').innerHTML = `<table class="rp-table"><thead><tr>${thead}</tr></thead><tbody>${body}</tbody></table>
            <p class="muted">※ <b>맨 앞 체크박스로 복사할 품목 선택</b>(기본=발주 대상). "선택 복사"는 체크된 셀러코드만 복사. <b>율(rate) 기반</b>: 발주 = (커버기간당 소진, 품절보정) × 안전계수 × 원가.
            <b>재고보유일</b> = 재고 있던 날수 근사(첫 판매~마지막 판매 구간). 이걸로 나눠 "재고 있을 때 속도"를 구함 → 품절기간 못 판 수요 상향(상한 캡).
            <b>현재 품절(재고0)·${MIN_SOLD_UPLIFT}개 이상 판매</b> 품목만 보정, 재고 남았거나 적게 팔린 건 미보정.
            <b>재고여유</b> ≥1배면 <span class="tag suff">회색</span>. <span class="tag warn">제외됨</span>=🚫(표엔 보이되 예산 제외, ↩︎복원).
            <span class="tag exact">정확</span>=스냅샷 실측 · <span class="tag est">추정</span>=판매구간.</p>`;

        document.querySelectorAll('.rp-table th[data-key]').forEach(th => {
            th.onclick = () => {
                const k = th.dataset.key;
                if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                else { sortKey = k; sortDir = (k === 'base' || k === 'name' || k === 'cls' || k === 'method') ? 'asc' : 'desc'; }
                renderTable();
            };
        });
        document.querySelectorAll('.exbtn').forEach(b => {
            b.onclick = async () => {
                if (busy) return;
                const c = b.dataset.c;
                if (b.classList.contains('restore-inline')) PAUSE.delete(c); else PAUSE.add(c);
                await savePause(); await compute();
            };
        });
        // 복사 체크박스
        document.querySelectorAll('.cpchk').forEach(chk => {
            chk.onchange = () => {
                if (chk.checked) CHECKED.add(chk.dataset.c); else CHECKED.delete(chk.dataset.c);
                const cb2 = $('copyBtn'); if (cb2) cb2.textContent = copyLabel();
            };
        });
        const chkAll = $('chkAll');
        if (chkAll) chkAll.onclick = () => {
            document.querySelectorAll('.cpchk').forEach(chk => {
                chk.checked = chkAll.checked;
                if (chkAll.checked) CHECKED.add(chk.dataset.c); else CHECKED.delete(chk.dataset.c);
            });
            const cb2 = $('copyBtn'); if (cb2) cb2.textContent = copyLabel();
        };
        const cb = $('copyBtn');
        if (cb) cb.onclick = () => {
            const codes = sortRows(lastRows).filter(r => CHECKED.has(r.base)).map(r => r.base);
            if (!codes.length) { alert('체크된 품목이 없습니다.'); return; }
            navigator.clipboard.writeText(codes.join(',')).then(
                () => { cb.textContent = `복사됨! (${codes.length}개)`; setTimeout(() => cb.textContent = copyLabel(), 1500); },
                () => alert('복사 실패'));
        };
    }

    // ---------- 진입 ----------
    document.addEventListener('DOMContentLoaded', async () => {
        const st = $('status');
        // 분석기간 기본값: 끝일=오늘(조회일), 시작일=오늘로부터 2주 전. 원하면 바꿀 수 있음.
        const nowD = new Date(); nowD.setHours(0, 0, 0, 0);
        $('analysisEnd').value = dstr(nowD);
        $('analysisStart').value = dstr(new Date(nowD.getTime() - 14 * DAY));
        try {
            st.textContent = '재고 · 제외목록 불러오는 중...';
            [STOCK, EXCLUDE, PAUSE] = await Promise.all([loadStock(), loadSet('inventoryExclude'), loadSet('restockPause')]);
            $('applyBtn').addEventListener('click', compute);
            $('showAll').addEventListener('change', renderTable);
            await compute();
        } catch (e) {
            st.textContent = '⚠️ 오류: ' + e.message; console.error(e);
        }
    });
})();
