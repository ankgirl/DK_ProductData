// code128.js — Code128 바코드 → SVG 인코더 (외부 라이브러리·CDN 없음, window.Code128)
//
// 왜 자체 구현인가:
//   프린트는 window.open 으로 연 새 창에 HTML을 write 해서 뽑는다. 그 창에서 외부 CDN 스크립트를
//   로드하면 "로드 완료 전에 print() 가 실행"되는 타이밍 사고가 나기 쉽고, 인터넷이 느리면 빈 라벨이
//   나온다. 그래서 부모 창에서 미리 SVG 문자열을 만들어 넣는다. 의존성 0 · 오프라인에서도 동작.
//
// 심볼로지: Code128 (Code B 기본, 숫자가 길게 이어지면 Code C 로 자동 전환해 폭을 줄임)
//   → 영문+숫자 혼용(DK819573167) 가능. 일반 바코드 스캐너·라벨프린터가 기본 지원.
//
// 사용:
//   Code128.svg('DK819573167')            → <svg …> 문자열 (viewBox 단위 = 모듈 1개)
//   Code128.moduleCount('DK819573167')    → 총 모듈 수(퀘어존 포함) — 라벨 폭 대비 모듈 굵기 계산용
(function (root) {
    'use strict';

    // Code128 패턴표(값 0~106). 각 문자열은 [바,공백,바,공백,바,공백] 굵기(모듈 수), 합 11.
    // 106(STOP)만 7요소·합 13. 표가 정확해야 스캔이 되므로 _scratch/test_code128.js 로 불변식 검증함
    // (모든 패턴 합=11 · 바(0,2,4번째) 합이 짝수 · 중복 없음).
    const PATTERNS = [
        '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
        '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
        '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
        '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
        '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
        '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
        '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
        '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
        '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
        '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
        '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
    ];

    const START_B = 104, START_C = 105, CODE_C = 99, CODE_B = 100, STOP = 106;
    const QUIET = 10; // 좌우 여백(모듈) — 스캐너가 바코드 시작/끝을 인식하는 데 필수

    const isDigit = c => c >= '0' && c <= '9';

    /**
     * 문자열 → Code128 심볼 값 배열(시작문자 + 데이터 + 체크문자 + STOP).
     * Code B(ASCII 32~126)로 인코딩하되, 숫자가 길게 이어지면 Code C(2자리=1심볼)로 전환해 폭을 절반으로 줄인다.
     */
    function toValues(text) {
        const s = String(text == null ? '' : text);
        if (!s) throw new Error('바코드 값이 비어 있습니다.');

        const runFrom = i => { let n = 0; while (i + n < s.length && isDigit(s[i + n])) n++; return n; };
        const vals = [];
        let mode, i = 0;

        // 시작 모드: 맨 앞이 숫자 4개 이상이면 Code C 로 시작
        const head = runFrom(0);
        if (head >= 4) { mode = 'C'; vals.push(START_C); }
        else { mode = 'B'; vals.push(START_B); }

        while (i < s.length) {
            if (mode === 'C') {
                if (runFrom(i) >= 2) { vals.push(parseInt(s.substr(i, 2), 10)); i += 2; }
                else { vals.push(CODE_B); mode = 'B'; }   // 숫자가 끊기거나 1자리만 남음 → B로 복귀
            } else {
                const run = runFrom(i);
                // 숫자 6개 이상(또는 끝까지 4개 이상) → C 전환이 이득. 홀수면 한 자리를 B로 먼저 소화해 짝수를 맞춘다.
                if (run >= 6 || (run >= 4 && i + run === s.length)) {
                    if (run % 2 === 1) { vals.push(s.charCodeAt(i) - 32); i++; }
                    vals.push(CODE_C); mode = 'C';
                } else {
                    const c = s.charCodeAt(i);
                    if (c < 32 || c > 126) throw new Error(`Code128로 표현할 수 없는 문자입니다: "${s[i]}" (${text})`);
                    vals.push(c - 32); i++;
                }
            }
        }

        // 체크문자: (시작값 + Σ 위치×값) mod 103
        let sum = vals[0];
        for (let k = 1; k < vals.length; k++) sum += k * vals[k];
        vals.push(sum % 103);
        vals.push(STOP);
        return vals;
    }

    // 심볼 값 배열 → '1'(바)/'0'(공백) 문자열. 모든 패턴은 바로 시작한다.
    function toBits(text) {
        let bits = '';
        toValues(text).forEach(v => {
            const p = PATTERNS[v];
            for (let k = 0; k < p.length; k++) bits += (k % 2 === 0 ? '1' : '0').repeat(Number(p[k]));
        });
        return bits;
    }

    // 퀘어존 포함 총 모듈 수. (라벨 폭 ÷ 모듈수 = 모듈 1개 굵기 → 너무 얇으면 스캔 실패)
    function moduleCount(text) { return toBits(text).length + QUIET * 2; }

    /**
     * SVG 문자열 생성. viewBox 단위 = 모듈 1개이므로, 바깥 요소의 width/height(mm)에 맞춰 늘어난다.
     * @param {string} text  인코딩할 값
     * @param {{height?:number}} [opts] height: viewBox 높이(기본 40, 비율만 의미 있음)
     */
    function svg(text, opts) {
        const o = opts || {};
        const h = o.height || 40;
        const bits = toBits(text);
        const total = bits.length + QUIET * 2;

        let rects = '', i = 0;
        while (i < bits.length) {
            if (bits[i] === '1') {
                let j = i; while (j < bits.length && bits[j] === '1') j++;
                rects += `<rect x="${QUIET + i}" y="0" width="${j - i}" height="${h}"/>`;
                i = j;
            } else i++;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${h}" ` +
            `preserveAspectRatio="none" shape-rendering="crispEdges" ` +
            `style="width:100%;height:100%;display:block">` +
            `<rect x="0" y="0" width="${total}" height="${h}" fill="#fff"/>` +
            `<g fill="#000">${rects}</g></svg>`;
    }

    root.Code128 = { svg, moduleCount, toValues, toBits, PATTERNS, QUIET };
})(typeof window !== 'undefined' ? window : globalThis);
