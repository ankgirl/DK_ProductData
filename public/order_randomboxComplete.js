// order_randomboxComplete.js

import { updateProductCounts } from './barcode_search.js';

export async function packingRandomboxComplete(orderData, messageDiv) {
    try {
        if (!orderData || !orderData.ProductRandomboxItem || orderData.ProductRandomboxItem.length === 0) {
            console.log("포장할 제품 정보가 없습니다.");
            return;
        }

        // ProductRandomboxItem 배열을 순회하며 바코드와 수량 추출
        for (const product of orderData.ProductRandomboxItem) {
            const barcode = product.바코드;
            const quantity = product.수량;

            if (barcode && quantity > 0) {
                // updateProductCounts 함수 호출하여 바코드별로 수량 업데이트
                await updateProductCounts(barcode, quantity, firebase.firestore());
                console.log(`바코드: ${barcode}, 수량: ${quantity} 업데이트 완료`);
            } else {
                console.log(`바코드 또는 수량 값이 없습니다: 바코드(${barcode}), 수량(${quantity})`);
            }
        }
        messageDiv.innerHTML += `<p>모든 바코드와 수량이 성공적으로 업데이트되었습니다. ${error.message}</p>`;
        console.log("모든 바코드와 수량이 성공적으로 업데이트되었습니다.");
        

    } catch (error) {
        messageDiv.innerHTML += `<p>제품 수량 업데이트 중 오류 발생: ${error.message}</p>`;
        console.error("제품 수량 업데이트 중 오류 발생: ", error);
        
    }
}

