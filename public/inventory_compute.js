// inventory_compute.js — 재고 가치 계산 "순수 로직" (DOM/Firebase 의존 없음)
// 브라우저(admin_inventory_value.js)와 Cloud Function(functions/index.js)이 같은 파일을 공유한다.
// → 화면에 표시되는 값과 자정에 기록되는 스냅샷 값이 절대 어긋나지 않도록 단일 소스로 유지.
//
// 단일 소스 = 이 파일(public/). Function 배포 시 predeploy 단계에서 functions/로 복사된다.
// (firebase.json functions.predeploy 참고)

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(); // Node (Cloud Function)
    } else {
        root.InventoryCompute = factory(); // 브라우저
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

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
    // docs: Map<id, data> (id = 셀러코드, SET_ 접두 = 세트 문서). exclude: Set<본품셀러코드>
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

    return { classifyRoom, sumOptionCounts, newAcc, addAcc, computeInventory };
});
