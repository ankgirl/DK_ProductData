import { generateImageURLs } from './generateImageURLs.js';

document.addEventListener("DOMContentLoaded", function() {
    const orderDropdown = document.getElementById("orderDropdown");
    const orderDetails = document.getElementById("orderDetails");
    const serviceDetails = document.createElement("div");
    const messageDiv = document.getElementById("message");
    const barcodeInput = document.getElementById("barcodeInput");
    const serviceBarcodeInput = document.getElementById("serviceBarcodeInput");

    loadOrderNumbers();

    orderDropdown.addEventListener("change", displayOrderDetails);

    barcodeInput.addEventListener("keypress", function(event) {
        if (event.key === 'Enter') {
            const barcode = barcodeInput.value.trim();
            if (barcode) {
                checkBarcode(barcode);
                barcodeInput.value = '';  // 입력 후 입력란 지우기
            }
        }
    });

    serviceBarcodeInput.addEventListener("keypress", function(event) {
        if (event.key === 'Enter') {
            const barcode = serviceBarcodeInput.value.trim();
            if (barcode) {
                checkServiceBarcode(barcode);
                serviceBarcodeInput.value = '';  // 입력 후 입력란 지우기
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

                let serviceDetailsHTML = `
                    <h3>서비스 상품 정보</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>판매자 상품코드</th>
                                <th>Discounted Price</th>
                                <th>원가</th>
                                <th>옵션이미지</th>
                                <th>실제이미지</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                productServices.forEach(service => {
                    serviceDetailsHTML += `
                        <tr>
                            <td>${service.판매자상품코드}</td>
                            <td>${service.DiscountedPrice}</td>
                            <td>${service.원가}</td>
                            <td><img src="${service.옵션이미지URL}" alt="옵션이미지" width="50"></td>
                            <td><img src="${service.실제이미지URL}" alt="실제이미지" width="50"></td>
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

    async function checkServiceBarcode(barcode) {
        try {
            let productSnapshot = await firebase.firestore().collection('Products').where('바코드', '==', barcode).get();
            let productData;

            if (productSnapshot.empty) {
                // OptionDatas 내부에서 바코드를 검색
                productSnapshot = await firebase.firestore().collection('Products').get();
                productSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.OptionDatas) {
                        for (let optionKey in data.OptionDatas) {
                            if (data.OptionDatas[optionKey].바코드 === barcode) {
                                productData = {
                                    ...data,
                                    optionKey,
                                    바코드: data.OptionDatas[optionKey].바코드,
                                    원가: data.원가,
                                    입고차수: data.소분류명,
                                };

                                const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(data.SellerCode, optionKey, data.소분류명);

                                productData.옵션이미지URL = 옵션이미지URL;
                                productData.실제이미지URL = 실제이미지URL;
                            }
                        }
                    }
                });

                if (!productData) {
                    alert("일치하는 서비스를 찾을 수 없습니다.");
                    return;
                }
            } else {
                const productDoc = productSnapshot.docs[0];
                productData = productDoc.data();

                const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(productData.SellerCode, productData.optionKey, productData.소분류명);

                productData.옵션이미지URL = 옵션이미지URL;
                productData.실제이미지URL = 실제이미지URL;
            }

            const orderNumber = orderDropdown.value;

            if (!orderNumber) {
                alert("먼저 주문 번호를 선택해주세요.");
                return;
            }

            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
            const orderDoc = await orderDocRef.get();

            if (orderDoc.exists) {
                const orderData = orderDoc.data();
                if (!orderData.ProductService) {
                    orderData.ProductService = [];
                }

                const serviceData = {
                    원가: productData.원가 || 0,
                    입고차수: productData.소분류명 ? productData.소분류명.replace("차입고", "") : '',
                    판매자상품코드: productData.SellerCode || '',
                    옵션정보: productData.optionKey || '',
                    실제이미지URL: productData.실제이미지URL || '',
                    옵션이미지URL: productData.옵션이미지URL || '',
                    DiscountedPrice: productData.DiscountedPrice
                };

                orderData.ProductService.push(serviceData);
                await orderDocRef.set(orderData, { merge: true });

                messageDiv.innerHTML += `<p>서비스 상품 바코드 ${barcode} 저장 성공!</p>`;
                displayOrderDetails();  // 데이터 저장 후 상세 정보 다시 표시
            } else {
                alert("선택된 주문 번호에 대한 정보를 찾을 수 없습니다.");
            }
        } catch (error) {
            console.error("Error processing service barcode: ", error);
            messageDiv.innerHTML += `<p>서비스 상품 바코드 처리 중 오류 발생: ${error.message}</p>`;
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
