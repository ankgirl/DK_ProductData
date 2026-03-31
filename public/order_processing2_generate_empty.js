// order_processing2_generate_empty.js

import { generateOrderNumber } from './generateOrderNumber.js';
import { reInitializeOrderMap } from './aGlobalMain.js';
import { loadOrderNumbers2 } from './order_processing2_display.js';

// ─── 빈 주문서 데이터 생성 (순수 함수, 테스트 가능) ─────────────────────────
/**
 * @param {string} orderNumber
 * @returns {Object} emptyOrderData
 */
export function createEmptyOrderData(orderNumber) {
    return {
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
        판매처:         '',
    };
}

// ─── DOMContentLoaded ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    const createEmptyOrderButton = document.getElementById('CreateEmptyOrderButton');
    const messageDiv             = document.getElementById('message');
    const orderDropdown          = document.getElementById('orderDropdown');

    createEmptyOrderButton.addEventListener('click', async function () {
        const orderNumber    = generateOrderNumber();
        const emptyOrderData = createEmptyOrderData(orderNumber);

        try {
            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
            await orderDocRef.set(emptyOrderData, { merge: true });
            await reInitializeOrderMap();
            messageDiv.innerHTML += `<p>빈 주문서 ${orderNumber} 생성 성공!</p>`;
            loadOrderNumbers2(orderDropdown, messageDiv);
        } catch (error) {
            console.error('Error writing document:', error);
            messageDiv.innerHTML += `<p>빈 주문서 ${orderNumber} 생성 중 오류 발생: ${error.message}</p>`;
        }
    });
});
