// admin_sales_analysis.js — 월별 판매 분석 (CompletedOrders 읽기 전용)
// ① 매출·수익·마진 ② 서비스(사은품) ③ 상품 ④ 채널 ⑤ 재고 연계

(function () {
    'use strict';

    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const won = n => Math.round(num(n)).toLocaleString('ko-KR') + '원';
    const cnt = n => Math.round(num(n)).toLocaleString('ko-KR');
    const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
    const classifyRoom = baseId => (baseId || '').startsWith('room_') ? '방꾸미기' : '다꾸';
    const baseOf = sc => (sc && sc.startsWith('SET_')) ? sc.slice(4) : (sc || '');

    const $ = id => document.getElementById(id);
    let lastAgg = null;
    let lastBest = null;       // Map<SellerCode, {name, qty, amt}>
    let bestSortKey = 'qty';   // 'qty' | 'amt'

    // ---- 드롭다운 초기화 ----
    function initDropdowns() {
        const now = new Date();
        const ySel = $('yearSel'), mSel = $('monthSel');
        for (let y = now.getFullYear(); y >= 2023; y--) ySel.add(new Option(y + '년', y));
        for (let m = 1; m <= 12; m++) mSel.add(new Option(m + '월', m));
        ySel.value = now.getFullYear();
        mSel.value = now.getMonth() + 1;
    }

    // ---- 집계 ----
    function aggregate(orders) {
        const A = { 실매출: 0, 정가매출: 0, 총원가: 0, 주문원가합산: 0, 서비스원가: 0, 서비스판매가: 0, 배송비: 0, 수량: 0, 주문수: orders.length };
        const cat = { 방꾸미기: { qty: 0, amt: 0 }, 다꾸: { qty: 0, amt: 0 } };
        const best = new Map();    // SellerCode -> {name, qty, amt}
        const batch = new Map();   // 입고차수 -> {qty, amt}
        const channel = new Map(); // 판매처 -> {orders, amt}
        const service = new Map(); // SellerCode -> {qty, cost}

        for (const o of orders) {
            A.실매출 += num(o.총결제금액);
            A.정가매출 += num(o.주문판매가합산금액);
            A.총원가 += num(o.총원가금액);
            A.주문원가합산 += num(o.주문원가합산금액);
            A.서비스원가 += num(o.서비스총원가금액);
            A.서비스판매가 += num(o.서비스총판매가금액);
            A.배송비 += num(o.기본배송비);
            A.수량 += num(o.총수량);

            const ch = o.판매처 || '(미지정)';
            const c = channel.get(ch) || { orders: 0, amt: 0 };
            c.orders++; c.amt += num(o.총결제금액); channel.set(ch, c);

            const po = o.ProductOrders || {};
            for (const k in po) {
                const it = po[k];
                const sc = it.SellerCode || '';
                const qty = num(it.상품수량), amt = num(it.상품결제금액);
                const cls = classifyRoom(baseOf(sc));
                cat[cls].qty += qty; cat[cls].amt += amt;
                const b = best.get(sc) || { name: it.상품명 || sc, qty: 0, amt: 0, img: '' };
                b.qty += qty; b.amt += amt;
                if (!b.img) b.img = it.옵션이미지URL || it.실제이미지URL || '';
                best.set(sc, b);
                const btKey = it.입고차수 || '(미상)';
                const bt = batch.get(btKey) || { qty: 0, amt: 0 };
                bt.qty += qty; bt.amt += amt; batch.set(btKey, bt);
            }

            const ps = o.ProductService;
            if (Array.isArray(ps)) ps.forEach(s => {
                const sc = s.SellerCode || '(미상)';
                const v = service.get(sc) || { qty: 0, cost: 0 };
                v.qty += 1; v.cost += num(s.PriceBuy_kr); service.set(sc, v);
            });
        }
        return { A, cat, best, batch, channel, service };
    }

    // ---- 렌더 헬퍼 ----
    const card = (k, v, sub) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
    function topRows(map, n, valFn) {
        return [...map.entries()].sort((a, b) => valFn(b[1]) - valFn(a[1])).slice(0, n);
    }

    // ---- 렌더 ----
    function render(agg, y, m) {
        const { A, cat, best, batch, channel, service } = agg;
        const 할인액 = A.정가매출 - A.실매출;
        const 매출총이익 = A.실매출 - A.주문원가합산; // 상품+서비스 원가 차감
        const 객단가 = A.주문수 ? A.실매출 / A.주문수 : 0;

        $('salesCards').innerHTML =
            card('실매출 (총결제금액)', won(A.실매출)) +
            card('정가 매출', won(A.정가매출), `할인액 ${won(할인액)} (${pct(할인액, A.정가매출)})`) +
            card('총 원가 (상품+서비스)', won(A.주문원가합산), `상품 ${won(A.총원가)} / 서비스 ${won(A.서비스원가)}`) +
            card('매출총이익', `<span class="${매출총이익 >= 0 ? 'pos' : 'neg'}">${won(매출총이익)}</span>`, `이익률 ${pct(매출총이익, A.실매출)}`) +
            card('주문 수', cnt(A.주문수), `객단가 ${won(객단가)}`) +
            card('판매 수량', cnt(A.수량)) +
            card('배송비 합계', won(A.배송비), '(참고)');

        // ② 서비스
        $('serviceCards').innerHTML =
            card('서비스 원가 합', won(A.서비스원가), `사은품 비용률 ${pct(A.서비스원가, A.실매출)}`) +
            card('서비스 판매가 합', won(A.서비스판매가), '(사은품 정가 가치)') +
            card('사은품 항목 수', cnt([...service.values()].reduce((s, v) => s + v.qty, 0)));
        const svcRows = topRows(service, 20, v => v.qty);
        $('serviceRank').innerHTML = `<h3>사은품 베스트 (횟수 Top 20)</h3>` + tableHTML(
            ['SellerCode', '나간 횟수', '원가 합'],
            svcRows.map(([sc, v]) => [sc, cnt(v.qty), won(v.cost)])
        );

        // ③ 상품
        const catTotalQty = cat.방꾸미기.qty + cat.다꾸.qty;
        const catTotalAmt = cat.방꾸미기.amt + cat.다꾸.amt;
        const barRow = (label, v, total) => {
            const p = total ? v / total * 100 : 0;
            return `<tr><td>${label}</td><td>${cnt(v)}</td><td>${p.toFixed(1)}%</td><td style="text-align:left"><span class="bar" style="width:${p * 1.5}px"></span></td></tr>`;
        };
        $('catSplit').innerHTML = `
            <table class="sa-table"><thead><tr><th>구분</th><th>수량</th><th>비중</th><th>금액 ${won(catTotalAmt)}</th></tr></thead><tbody>
            ${barRow('방꾸미기(room_)', cat.방꾸미기.qty, catTotalQty)}
            ${barRow('다꾸', cat.다꾸.qty, catTotalQty)}
            </tbody></table>
            <p class="muted">금액: 방꾸미기 ${won(cat.방꾸미기.amt)} / 다꾸 ${won(cat.다꾸.amt)}</p>`;

        const batchRows = topRows(batch, 15, v => v.qty);
        $('batchRank').innerHTML = tableHTML(['입고차수', '수량', '금액'], batchRows.map(([k, v]) => [k, cnt(v.qty), won(v.amt)]));

        lastBest = best;
        renderBest();

        // ④ 채널
        const chRows = topRows(channel, 30, v => v.amt);
        $('channelTable').innerHTML = tableHTML(
            ['판매처', '주문수', '매출', '비중'],
            chRows.map(([k, v]) => [k, cnt(v.orders), won(v.amt), pct(v.amt, A.실매출)])
        );

        $('invResult').innerHTML = '';
        $('report').style.display = '';
    }

    function renderBest() {
        if (!lastBest) return;
        const rows = topRows(lastBest, 20, v => bestSortKey === 'amt' ? v.amt : v.qty);
        const href = sc => `search_by_seller_code.html?sellerCode=${encodeURIComponent(sc)}`;
        const link = sc => `<a href="${href(sc)}" target="_blank" rel="noopener">${sc}</a>`;
        const imgCell = (sc, v) => v.img
            ? `<a href="${href(sc)}" target="_blank" rel="noopener"><img src="${v.img}" alt="${sc}" style="width:44px;height:44px;object-fit:cover;border-radius:4px;" loading="lazy" onerror="tryAlternativeExtension(this)"></a>`
            : '<span class="muted">-</span>';
        $('bestSeller').innerHTML = tableHTML(
            ['SellerCode', '이미지', '상품명', '수량', '금액'],
            rows.map(([sc, v]) => [link(sc), imgCell(sc, v), (v.name || '').slice(0, 36), cnt(v.qty), won(v.amt)])
        );
        $('bsQty').classList.toggle('active', bestSortKey === 'qty');
        $('bsAmt').classList.toggle('active', bestSortKey === 'amt');
    }

    function tableHTML(headers, rows) {
        if (!rows.length) return '<p class="muted">데이터 없음</p>';
        return `<table class="sa-table"><thead><tr>${headers.map((h, i) => `<th${i === 0 ? '' : ''}>${h}</th>`).join('')}</tr></thead>`
            + `<tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? '' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }

    // ---- ⑤ 재고 연계 ----
    async function runInventoryLink() {
        const el = $('invResult');
        if (!lastAgg) { el.textContent = '먼저 월을 조회하세요.'; return; }
        el.textContent = '전체 상품 재고 불러오는 중...';
        try {
            const snap = await db.collection('Products').get();
            let totalStockQty = 0;
            const stockByBase = new Map(); // 본품코드 -> 재고수량(본품+세트환산 합산 단순화: 본품 옵션 Counts 합)
            snap.forEach(d => {
                const id = d.id, data = d.data();
                const od = data.OptionDatas || {};
                let q = 0; for (const k in od) q += num(od[k].Counts);
                if (q <= 0) return;
                totalStockQty += q;
                const base = baseOf(id);
                stockByBase.set(base, (stockByBase.get(base) || 0) + q);
            });

            const monthQty = lastAgg.A.수량;
            const turnover = totalStockQty ? monthQty / totalStockQty : 0;
            const monthsLeft = monthQty ? totalStockQty / monthQty : Infinity;

            // 데드스톡: 재고 있는 본품코드 중 이번 달 판매 0
            const soldBases = new Set([...lastAgg.best.keys()].map(baseOf));
            let dead = 0, deadList = [];
            for (const [base, q] of stockByBase) {
                if (!soldBases.has(base)) { dead++; if (deadList.length < 30) deadList.push(`${base}(${q})`); }
            }

            el.innerHTML =
                `<div class="card-grid">
                    ${card('현재 총 재고수량', cnt(totalStockQty))}
                    ${card('이번 달 판매수량', cnt(monthQty))}
                    ${card('재고 회전율 (월)', (turnover * 100).toFixed(1) + '%', '월판매 ÷ 현재고')}
                    ${card('소진 예상', isFinite(monthsLeft) ? monthsLeft.toFixed(1) + '개월' : '-', '현재고 ÷ 월판매')}
                    ${card('데드스톡(이번달 미판매)', cnt(dead) + '품목')}
                </div>
                <details><summary class="muted">데드스톡 예시(최대 30)</summary><p class="muted">${deadList.join(', ') || '없음'}</p></details>
                <p class="muted">※ 회전율/소진은 전체 합산 기준 개략치입니다. 재고수량은 본품+세트 옵션 Counts 합.</p>`;
        } catch (e) {
            el.textContent = '오류: ' + e.message;
            console.error(e);
        }
    }

    // ---- 진입 ----
    async function run() {
        const y = +$('yearSel').value, m = +$('monthSel').value;
        const st = $('status');
        st.textContent = '조회 중...';
        $('report').style.display = 'none';
        try {
            const start = new Date(y, m - 1, 1), end = new Date(y, m, 0, 23, 59, 59);
            const snap = await db.collection('CompletedOrders')
                .where('주문처리날짜', '>=', start).where('주문처리날짜', '<=', end).get();
            const orders = [];
            snap.forEach(d => orders.push(d.data()));
            if (!orders.length) { st.textContent = `${y}년 ${m}월 완료 주문이 없습니다.`; return; }
            lastAgg = aggregate(orders);
            render(lastAgg, y, m);
            st.textContent = `${y}년 ${m}월 · 주문 ${orders.length}건`;
        } catch (e) {
            st.textContent = '오류: ' + e.message;
            console.error(e);
        }
    }

    // ---- 월별 추이 그래프 (최근 12개월) ----
    let trendChart = null;
    async function loadMonthlyTrend() {
        const ts = $('trendStatus');
        try {
            const now = new Date();
            const months = [];
            for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
            const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            const snap = await db.collection('CompletedOrders').where('주문처리날짜', '>=', start).get();

            const buckets = {};
            months.forEach(m => buckets[m] = { 실매출: 0, 이익: 0, 방: 0, 다: 0, 수량: 0 });
            snap.forEach(doc => {
                const o = doc.data();
                const dt = o.주문처리날짜;
                if (!dt) return;
                const d = dt.toDate ? dt.toDate() : new Date(dt);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const b = buckets[key];
                if (!b) return;
                b.실매출 += num(o.총결제금액);
                b.이익 += num(o.총결제금액) - num(o.주문원가합산금액);
                b.수량 += num(o.총수량);
                const po = o.ProductOrders || {};
                for (const k in po) {
                    const it = po[k];
                    const amt = num(it.상품결제금액);
                    if (classifyRoom(baseOf(it.SellerCode || '')) === '방꾸미기') b.방 += amt; else b.다 += amt;
                }
            });
            drawMonthly(months, buckets);
            ts.textContent = '';
        } catch (e) {
            ts.textContent = '추이 로드 오류: ' + e.message;
            console.error(e);
        }
    }
    function drawMonthly(months, buckets) {
        const pick = f => months.map(m => buckets[m][f]);
        const ds = (label, f, color, hidden) => ({
            label, data: pick(f), borderColor: color, backgroundColor: color, tension: 0.2, pointRadius: 3, hidden: !!hidden,
        });
        const data = {
            labels: months,
            datasets: [
                ds('실매출', '실매출', '#2e7d32'),
                ds('매출총이익', '이익', '#c0392b'),
                ds('방꾸미기 매출', '방', '#8884d8', true),
                ds('다꾸 매출', '다', '#e69138', true),
            ],
        };
        const opts = {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${won(c.parsed.y)}` } } },
            scales: { y: { ticks: { callback: v => (v / 10000).toLocaleString() + '만' } } },
        };
        if (trendChart) trendChart.destroy();
        trendChart = new Chart($('monthlyTrend'), { type: 'line', data, options: opts });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initDropdowns();
        $('loadBtn').addEventListener('click', run);
        $('invBtn').addEventListener('click', runInventoryLink);
        $('bsQty').addEventListener('click', () => { bestSortKey = 'qty'; renderBest(); });
        $('bsAmt').addEventListener('click', () => { bestSortKey = 'amt'; renderBest(); });
        loadMonthlyTrend();
        run();
    });
})();
