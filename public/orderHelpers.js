import { generateImageURLs } from './generateImageURLs.js';
import { playDingDong, playBeep, playBeepBeep } from './playsound.js';
import { getOrderByOrderNumber, getProductByBarcode, updateOrderProductService } from './aGlobalMain.js';

// 공통 계산 함수 정의
function calculateTotals(orderData) {
    // 모든 서비스 제품 판매가 합산 (숫자로 변환하여 합산)
    const newServiceTotalSales = orderData.ProductService.reduce((acc, service) => {
        const SellingPrice = parseFloat(service.SellingPrice) || 0;
        console.log(`서비스 항목 SellingPrice: ${service.SellingPrice}, 변환된 값: ${SellingPrice}`);
        return acc + SellingPrice;
    }, 0);
    orderData.서비스총판매가금액 = newServiceTotalSales;

    // 로그 추가
    console.log(`서비스 총 판매가 금액: ${newServiceTotalSales}`);

    // 모든 서비스 제품 원가 합산 (숫자로 변환하여 합산)
    const newServiceTotalCost = orderData.ProductService.reduce((acc, service) => {
        const 원가 = parseFloat(service.원가) || 0;
        console.log(`서비스 항목 원가: ${service.원가}, 변환된 값: ${원가}`);
        return acc + 원가;
    }, 0);
    orderData.서비스총원가금액 = newServiceTotalCost;

    // 로그 추가
    console.log(`서비스 총 원가 금액: ${newServiceTotalCost}`);

    // 주문판매가합산금액 업데이트
    const productTotalSales = parseFloat(orderData.총결제금액) || 0;
    const newOrderTotalSales = productTotalSales + newServiceTotalSales;
    orderData.주문판매가합산금액 = newOrderTotalSales;

    // 로그 추가
    console.log(`상품 총 결제 금액: ${productTotalSales}`);
    console.log(`새 주문 총 판매가 금액: ${newOrderTotalSales}`);

    // 주문원가합산금액 업데이트
    const productTotalCost = parseFloat(orderData.총원가금액) || 0;
    const newOrderTotalCost = productTotalCost + newServiceTotalCost;
    orderData.주문원가합산금액 = newOrderTotalCost;

    // 로그 추가
    console.log(`상품 총 원가 금액: ${productTotalCost}`);
    console.log(`새 주문 총 원가 금액: ${newOrderTotalCost}`);
}

export async function loadOrderNumbers(orderDropdown, messageDiv) {
    try {
        console.warn("loadOrderNumbers");
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
                
                //const orderData = await getOrderData(orderNumber);
                const orderData = await getOrderByOrderNumber(orderNumber);
                const productOrders = orderData.ProductOrders || {};
                const productServices = orderData.ProductService || [];

                const serviceTotalSales = orderData.서비스총판매가금액 || 0;
                const serviceTotalCost = orderData.서비스총원가금액 || 0;
                const totalSales = orderData.주문판매가합산금액 || 0;
                const totalCost = orderData.주문원가합산금액 || 0;

                // SellerCode가 SET_로 시작하면 SET_를 제거한 후 소팅
                const sortedProductOrders = Object.values(productOrders).sort((a, b) => {
                    // SellerCode에서 SET_ 제거
                    const sellerCodeA = a.SellerCode && a.SellerCode.startsWith("SET_") ? a.SellerCode.replace(/^SET_/, "") : a.SellerCode;
                    const sellerCodeB = b.SellerCode && b.SellerCode.startsWith("SET_") ? b.SellerCode.replace(/^SET_/, "") : b.SellerCode;

                    if (sellerCodeA < sellerCodeB) return -1;
                    if (sellerCodeA > sellerCodeB) return 1;
                    if (a.보여주기용옵션명 < b.보여주기용옵션명) return -1;
                    if (a.보여주기용옵션명 > b.보여주기용옵션명) return 1;
                    return 0;
                });

                let orderDetailsHTML = `
                    <h3>주문번호: ${orderNumber}</h3>                    
                    <p><strong>운송장번호:</strong> ${orderData.운송장번호}</p>
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
                        <td data-label="판매자상품코드">${order.SellerCode}</td>
                        <td data-label="입고차수">${order.입고차수}</td>
                        <td data-label="옵션정보">${order.보여주기용옵션명}</td>
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
                        <td data-label="원가">${order.원가}</td>
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
                                <th>SellingPrice</th>
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
                            <td data-label="판매자상품코드">${service.SellerCode}</td>
                            <td data-label="바코드">${service.바코드}</td>
                            <td data-label="SellingPrice">${service.SellingPrice}</td>
                            <td data-label="원가">${service.원가}</td>
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


                document.querySelectorAll(".barcodeCheck").forEach(check => {
                    check.addEventListener("change", function () {
                        const row = this.closest("tr");
                        if (!row) return;

                        const packingQuantityInput = row.querySelector(".packingQuantity");
                        if (!packingQuantityInput) return;

                        let currentValue = parseInt(packingQuantityInput.value, 10) || 0;

                        if (this.checked) {
                            // 체크되면 +1
                            packingQuantityInput.value = currentValue + 1;
                        } else {
                            // 체크 해제되면 -1 (최소 0으로 보정)
                            packingQuantityInput.value = 0;   // 체크 해제 시 0
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
        //const orderData = await getOrderData(orderNumber);
        const orderData = await getOrderByOrderNumber(orderNumber);
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
        var productsFound = await getProductByBarcode (barcode);

        messageDiv.innerHTML += `<p>서비스상품 추가 완료. ${productsFound.스토어키워드네임},${productsFound.SellerCode}, ${productsFound.matchedOption} </p>`;        
        if (!productsFound) {
            alert("바코드가 일치하는 제품을 찾을 수 없습니다.");
            return;
        }

        const productData = productsFound;
        const optionKey = productData.matchedOption || ''; // matchedOption이 있으면 사용, 없으면 빈 문자열
        // 여기
        console.log(productData.GroupOptions);
        const { 보여주기용옵션명, 옵션이미지URL, 실제이미지URL } = generateImageURLs(productData.SellerCode, optionKey, productData.소분류명, productData.GroupOptions);
        productData.옵션이미지URL = 옵션이미지URL;
        productData.실제이미지URL = 실제이미지URL;
        productData.보여주기용옵션명 = 보여주기용옵션명;

        const orderNumber = orderDropdown.value;
        if (!orderNumber) {
            alert("먼저 주문 번호를 선택해주세요.");
            return;
        }

        //const orderData = await getOrderData(orderNumber);
        const orderData = await getOrderByOrderNumber(orderNumber);
        if (!orderData.ProductService) {
            orderData.ProductService = [];
        }

        const serviceData = {
            원가: productData.원가 || 0,
            SellingPrice: productData.SellingPrice || 0,
            소분류명: productData.소분류명 ? productData.소분류명.replace("차입고", "") : '',
            SellerCode: productData.SellerCode || '',
            옵션정보: optionKey, // 일치하는 옵션의 키를 사용
            실제이미지URL: productData.실제이미지URL || '',
            옵션이미지URL: productData.옵션이미지URL || '',
            보여주기용옵션명: productData.보여주기용옵션명 || '',
            바코드: barcode,
        };

        orderData.ProductService.push(serviceData);

        updateOrderProductService(orderNumber, orderData.ProductService);

        calculateTotals(orderData);

        // const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
        // await orderDocRef.set(orderData, { merge: true });

        messageDiv.innerHTML += `<p>서비스 상품 바코드 ${barcode} 저장 성공!</p>`;

        // await loadOrderNumbers(orderDropdown, messageDiv);
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
    let countOver = false;
    let currentPackingQuantity = 0;
    let checkQuantity = 0;
    let productOrderNumber = '';

    for (const row of rows) {  
    //rows.forEach(row => {        
        const barcodeCell = row.cells[9];
        const packingQuantityInput = row.querySelector(".packingQuantity");
        const quantityCell = row.cells[4];
        const checkbox = row.querySelector(".barcodeCheck");
        const orderNumberCell = row.cells[0];
        const sellerCode = row.cells[1];
        const optionName = row.cells[3];

        console.log(sellerCode.textContent);
        if (sellerCode.textContent.startsWith("SET_")) {                    
            productOrderNumber = orderNumberCell.textContent + "_" + optionName.textContent;
            console.log(productOrderNumber);
        }
        else{
            productOrderNumber = orderNumberCell.textContent;
            console.log(productOrderNumber);
        }

        if (barcodeCell && barcodeCell.textContent === barcode) {
            countOver = false;
            currentPackingQuantity = parseInt(packingQuantityInput.value) || 0;
            checkQuantity = parseInt(quantityCell.textContent) || 0;            

            var increasedQuantity = currentPackingQuantity + 1;
            
            if (increasedQuantity <= checkQuantity) {
                found = true;
                packingQuantityInput.value = currentPackingQuantity + 1;
                if (packingQuantityInput.value == quantityCell.textContent) {
                    checkbox.checked = true;
                } else {
                    checkbox.checked = false;
                }
    
                const orderNumber = orderDropdown.value;
                if (!orderNumber) return;
                
            }
            else{
                countOver = true;
            }
            //saveBarcodeInfoToDB(orderNumber, productOrderNumber, currentPackingQuantity + 1);
            // todo: 임시저장 -> 글로벌주문정보
            if (found) break; // found가 true면 반복문 중단

        }
    }

    if (!found) {
        playBeep();
        alert("일치하는 바코드를 찾을 수 없습니다.");    
    } else {
        if (countOver){
            playBeepBeep();
            alert("수량 초과");
        }
        else{
            playDingDong();            
        }
    }
}
