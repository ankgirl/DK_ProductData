// admin_restock_candidates.js — 판매 추세 기반 재입고 후보 (읽기 전용)
// 후보 = 월평균판매 ≥ 최소 AND 소진예상(현재고÷월평균) ≤ 임계. 본품 단위(세트/랜덤박스 제외).

(function () {
    'use strict';

    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const cnt = n => Math.round(n).toLocaleString('ko-KR');
    const classifyRoom = b => (b || '').startsWith('room_') ? '방꾸미기' : '다꾸';
    const baseOf = sc => (sc && sc.startsWith('SET_')) ? sc.slice(4) : (sc || '');
    const $ = id => document.getElementById(id);

    let STOCK = null;       // Map<baseCode, {qty, name, cls}>  본품만
    let ORDERS = null;      // [{date, items:[{base, qty}]}]  최근 12개월
    let EXCLUDE = new Set();
    let lastRows = [], lastPeriod = 3, lastTarget = 3;
    let sortKey = 'months', sortDir = 'asc'; // 기본: 소진 임박순

    async function loadExclude() {
        const s = await db.collection('AdminConfig').doc('inventoryExclude').get();
        return new Set(s.exists ? (s.data().sellerCodes || []) : []);
    }
    async function loadStock() {
        const snap = await db.collection('Products').get();
        const m = new Map();
        const sets = [];
        snap.forEach(d => {
            const id = d.id, data = d.data();
            if (id.startsWith('SET_')) { sets.push({ id, data }); return; }
            const od = data.OptionDatas || {};
            let q = 0, n = 0; for (const k in od) { q += num(od[k].Counts); n++; }
            const optN = (data.GroupOptions || '').split(',').map(s => s.trim()).filter(Boolean).length || n;
            m.set(id, {
                base: q, set: 0, optN, name: data.상품명 || '', cls: classifyRoom(id),
                img: data.Cafe24URL || data.대표이미지 || data.ImageURL || ''
            });
        });
        // 세트 재고를 본품 개별 수량으로 환산해 합산 (세트 1개 = 본품 옵션수 N개)
        for (const { id, data } of sets) {
            const info = m.get(id.slice(4));
            if (!info) continue; // 본품 없는 고아 세트는 건너뜀
            const opt1 = (data.OptionDatas || {})['옵션1'] || {};
            info.set += Math.max(0, num(opt1.Counts)) * info.optN; // 음수 세트재고(오류)는 0 취급
        }
        for (const info of m.values()) info.qty = info.base + info.set;
        return m;
    }
    async function loadOrders() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const snap = await db.collection('CompletedOrders').where('주문처리날짜', '>=', start).get();
        const arr = [];
        snap.forEach(doc => {
            const o = doc.data();
            const dt = o.주문처리날짜;
            if (!dt) return;
            const date = dt.toDate ? dt.toDate() : new Date(dt);
            const items = [];
            const po = o.ProductOrders || {};
            for (const k in po) {
                const it = po[k];
                items.push({ base: baseOf(it.SellerCode || ''), qty: num(it.상품수량) }); // 세트 판매도 본품 수요로 귀속
            }
            arr.push({ date, items });
        });
        return arr;
    }

    function compute() {
        const period = Math.max(1, num($('period').value) || 3);
        const threshold = num($('threshold').value) || 1.5;
        const minSales = num($('minSales').value);
        const target = num($('target').value) || 3;
        const catFilter = $('catFilter').value;

        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth() - period + 1, 1);

        const sales = new Map(); // base -> 기간 판매수량
        for (const o of ORDERS) {
            if (o.date < from) continue;
            for (const it of o.items) {
                if (!it.base) continue;
                sales.set(it.base, (sales.get(it.base) || 0) + it.qty);
            }
        }

        const rows = [];
        for (const [base, info] of STOCK) {
            if (EXCLUDE.has(base)) continue;
            if (catFilter !== '전체' && info.cls !== catFilter) continue;
            const sold = sales.get(base) || 0;
            const monthly = sold / period;
            if (monthly <= 0 || monthly < minSales) continue;
            const months = monthly ? info.qty / monthly : Infinity; // 소진 예상
            if (months > threshold) continue;
            const recommend = Math.max(0, Math.ceil(monthly * target - info.qty));
            rows.push({ base, name: info.name, img: info.img, cls: info.cls, sold, monthly, qty: info.qty, baseQty: info.base, setQty: info.set, months, recommend });
        }
        render(rows, period, target);
    }

    function render(rows, period, target) {
        lastRows = rows; lastPeriod = period; lastTarget = target;
        renderTable();
    }

    function sortRows(rows) {
        const dir = sortDir === 'asc' ? 1 : -1;
        const big = v => v === Infinity ? 1e15 : v;
        return [...rows].sort((a, b) => {
            const x = a[sortKey], y = b[sortKey];
            if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y)) * dir;
            return (big(x) - big(y)) * dir;
        });
    }

    function renderTable() {
        const period = lastPeriod, target = lastTarget;
        $('summary').innerHTML = `재입고 후보 <strong>${lastRows.length}건</strong>
            <span class="muted">(최근 ${period}개월 기준, 목표 ${target}개월분)</span>
            ${lastRows.length ? `<button class="copybtn" id="copyBtn">셀러코드 콤마 복사</button>` : ''}`;

        if (!lastRows.length) {
            $('result').innerHTML = '<p class="muted">조건에 맞는 후보가 없습니다. 파라미터를 조정해 보세요.</p>';
            return;
        }
        const COLS = [
            { key: 'base', label: '셀러코드' },
            { key: 'name', label: '이미지' },
            { key: 'cls', label: '분류' },
            { key: 'sold', label: `${period}개월 판매` },
            { key: 'monthly', label: '월평균' },
            { key: 'qty', label: '현재고' },
            { key: 'months', label: '소진(개월)' },
            { key: 'recommend', label: '권장발주' },
        ];
        const arrow = k => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        const thead = COLS.map(c => `<th data-key="${c.key}" style="cursor:pointer; user-select:none;">${c.label}${arrow(c.key)}</th>`).join('');

        const fix = n => n.toFixed(1);
        const sorted = sortRows(lastRows);
        const body = sorted.map(r => {
            const urg = r.months < 0.5 ? 'urgent' : (r.months < 1 ? 'warn' : '');
            return `<tr>
                <td><a href="search_by_seller_code.html?sellerCode=${encodeURIComponent(r.base)}" target="_blank" rel="noopener">${r.base}</a></td>
                <td><a href="search_by_seller_code.html?sellerCode=${encodeURIComponent(r.base)}" target="_blank" rel="noopener" title="${(r.name || '').replace(/"/g, '&quot;')}">${r.img ? `<img src="${r.img}" alt="${r.base}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;" loading="lazy" onerror="this.style.display='none';this.parentNode.textContent='이미지없음';">` : '<span class="muted">없음</span>'}</a></td>
                <td>${r.cls}</td>
                <td>${cnt(r.sold)}</td>
                <td>${fix(r.monthly)}</td>
                <td>${cnt(r.qty)}${r.setQty ? ` <span class="muted">(본품${cnt(r.baseQty)}+세트환산${cnt(r.setQty)})</span>` : ''}</td>
                <td class="${urg}">${isFinite(r.months) ? fix(r.months) : '∞'}</td>
                <td><strong>${cnt(r.recommend)}</strong></td>
            </tr>`;
        }).join('');
        $('result').innerHTML = `
            <table class="rc-table">
                <thead><tr>${thead}</tr></thead>
                <tbody>${body}</tbody>
            </table>
            <p class="muted">※ 머리글 클릭으로 정렬(다시 클릭 시 방향 전환). 소진(개월) = 현재고 ÷ 월평균판매. <span class="urgent">빨강</span>=0.5개월 미만, <span class="warn">주황</span>=1개월 미만. 세트 판매는 본품 수요로 합산.</p>`;

        document.querySelectorAll('.rc-table th[data-key]').forEach(th => {
            th.onclick = () => {
                const k = th.dataset.key;
                if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                else { sortKey = k; sortDir = (k === 'base' || k === 'name' || k === 'cls') ? 'asc' : 'desc'; }
                renderTable();
            };
        });

        const cb = $('copyBtn');
        if (cb) cb.onclick = () => {
            navigator.clipboard.writeText(sorted.map(r => r.base).join(',')).then(
                () => { cb.textContent = '복사됨!'; setTimeout(() => cb.textContent = '셀러코드 콤마 복사', 1500); },
                () => alert('복사 실패')
            );
        };
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const st = $('status');
        try {
            st.textContent = '상품 재고 · 판매 기록 불러오는 중...';
            [STOCK, ORDERS, EXCLUDE] = await Promise.all([loadStock(), loadOrders(), loadExclude()]);
            st.textContent = `본품 ${STOCK.size.toLocaleString()}건 · 최근 12개월 주문 ${ORDERS.length.toLocaleString()}건 로드 완료`;
            $('applyBtn').addEventListener('click', compute);
            compute();
        } catch (e) {
            st.textContent = '⚠️ 오류: ' + e.message;
            console.error(e);
        }
    });
})();
