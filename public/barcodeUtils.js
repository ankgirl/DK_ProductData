// barcodeUtils.js — 바코드/수량 입력 공용 유틸 (plain script, window.BarcodeUtils 로 노출)
// 목적: 여러 화면에 흩어져 중복되던 "바코드 정제 / 수량 검증 / 입고차수 매칭" 로직을 한 곳으로 모아
//       모든 호출부가 같은 규칙을 공유하도록 한다. (CLAUDE.md: 같은 로직 복사 금지)
//
// 사용처:
//  - admin_intake_barcode.js (신상 입고 일괄 바코드/수량 등록)
//  - (향후) displayProductData.js / aGlobalMain.js 의 refineInputValue 도 이 파일로 통일 예정
//    ※ 위 둘은 라이브 재고 저장 경로라 이번엔 건드리지 않음. 지금은 이 파일이 "정본(正本)".
(function (root) {
    'use strict';

    // ---- 바코드 정제 ----
    // 스캐너/수기 입력에서 섞여 들어오는 특수문자( ) * 제거 + 한글자모→영문키 매핑.
    // (한글 IME 상태로 스캔하면 바코드가 한글로 찍히는 사고 방지. 기존 두 사본의 합집합 맵.)
    const koreanToEnglishMap = {
        'ㄱ': 'R', 'ㄲ': 'RR', 'ㄴ': 'S', 'ㄷ': 'E', 'ㄸ': 'EE', 'ㄹ': 'F', 'ㅁ': 'A', 'ㅂ': 'Q', 'ㅃ': 'QQ', 'ㅅ': 'T', 'ㅆ': 'TT', 'ㅇ': 'D', 'ㅈ': 'W', 'ㅉ': 'WW', 'ㅊ': 'C', 'ㅋ': 'Z', 'ㅌ': 'X', 'ㅍ': 'V', 'ㅎ': 'G',
        'ㅏ': 'K', 'ㅐ': 'O', 'ㅑ': 'I', 'ㅒ': 'OI', 'ㅓ': 'J', 'ㅔ': 'P', 'ㅕ': 'U', 'ㅖ': 'PU', 'ㅗ': 'H', 'ㅘ': 'HK', 'ㅙ': 'HO', 'ㅚ': 'HL', 'ㅛ': 'Y', 'ㅜ': 'N', 'ㅝ': 'NJ', 'ㅞ': 'NP', 'ㅟ': 'NL', 'ㅠ': 'B', 'ㅡ': 'M', 'ㅢ': 'ML', 'ㅣ': 'L',
        '가': 'RK', '나': 'SK', '다': 'EK', '라': 'FK', '마': 'AK', '바': 'QK', '사': 'TK', '아': 'DK', '자': 'WK', '차': 'CK', '카': 'ZK', '타': 'XK', '파': 'VK', '하': 'GK',
        '이': 'DL', '어': 'J', '리': 'DJFL', '느': 'SM'
    };

    function refineBarcode(input) {
        let refined = String(input == null ? '' : input).replace(/[()*]/g, '');
        refined = refined.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, m => koreanToEnglishMap[m] || '');
        return refined.trim();
    }

    // ---- 수량 입력 검증 ----
    // 바코드(보통 8~13자리 큰 수)를 수량칸에 잘못 입력하는 실수를 막는 상한.
    const MAX_REASONABLE_COUNT = 10000;

    /**
     * 수량 입력값 검증. 빈 칸은 '변경 없음'(value=null)으로 통과.
     * @returns {{ok:boolean, value:(number|null), reason:string}}
     */
    function validateCountInput(raw) {
        const s = String(raw == null ? '' : raw).trim();
        if (s === '') return { ok: true, value: null, reason: '' };
        if (!/^-?\d+$/.test(s)) return { ok: false, value: NaN, reason: '숫자가 아닌 값' };
        const n = parseInt(s, 10);
        if (n < 0) return { ok: false, value: n, reason: '음수는 입력할 수 없습니다' };
        if (n > MAX_REASONABLE_COUNT)
            return { ok: false, value: n, reason: `${MAX_REASONABLE_COUNT.toLocaleString()}개 초과 — 바코드를 수량칸에 입력했을 가능성이 높습니다` };
        return { ok: true, value: n, reason: '' };
    }

    // ---- 입고차수(소분류명) 매칭 ----
    // 소분류명에서 "차입고"를 뗀 값. (예: "71차입고" → "71", "cat" → "cat")
    // search_from_database.js 의 검색 규칙과 동일하게 유지.
    function stripCategory(소분류명) {
        return String(소분류명 == null ? '' : 소분류명).replace('차입고', '').trim();
    }

    // ---- 예약(특수 명령) 바코드 ----
    // 주문처리에서 명령용으로 쓰는 값들 → 상품 바코드로 등록되면 주문처리 때 오작동하므로 등록 금지.
    //   1111111111 포장완료 · 5555555555 운송장칸 이동 · 9999999999 구매바코드칸 이동
    const RESERVED_BARCODES = ['1111111111', '5555555555', '9999999999'];
    function isReservedBarcode(v) {
        return RESERVED_BARCODES.indexOf(String(v == null ? '' : v).trim()) !== -1;
    }

    // ---- 자체 바코드 생성 (DK + 숫자 9자리) ----
    // 제조사 바코드가 전 옵션 동일한 제품은 옵션 구분이 불가능하므로 우리 바코드를 새로 발급해 라벨을 붙인다.
    // 형식은 지금까지 써 온 것과 동일: DK819573167 · DK016432684 (앞자리 0 있음 → 반드시 문자열로 다룰 것)
    // Code128로 인쇄되며 일반 스캐너가 그대로 읽는다.
    const DK_PREFIX = 'DK', DK_DIGITS = 9;
    const DK_PATTERN = /^DK\d{9}$/;

    function isDkBarcode(v) { return DK_PATTERN.test(String(v == null ? '' : v).trim()); }

    function randomDigits(n) {
        const c = window.crypto || window.msCrypto;
        const a = new Uint32Array(n);
        c.getRandomValues(a);                       // Math.random 대신 암호학적 난수 → 편향/중복 최소화
        let s = '';
        for (let i = 0; i < n; i++) s += String(a[i] % 10);
        return s;
    }

    /**
     * 중복되지 않는 새 DK 바코드 생성.
     * @param {(v:string)=>boolean} isTaken 이미 쓰이는 값인지 판정(상품 인덱스 + 생성기록 둘 다 확인해야 함)
     * @param {number} [maxTries=20]
     * @returns {string} 예: 'DK819573167'
     * @throws 모든 시도가 중복이면 에러(조용히 넘어가지 않음 — 중복 바코드가 등록되는 게 최악이므로)
     */
    function generateDkBarcode(isTaken, maxTries) {
        const tries = maxTries || 20;
        for (let i = 0; i < tries; i++) {
            const v = DK_PREFIX + randomDigits(DK_DIGITS);
            if (isReservedBarcode(v)) continue;
            if (typeof isTaken === 'function' && isTaken(v)) continue;
            return v;
        }
        throw new Error(`바코드 생성 실패: ${tries}회 모두 이미 쓰이는 값이었습니다. (기록이 손상됐을 수 있으니 확인 필요)`);
    }

    // ---- 바코드 인덱스 ----
    // 전 상품 Map(id→data)을 훑어 바코드 → 사용처[{code, option}] 목록을 만든다.
    // option === null 은 문서레벨 Barcode(구형). 신상입고(중복검사)·재입고(옵션조회)가 공유.
    function buildBarcodeIndex(docsMap) {
        const index = new Map();
        docsMap.forEach((data, id) => {
            const add = (bc, option) => {
                const v = String(bc == null ? '' : bc).trim();
                if (!v) return;
                if (!index.has(v)) index.set(v, []);
                index.get(v).push({ code: id, option });
            };
            if (data.Barcode) add(data.Barcode, null);
            const od = data.OptionDatas || {};
            for (const k in od) add(od[k].바코드, k);
        });
        return index;
    }

    root.BarcodeUtils = {
        refineBarcode, validateCountInput, stripCategory, buildBarcodeIndex, isReservedBarcode,
        generateDkBarcode, isDkBarcode,
        RESERVED_BARCODES, MAX_REASONABLE_COUNT, DK_PREFIX, DK_DIGITS
    };
})(window);
