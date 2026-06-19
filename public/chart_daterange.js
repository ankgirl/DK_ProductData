// chart_daterange.js — 관리자 차트 공용 "기간 선택" 컨트롤 (DOM만, Firebase 의존 없음)
// 재고가치 추이 / 판매분석 월별추이 등 여러 차트가 동일 UI·로직을 공유한다(중복 방지).
//
// 사용:
//   const ctl = DateRangeControl.create(containerEl, {
//       defaultPreset: 'all' | '7d' | '30d' | '3m' | '6m' | '1y',
//       onApply: ({start, end}) => { ... }   // start/end = 'YYYY-MM-DD' (end 포함). 'all'이면 start=''
//   });
//   ctl.get()            → { start, end }
//   DateRangeControl.monthsBetween(start, end, fallbackStart) → ['YYYY-MM', ...]

(function (root) {
    'use strict';

    const p = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const parse = s => { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2] || 1); };

    // 프리셋 → {start, end} ('YYYY-MM-DD'). 'all'은 start=''(하한 없음).
    function presetRange(preset) {
        const end = new Date();
        const start = new Date();
        switch (preset) {
            case '7d': start.setDate(end.getDate() - 6); break;
            case '30d': start.setDate(end.getDate() - 29); break;
            case '3m': start.setMonth(end.getMonth() - 3); break;
            case '6m': start.setMonth(end.getMonth() - 6); break;
            case '1y': start.setFullYear(end.getFullYear() - 1); break;
            case 'all': return { start: '', end: fmt(end) };
            default: return { start: '', end: fmt(end) };
        }
        return { start: fmt(start), end: fmt(end) };
    }

    // start~end 사이의 'YYYY-MM' 목록(양끝 포함). start가 ''이면 fallbackStart부터.
    function monthsBetween(startStr, endStr, fallbackStart) {
        const endD = endStr ? parse(endStr) : new Date();
        const startD = parse(startStr || fallbackStart);
        const out = [];
        const d = new Date(startD.getFullYear(), startD.getMonth(), 1);
        while (d <= endD) { out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}`); d.setMonth(d.getMonth() + 1); }
        return out;
    }

    let styleInjected = false;
    function injectStyle() {
        if (styleInjected) return;
        styleInjected = true;
        const css = '.dr-control{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0;}'
            + '.dr-control .dr-preset{padding:5px 12px;border:1px solid #aaa;background:#fff;cursor:pointer;border-radius:4px;font-size:.9em;}'
            + '.dr-control .dr-preset.active{background:#3a2b4d;color:#fff;border-color:#3a2b4d;}'
            + '.dr-control input[type=date]{padding:4px 6px;}'
            + '.dr-control .dr-sep{color:#888;}'
            + '.dr-control .dr-apply{padding:5px 12px;border:1px solid #3a2b4d;background:#3a2b4d;color:#fff;border-radius:4px;cursor:pointer;}';
        const el = document.createElement('style');
        el.textContent = css;
        document.head.appendChild(el);
    }

    function create(container, opts) {
        opts = opts || {};
        injectStyle();
        const presets = opts.presets || [['7d', '7일'], ['30d', '30일'], ['3m', '3개월'], ['1y', '1년'], ['all', '전체']];
        container.classList.add('dr-control');
        container.innerHTML =
            presets.map(([k, l]) => `<button type="button" class="dr-preset" data-p="${k}">${l}</button>`).join('')
            + '<input type="date" class="dr-start"><span class="dr-sep">~</span><input type="date" class="dr-end">'
            + '<button type="button" class="dr-apply">적용</button>';

        const startEl = container.querySelector('.dr-start');
        const endEl = container.querySelector('.dr-end');
        const fire = () => { if (opts.onApply) opts.onApply({ start: startEl.value, end: endEl.value }); };
        const setActive = key => container.querySelectorAll('.dr-preset').forEach(b => b.classList.toggle('active', b.dataset.p === key));
        const setRange = r => { startEl.value = r.start; endEl.value = r.end; };

        container.querySelectorAll('.dr-preset').forEach(b => b.addEventListener('click', () => {
            setRange(presetRange(b.dataset.p));
            setActive(b.dataset.p);
            fire();
        }));
        // 날짜 직접 편집 시 프리셋 강조 해제 (적용 버튼 또는 Enter로 반영)
        [startEl, endEl].forEach(el => el.addEventListener('change', () => setActive(null)));
        container.querySelector('.dr-apply').addEventListener('click', fire);

        const def = opts.defaultPreset || 'all';
        setRange(presetRange(def));
        setActive(def);
        return { get: () => ({ start: startEl.value, end: endEl.value }), setRange };
    }

    root.DateRangeControl = { create, presetRange, monthsBetween, fmt };
})(window);
