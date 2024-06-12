document.addEventListener("DOMContentLoaded", function() {
    const uploadForm = document.getElementById("uploadForm");
    const messageDiv = document.getElementById("message");

    uploadForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const xlsxFile = document.getElementById("xlsxFile").files[0];
        if (!xlsxFile) {
            alert("XLSX 파일을 선택해주세요.");
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);

            processOrders(worksheet);
        };
        reader.readAsArrayBuffer(xlsxFile);
    });

    async function processOrders(orders) {
        const ordersMap = {};

        orders.forEach(order => {
            const orderNumber = order["주문번호"];
            const sellerCode = order["판매자 상품코드"];
            const option = order["옵션정보"].replace("선택: ", "");
            const productOrderNumber = order["상품주문번호"];

            const orderData = {
                상품주문번호: productOrderNumber || '',
                주문번호: orderNumber || '',
                판매자상품코드: sellerCode || '',
                상품명: order["상품명"] || '',
                상품수량: parseInt(order["상품 수량(출력용)"], 10) || 0,
                상품별총주문금액: parseFloat(order["상품별 총 주문금액"]) || 0,
                상품결제금액: parseFloat(order["상품결제금액"]) || 0,
                옵션정보: option || '',
            };

            if (!ordersMap[orderNumber]) {
                ordersMap[orderNumber] = {
                    ProductOrders: {},
                    총수량: 0,
                    총주문금액: 0,
                    총결제금액: 0,
                    총원가금액: 0,
                    기본배송비: order["기본 배송비"] || '',
                    배송메세지: order["배송 메세지"] || '',
                    수취인이름: order["수취인 이름"] || '',
                    택배접수번호: order["택배접수번호"] || ''
                };
            }

            ordersMap[orderNumber].ProductOrders[productOrderNumber] = orderData;
            ordersMap[orderNumber].총수량 += orderData.상품수량;
            ordersMap[orderNumber].총주문금액 += orderData.상품별총주문금액;
            ordersMap[orderNumber].총결제금액 += orderData.상품결제금액;
        });

        for (let orderNumber in ordersMap) {
            const orderDetails = ordersMap[orderNumber];
            orderDetails.서비스제품금액 = orderDetails.총결제금액 * 0.5;

            try {
                for (let productOrderNumber in orderDetails.ProductOrders) {
                    const orderData = orderDetails.ProductOrders[productOrderNumber];
                    const sellerCode = orderData.판매자상품코드;
                    const option = orderData.옵션정보;
                    const productDocRef = firebase.firestore().collection('Products').doc(sellerCode);

                    const productDoc = await productDocRef.get();
                    let counts = '';
                    let barcode = '';
                    let 입고차수 = '';
                    let 원가 = 0;

                    if (productDoc.exists) {
                        const productData = productDoc.data();
                        if (productData.OptionDatas && productData.OptionDatas[option]) {
                            counts = productData.OptionDatas[option].Counts || '';
                            barcode = productData.OptionDatas[option].바코드 || '';
                            원가 = parseFloat(productData.원가) || 0;
                        } else if (productData.Barcode) {
                            barcode = productData.Barcode;
                        }

                        if (productData.소분류명) {
                            입고차수 = productData.소분류명.replace("차입고", "") || '';
                        }
                    }

                    // 입고차수정보에 따른 이미지명 생성
                    const optionNumber = option.replace("옵션", "").padStart(3, '0');
                    const 입고차수정보 = parseInt(입고차수, 10);
                    let 이미지명 = '';

                    if (입고차수정보 <= 23) {
                        이미지명 = `${sellerCode}%20sku${optionNumber}.jpg`;
                    } else {
                        이미지명 = `${sellerCode}%20sku_${optionNumber}.jpg`;
                    }

                    // 이미지 URL 생성
                    const baseUrl = `https://dakkuharu.openhost.cafe24.com/1688/${입고차수}/${sellerCode}`;
                    const 옵션이미지URL = `${baseUrl}/option/${이미지명}`;
                    const 실제이미지URL = `${baseUrl}/real/${이미지명}`;

                    orderData.Counts = counts;
                    orderData.바코드 = barcode;
                    orderData.입고차수 = 입고차수;
                    orderData.원가 = 원가;
                    orderData.옵션이미지URL = 옵션이미지URL;
                    orderData.실제이미지URL = 실제이미지URL;

                    orderDetails.총원가금액 += 원가;
                }

                const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
                await orderDocRef.set(orderDetails, { merge: true });
                messageDiv.innerHTML += `<p>주문번호 ${orderNumber} 저장 성공!</p>`;
            } catch (error) {
                console.error("Error writing document: ", error);
                messageDiv.innerHTML += `<p>주문번호 ${orderNumber} 저장 중 오류 발생: ${error.message}</p>`;
            }
        }

        loadOrderNumbers();
    }

    async function loadOrderNumbers() {
        try {
            const ordersSnapshot = await firebase.firestore().collection('Orders').get();
            const orderDropdown = document.getElementById("orderDropdown");
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

            orderDropdown.addEventListener("change", displayOrderDetails);
        } catch (error) {
            console.error("Error loading order numbers: ", error);
            messageDiv.innerHTML += `<p>주문번호 로드 중 오류 발생: ${error.message}</p>`;
        }
    }
});
