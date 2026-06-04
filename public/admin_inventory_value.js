// admin_inventory_value.js — 전체 재고 가치 계산 + 일별 스냅샷 적립 + 추이 그래프
// 기존 컬렉션(Products)은 읽기 전용. 쓰기는 InventorySnapshots / AdminConfig(신규)에만.

(function () {
    'use strict';

    const won = n => (Math.round(n) || 0).toLocaleString('ko-KR') + '원';
    const $ = id => document.getElementById(id);

    // 집계 제외 기본값 (랜덤박스 = 가상상품, 재고수량이 더미값). 이후 화면에서 추가/삭제.
    const DEFAULT_EXCLUDE = ['랜덤박스_0001', '랜덤박스_0002', '랜덤박스_0003',
        'test_pack01', 'test_pack02', 'test_pack03', 'test_pack04', 'test_pack05'];

    let DOCS = null;          // Map<id, data>  (1회 로드 후 캐시)
    let EXCLUDE = new Set();  // 제외할 본품 셀러코드
    let allSnapshots = [];
    let chart = null;
    let currentUnit = 'day';

    // ---- 분류 헬퍼 ----
    const classifyRoom = baseId => baseId.startsWith('room_') ? '방꾸미기' : '다꾸';
    function sumOptionCounts(data) {
        let c = 0;
        const od = data.OptionDatas || {};
        for (const k in od) c += Number(od[k].Counts) || 0;
        return c;
    }

    // ---- 누적기 ----
    function newAcc() {
        const z = () => ({ 전체: 0, 본품: 0, 세트: 0, 방꾸미기: 0, 다꾸: 0 });
        return { 원가: z(), 실판매가: z(), 정가: z() };
    }
    function addAcc(acc, bonset, cls, cost, sale, list) {
        for (const [metric, val] of [['원가', cost], ['실판매가', sale], ['정가', list]]) {
            acc[metric].전체 += val;
            acc[metric][bonset] += val;
            acc[metric][cls] += val;
        }
    }

    // ---- 재고 가치 계산 ----
    function computeInventory(docs, exclude) {
        const acc = newAcc();
        const flags = { 환산세트: [], 고아세트: [], 원가미입력: [], 제외: 0 };

        for (const [id, data] of docs) {
            const baseId = id.startsWith('SET_') ? id.slice(4) : id;
            if (exclude.has(baseId)) { flags.제외++; continue; } // 본품/세트 모두 본품코드 기준 제외

            if (!id.startsWith('SET_')) {
                // ===== 본품 =====
                const cls = classifyRoom(id);
                const totalCounts = sumOptionCounts(data);
                if (totalCounts === 0) continue;
                const unitCost = Number(data.원가) || 0;
                if (!unitCost) flags.원가미입력.push(id);

                let salePrice = 0; // 옵션별 실판매가(Price) × Counts
                const od = data.OptionDatas || {};
                for (const k in od) salePrice += (Number(od[k].Price) || 0) * (Number(od[k].Counts) || 0);

                // 정가 = 실판매가 ÷ 0.9 (단품 10% 할인 역산). SellingPrice 필드는 신뢰도 낮아 미사용.
                addAcc(acc, '본품', cls, unitCost * totalCounts, salePrice, salePrice / 0.9);
            } else {
                // ===== 세트 =====
                const cls = classifyRoom(baseId);
                const od = data.OptionDatas || {};
                const opt1 = od['옵션1'] || {};
                const setCounts = Number(opt1.Counts) || 0;
                if (setCounts === 0) continue;

                let setCost = Number(data.원가) || 0;
                let setSale = Number(opt1.Price) || Number(data.DiscountedPrice) || 0;

                // 저장값 우선, 0/누락이면 본품에서 환산 (검증결과: 저장값 신뢰, 7%만 누락)
                if (!setCost || !setSale) {
                    const base = docs.get(baseId);
                    if (base) {
                        const nOpt = (base.GroupOptions || '').split(',').map(s => s.trim()).filter(Boolean).length
                            || Object.keys(base.OptionDatas || {}).length;
                        const baseCost = Number(base.원가) || 0;
                        const baseSell = Number(base.SellingPrice) || 0;
                        if (!setCost) setCost = baseCost * nOpt;
                        if (!setSale) setSale = Math.floor(baseSell * nOpt * 0.75); // 세트 25% 할인
                        flags.환산세트.push(id);
                    } else {
                        flags.고아세트.push(id); // 본품 없고 저장값도 없음 → 0으로 계산됨
                    }
                }
                // 정가 = 실판매가 ÷ 0.75 (세트 25% 할인 역산)
                const setSaleTotal = setSale * setCounts;
                addAcc(acc, '세트', cls, setCost * setCounts, setSaleTotal, setSaleTotal / 0.75);
            }
        }
        return { acc, flags };
    }

    // ---- 화면: 요약표 ----
    function renderSummary(result) {
        const a = result.acc;
        const cols = ['전체', '본품', '세트', '방꾸미기', '다꾸'];
        const row = (label, m, cls) => {
            let html = `<tr class="${cls || ''}"><td>${label}</td>`;
            for (const c of cols) html += `<td>${won(m[c])}</td>`;
            return html + '</tr>';
        };
        const margin = {};
        for (const c of cols) margin[c] = a.실판매가[c] - a.원가[c];

        $('summary').innerHTML = `
            <table class="inv-table big-num">
                <thead><tr><th>구분</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
                <tbody>
                    ${row('재고 원가', a.원가, 'total-row')}
                    ${row('재고 실판매가', a.실판매가)}
                    ${row('재고 정가', a.정가)}
                    ${row('잠재 마진 (실판매가−원가)', margin)}
                </tbody>
            </table>
            <p class="muted">※ 정가는 실판매가를 할인율(단품 10%·세트 25%)로 역산한 근사치입니다. 원가·실판매가가 정확값입니다.</p>
        `;
    }

    // ---- 화면: 검증 정보 ----
    function renderValidation(result) {
        const f = result.flags;
        const clean = f.고아세트.length === 0 && f.원가미입력.length === 0;
        const list = (arr, n = 20) => arr.slice(0, n).join(', ') + (arr.length > n ? ` 외 ${arr.length - n}건` : '');
        $('validation').innerHTML = `
            <div class="validation ${clean ? 'ok' : ''}">
                <strong>검증</strong>
                <ul style="margin:6px 0 0; padding-left:18px;">
                    <li>세트 환산 적용(저장값 누락→본품 환산): <strong>${f.환산세트.length}건</strong>
                        ${f.환산세트.length ? `<details><summary>목록</summary>${list(f.환산세트)}</details>` : ''}</li>
                    <li>본품 없는 고아 세트(0 처리): <strong>${f.고아세트.length}건</strong>
                        ${f.고아세트.length ? `<details><summary>목록</summary>${list(f.고아세트)}</details>` : ''}</li>
                    <li>원가 미입력 본품(재고 보유분): <strong>${f.원가미입력.length}건</strong>
                        ${f.원가미입력.length ? `<details><summary>목록</summary>${list(f.원가미입력)}</details>` : ''}</li>
                </ul>
            </div>
        `;
    }

    // ---- 제외목록 (AdminConfig/inventoryExclude) ----
    function excludeRef() { return db.collection('AdminConfig').doc('inventoryExclude'); }
    async function loadExclude() {
        const snap = await excludeRef().get();
        if (!snap.exists) {
            await excludeRef().set({ sellerCodes: DEFAULT_EXCLUDE });
            return new Set(DEFAULT_EXCLUDE);
        }
        return new Set(snap.data().sellerCodes || []);
    }
    async function saveExclude() {
        await excludeRef().set({ sellerCodes: [...EXCLUDE] });
    }
    function renderExcludeManager(result) {
        const items = [...EXCLUDE].sort();
        $('excludeManager').innerHTML = `
            <strong>집계 제외 상품 (${items.length})</strong>
            <span class="muted">— 판매중지/가상상품. 재고·스냅샷에서 빠집니다. (이번 계산 제외 ${result.flags.제외}품목)</span>
            <div style="margin:8px 0;">
                <input id="exInput" placeholder="셀러코드 입력 (예: 랜덤박스_0002)">
                <button id="exAdd">추가</button>
            </div>
            <div>${items.map(c => `<span class="ex-chip">${c} <a href="#" data-c="${c}" class="ex-del">✕</a></span>`).join(' ') || '<span class="muted">없음</span>'}</div>
        `;
        $('exAdd').onclick = async () => {
            const v = $('exInput').value.trim();
            if (!v) return;
            EXCLUDE.add(v);
            await saveExclude();
            await recompute();
        };
        document.querySelectorAll('.ex-del').forEach(el => {
            el.onclick = async e => {
                e.preventDefault();
                EXCLUDE.delete(el.dataset.c);
                await saveExclude();
                await recompute();
            };
        });
    }

    // ---- 스냅샷 저장 (오늘 날짜, 멱등 덮어쓰기) ----
    function todayStr() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    async function saveTodaySnapshot(result) {
        const id = todayStr();
        const doc = {
            날짜: id,
            기록시각: firebase.firestore.FieldValue.serverTimestamp(),
            원가: result.acc.원가,
            실판매가: result.acc.실판매가,
            정가: result.acc.정가,
        };
        const el = $('snapshotStatus');
        try {
            await db.collection('InventorySnapshots').doc(id).set(doc);
            el.textContent = `오늘(${id}) 스냅샷 저장 완료.`;
        } catch (e) {
            el.textContent = `⚠️ 스냅샷 저장 실패: ${e.message}`;
            console.error('[snapshot] 저장 실패', e);
        }
    }

    // ---- 추이 그래프 ----
    function weekKey(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const day = (d.getDay() + 6) % 7; // 월요일=0
        d.setDate(d.getDate() - day);
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    function aggregate(arr, unit) {
        if (unit === 'day') return arr.map(s => ({ label: s.날짜, s }));
        const m = new Map(); // 정렬돼 있으므로 같은 key의 마지막(최신) 스냅샷 유지
        for (const s of arr) {
            const key = unit === 'month' ? s.날짜.slice(0, 7) : weekKey(s.날짜);
            m.set(key, s);
        }
        return [...m.entries()].map(([label, s]) => ({ label, s }));
    }
    function drawTrend(unit) {
        const rows = aggregate(allSnapshots, unit);
        const labels = rows.map(r => r.label);
        const pick = metric => rows.map(r => (r.s[metric] && r.s[metric].전체) || 0);
        const ds = (label, metric, color) => ({
            label, data: pick(metric), borderColor: color, backgroundColor: color, tension: 0.2, pointRadius: 3,
        });
        const data = {
            labels,
            datasets: [
                ds('원가', '원가', '#c0392b'),
                ds('실판매가', '실판매가', '#2e7d32'),
                ds('정가', '정가', '#8884d8'),
            ],
        };
        const opts = {
            responsive: true,
            plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${won(c.parsed.y)}` } } },
            scales: { y: { ticks: { callback: v => (v / 10000).toLocaleString() + '만' } } },
        };
        if (chart) chart.destroy();
        chart = new Chart($('trendChart'), { type: 'line', data, options: opts });
    }
    async function loadAndDrawTrend() {
        const snap = await db.collection('InventorySnapshots').orderBy('날짜').get();
        allSnapshots = [];
        snap.forEach(d => allSnapshots.push(d.data()));
        drawTrend(currentUnit);
    }
    function bindUnitButtons() {
        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentUnit = btn.dataset.unit;
                drawTrend(currentUnit);
            });
        });
    }

    // ---- 재계산 (제외목록 변경 시에도 호출) ----
    async function recompute() {
        const result = computeInventory(DOCS, EXCLUDE);
        renderSummary(result);
        renderExcludeManager(result);
        renderValidation(result);
        await saveTodaySnapshot(result);
        await loadAndDrawTrend(); // 오늘 점(제외 반영) 그래프에 반영
    }

    // ---- 진입점 ----
    document.addEventListener('DOMContentLoaded', async () => {
        const statusEl = $('status');
        try {
            statusEl.textContent = '상품 데이터 불러오는 중...';
            const snap = await db.collection('Products').get();
            DOCS = new Map();
            snap.forEach(d => DOCS.set(d.id, d.data()));
            statusEl.textContent = `상품 ${DOCS.size.toLocaleString()}건 로드 완료. 계산 중...`;

            EXCLUDE = await loadExclude();
            bindUnitButtons();
            await recompute();

            statusEl.textContent = '';
        } catch (e) {
            statusEl.textContent = `⚠️ 오류: ${e.message}`;
            console.error(e);
        }
    });
})();
