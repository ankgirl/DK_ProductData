import { getAllOrders } from './aGlobalMain.js';

document.addEventListener("DOMContentLoaded", async function () {
    const makeTotalOrderButton = document.getElementById("makeTotalOrderButton");
    const messageDiv = document.getElementById("message");

    makeTotalOrderButton.addEventListener("click", async function () {
        const orderNumber = "9999999999";
        const orders = await getAllOrders();
        console.log(orders);

        const emptyOrderData = {
            ProductOrders: {}, // 바코드 기준으로 통합
            총수량: 0,
            총주문금액: 0,
            총결제금액: 0,
            총원가금액: 0,
            기본배송비: '',
            배송메세지: '',
            수취인이름: '',
            택배접수번호: '',
            서비스제품금액: 0
        };

        orders.forEach(order => {
            //console.error(order);

            Object.values(order.ProductOrders).forEach(productOrder => {
                //console.error(productOrder);

                const barcode = productOrder.바코드; // 바코드 기준으로 통합
                if (!barcode) return; // 바코드가 없으면 건너뛰기

                // 이미 바코드가 존재하면 상품수량 추가
                if (emptyOrderData.ProductOrders[barcode]) {
                    emptyOrderData.ProductOrders[barcode].상품수량 += productOrder.상품수량;
                } else {
                    // 바코드가 존재하지 않으면 새로운 데이터 추가
                    emptyOrderData.ProductOrders[barcode] = {
                        SellerCode: productOrder.SellerCode || '',
                        SellerCode: productOrder.SellerCode ? productOrder.SellerCode.replace("SET_", "") : '',                        
                        바코드: barcode,
                        보여주기용옵션명: productOrder.보여주기용옵션명 || '',
                        상품명: productOrder.상품명 || '',
                        상품수량: productOrder.상품수량 || 0,
                        실제이미지URL: productOrder.실제이미지URL || '',
                        옵션이미지URL: productOrder.옵션이미지URL || '',
                        옵션정보: productOrder.옵션정보 || '',
                        입고차수: productOrder.입고차수 || ''
                    };
                }
            });
        });

        // 총 수량 계산
        emptyOrderData.총수량 = Object.values(emptyOrderData.ProductOrders).reduce((sum, item) => sum + item.상품수량, 0);

        try {
            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
            await orderDocRef.set(emptyOrderData, { merge: true });
            messageDiv.innerHTML += `<p>통합 주문서 ${orderNumber} 생성 성공!</p>`;
        } catch (error) {
            console.error("Error writing document: ", error);
            messageDiv.innerHTML += `<p>통합 주문서 ${orderNumber} 생성 중 오류 발생: ${error.message}</p>`;
        }
    });
});
