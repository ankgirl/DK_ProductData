// admin_set_option_gap.js — 세트 재고 있음 + 본품 개별 옵션 품절(0이하) 제품 (읽기 전용)

(function () {
    'use strict';

    const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const cnt = n => Math.round(n).toLocaleString('ko-KR');
    const $ = id => document.getElementById(id);

    let DOCS = null;
    let lastRows = [];
    let sortKey = 'setCounts', sortDir = 'desc';

    function compute() {
        const minSet = Math.max(1, num($('minSet').value) || 1);
        const minZero = Math.max(1, num($('minZero').value) || 1);
        const negOnly = $('negOnly').checked;
        const inclRoom = $('inclRoom').checked;

        const rows = [];
        for (const [id, data] of DOCS) {
            if (!id.startsWith('SET_')) continue;
            const baseId = id.slice(4);
            if (!inclRoom && baseId.startsWith('room_')) continue; // 방꾸미기 제외(기본)
            const setCounts = num((data.OptionDatas || {})['옵션1'] && (data.OptionDatas || {})['옵션1'].Counts);
            if (setCounts < minSet) continue;
            const base = DOCS.get(baseId);
            if (!base) continue; // 고아 세트 제외
            const od = base.OptionDatas || {};
            const opts = Object.entries(od).map(([k, v]) => ({ k, c: num(v.Counts) }));
            const bad = opts.filter(o => negOnly ? o.c < 0 : o.c <= 0);
            if (bad.length < minZero) continue;
            rows.push({
                base: id.slice(4),
                name: base.상품명 || '',
                setCounts,
                zeroCount: bad.length,
                totalCount: opts.length,
                hasNeg: opts.some(o => o.c < 0),
                opts,
            });
        }
        lastRows = rows;
        renderTable();
    }

    function sortRows(rows) {
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const x = a[sortKey], y = b[sortKey];
            if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y)) * dir;
            return (x - y) * dir;
        });
    }

    function optDetail(opts) {
        return opts.map(o => {
            if (o.c < 0) return `<span class="neg">${o.k}:${o.c}</span>`;
            if (o.c === 0) return `<span class="ok0">${o.k}:0</span>`;
            return `${o.k}:${o.c}`;
        }).join(', ');
    }

    function renderTable() {
        $('summary').innerHTML = `대상 <strong>${lastRows.length}건</strong>
            <span class="muted">(세트로는 재고 있으나 개별 옵션 품절)</span>
            ${lastRows.length ? `<button class="copybtn" id="copyBtn">셀러코드 콤마 복사</button>` : ''}`;
        if (!lastRows.length) {
            $('result').innerHTML = '<p class="muted">조건에 맞는 제품이 없습니다.</p>';
            return;
        }
        const COLS = [
            { key: 'base', label: '셀러코드' },
            { key: 'setCounts', label: '세트재고' },
            { key: 'zeroCount', label: '품절옵션' },
            { key: 'totalCount', label: '전체옵션' },
            { key: 'name', label: '상품명' },
        ];
        const arrow = k => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        const thead = COLS.map(c => `<th data-key="${c.key}">${c.label}${arrow(c.key)}</th>`).join('') + '<th>본품 옵션별 재고</th>';

        const sorted = sortRows(lastRows);
        const body = sorted.map(r => `<tr>
            <td><a href="search_by_seller_code.html?sellerCode=${encodeURIComponent(r.base)}" target="_blank" rel="noopener">${r.base}</a></td>
            <td>${cnt(r.setCounts)}</td>
            <td>${r.zeroCount}${r.hasNeg ? ' <span class="neg">⚠</span>' : ''}</td>
            <td>${r.totalCount}</td>
            <td>${(r.name || '').slice(0, 30)}</td>
            <td style="text-align:left;">${optDetail(r.opts)}</td>
        </tr>`).join('');

        $('result').innerHTML = `
            <table class="gap-table">
                <thead><tr>${thead}</tr></thead>
                <tbody>${body}</tbody>
            </table>
            <p class="muted">※ 머리글 클릭으로 정렬. <span class="ok0">주황</span>=0, <span class="neg">빨강</span>=음수(과판매). ⚠=음수 옵션 보유.</p>`;

        document.querySelectorAll('.gap-table th[data-key]').forEach(th => {
            th.onclick = () => {
                const k = th.dataset.key;
                if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                else { sortKey = k; sortDir = (k === 'base' || k === 'name') ? 'asc' : 'desc'; }
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
            st.textContent = '상품 데이터 불러오는 중...';
            const snap = await db.collection('Products').get();
            DOCS = new Map();
            snap.forEach(d => DOCS.set(d.id, d.data()));
            st.textContent = `상품 ${DOCS.size.toLocaleString()}건 로드 완료`;
            $('applyBtn').addEventListener('click', compute);
            compute();
        } catch (e) {
            st.textContent = '⚠️ 오류: ' + e.message;
            console.error(e);
        }
    });
})();
