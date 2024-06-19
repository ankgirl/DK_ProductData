import { generateImageURLs } from './generateImageURLs.js';
import { searchByBarcode } from './barcode_search.js';

// loadOrderNumbers 함수 정의
export async function loadOrderNumbers(orderDropdown, messageDiv) {
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

        // displayOrderDetails 함수 추가
        orderDropdown.addEventListener("change", async function() {
            const orderNumber = orderDropdown.value;
            if (!orderNumber) return;

            try {
                const orderDoc = await firebase.firestore().collection('Orders').doc(orderNumber).get();
                if (orderDoc.exists) {
                    const orderData = orderDoc.data();
                    const productOrders = orderData.ProductOrders || {};
                    const productServices = orderData.ProductService || [];

                    // 서비스총원가금액 및 주문원가합산금액은 DB에서 가져옴
                    const serviceTotalCost = orderData.서비스총원가금액 || 0;
                    const totalCost = orderData.주문원가합산금액 || 0;

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

                    document.getElementById('orderDetails').innerHTML = orderDetailsHTML;

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

                    const serviceDetails = document.createElement('div');
                    serviceDetails.innerHTML = serviceDetailsHTML;
                    document.getElementById('orderDetails').appendChild(serviceDetails);

                } else {
                    document.getElementById('orderDetails').innerHTML = "<p>주문 정보를 찾을 수 없습니다.</p>";
                    document.getElementById('serviceDetails').innerHTML = "";
                }
            } catch (error) {
                console.error("Error loading order details: ", error);
                document.getElementById('orderDetails').innerHTML = `<p>주문 정보 로드 중 오류 발생: ${error.message}</p>`;
                document.getElementById('serviceDetails').innerHTML = "";
            }
        });
    } catch (error) {
        console.error("Error loading order numbers: ", error);
        messageDiv.innerHTML += `<p>주문번호 로드 중 오류 발생: ${error.message}</p>`;
    }
}

// checkServiceBarcode 함수 정의
export async function checkServiceBarcode(barcode, orderDropdown, messageDiv) {
    try {
        const productsFound = await searchByBarcode(barcode, firebase.firestore());
        let productData;
        let optionKey = ''; // 기본값으로 빈 문자열 설정

        if (!productsFound) {
            alert("일치하는 서비스를 찾을 수 없습니다.");
            return;
        } else {
            productData = productsFound[0];
            optionKey = productData.matchedOption || ''; // matchedOption이 있으면 사용, 없으면 빈 문자열
            const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(productData.SellerCode, optionKey, productData.소분류명);

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
                옵션정보: optionKey, // 일치하는 옵션의 키를 사용
                실제이미지URL: productData.실제이미지URL || '',
                옵션이미지URL: productData.옵션이미지URL || '',
                바코드: barcode,  // 바코드 추가
                DiscountedPrice: productData.DiscountedPrice
            };

            orderData.ProductService.push(serviceData);

              // 모든 서비스 제품 원가 합산 (숫자로 변환하여 합산)
              const newServiceTotalCost = orderData.ProductService.reduce((acc, service) => acc + (parseFloat(service.원가) || 0), 0);
              orderData.서비스총원가금액 = newServiceTotalCost;
  
              // 주문원가합산금액 업데이트
              const productTotalCost = parseFloat(orderData.총원가금액) || 0;
              const newOrderTotalCost = productTotalCost + newServiceTotalCost;
              orderData.주문원가합산금액 = newOrderTotalCost;

            await orderDocRef.set(orderData, { merge: true });

            messageDiv.innerHTML += `<p>서비스 상품 바코드 ${barcode} 저장 성공!</p>`;

            await loadOrderNumbers(orderDropdown, messageDiv);
            orderDropdown.value = orderNumber;
            orderDropdown.dispatchEvent(new Event('change'));

            return orderData;  // 데이터 저장 후 상세 정보 반환
        } else {
            alert("선택된 주문 번호에 대한 정보를 찾을 수 없습니다.");
        }
    } catch (error) {
        console.error("Error processing service barcode: ", error);
        messageDiv.innerHTML += `<p>서비스 상품 바코드 처리 중 오류 발생: ${error.message}</p>`;
    }
    return null;
}

// checkBarcode 함수 정의
export function checkBarcode(barcode, orderDetails) {
    const rows = orderDetails.querySelectorAll("tbody tr");
    let found = false;

    rows.forEach(row => {
        const barcodeCell = row.cells[9];
        const packingQuantityInput = row.querySelector(".packingQuantity");
        const quantityCell = row.cells[4];
        const checkbox = row.querySelector(".barcodeCheck");

        if (barcodeCell) {
            console.log(`Checking barcode: ${barcodeCell.textContent} against input barcode: ${barcode}`);
        }

        if (barcodeCell && barcodeCell.textContent === barcode) {
            found = true;  // 일치하는 바코드가 있을 경우 found를 true로 설정

            let currentPackingQuantity = parseInt(packingQuantityInput.value) || 0;
            packingQuantityInput.value = currentPackingQuantity + 1;

            if (packingQuantityInput.value == quantityCell.textContent) {
                checkbox.checked = true;
            }
        }
    });

    if (!found) {
        alert("일치하는 바코드를 찾을 수 없습니다.");
    }
}
