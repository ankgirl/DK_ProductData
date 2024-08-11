// order_upload.js


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

function generateOrderNumber() {
    // 현재 날짜 가져오기
    const now = new Date();
    
    // 년도, 월, 일 추출 및 문자열로 변환
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // 월은 0부터 시작하므로 1 더해줌
    const day = now.getDate().toString().padStart(2, '0');
    
    // 8자리 랜덤 숫자 생성
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    
    // 주문번호 생성
    const orderNumber = `${year}${month}${day}${randomDigits}`;
    
    return orderNumber;
}
