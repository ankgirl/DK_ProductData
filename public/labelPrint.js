// labelPrint.js — 라벨(용지) 프린트 공용 엔진 (window.LabelPrint)
//
// 여러 화면에서 "라벨 1장당 1건" 프린트가 필요해 로직이 중복되던 것을 한 곳으로 모음.
// (CLAUDE.md: 같은 로직 복사 금지 — 셀러코드 라벨 / 생성 바코드 라벨이 이 엔진을 공유)
//
// 쓰는 곳:
//   admin_search_by_category.js   — 셀러코드 텍스트 라벨
//   admin_generated_barcodes.js   — Code128 바코드 라벨
//
// 사용:
//   LabelPrint.print({ widthMm:50, heightMm:30, title:'셀러코드 라벨',
//                      labels: codes.map(c => LabelPrint.textLabelHTML(c, 50)) })
//   → 팝업이 열려 인쇄를 시작했으면 true, 열지 못했으면 false 반환(호출부가 '프린트함' 기록 여부 판단).
(function (root) {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const clampMm = (v, def) => Math.max(10, Math.min(200, parseInt(v, 10) || def));

    // 라벨 폭(mm) 안에 한 줄로 들어가는 글자 크기(mm). 모노스페이스 글자폭 ≈ 0.62em 기준.
    function fitFontMm(text, widthMm, maxMm) {
        const usable = Math.max(5, widthMm - 3);
        const fs = usable / (0.62 * Math.max(String(text).length, 1));
        return Math.max(2.4, Math.min(maxMm || 9, fs)).toFixed(2);
    }

    // 텍스트만 있는 라벨(셀러코드 등)
    function textLabelHTML(text, widthMm) {
        return `<div class="lbl"><span style="font-size:${fitFontMm(text, widthMm)}mm">${esc(text)}</span></div>`;
    }

    /**
     * Code128 바코드 + 하단 사람이 읽는 번호 라벨. (code128.js 필요)
     * 바코드는 라벨 폭에 맞춰 늘어나므로, 모듈이 너무 얇아지면 warnIfTooThin 으로 미리 경고할 것.
     */
    function barcodeLabelHTML(code, widthMm, heightMm) {
        if (!root.Code128) throw new Error('code128.js 가 로드되지 않았습니다.');
        const bw = (widthMm - 3).toFixed(2);                       // 좌우 1.5mm 여백
        const bh = Math.max(4, heightMm * 0.55).toFixed(2);        // 바 높이 = 라벨 높이의 55%
        const fs = fitFontMm(code, widthMm, 3.6);
        return `<div class="lbl lbl-bc">` +
            `<div class="bc-svg" style="width:${bw}mm;height:${bh}mm">${root.Code128.svg(code)}</div>` +
            `<div class="bc-text" style="font-size:${fs}mm">${esc(code)}</div></div>`;
    }

    // 라벨 폭에서 모듈 1개가 몇 mm 인지. 0.19mm 미만이면 스캔 실패 위험(203dpi 프린터 1.5도트).
    function moduleWidthMm(code, widthMm) {
        if (!root.Code128) return null;
        return (widthMm - 3) / root.Code128.moduleCount(code);
    }

    /**
     * 라벨 인쇄. labels 배열의 각 HTML이 라벨 1장(용지 1장)이 된다.
     * @param {{widthMm:number, heightMm:number, labels:string[], title?:string, extraCSS?:string}} opts
     * @returns {boolean} 인쇄창을 실제로 띄웠으면 true
     */
    function print(opts) {
        const o = opts || {};
        const labels = o.labels || [];
        if (!labels.length) { alert('프린트할 라벨이 없습니다.'); return false; }

        const W = clampMm(o.widthMm, 50), H = clampMm(o.heightMm, 30);
        const w = window.open('', '_blank');
        if (!w) { alert('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해주세요.'); return false; }

        w.document.write(
            '<html><head><meta charset="utf-8"><title>' + esc(o.title || '라벨') + '</title><style>' +
            `@page{size:${W}mm ${H}mm;margin:0;}` +
            'html,body{margin:0;padding:0;}' +
            `.lbl{width:${W}mm;height:${H}mm;box-sizing:border-box;padding:1mm;` +
            'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
            'page-break-after:always;break-after:page;overflow:hidden;}' +
            '.lbl span,.lbl .bc-text{font-family:"Consolas","Malgun Gothic",monospace;font-weight:700;' +
            'letter-spacing:-0.2px;line-height:1.05;word-break:break-all;}' +
            '.lbl-bc .bc-svg{margin-bottom:0.6mm;}' +
            '.lbl:last-child{page-break-after:auto;break-after:auto;}' +
            (o.extraCSS || '') +
            '</style></head><body>' + labels.join('') + '</body></html>'
        );
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
        return true;
    }

    root.LabelPrint = { print, textLabelHTML, barcodeLabelHTML, fitFontMm, moduleWidthMm, clampMm, esc };
})(window);
