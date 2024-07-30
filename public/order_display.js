import { loadOrderNumbers, checkServiceBarcode, checkBarcode, getOrderData } from './orderHelpers.js';
import { updateProductCounts } from './barcode_search.js';

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

    packingCompleteButton.addEventListener('click', async function() {
        try {
            const orderNumber = orderDropdown.value;
            if (!orderNumber) return;

            const orderData = await getOrderData(orderNumber);

            // 상품정보 테이블의 체크된 행만 처리
            const productRows = orderDetails.querySelectorAll("tbody tr");
            for (const row of productRows) {
                const checkbox = row.querySelector(".barcodeCheck");
                if (checkbox && checkbox.checked) {
                    const barcode = row.querySelector('[data-label="바코드"]').textContent;
                    const quantity = parseInt(row.querySelector('.packingQuantity').value, 10);
                    console.log(`Processing product with barcode: ${barcode}, quantity: ${quantity}`);
                    try {
                        await updateProductCounts(barcode, quantity, firebase.firestore());
                        console.log(`Successfully updated product counts for barcode: ${barcode}`);
                    } catch (error) {
                        console.error(`Error updating product counts for barcode: ${barcode}`, error);
                    }
                } else {
                    console.log(`Skipping unchecked product row: ${row}`);
                }
            }

            // 서비스 상품 정보 모든 행 처리
            const serviceRows = orderData.ProductService || [];
            console.log(`serviceRows count: ${serviceRows.length}`);
            for (const service of serviceRows) {
                const barcode = service.바코드;
                const quantity = 1;
                console.log(`Processing service product with barcode: ${barcode}, quantity: ${quantity}`);
                try {
                    await updateProductCounts(barcode, quantity, firebase.firestore());
                    console.log(`Successfully updated service product counts for barcode: ${barcode}`);
                } catch (error) {
                    console.error(`Error updating service product counts for barcode: ${barcode}`, error);
                }
            }


            // 주문 데이터를 CompletedOrders로 이동하고 Orders에서 삭제
            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
            const orderDoc = await orderDocRef.get();
            if (orderDoc.exists) {
                orderData.주문처리날짜 = new Date();  // 현재 날짜와 시간을 저장
                await firebase.firestore().collection('CompletedOrders').doc(orderNumber).set(orderData);
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
