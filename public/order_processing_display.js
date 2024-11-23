//order_processing_display.js

import { loadOrderNumbers, checkServiceBarcode, checkBarcode, getOrderData } from './orderHelpers.js';
import { updateSetProductCounts } from './barcode_search.js';
import { playDingDong } from './playsound.js';
import { playBeep } from './playsound.js';
import { saveBarcodeInfoToDB } from './orderHelpers.js';
import { getProductByBarcode } from './aGlobalMain.js';

document.addEventListener("DOMContentLoaded", function() {
    const orderDropdown = document.getElementById("orderDropdown");
    const orderDetails = document.getElementById("orderDetails");
    const serviceDetails = document.getElementById("serviceDetails");
    const messageDiv = document.getElementById("message");
    const barcodeInput = document.getElementById("barcodeInput");
    const serviceBarcodeInput = document.getElementById("serviceBarcodeInput");
    const packingCompleteButton = document.getElementById("packingCompleteButton");
    const manualBarcodeButton = document.getElementById("manualBarcodeButton");
    const deleteOrderButton = document.getElementById("deleteOrderButton");
    
    loadOrderNumbers(orderDropdown, messageDiv);

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
                await checkServiceBarcode(barcode, orderDropdown, messageDiv);
                serviceBarcodeInput.value = '';  // 입력 후 입력란 지우기
            }
        }
    });

    // 포장수량 input 값 변경 이벤트 리스너 추가
    orderDetails.addEventListener("keypress", async function(event) {
        if (event.key === 'Enter' && event.target.classList.contains("packingQuantity")) {
            const packingQuantityInput = event.target;
            const row = packingQuantityInput.closest("tr");
            const productOrderNumber = row.querySelector('[data-label="상품주문번호"]').textContent;
            const orderNumber = orderDropdown.value;

            if (orderNumber && productOrderNumber) {
                try {
                    const currentPackingQuantity = parseInt(packingQuantityInput.value, 10) || 0;
                    await saveBarcodeInfoToDB(orderNumber, productOrderNumber, currentPackingQuantity);
                    messageDiv.innerHTML += `<p>포장수량이 업데이트되었습니다: ${productOrderNumber} - ${currentPackingQuantity}</p>`;
                } catch (error) {
                    console.error("Error updating packing quantity: ", error);
                    messageDiv.innerHTML += `<p>포장수량 업데이트 중 오류 발생: ${error.message}</p>`;
                }
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


    async function fetchOrderData(orderNumber) {
        const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
        const orderDoc = await orderDocRef.get();
    
        if (!orderDoc.exists) {
            console.error("Order document does not exist");
            return null;
        }
        return orderDoc.data();
    }

    async function validatePacking(orderData) {
        const totalQuantityFromOrder = orderData.총수량;
        let totalPackedQuantity = 0;
        let allChecked = true;
    
        const productOrdersArray = Object.values(orderData.ProductOrders || {});
        for (const product of productOrdersArray) {
            if (!product.currentPackingQuantity || !product.found) {
                allChecked = false;
                break;
            }
            totalPackedQuantity += parseInt(product.currentPackingQuantity, 10) || 0;
        }
    
        if (totalPackedQuantity !== totalQuantityFromOrder) {
            messageDiv.innerHTML = `<p>제품 확인 필요: 총 포장수량(${totalPackedQuantity})이 주문서 총수량(${totalQuantityFromOrder})과 일치하지 않습니다.</p>`;
            playBeep();
            return false;
        }
    
        if (!allChecked) {
            messageDiv.innerHTML = "<p>제품 확인 필요: 모든 제품이 체크되지 않았습니다.</p>";
            playBeep();
            return false;
        }
    
        playDingDong();
        return true;
    }

    async function batchUpdateProductCounts(productUpdates, db) {
        const batch = db.batch();  // Firestore 배치 생성
    
        productUpdates.forEach(update => {
            const { id, data } = update;
            const docRef = db.collection('Products').doc(id);
            batch.set(docRef, data, { merge: true });
        });
    
        await batch.commit();  // 배치 업데이트 실행
        console.log("Batch update completed");
    }
    
    packingCompleteButton.addEventListener('click', async function() {

        try {
            const orderNumber = orderDropdown.value;
            if (!orderNumber) return;

            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);

    
            const orderData = await fetchOrderData(orderNumber);
            if (!orderData) return;
    
            if (!await validatePacking(orderData)) return;

            // 제품 업데이트 정보를 모으는 객체로 변경하여 중복 방지
            const productUpdatesMap = {};
            // 모든 상품 정보 행 처리
            const productRows = orderDetails.querySelectorAll("tbody tr");
            const SETProductSellerCode = {};
            
            for (const row of productRows) {
                console.log(`productRows: ${row}`);
                const sellerCode = row.querySelector('[data-label="판매자상품코드"]').textContent;
                const packingQuantityInput = row.querySelector('.packingQuantity');

                if (packingQuantityInput && packingQuantityInput.value !== '') {
                    const quantity = parseInt(packingQuantityInput.value, 10);

                    if (sellerCode.startsWith("SET_")) {
                        if (!SETProductSellerCode[sellerCode]) {
                            SETProductSellerCode[sellerCode] = quantity; // 추가                        
                        }
                    } else {
                        const barcodeCell = row.querySelector('[data-label="바코드"]');
                        if (barcodeCell) {
                            const barcode = barcodeCell.textContent;
                            processProductUpdateMap(barcode, productUpdatesMap, quantity);
                        }
                    }
                }
            }

            // SETProductSellerCode를 순회하면서 updateSetProductCounts 호출
            for (const sellerCode in SETProductSellerCode) {
                const quantity = SETProductSellerCode[sellerCode];
                try {
                    console.log(sellerCode);
                    console.log(quantity);
                    await updateSetProductCounts(sellerCode, quantity, firebase.firestore());
                    
                } catch (error) {
                    
                }
            }      

            // serviceRows 처리 추가
            const serviceRows = orderData.ProductService || [];
             
            //const serviceRows = serviceDetails.querySelectorAll("tbody tr");
            console.log(`serviceRows count: ${serviceRows.length}`);


            for (const service of serviceRows) {
                //const barcodeCell = row.querySelector('[data-label="바코드"]');

                console.log(`service.바코드: ${service.바코드}`);
                const barcodeCell = service.바코드;
                console.log(`barcodeCell: ${barcodeCell}`);

                if (barcodeCell) {
                    const barcode = barcodeCell;
                    const quantity = 1; // 서비스 제품은 기본적으로 수량이 1이라고 가정
                    processProductUpdateMap(barcode, productUpdatesMap, quantity);

                } else {
                    console.warn("Barcode cell not found for service row");
                }
            }

            // productUpdatesMap의 값을 배열로 변환하여 Firestore에 배치 업데이트 실행
            const productUpdates = Object.values(productUpdatesMap);
            console.log(`productUpdates count: ${productUpdates.length}`);
            productUpdates.forEach((update, index) => {
                console.log(`productUpdates[${index}]: `, update);
            });

            await batchUpdateProductCounts(productUpdates, firebase.firestore());
    
            // 이후 완료 처리 로직 유지
            orderData.주문처리날짜 = new Date();
            orderData.배송메시지 = "";
            orderData.수취인이름 = "";
    
            await firebase.firestore().collection('CompletedOrders').doc(orderNumber).set(orderData);
            await orderDocRef.delete();
    
            orderDetails.innerHTML = "";
            serviceDetails.innerHTML = "";
            orderDropdown.value = "";
            messageDiv.innerHTML = "<p>모든 선택된 상품의 Counts가 업데이트되었으며, 주문이 완료되었습니다.</p>";
            playDingDong();
            alert("모든 선택된 상품의 Counts가 업데이트되었으며, 주문이 완료되었습니다.");
            loadOrderNumbers(orderDropdown, messageDiv);
    
        } catch (error) {
            console.error("Error completing packing: ", error);
            messageDiv.innerHTML = `<p>포장 완료 중 오류 발생: ${error.message}</p>`;
            playBeep();
            alert("포장 중 오류 발생");
        }
    });
    
    

    deleteOrderButton.addEventListener('click', async function() {
        const orderNumber = orderDropdown.value;  // 드롭다운에서 선택된 주문서 번호 가져오기
    
        // 선택된 내용이 없으면 메시지 표시
        if (!orderNumber) {
            messageDiv.innerHTML = "<p>선택된 주문서가 없습니다.</p>";
            return;
        }
    
        try {
            // Orders 컬렉션에서 해당 주문서 문서 참조 가져오기
            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
    
            // 문서가 존재하는지 확인
            const orderDoc = await orderDocRef.get();
            if (orderDoc.exists) {
                // 주문서 문서 삭제
                await orderDocRef.delete();
                messageDiv.innerHTML = `<p>주문서 ${orderNumber}가 성공적으로 삭제되었습니다.</p>`;
    
                // 화면 초기화
                orderDetails.innerHTML = "";
                serviceDetails.innerHTML = "";
                orderDropdown.value = "";
    
                // 주문 목록 갱신
                loadOrderNumbers(orderDropdown, messageDiv);
            } else {
                messageDiv.innerHTML = `<p>주문서 ${orderNumber}를 찾을 수 없습니다.</p>`;
            }
        } catch (error) {
            console.error("Error deleting order: ", error);
            messageDiv.innerHTML = `<p>주문서 삭제 중 오류 발생: ${error.message}</p>`;
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
function processProductUpdateMap(barcode, productUpdatesMap, quantity) {
    //const productsFound = await searchByBarcode(barcode, firebase.firestore());
    const productsFound = getProductByBarcode (barcode);

    console.log(`barcode: ${barcode}`);
    if (productsFound && productsFound.length > 0) {
        const product = productsFound[0];

        var optionKeySave;
        if (product.OptionDatas) {
            for (let optionKey in product.OptionDatas) {
                if (product.OptionDatas[optionKey].바코드 === barcode) {
                    optionKeySave = optionKey;
                }
            }
        }

        console.log(`product 찾음 optionKey: ${optionKeySave}`);

        if (productUpdatesMap[product.id]) {
            if (productUpdatesMap[product.id].data.OptionDatas[optionKeySave]) {
                productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts -= quantity;
                console.log(`같은제품 있음 같은 옵션 있음: ${productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts}`);
            } else {
                productUpdatesMap[product.id].data.OptionDatas[optionKeySave] = {
                    ...product.OptionDatas[optionKeySave]
                };
                productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts -= quantity;
                console.log(`같은제품 있음 같은 옵션 없음: ${productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts}`);
            }
        } else {
            productUpdatesMap[product.id] = { id: product.id, data: product };
            productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts -= quantity;
            console.log(`같은제품 없음 같은 옵션 없음: ${productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts}`);
        }
    }
}

