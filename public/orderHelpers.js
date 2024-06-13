import { generateImageURLs } from './generateImageURLs.js';
import { searchByBarcode } from './barcode_search.js';

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

    } catch (error) {
        console.error("Error loading order numbers: ", error);
        messageDiv.innerHTML += `<p>주문번호 로드 중 오류 발생: ${error.message}</p>`;
    }
}

export async function checkServiceBarcode(barcode, orderDropdown, messageDiv) {
    try {
        const productsFound = await searchByBarcode(barcode, firebase.firestore());
        let productData;

        if (!productsFound) {
            alert("일치하는 서비스를 찾을 수 없습니다.");
            return;
        } else {
            productData = productsFound[0];
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
                바코드: barcode,  // 바코드 추가
                DiscountedPrice: productData.DiscountedPrice
            };

            orderData.ProductService.push(serviceData);
            await orderDocRef.set(orderData, { merge: true });

            messageDiv.innerHTML += `<p>서비스 상품 바코드 ${barcode} 저장 성공!</p>`;
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
