import { generateImageURLs } from './generateImageURLs.js';
import { loadOrderNumbers, checkServiceBarcode, checkBarcode } from './orderHelpers.js';
import { updateProductCounts } from './barcode_search.js';

document.addEventListener("DOMContentLoaded", function() {
    const orderDropdown = document.getElementById("orderDropdown");
    const orderDetails = document.getElementById("orderDetails");
    const serviceDetails = document.createElement("div");
    const messageDiv = document.getElementById("message");
    const barcodeInput = document.getElementById("barcodeInput");
    const serviceBarcodeInput = document.getElementById("serviceBarcodeInput");
    const packingCompleteButton = document.getElementById("packingCompleteButton");
    const manualBarcodeButton = document.getElementById("manualBarcodeButton");

    loadOrderNumbers(orderDropdown, messageDiv);

    orderDropdown.addEventListener("change", displayOrderDetails);

    barcodeInput.addEventListener("keypress", function(event) {
        if (event.key === 'Enter') {
            const barcode = barcodeInput.value.trim();
            if (barcode) {
                checkBarcode(barcode, orderDetails);
                barcodeInput.value = '';  // 입력 후 입력란 지우기
            }
        }
    });

    serviceBarcodeInput.addEventListener("keypress", async function(event) {
        if (event.key === 'Enter') {
            const barcode = serviceBarcodeInput.value.trim();
            if (barcode) {
                const orderData = await checkServiceBarcode(barcode, orderDropdown, messageDiv);
                if (orderData) {
                    displayOrderDetails();
                }
                serviceBarcodeInput.value = '';  // 입력 후 입력란 지우기
            }
        }
    });

    manualBarcodeButton.addEventListener("click", function() {
        // 상품정보 테이블의 모든 행에 대해 수량값을 포장수량에 입력하고 체크박스를 true로 변경
        const productRows = orderDetails.querySelectorAll("tbody tr");
        productRows.forEach(row => {
            const quantityCell = row.querySelector('[data-label="수량"]');
            const packingQuantityInput = row.querySelector('.packingQuantity');
            const checkbox = row.querySelector(".barcodeCheck");

            if (quantityCell && packingQuantityInput && checkbox) {
                packingQuantityInput.value = quantityCell.textContent;
                checkbox.checked = true;
            }
        });

        // 서비스 상품 정보 테이블의 모든 행에 대해 수량값을 포장수량에 입력하고 체크박스를 true로 변경
        const serviceRows = serviceDetails.querySelectorAll("tbody tr");
        serviceRows.forEach(row => {
            const quantityInput = row.querySelector('.serviceQuantity');
            const checkbox = row.querySelector(".barcodeCheck");

            if (quantityInput && checkbox) {
                checkbox.checked = true;
            }
        });
    });

    async function displayOrderDetails() {
        const orderNumber = orderDropdown.value;
        if (!orderNumber) return;

        try {
            const orderDoc = await firebase.firestore().collection('Orders').doc(orderNumber).get();
            if (orderDoc.exists) {
                const orderData = orderDoc.data();
                const productOrders = orderData.ProductOrders || {};
                const productServices = orderData.ProductService || [];

                // 서비스총원가금액 계산
                const serviceTotalCost = productServices.reduce((total, service) => total + (parseFloat(service.원가) || 0), 0);

                // 주문원가합산금액 계산
                const totalCost = serviceTotalCost + (parseFloat(orderData.총원가금액) || 0);

                // 판매자 상품코드 내림차순 및 옵션 정보 오름차순으로 정렬
                const sortedProductOrders = Object.values(productOrders).sort((a, b) => {
                    if (a.판매자상품코드 < b.판매자상품코드) return 1;
                    if (a.판매자상품코드 > b.판매자상품코드) return -1;
                    if (a.옵션정보 < b.옵션정보) return -1;
                    if (a.옵션정보 > b.옵션정보) return 1;
                    return 0;
                });

                let orderDetailsHTML = `
                    <h3>주문번호: ${orderNumber}</h3>
                    <p><strong>기본배송비:</strong> ${orderData.기본배송비}</p>
                    <p><strong>배송메세지:</strong> ${orderData.배송메세지}</p>
                    <p><strong>수취인이름:</strong> ${orderData.수취인이름}</p>
                    <p><strong>택배접수번호:</strong> ${orderData.택배접수번호}</p>
                    <p><strong>총수량:</strong> ${orderData.총수량}</p>
                    <p><strong>총주문금액:</strong> ${orderData.총주문금액}</p>
                    <p><strong>총결제금액:</strong> ${orderData.총결제금액}</p>
                    <p><strong>판매총원가금액:</strong> ${orderData.총원가금액}</p>
                    <p><strong>서비스제품금액:</strong> ${orderData.서비스제품금액}</p>
                    <p><strong>서비스총원가금액:</strong> ${serviceTotalCost}</p>
                    <p><strong>주문원가합산금액:</strong> ${totalCost}</p>
                `;

                orderDetailsHTML += `
                    <h3>상품 정보</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>상품주문번호</th>
                                <th>판매자 상품코드</th>
                                <th>입고차수</th>
                                <th>옵션정보</th>
                                <th>수량</th>
                                <th>포장수량</th>
                                <th>총가격</th>
                                <th>원가</th>
                                <th>Counts</th>
                                <th>바코드</th>
                                <th>옵션이미지</th>
                                <th>실제이미지</th>
                                <th>체크</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                sortedProductOrders.forEach(order => {
                    const quantityStyle = order.상품수량 !== 1 ? "font-weight: bold; color: red;" : "";
                    orderDetailsHTML += `
                        <tr>
                            <td data-label="상품주문번호">${order.상품주문번호}</td>
                            <td data-label="판매자상품코드">${order.판매자상품코드}</td>
                            <td data-label="입고차수">${order.입고차수}</td>
                            <td data-label="옵션정보">${order.옵션정보}</td>
                            <td data-label="수량" style="${quantityStyle}">${order.상품수량}</td>
                            <td><input type="number" class="packingQuantity" min="0" max="${order.상품수량}" value="0" data-label="포장수량"></td>
                            <td data-label="총가격">${order.상품별총주문금액}</td>
                            <td data-label="원가">${order.원가}</td>
                            <td data-label="Counts">${order.Counts}</td>
                            <td data-label="바코드">${order.바코드}</td>
                            <td data-label="옵션이미지"><img src="${order.옵션이미지URL}" alt="옵션이미지" width="50"></td>
                            <td data-label="실제이미지"><img src="${order.실제이미지URL}" alt="실제이미지" width="50"></td>
                            <td><input type="checkbox" class="barcodeCheck"></td>
                        </tr>
                    `;
                });

                orderDetailsHTML += `
                        </tbody>
                    </table>
                `;

                orderDetails.innerHTML = orderDetailsHTML;

                let serviceDetailsHTML = `
                    <h3>서비스 상품 정보</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>판매자 상품코드</th>
                                <th>바코드</th>
                                <th>Discounted Price</th>
                                <th>원가</th>
                                <th>수량</th> <!-- 수량 추가 -->
                                <th>옵션이미지</th>
                                <th>실제이미지</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                productServices.forEach(service => {
                    serviceDetailsHTML += `
                        <tr>
                            <td data-label="판매자상품코드">${service.판매자상품코드}</td>
                            <td data-label="바코드">${service.바코드}</td>
                            <td data-label="Discounted Price">${service.DiscountedPrice}</td>
                            <td data-label="원가">${service.원가}</td>
                            <td><input type="number" class="serviceQuantity" min="1" value="1" data-label="수량"></td> <!-- 수량 입력란 추가 -->
                            <td data-label="옵션이미지"><img src="${service.옵션이미지URL}" alt="옵션이미지" width="50"></td>
                            <td data-label="실제이미지"><img src="${service.실제이미지URL}" alt="실제이미지" width="50"></td>
                        </tr>
                    `;
                });

                serviceDetailsHTML += `
                        </tbody>
                    </table>
                `;

                serviceDetails.innerHTML = serviceDetailsHTML;
                orderDetails.appendChild(serviceDetails);

            } else {
                orderDetails.innerHTML = "<p>주문 정보를 찾을 수 없습니다.</p>";
                serviceDetails.innerHTML = "";
            }
        } catch (error) {
            console.error("Error loading order details: ", error);
            orderDetails.innerHTML = `<p>주문 정보 로드 중 오류 발생: ${error.message}</p>`;
            serviceDetails.innerHTML = "";
        }
    }

    packingCompleteButton.addEventListener('click', async function() {
        try {
            const orderNumber = orderDropdown.value;

            // 상품정보 테이블의 체크된 행만 처리
            const productRows = orderDetails.querySelectorAll("tbody tr");
            for (const row of productRows) {
                const checkbox = row.querySelector(".barcodeCheck");
                if (checkbox && checkbox.checked) {
                    const barcode = row.querySelector('[data-label="바코드"]').textContent;
                    const quantity = parseInt(row.querySelector('.packingQuantity').value, 10);
                    await updateProductCounts(barcode, quantity, firebase.firestore());
                }
            }

            // 서비스 상품 정보 모든 행 처리
            const serviceRows = serviceDetails.querySelectorAll("tbody tr");
            for (const row of serviceRows) {
                const barcode = row.querySelector('[data-label="바코드"]').textContent;
                const quantity = parseInt(row.querySelector('[data-label="수량"]').value, 10);
                await updateProductCounts(barcode, quantity, firebase.firestore());
            }

            // 주문 데이터를 CompletedOrders로 이동하고 Orders에서 삭제
            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
            const orderDoc = await orderDocRef.get();
            if (orderDoc.exists) {
                await firebase.firestore().collection('CompletedOrders').doc(orderNumber).set(orderDoc.data());
                await orderDocRef.delete();
            }

            // 화면 초기화
            orderDetails.innerHTML = "";
            serviceDetails.innerHTML = "";
            orderDropdown.value = "";
            messageDiv.innerHTML = "<p>모든 선택된 상품의 Counts가 업데이트되었으며, 주문이 완료되었습니다.</p>";

            // 주문 목록 갱신
            loadOrderNumbers(orderDropdown, messageDiv);

        } catch (error) {
            console.error("Error completing packing: ", error);
            messageDiv.innerHTML = `<p>포장 완료 중 오류 발생: ${error.message}</p>`;
        }
    });

    document.getElementById('printButton').addEventListener('click', function() {
        printOrderDetails();
    });

    function printOrderDetails() {
        const printContent = document.getElementById('orderDetails').innerHTML;
        const originalContent = document.body.innerHTML;

        const printWindow = window.open('', '', 'height=800,width=800');
        printWindow.document.write('<html><head><title>Print Order Details</title>');
        printWindow.document.write('<link rel="stylesheet" href="style.css">'); // 스타일을 동일하게 유지
        printWindow.document.write('</head><body>');
        printWindow.document.write(printContent);
        printWindow.document.write('</body></html>');

        printWindow.document.close();
        printWindow.print();
    }
});
