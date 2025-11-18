/**
 * payloadList에서 stock_quantity 또는 set_stock_quantity가 음수인 seller_code를 찾아 반환합니다.
 * @param {Array<Object>} payloadList - 검사할 페이로드 리스트.
 * @returns {Array<string>} - 재고가 음수인 seller_code 문자열 배열.
 */
export function findNegativeStockSellerCodes(payloadList) {
    // 중복 방지를 위해 Set을 사용합니다.
    const negativeStockCodes = new Set();

    for (const item of payloadList) {
        const { seller_code, options, set_stock_quantity } = item;

        // 1. set_stock_quantity 검사
        if (set_stock_quantity < 0) {
            negativeStockCodes.add(seller_code);
            // 이 seller_code가 이미 추가되었으므로 다음 item으로 넘어갑니다.
            continue; 
        }

        // 2. options 배열 내의 stock_quantity 검사
        if (options && Array.isArray(options)) {
            for (const option of options) {
                if (option.stock_quantity < 0) {
                    negativeStockCodes.add(seller_code);
                    // 이 seller_code에 대해 음수 재고가 발견되었으므로,
                    // 더 이상 이 options 배열을 검사할 필요 없이 다음 item으로 넘어갑니다.
                    break; 
                }
            }
        }
    }

    // Set을 배열로 변환하여 반환합니다.
    return Array.from(negativeStockCodes);
}