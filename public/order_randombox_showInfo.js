
console.log("2");

export function clearOrderData() {
    updateElementsByClass('orderNumber', '');
    updateElementsByClass('luckyRandomBoxPrice', '');
    updateElementsByClass('randomBoxStyle', '');
    updateElementsByClass('productQuantity', '');
    updateElementsByClass('totalProductPrice', '');
    updateElementsByClass('totalProductCost', '');
    updateElementsByClass('netProfit', '');
}

export async function ShowOrderData(orderData) {
    console.log(orderData);
    if (!orderData) {
        clearOrderData();
        return;
    }

    // 클래스에 맞게 값을 업데이트하는 함수 호출
    updateElementsByClass('orderNumber', orderData.orderNumber);
    updateElementsByClass('luckyRandomBoxPrice', orderData.럭키랜덤박스가격 || 0);
    updateElementsByClass('randomBoxStyle', orderData.스타일 || '');
    updateElementsByClass('productQuantity', orderData.제품수량 || 0);
    updateElementsByClass('totalProductPrice', orderData.총제품가격 || 0);
    updateElementsByClass('totalProductCost', orderData.총제품원가 || 0);
    updateElementsByClass('netProfit', (orderData.럭키랜덤박스가격 || 0) - (orderData.총제품원가 || 0));

    // 제품 정보 테이블 업데이트
    const productTableBody = document.querySelector('.randomItemDetails');
    productTableBody.innerHTML = '';  // 테이블을 초기화

    if (orderData.ProductRandomboxItem && orderData.ProductRandomboxItem.length > 0) {
        orderData.ProductRandomboxItem.forEach((item, index) => {
            const row = `
                    <tr>
                        <td>${item.판매자상품코드}</td>
                        <td>${item.옵션정보}</td>
                        <td>${item.수량 || 1}</td>  <!-- 수량이 없으면 기본값 1 -->
                        <td>${item.원가 || 0}</td>
                        <td>${item.할인가 || 0}</td>
                        <td>${item.판매가 || 0}</td>
                        <td>${item.바코드}</td>
                        <td><img src="${item.옵션이미지}" alt="옵션이미지" width="150"></td>
                        <td><img src="${item.실제이미지}" alt="실제이미지" width="150"></td>
                        <td><button class="deleteItemButton" data-index="${index}">삭제</button></td>
                    </tr>                `;
            productTableBody.innerHTML += row;
        });
    }

    // 삭제 버튼 이벤트 리스너 추가
    const deleteButtons = document.querySelectorAll('.deleteItemButton');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function () {
            const index = parseInt(this.getAttribute('data-index'));
            deleteItemFromOrder(index, orderData);  // 삭제 함수 호출
        });
    });

    // 영수증 테이블 업데이트
    const receiptTableBody = document.querySelector('.randomItemDetailsRecipt');  // 영수증 테이블의 tbody를 선택
    receiptTableBody.innerHTML = '';  // 영수증 테이블 초기화

    if (orderData.ProductRandomboxItem && orderData.ProductRandomboxItem.length > 0) {
        orderData.ProductRandomboxItem.forEach(item => {
            const receiptRow = `
                <tr>
                    <td>${item.제품명}</td>
                    <td><img src="${item.옵션이미지}" alt="옵션이미지" width="150"></td>
                    <td>${item.판매가 || 0}</td>
                    <!-- <td><img src="https://api.qrserver.com/v1/create-qr-code/?data=${item.스토어링크}&size=100x100" alt="-"></td> -->
                </tr>
            `;
            receiptTableBody.innerHTML += receiptRow;
        });
    }

}




export function updateElementsByClass(className, value) {
    const elements = document.querySelectorAll(`.${className}`);
    elements.forEach(element => {
        element.textContent = value;
    });
}

export function deleteItemFromOrder(index, orderData) {
    // 해당 인덱스의 아이템 삭제
    if (orderData.ProductRandomboxItem && orderData.ProductRandomboxItem.length > index) {
        orderData.ProductRandomboxItem.splice(index, 1);

        // 제품수량, 총제품가격, 총제품원가 다시 계산
        orderData.제품수량 = orderData.ProductRandomboxItem.length;
        orderData.총제품가격 = orderData.ProductRandomboxItem.reduce((acc, item) => acc + (parseFloat(item.판매가) || 0), 0);
        orderData.총제품원가 = orderData.ProductRandomboxItem.reduce((acc, item) => acc + (parseFloat(item.원가) || 0), 0);

        // Firebase에 업데이트
        const orderDocRef = firebase.firestore().collection('RandomboxOrders').doc(orderData.id);
        orderDocRef.set(orderData, { merge: true }).then(() => {
            ShowOrderData(orderData);  // UI 업데이트
        }).catch(error => {
            console.error("Error updating order after deletion: ", error);
        });
    }
}
