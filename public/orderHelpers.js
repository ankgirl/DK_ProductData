import { generateImageURLs } from './generateImageURLs.js';
import { searchByBarcode } from './barcode_search.js';
import { playDingDong } from './playsound.js';
import { playBeep } from './playsound.js';

// 공통 계산 함수 정의
function calculateTotals(orderData) {
    // 모든 서비스 제품 판매가 합산 (숫자로 변환하여 합산)
    const newServiceTotalSales = orderData.ProductService.reduce((acc, service) => acc + (parseFloat(service.DiscountedPrice) || 0), 0);
    orderData.서비스총판매가금액 = newServiceTotalSales;

    // 모든 서비스 제품 원가 합산 (숫자로 변환하여 합산)
    const newServiceTotalCost = orderData.ProductService.reduce((acc, service) => acc + (parseFloat(service.PriceBuy_kr) || 0), 0);
    orderData.서비스총원가금액 = newServiceTotalCost;

    // 주문판매가합산금액 업데이트
    const productTotalSales = parseFloat(orderData.총결제금액) || 0;
    const newOrderTotalSales = productTotalSales + newServiceTotalSales;
    orderData.주문판매가합산금액 = newOrderTotalSales;

    // 주문원가합산금액 업데이트
    const productTotalCost = parseFloat(orderData.총원가금액) || 0;
    const newOrderTotalCost = productTotalCost + newServiceTotalCost;
    orderData.주문원가합산금액 = newOrderTotalCost;
}

// 주문서 데이터 가져오기 함수
export async function getOrderData(orderNumber) {
    const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
    const orderDoc = await orderDocRef.get();
    if (orderDoc.exists) {
        return orderDoc.data();
    }
    throw new Error("선택된 주문 번호에 대한 정보를 찾을 수 없습니다.");
}

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
                const orderData = await getOrderData(orderNumber);
                const productOrders = orderData.ProductOrders || {};
                const productServices = orderData.ProductService || [];

                const serviceTotalSales = orderData.서비스총판매가금액 || 0;
                const serviceTotalCost = orderData.서비스총원가금액 || 0;
                const totalSales = orderData.주문판매가합산금액 || 0;
                const totalCost = orderData.주문원가합산금액 || 0;

                const sortedProductOrders = Object.values(productOrders).sort((a, b) => {
                    if (a.판매자상품코드 < b.판매자상품코드) return -1;
                    if (a.판매자상품코드 > b.판매자상품코드) return 1;
                    if (a.옵션정보 < b.옵션정보) return -1;
                    if (a.옵션정보 > b.옵션정보) return 1;
                    return 0;
                });

                let orderDetailsHTML = `
                    <h3>주문번호: ${orderNumber}</h3>
                    <p><strong><b style="color: red;">서비스제품금액:</strong> ${orderData.서비스제품금액}</b></p>                        
                    <p><strong><b style="color: blue;">서비스총판매가금액:</strong> ${serviceTotalSales}</b></p>
                    <p><strong>기본배송비:</strong> ${orderData.기본배송비}</p>
                    <p><strong>배송메세지:</strong> ${orderData.배송메세지}</p>
                    <p><strong>수취인이름:</strong> ${orderData.수취인이름}</p>
                    <p><strong>총수량:</strong> ${orderData.총수량}</p>
                    <p><strong>총결제금액:</strong> ${orderData.총결제금액}</p>
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
                        <td>
                            <input type="number" 
                                class="packingQuantity" 
                                min="0" 
                                max="${order.상품수량}" 
                                value="${order.currentPackingQuantity !== undefined ? order.currentPackingQuantity : 0}" 
                                data-label="포장수량">
                        </td>
                        <td data-label="총가격">${order.상품별총주문금액}</td>
                        <td data-label="원가">${order.PriceBuy_kr}</td>
                        <td data-label="Counts">${order.Counts}</td>
                        <td data-label="바코드">${order.바코드}</td>
                        <td class="image-container"><img src="${order.옵션이미지URL}" alt="옵션이미지"></td>
                        <td class="image-container"><img src="${order.실제이미지URL}" alt="실제이미지"></td>
                        <td>
                            <input type="checkbox" 
                                class="barcodeCheck" 
                                ${order.found ? 'checked' : ''}>
                        </td>
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
                                <th>수량</th>
                                <th>옵션이미지</th>
                                <th>실제이미지</th>
                                <th>삭제</th>
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
                            <td data-label="원가">${service.PriceBuy_kr}</td>
                            <td><input type="number" class="serviceQuantity" min="1" value="1" data-label="수량"></td> <!-- 수량 입력란 추가 -->
                            <td class="image-container"><img src="${service.옵션이미지URL}" alt="옵션이미지"></td>
                            <td class="image-container"><img src="${service.실제이미지URL}" alt="실제이미지"></td>
                            <td><button class="deleteServiceButton" data-barcode="${service.바코드}">삭제</button></td>
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

                // 삭제 버튼 이벤트 리스너 추가
                document.querySelectorAll('.deleteServiceButton').forEach(button => {
                    button.addEventListener('click', async function() {
                        const barcode = this.getAttribute('data-barcode');
                        const orderNumber = orderDropdown.value;
                        if (orderNumber && barcode) {
                            await deleteServiceProduct(orderNumber, barcode, messageDiv);
                            orderDropdown.dispatchEvent(new Event('change')); // 주문서 다시 로드
                        }
                    });
                });

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

// 서비스 상품 삭제 함수 정의
export async function deleteServiceProduct(orderNumber, barcode, messageDiv) {
    try {
        const orderData = await getOrderData(orderNumber);
        const updatedProductServices = orderData.ProductService.filter(service => service.바코드 !== barcode);
        orderData.ProductService = updatedProductServices;

        calculateTotals(orderData);

        const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
        await orderDocRef.set(orderData, { merge: true });

        messageDiv.innerHTML += `<p>서비스 상품 바코드 ${barcode} 삭제 성공!</p>`;

        return orderData;  // 데이터 저장 후 상세 정보 반환
    } catch (error) {
        console.error("Error deleting service product: ", error);
        messageDiv.innerHTML += `<p>서비스 상품 삭제 중 오류 발생: ${error.message}</p>`;
    }
    return null;
}

// checkServiceBarcode 함수 정의
export async function checkServiceBarcode(barcode, orderDropdown, messageDiv) {
    try {
        const productsFound = await searchByBarcode(barcode, firebase.firestore());
        if (!productsFound) {
            alert("일치하는 서비스를 찾을 수 없습니다.");
            return;
        }
        const productData = productsFound[0];
        const optionKey = productData.matchedOption || ''; // matchedOption이 있으면 사용, 없으면 빈 문자열
        const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(productData.SellerCode, optionKey, productData.소분류명);

        productData.옵션이미지URL = 옵션이미지URL;
        productData.실제이미지URL = 실제이미지URL;

        const orderNumber = orderDropdown.value;
        if (!orderNumber) {
            alert("먼저 주문 번호를 선택해주세요.");
            return;
        }

        const orderData = await getOrderData(orderNumber);
        if (!orderData.ProductService) {
            orderData.ProductService = [];
        }

        const serviceData = {
            원가: productData.PriceBuy_kr || 0,
            판매가: productData.DiscountedPrice || 0,
            입고차수: productData.소분류명 ? productData.소분류명.replace("차입고", "") : '',
            판매자상품코드: productData.SellerCode || '',
            옵션정보: optionKey, // 일치하는 옵션의 키를 사용
            실제이미지URL: productData.실제이미지URL || '',
            옵션이미지URL: productData.옵션이미지URL || '',
            바코드: barcode,
            DiscountedPrice: productData.DiscountedPrice
        };

        orderData.ProductService.push(serviceData);

        calculateTotals(orderData);

        const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
        await orderDocRef.set(orderData, { merge: true });

        messageDiv.innerHTML += `<p>서비스 상품 바코드 ${barcode} 저장 성공!</p>`;

        await loadOrderNumbers(orderDropdown, messageDiv);
        orderDropdown.value = orderNumber;
        orderDropdown.dispatchEvent(new Event('change'));

        return orderData;  // 데이터 저장 후 상세 정보 반환
    } catch (error) {
        console.error("Error processing service barcode: ", error);
        messageDiv.innerHTML += `<p>서비스 상품 바코드 처리 중 오류 발생: ${error.message}</p>`;
    }
    return null;
}

// checkBarcode 함수 정의
// 바코드를 체크하는 함수
export function checkBarcode(barcode, orderDetails) {
    const rows = orderDetails.querySelectorAll("tbody tr");
    let found = false;
    let currentPackingQuantity = 0;
    let productOrderNumber = '';

    rows.forEach(row => {
        const barcodeCell = row.cells[9];
        const packingQuantityInput = row.querySelector(".packingQuantity");
        const quantityCell = row.cells[4];
        const checkbox = row.querySelector(".barcodeCheck");
        const orderNumberCell = row.cells[0];

        if (barcodeCell && barcodeCell.textContent === barcode) {
            found = true;

            productOrderNumber = orderNumberCell.textContent;
            currentPackingQuantity = parseInt(packingQuantityInput.value) || 0;
            packingQuantityInput.value = currentPackingQuantity + 1;

            if (packingQuantityInput.value == quantityCell.textContent) {
                checkbox.checked = true;
            } else {
                checkbox.checked = false;
            }

            const orderNumber = orderDropdown.value;
            if (!orderNumber) return;

            saveBarcodeInfoToDB(orderNumber, productOrderNumber, currentPackingQuantity + 1);
        }
    });

    if (!found) {
        playBeep();
        alert("일치하는 바코드를 찾을 수 없습니다.");
    } else {
        playDingDong();
    }
}

// Firestore에 데이터 저장 함수
export async function saveBarcodeInfoToDB(orderNumber, productOrderNumber, currentPackingQuantity) {
    try {
        const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
        const orderDoc = await orderDocRef.get();

        if (orderDoc.exists) {
            const orderData = orderDoc.data();
            const productOrders = orderData.ProductOrders || {};

            if (!productOrders[productOrderNumber]) {
                productOrders[productOrderNumber] = {};
            }

            productOrders[productOrderNumber].found = true;
            productOrders[productOrderNumber].currentPackingQuantity = currentPackingQuantity;

            await orderDocRef.set({ ProductOrders: productOrders }, { merge: true });

            console.log(`바코드 정보가 성공적으로 저장되었습니다: ${productOrderNumber}`);
        } else {
            console.error("선택된 주문 번호에 대한 정보를 찾을 수 없습니다.");
        }
    } catch (error) {
        console.error("바코드 정보를 Firestore에 저장하는 중 오류 발생: ", error);
    }
}
