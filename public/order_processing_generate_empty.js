
import { generateOrderNumber } from './generateOrderNumber.js';

document.addEventListener("DOMContentLoaded", function() {
    const createEmptyOrderButton = document.getElementById("CreateEmptyOrderButton");
    const messageDiv = document.getElementById("message");

    createEmptyOrderButton.addEventListener("click", async function() {
        const orderNumber = generateOrderNumber();
        
        const emptyOrderData = {
            ProductOrders: {},
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

        try {
            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
            await orderDocRef.set(emptyOrderData, { merge: true });
            messageDiv.innerHTML += `<p>빈 주문서 ${orderNumber} 생성 성공!</p>`;
        } catch (error) {
            console.error("Error writing document: ", error);
            messageDiv.innerHTML += `<p>빈 주문서 ${orderNumber} 생성 중 오류 발생: ${error.message}</p>`;
        }
    });
});
