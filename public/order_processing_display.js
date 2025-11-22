//order_processing_display.js

import { loadOrderNumbers, checkServiceBarcode, checkBarcode} from './orderHelpers.js';
import { updateSetProductCounts } from './barcode_search.js';
import { playDingDong } from './playsound.js';
import { playBeep } from './playsound.js';
//import { saveBarcodeInfoToDB } from './orderHelpers.js';
import { getProductByBarcode, getProductBySellerCode } from './aGlobalMain.js';
import { refineInputValue, reInitializeOrderMap, reInitializeProductMap, getOrderByOrderNumber, updateOrderInfo, getOrderMap, getOrderNumberByDeliveryNumber} from './aGlobalMain.js';
import { generateBatchContent, sendBatchInventoryUpdate } from './aSaveInventoryBatchToSmartStore.js';
import { findNegativeStockSellerCodes } from './order_processing_support.js';

document.addEventListener("DOMContentLoaded", function() {
    const orderDropdown = document.getElementById("orderDropdown");
    const orderDetails = document.getElementById("orderDetails");
    const serviceDetails = document.getElementById("serviceDetails");
    const messageDiv = document.getElementById("message");
    const barcodeInput = document.getElementById("barcodeInput");
    const serviceBarcodeInput = document.getElementById("serviceBarcodeInput");
    const packingCompleteButton = document.getElementById("packingCompleteButton");
    const saveCurrentStateButton = document.getElementById("saveCurrentStateButton");    
    const manualBarcodeButton = document.getElementById("manualBarcodeButton");
    const deleteOrderButton = document.getElementById("deleteOrderButton");
    const orderNumberInput = document.getElementById("orderNumberInput");
    const deliveryNumberInput = document.getElementById("deliveryNumberInput");
    loadOrderNumbers(orderDropdown, messageDiv);

    // Attach an event listener to the input field to listen for the Enter key
    orderNumberInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            let inputValue = orderNumberInput.value.trim(); // Get the input value
            inputValue = refineInputValue(inputValue);
            if (inputValue) {
                const options = Array.from(orderDropdown.options);
                const matchingOption = options.find(option => option.value.includes(inputValue)); // Partial match

                if (matchingOption) {
                    orderDropdown.value = matchingOption.value; // Select the matching option in the dropdown
                    messageDiv.textContent = `Order ${matchingOption.value} selected.`;
                    // Trigger any event or logic tied to selecting an option
                    orderDropdown.dispatchEvent(new Event('change'));
                    serviceBarcodeInput.focus();
                } else {
                    messageDiv.textContent = `Order containing ${inputValue} not found in the dropdown.`;
                }
            } else {
                messageDiv.textContent = "Please enter a valid order number."; // Display a message for invalid input
            }
        }
    });

    deliveryNumberInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
            let inputValue = deliveryNumberInput.value.trim(); // Get the input value
            inputValue = refineInputValue(inputValue);
            deliveryNumberInput.value = '';


            if (inputValue) {
                
                const orderData = await getOrderNumberByDeliveryNumber(inputValue)
                if (orderData) {
                    orderDropdown.value = orderData.id;
                    messageDiv.textContent = `OrderNumber ${orderData.id} selected. 운송정번호 ${orderData.운송장번호} selected.`;                    
                    orderDropdown.dispatchEvent(new Event('change'));
                    serviceBarcodeInput.focus();
                } else {
                    messageDiv.textContent = `Order containing ${inputValue} not found in the dropdown.`;
                }
            } else {
                messageDiv.textContent = "Please enter a valid order number."; // Display a message for invalid input
            }
        }
    });

    barcodeInput.addEventListener("keypress", function(event) {
        if (event.key === 'Enter') {
            let barcode = barcodeInput.value.trim();
            barcode = refineInputValue(barcode);
            if (barcode) {
                if (barcode == "1111111111") {
                    packingCompleteButton.click(); // 버튼 강제 클릭 실행
                }
                else{
                    checkBarcode(barcode, orderDetails);                    
                }
                barcodeInput.value = '';  // 입력 후 입력란 지우기
            }
        }
    });

    serviceBarcodeInput.addEventListener("keypress", async function(event) {
        if (event.key === 'Enter') {
            let barcode = serviceBarcodeInput.value.trim();
            barcode = refineInputValue(barcode);
            if (barcode) {
                if (barcode == "9999999999"){
                    barcodeInput.focus();
                }
                else{
                    await checkServiceBarcode (barcode, orderDropdown, messageDiv);
                }
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

                    //await saveBarcodeInfoToDB(orderNumber, productOrderNumber, currentPackingQuantity);
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

    async function validatePacking(orderData) {
        const totalQuantityFromOrder = orderData.총수량;
        let totalPackedQuantity = 0;
        let allChecked = true;

        if (orderData.ProductOrders)
        {
            console.log(orderData.ProductOrders);
            console.log(orderData.ProductOrders.length);
            const productOrdersArray = Object.values(orderData.ProductOrders || {});    
            const productRows = orderDetails.querySelectorAll("tbody tr");
            for (const row of productRows) {
                console.log(`productRows: ${row}`);
                const packingQuantityInput = row.querySelector('.packingQuantity');
    
                if (packingQuantityInput && packingQuantityInput.value !== '') {
                    totalPackedQuantity += parseInt(packingQuantityInput.value, 10) || 0;;
                    console.log(totalPackedQuantity);
                }
            }    
        }
        else{
            console.log("orderData.ProductOrders null");
        }
    
        if (totalPackedQuantity !== totalQuantityFromOrder) {
            messageDiv.innerHTML = `<p>제품 확인 필요: 총 포장수량(${totalPackedQuantity})이 주문서 총수량(${totalQuantityFromOrder})과 일치하지 않습니다.</p>`;
            playBeep();
            barcodeInput.focus();
            return false;
        }
    
        if (!allChecked) {
            messageDiv.innerHTML = "<p>제품 확인 필요: 모든 제품이 체크되지 않았습니다.</p>";
            playBeep();
            barcodeInput.focus();
            return false;
        }
    
        playDingDong();
        return true;
    }


    
    async function batchUpdateOrder(orderUpdates, db) {
        const batch = db.batch();  // Firestore 배치 생성
        console.log("orderUpdates", orderUpdates);    
        
        orderUpdates.forEach((data, id) => {
            console.log(`id: ${id}`);
            console.log(`data: ${JSON.stringify(data)}`);
    
            const docRef = db.collection('Orders').doc(id);
            console.log(`docRef: ${docRef}`);
    
            if (data && typeof data === "object") {
                // Firestore에 적합한 객체인지 확인 후 추가
                batch.set(docRef, data, { merge: true });
            } else {
                console.error(`Invalid data for id ${id}:`, data);
            }
        });
    
        await batch.commit();  // 배치 업데이트 실행
        console.log("batchUpdateOrder completed");
    }
    


    async function batchUpdateProductCounts(productUpdates, db) {
        const batch = db.batch();  // Firestore 배치 생성
        console.log("productUpdates", productUpdates);



        productUpdates.forEach(update => {
            const { id, data } = update;            
            console.log(`id: ${id}`);
            const docRef = db.collection('Products').doc(id);
            console.log(`docRef path: ${docRef.path}`);
            batch.set(docRef, data, { merge: true });
        });
    
        await batch.commit();  // 배치 업데이트 실행
    }
    
    saveCurrentStateButton.addEventListener('click', async function () {
        playDingDong();
        const orderNumber = orderDropdown.value;
        if (!orderNumber) return;

        const productRows = orderDetails.querySelectorAll("tbody tr");
        for (const row of productRows) {            
            const productOrderNumber = row.querySelector('[data-label="상품주문번호"]');
            const packingQuantityInput = row.querySelector('.packingQuantity');                        
            if (packingQuantityInput && packingQuantityInput.value !== '') {
                const currentPackingQuantity =  parseInt(packingQuantityInput.value, 10) || 0;;
                updateOrderInfo (orderNumber, productOrderNumber, currentPackingQuantity);
            }
        }
        
        //const serviceRows = orderData.ProductService || [];


        let orderMap = getOrderMap()
        //const orderData = await getOrderByOrderNumber(orderNumber);
        await batchUpdateOrder(orderMap, firebase.firestore());


        playDingDong();
    });

    packingCompleteButton.addEventListener('click', async function() {

        // 버튼 비활성화
        packingCompleteButton.disabled = true;

        try {
            const orderNumber = orderDropdown.value;
            if (!orderNumber) return;
            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
            const orderData = await getOrderByOrderNumber(orderNumber);
            if (!orderData) return;    
            if (!await validatePacking(orderData)) return;
            
            const productUpdatesMap = {};
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
                            SETProductSellerCode[sellerCode] = { quantity: quantity }; // 추가                        
                        }
                    } else {
                        const barcodeCell = row.querySelector('[data-label="바코드"]');
                        if (barcodeCell) {
                            const barcode = barcodeCell.textContent;
                            await processProductUpdateMap(barcode, productUpdatesMap, quantity, SETProductSellerCode);
                        }
                    }
                }
            }

            // SETProductSellerCode를 순회하면서 updateSetProductCounts 호출
            for (const sellerCode in SETProductSellerCode) {
                const quantity = SETProductSellerCode[sellerCode].quantity;
                try {
                    console.log(sellerCode);
                    console.log(quantity);
                    const setUpdateResult = await updateSetProductCounts(sellerCode, quantity, firebase.firestore());
                    // sellerCode -> SETProductSellerCode[sellerCode] 값은 수량(Number)입니다. 객체가 아니기 때문에 프로퍼티를 추가해도 undefined가 됩니다.
                    // 따라서 객체로 할당 또는 새로운 객체 Map으로 일관되게 넣어야 합니다.
                    // 여기서는 Map을 객체로 변환해 batch에 전달하려면 아래처럼 작성하세요.
                    SETProductSellerCode[sellerCode] = { 
                        quantity: SETProductSellerCode[sellerCode], 
                        UpdatedCounts: setUpdateResult 
                    };
                    
                    
                } catch (error) {
                    
                }
            }
            const serviceRows = orderData.ProductService || [];
            for (const service of serviceRows) {
                const barcodeCell = service.바코드;
                if (barcodeCell) {
                    const barcode = barcodeCell;
                    const quantity = 1; // 서비스 제품은 기본적으로 수량이 1이라고 가정
                    await processProductUpdateMap(barcode, productUpdatesMap, quantity, SETProductSellerCode);

                    console.log(`productUpdatesMap: ${productUpdatesMap}`);

                } else {
                    console.warn("Barcode cell not found for service row");
                }
            }
            console.log(`0000: ${serviceRows.length}`);
            
            const productUpdates = Object.values(productUpdatesMap);


            // 지금 수정중
            const payloadList = [];   // <-- 결과 저장 배열
            generateBatchContent (payloadList, productUpdates);            
            console.log(`payloadList 개별제품, 서비스: ${JSON.stringify(payloadList, null, 2)}`);
            generateBatchContent (payloadList, SETProductSellerCode);            
            console.log(`payloadList 개별제품, 서비스 세트제품: ${JSON.stringify(payloadList, null, 2)}`);

            findNegativeStockSellerCodes (payloadList)
            const negativeStockSellerCodes = findNegativeStockSellerCodes(payloadList);
            console.log("재고가 음수인 seller_code 목록:", negativeStockSellerCodes);

            await sendBatchInventoryUpdate(payloadList)
            // 지금 수정중



            console.log(`productUpdates count: ${productUpdates.length}`);
            productUpdates.forEach((update, index) => {
                console.log(`productUpdates[${index}]: `, update);
            });
            
            await batchUpdateProductCounts(productUpdates, firebase.firestore());            

            orderData.주문처리날짜 = new Date();
            orderData.배송메시지 = "";
            orderData.수취인이름 = "";   

            await firebase.firestore().collection('CompletedOrders').doc(orderNumber).set(orderData);
            await orderDocRef.delete();
    
            await reInitializeOrderMap ();
            console.log(`3333`);
            await reInitializeProductMap ();            
            console.log(`4444`);

            orderDetails.innerHTML = "";
            serviceDetails.innerHTML = "";
            orderDropdown.value = "";
            messageDiv.innerHTML = "<p>모든 선택된 상품의 Counts가 업데이트되었으며, 주문이 완료되었습니다.</p>";

            playDingDong();
            alert("모든 선택된 상품의 Counts가 업데이트되었으며, 주문이 완료되었습니다.");
            loadOrderNumbers(orderDropdown, messageDiv);
            deliveryNumberInput.focus();    
        } catch (error) {
            console.error("Error completing packing: ", error);
            messageDiv.innerHTML = `<p>포장 완료 중 오류 발생: ${error.message}</p>`;
            
            playBeep();
            barcodeInput.focus();            
            alert("포장 중 오류 발생");
            barcodeInput.focus();
        } finally {
            // 무조건 실행 → 버튼 다시 활성화
            packingCompleteButton.disabled = false;
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


/**
 * 개별 상품 옵션의 재고(Counts)를 감소시키고, 재고가 0 미만이 될 경우 세트 상품 재고를 감소시키고
 * 개별 상품 옵션 재고를 복구(1 증가)하는 보정 작업을 수행합니다.
 *
 * (파라미터 생략)
 */
/**
 * 개별 상품 옵션의 재고(Counts)를 감소시키고, 재고가 0 미만이 될 경우 세트 상품 재고를 확인하여
 * 보정 작업(세트 감소 및 개별 옵션 복구)을 수행하거나, 보정 불가 시 0으로 조정합니다.
 *
 * (파라미터 생략)
 */
async function decreaseCounts(productUpdatesMap, setProduct, quantity, product, optionKeySave, SETProductSellerCode) {
    const productId = product?.id;
    const optionDatas = productUpdatesMap?.[productId]?.data?.OptionDatas;

    // 1. 초기 유효성 검사 (생략: 이전과 동일)
    if (!optionDatas) {
        console.error(`[decreaseCounts][${productId}] 옵션 데이터(optionDatas)를 찾을 수 없습니다.`);
        return;
    }

    const targetOption = optionDatas[optionKeySave];
    if (!targetOption || targetOption.Counts === undefined) {
        console.error(`[decreaseCounts][${productId}] 옵션 키 ${optionKeySave}의 Counts를 찾을 수 없습니다.`);
        return;
    }
    
    // 2. 재고 감소 로직 (생략: 이전과 동일)
    const beforeCount = targetOption.Counts;
    targetOption.Counts -= quantity;

    console.log(
        `[decreaseCounts][${productId}] 옵션 ${optionKeySave} 재고 감소: ${beforeCount} -> ${targetOption.Counts}`
    );

    // 3. 감소 결과가 0보다 작으면 보정 작업 시도
    if (targetOption.Counts < 0) {
        console.warn(`[decreaseCounts][${productId}] Counts가 0 미만(${targetOption.Counts})입니다! 보정 작업 시도.`);
        
        const isSetCountAvailable = setProduct?.OptionDatas?.["옵션1"]?.Counts > 0;
        console.error(`[isSetCountAvailable][${setProduct?.OptionDatas?.["옵션1"]?.Counts}]`);
        
        if (isSetCountAvailable) {
            // 3-1. 세트 상품 재고 감소 및 DB 업데이트
            await handleSetProductCorrection(setProduct, SETProductSellerCode);
            
            // 3-2. 일반 옵션 재고 복구 (전체 +1 증가)
            restoreOptionCounts(product, optionDatas, optionKeySave);
            
            console.log(`[decreaseCounts][${productId}] 세트 상품 재고를 사용하여 옵션 재고 복구 완료.`);
        } else {
            console.warn(`[decreaseCounts][${productId}] 세트 상품 재고("옵션1" Counts)가 0 이하이므로 보정 작업을 건너뜁니다.`);
            
            // **추가된 코드: 보정 실패 시 0으로 즉시 조정**
            targetOption.Counts = 0;
            console.warn(`[decreaseCounts][${productId}] 옵션 ${optionKeySave}의 Counts를 ${targetOption.Counts}으로 조정했습니다.`);
        }
    }
    
    // 최종 상태 로그
    console.log(`[decreaseCounts][${productId}] 최종 optionDatas:`, JSON.stringify(optionDatas));
}

// --- 헬퍼 함수들은 이전과 동일하게 유지 ---

// --- 헬퍼 함수 ---

// *참고: handleSetProductCorrection 내에서는 이미 isSetCountAvailable 조건이 통과된 후 호출되므로,
// 내부에서 추가적인 SetCount > 0 검사는 필수는 아니지만, 방어적 코딩 차원에서 유지해도 무방합니다.*

/**
 * 재고가 0 미만일 때 세트 상품의 '옵션1' 재고를 감소시키고 DB에 반영합니다.
 */
async function handleSetProductCorrection(setProduct, SETProductSellerCode) {
    if (!setProduct || !setProduct.OptionDatas || typeof setProduct.OptionDatas !== "object") {
        console.error(`[handleSetProductCorrection] setProduct 또는 OptionDatas가 유효하지 않습니다!`, setProduct);
        return;
    }
    
    const setOption1 = setProduct.OptionDatas["옵션1"];

    if (!setOption1 || setOption1.Counts === undefined) {
        console.error(`[handleSetProductCorrection] setProduct.OptionDatas["옵션1"] 값이 존재하지 않거나 Counts가 없습니다!`);
        return;
    }
    
    // 이 시점에서는 이미 상위 함수에서 Counts > 0 임이 보장되었으나, 방어적 코드
    if (setOption1.Counts <= 0) {
        console.warn(`[handleSetProductCorrection] Set 상품의 재고가 0 이하입니다. 추가 처리를 중단합니다.`);
        return;
    }
    
    // 재고 감소 및 0 미만 방지 (SetProduct의 DB 업데이트는 감소량 1로 고정)
    setOption1.Counts -= 1;
    
    // ... DB 업데이트 및 SETProductSellerCode 로직 (이전과 동일) ...
    
    // 0 미만 방지 (감소 후의 0 미만 방지)
    if (setOption1.Counts < 0) {
        setOption1.Counts = 0;
        console.warn(`[handleSetProductCorrection] setProduct.OptionDatas["옵션1"].Counts가 0 미만으로 조정됨.`);
    }

        // DB 업데이트

    const setUpdateResult = await updateSetProductCounts(

        setProduct.id,
        1,
        firebase.firestore()
    );
    SETProductSellerCode[setProduct.id] = {
    quantity: setUpdateResult,
    UpdatedCounts: setUpdateResult
    };
}

/**
 * 재고가 0 미만이 되었을 때, 모든 개별 옵션의 재고를 1씩 증가시켜 복구합니다.
 * (복구의 의미는 이전에 감소시킨 옵션의 재고 1을 포함하여 전체 옵션의 재고를 1씩 증가시키는 것)
 * * @param {Object} product - 원본 상품 정보 객체 (product.OptionDatas를 포함)
 * @param {Object} optionDatas - 현재 업데이트 맵에 있는 옵션 데이터 객체 (직접 변경됨)
 */
function restoreOptionCounts(product, optionDatas) {
    console.log(`[restoreOptionCounts] 전체 optionDatas Counts += 1 수행 시작`);

    // 1. 원본 product에는 있지만 optionDatas에 없는 옵션들을 추가합니다.
    // 이는 이전에 업데이트가 전혀 없었지만 재고 복구가 필요한 새로운 옵션이 있을 수 있기 때문입니다.
    if (product.OptionDatas) {
        for (const key in product.OptionDatas) {
            // 원본 product에 있고, 현재 optionDatas에 없는 경우
            if (product.OptionDatas.hasOwnProperty(key) && !optionDatas.hasOwnProperty(key)) {
                // 원본 옵션을 복사하여 추가 (얕은 복사)
                optionDatas[key] = { ...product.OptionDatas[key] };
                console.log(`[restoreOptionCounts] 원본 옵션 ${key}를 optionDatas에 추가했습니다.`);
            }
        }
    }
    
    // 2. 모든 옵션의 Counts를 1 증가시킵니다.
    for (const key in optionDatas) {
        const option = optionDatas[key];
        
        // 옵션 객체가 유효하고, Counts 속성이 숫자인 경우에만 처리
        if (option && typeof option.Counts === 'number') {
            const before = option.Counts;
            option.Counts += 1;

            console.log(
                `[restoreOptionCounts] 옵션 ${key}: Counts ${before} -> ${option.Counts}`
            );
        }
    }
    
    // (참고: 이전 코드에 있던 optionKeySave 인수는 이 로직에서 사용되지 않아 제거했습니다.)
}



async function processProductUpdateMap(barcode, productUpdatesMap, quantity, SETProductSellerCode) {
    
    const product = await getProductByBarcode (barcode);    
    const setProduct = await getProductBySellerCode("SET_"+product.id);

    console.log(`barcode: ${barcode}, product: ${product}`);    
    var optionKeySave;
    if (product.OptionDatas) {
        for (let optionKey in product.OptionDatas) {
            if (product.OptionDatas[optionKey].바코드 === barcode) {
                optionKeySave = optionKey;
                console.log(`optionKeySave: ${optionKeySave}`);
            }
        }
    }
    console.log(`product 찾음 optionKey: ${optionKeySave}`);
    if (productUpdatesMap[product.id]) {
        console.log(`옵션정보: ${productUpdatesMap[product.id].data.OptionDatas[optionKeySave]}`);
        console.log(`옵션정보: ${productUpdatesMap[product.id].data.OptionDatas[optionKeySave]}`);
        if (productUpdatesMap[product.id].data.OptionDatas[optionKeySave]) {
            await decreaseCounts(productUpdatesMap, setProduct, quantity, product, optionKeySave, SETProductSellerCode);
            console.log(`같은제품 있음 같은 옵션 있음: ${product.id} ${optionKeySave} ${productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts}`);
        } else {
            productUpdatesMap[product.id].data.OptionDatas[optionKeySave] = {
                ...product.OptionDatas[optionKeySave]
            };
            await decreaseCounts(productUpdatesMap, setProduct, quantity, product, optionKeySave, SETProductSellerCode);
            console.log(`같은제품 있음 같은 옵션 없음: ${product.id} ${optionKeySave} ${productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts}`);
            console.log(`옵션정보: ${productUpdatesMap[product.id].data.OptionDatas}`);
        }
    } else {
        productUpdatesMap[product.id] = { 
            id: product.id, 
            data: { 
                ...product, 
                OptionDatas: { [optionKeySave]: { ...product.OptionDatas[optionKeySave] } } 
            }
        };
        await decreaseCounts(productUpdatesMap, setProduct, quantity, product, optionKeySave, SETProductSellerCode);
        console.log(`같은제품 없음 같은 옵션 없음: ${product.id} ${optionKeySave} ${productUpdatesMap[product.id].data.OptionDatas[optionKeySave].Counts}`);        
    }
    //console.log(`productUpdatesMap${productUpdatesMap}`);
    //console.log("productUpdatesMap: ", JSON.stringify(productUpdatesMap, null, 2));

    return productUpdatesMap;
}

