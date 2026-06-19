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
    let currentRange = { start: '', end: '' }; // 기간 필터 (DateRangeControl)

    // ---- 재고 가치 계산 (공유 순수 로직: inventory_compute.js) ----
    // Cloud Function(자정 자동 기록)도 같은 모듈을 사용 → 화면 값과 기록 값이 어긋나지 않음.
    const { computeInventory } = window.InventoryCompute;

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
    // 수동 저장 전용 (자동 적립은 Cloud Function이 매일 자정 KST에 수행).
    // 제외목록을 방금 바꿔 오늘 스냅샷을 즉시 갱신하고 싶을 때만 사용.
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
            el.textContent = `오늘(${id}) 스냅샷 수동 저장 완료.`;
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
    function inRange(dateStr) {
        if (currentRange.start && dateStr < currentRange.start) return false;
        if (currentRange.end && dateStr > currentRange.end) return false;
        return true;
    }
    function drawTrend(unit) {
        const rows = aggregate(allSnapshots.filter(s => inRange(s.날짜)), unit);
        const labels = rows.map(r => r.label);
        const pick = metric => rows.map(r => (r.s[metric] && r.s[metric].전체) || 0);
        const META = [['원가', '#c0392b'], ['실판매가', '#2e7d32'], ['정가', '#8884d8']];
        // 항목별 가격대 차이가 커서 공용 축이면 변동이 거의 안 보임 →
        // 각 항목을 자기 자신의 스케일(숨김 축)로 그려 일별 변동을 살린다. 실제 값은 툴팁에 표시.
        const datasets = META.map(([label, color], i) => ({
            label, data: pick(label), borderColor: color, backgroundColor: color,
            tension: 0.2, pointRadius: 3, yAxisID: 'y' + i,
        }));
        const scales = {};
        META.forEach((_, i) => { scales['y' + i] = { display: false, grace: '8%' }; });
        const opts = {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${won(c.parsed.y)}` } } },
            scales,
        };
        if (chart) chart.destroy();
        chart = new Chart($('trendChart'), { type: 'line', data: { labels, datasets }, options: opts });
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

    // ---- 재계산 (화면 표시 전용, DB 쓰기 없음) ----
    // 스냅샷 적립은 더 이상 접속 시마다 하지 않음 → Cloud Function이 매일 자정(KST) 자동 기록.
    async function recompute() {
        const result = computeInventory(DOCS, EXCLUDE);
        renderSummary(result);
        renderExcludeManager(result);
        renderValidation(result);
        await loadAndDrawTrend();
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

            // 기간 선택 (기본 '전체') — 변경 시 차트만 다시 그림
            const rangeCtl = DateRangeControl.create($('rangeControl'), {
                defaultPreset: 'all',
                onApply: r => { currentRange = r; drawTrend(currentUnit); },
            });
            currentRange = rangeCtl.get();

            await recompute();

            // 수동 기록 버튼 (자동 적립은 매일 자정 Cloud Function)
            const saveBtn = $('saveSnapshotBtn');
            if (saveBtn) saveBtn.onclick = async () => {
                saveBtn.disabled = true;
                await saveTodaySnapshot(computeInventory(DOCS, EXCLUDE));
                await loadAndDrawTrend();
                saveBtn.disabled = false;
            };

            statusEl.textContent = '';
        } catch (e) {
            statusEl.textContent = `⚠️ 오류: ${e.message}`;
            console.error(e);
        }
    });
})();
