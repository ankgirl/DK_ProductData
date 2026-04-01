// order_processing2_makeTotalOrder.js

import { getAllOrders, reInitializeOrderMap } from './aGlobalMain.js';
import { loadOrderNumbers2 } from './order_processing2_display.js';

export const TOTAL_ORDER_NUMBER = '9999999999';

// ─── 모든 주문에서 통합 주문 데이터 생성 (순수 함수, 테스트 가능) ─────────────
/**
 * @param {Array<Object>} orders  - Firebase에서 가져온 주문 배열
 * @returns {Object} totalOrderData
 */
export function buildTotalOrderData(orders) {
    const totalOrderData = {
        ProductOrders:  {},
        총수량:         0,
        총주문금액:     0,
        총결제금액:     0,
        총원가금액:     0,
        기본배송비:     '',
        배송메세지:     '',
        수취인이름:     '',
        운송장번호:     '',
        서비스제품금액: 0,
    };

    orders.forEach(order => {
        Object.values(order.ProductOrders).forEach(productOrder => {
            const barcode = productOrder.바코드;
            if (!barcode) return;

            if (totalOrderData.ProductOrders[barcode]) {
                totalOrderData.ProductOrders[barcode].상품수량 += productOrder.상품수량;
            } else {
                totalOrderData.ProductOrders[barcode] = {
                    SellerCode:       productOrder.SellerCode
                                        ? productOrder.SellerCode.replace('SET_', '')
                                        : '',
                    바코드:           barcode,
                    보여주기용옵션명: productOrder.보여주기용옵션명 || '',
                    상품명:           productOrder.상품명 || '',
                    상품수량:         productOrder.상품수량 || 0,
                    실제이미지URL:    productOrder.실제이미지URL || '',
                    옵션이미지URL:    productOrder.옵션이미지URL || '',
                    옵션정보:         productOrder.옵션정보 || '',
                    입고차수:         productOrder.입고차수 || '',
                };
            }
        });
    });

    totalOrderData.총수량 = Object.values(totalOrderData.ProductOrders)
        .reduce((sum, item) => sum + item.상품수량, 0);

    return totalOrderData;
}

// ─── DOMContentLoaded ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
    const makeTotalOrderButton = document.getElementById('makeTotalOrderButton');
    const messageDiv           = document.getElementById('message');
    const orderDropdown        = document.getElementById('orderDropdown');

    makeTotalOrderButton.addEventListener('click', async function () {
        try {
            const orders         = await getAllOrders();
            const totalOrderData = buildTotalOrderData(orders);

            const orderDocRef = firebase.firestore().collection('Orders').doc(TOTAL_ORDER_NUMBER);
            await orderDocRef.set(totalOrderData, { merge: true });
            await reInitializeOrderMap();
            messageDiv.innerHTML += `<p>통합 주문서 ${TOTAL_ORDER_NUMBER} 생성 성공!</p>`;
            loadOrderNumbers2(orderDropdown, messageDiv);
        } catch (error) {
            console.error('Error writing document:', error);
            messageDiv.innerHTML += `<p>통합 주문서 생성 중 오류 발생: ${error.message}</p>`;
        }
    });
});
