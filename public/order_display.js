document.addEventListener("DOMContentLoaded", function() {
    const orderDropdown = document.getElementById("orderDropdown");
    const orderDetails = document.getElementById("orderDetails");
    const messageDiv = document.getElementById("message");
    const barcodeInput = document.getElementById("barcodeInput");

    loadOrderNumbers();

    orderDropdown.addEventListener("change", displayOrderDetails);

    barcodeInput.addEventListener("keypress", function(event) {
        if (event.key === 'Enter') {
            const barcode = barcodeInput.value.trim();
            if (barcode) {
                checkBarcode(barcode);
            }
        }
    });

    async function loadOrderNumbers() {
        try {
            const ordersSnapshot = await firebase.firestore().collection('Orders').get();
            orderDropdown.innerHTML = "<option value=''>주문 번호 선택</option>";
            
            if (ordersSnapshot.empty) {
                console.log("No orders found");
                messageDiv.innerHTML += `<p>주문 번호가 없습니다.</p>`;
                return;
            }

            ordersSnapshot.forEach(doc => {
                const option = document.createElement("option");
                option.value = doc.id;
                option.textContent = doc.id;
                orderDropdown.appendChild(option);
            });

        } catch (error) {
            console.error("Error loading order numbers: ", error);
            messageDiv.innerHTML += `<p>주문번호 로드 중 오류 발생: ${error.message}</p>`;
        }
    }

    async function displayOrderDetails() {
        const orderNumber = orderDropdown.value;
        if (!orderNumber) return;

        try {
            const orderDoc = await firebase.firestore().collection('Orders').doc(orderNumber).get();
            if (orderDoc.exists) {
                const orderData = orderDoc.data();
                const productOrders = orderData.ProductOrders || {};

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
                    <p><strong>총원가금액:</strong> ${orderData.총원가금액}</p>
                    <p><strong>서비스제품금액:</strong> ${orderData.서비스제품금액}</p>
                `;

                orderDetailsHTML += `
                    <table>
                        <thead>
                            <tr>
                                <th>상품주문번호</th>
                                <th>판매자 상품코드</th>
                                <th>입고차수</th>
                                <th>옵션정보</th>
                                <th>수량</th>
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
                            <td>${order.상품주문번호}</td>
                            <td>${order.판매자상품코드}</td>
                            <td>${order.입고차수}</td>
                            <td>${order.옵션정보}</td>
                            <td style="${quantityStyle}">${order.상품수량}</td>
                            <td>${order.상품별총주문금액}</td>
                            <td>${order.원가}</td>
                            <td>${order.Counts}</td>
                            <td>${order.바코드}</td>
                            <td><img src="${order.옵션이미지URL}" alt="옵션이미지" width="50"></td>
                            <td><img src="${order.실제이미지URL}" alt="실제이미지" width="50"></td>
                            <td><input type="checkbox" class="barcodeCheck"></td>
                        </tr>
                    `;
                });

                orderDetailsHTML += `
                        </tbody>
                    </table>
                `;

                orderDetails.innerHTML = orderDetailsHTML;
            } else {
                orderDetails.innerHTML = "<p>주문 정보를 찾을 수 없습니다.</p>";
            }
        } catch (error) {
            console.error("Error loading order details: ", error);
            orderDetails.innerHTML = `<p>주문 정보 로드 중 오류 발생: ${error.message}</p>`;
        }
    }

    function checkBarcode(barcode) {
        const rows = orderDetails.querySelectorAll("tbody tr");
        let found = false;

        rows.forEach(row => {
            const barcodeCell = row.cells[8];
            if (barcodeCell && barcodeCell.textContent === barcode) {
                const checkbox = row.querySelector(".barcodeCheck");
                if (checkbox) {
                    checkbox.checked = true;
                }
                found = true;
            }
        });

        if (!found) {
            alert("일치하는 바코드를 찾을 수 없습니다.");
        }
    }

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
