// order_upload.js

import { generateImageURLs } from './generateImageURLs.js';
import { loadOrderNumbers } from './orderHelpers.js';

document.addEventListener("DOMContentLoaded", function () {
    const uploadForm = document.getElementById("uploadForm");
    const messageDiv = document.getElementById("message");
    const orderDropdown = document.getElementById("orderDropdown");

    uploadForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const xlsxFile = document.getElementById("xlsxFile").files[0];
        if (!xlsxFile) {
            alert("XLSX 파일을 선택해주세요.");
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);

            // 첫 번째 행(헤더가 없으므로 첫 번째 데이터 행에서 "판매자 상품코드"가 있는지 확인)
            if (worksheet.length > 0 && "판매자 상품코드" in worksheet[0]) {
                console.log("판매자 상품코드가 존재합니다.");
                processOrdersTogle(worksheet); // 모든 데이터를 그대로 전달
            } else {
                processOrdersGrip(worksheet); // 모든 데이터를 그대로 전달
            }
        };
        reader.readAsArrayBuffer(xlsxFile);
    });
    
    async function processOrdersGrip(orders) {
        const ordersMap = {};
        console.log(orders);
        orders.forEach(order => {
            const orderNumber = order["주문번호"];
            const sellerCode = order["자체상품코드"];
            const option = order["옵션"].replace("선택: ", "");
            const productOrderNumber = order["주문상품번호"];

            const orderData = {
                상품주문번호: productOrderNumber || '',
                주문번호: orderNumber || '',
                SellerCode: sellerCode || '',
                상품명: order["상품명"] || '',
                상품수량: parseInt(order["수량"], 10) || 0,
                상품별총주문금액: parseFloat(order["구매가"]) || 0,
                상품결제금액: parseFloat(order["상품구매금액"]) || 0,
                옵션정보: option || '',
            };

            if (!ordersMap[orderNumber]) {
                ordersMap[orderNumber] = {
                    ProductOrders: {},
                    총수량: 0,
                    총주문금액: 0,
                    총결제금액: 0,
                    총원가금액: 0,
                    기본배송비: order["배송비"] || '',
                    배송메세지: order["배송 메세지"] || '',
                    수취인이름: order["수령인"] || '',
                    판매처: "Grip",
                };
            }

            ordersMap[orderNumber].ProductOrders[productOrderNumber] = orderData;
            ordersMap[orderNumber].총수량 += orderData.상품수량;
            ordersMap[orderNumber].총주문금액 += orderData.상품별총주문금액;
            ordersMap[orderNumber].총결제금액 += orderData.상품결제금액;
        });

        for (let orderNumber in ordersMap) {
            const orderDetails = ordersMap[orderNumber];
            try {
                for (let productOrderNumber in orderDetails.ProductOrders) {
                    const orderData = orderDetails.ProductOrders[productOrderNumber];
                    const sellerCode = orderData.SellerCode;
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
                            원가 = parseFloat(productData.PriceBuy_kr) || 0;
                        } else if (productData.Barcode) {
                            barcode = productData.Barcode;
                        }

                        if (productData.소분류명) {
                            입고차수 = productData.소분류명.replace("차입고", "") || '';
                        }
                    }

                    // 입고차수정보에 따른 이미지명 생성
                    const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(sellerCode, option, 입고차수);

                    orderData.Counts = counts;
                    orderData.바코드 = barcode;
                    orderData.입고차수 = 입고차수;
                    orderData.PriceBuy_kr = 원가;
                    orderData.옵션이미지URL = 옵션이미지URL;
                    orderData.실제이미지URL = 실제이미지URL;

                    orderDetails.총원가금액 += 원가;
                }

                orderDetails.서비스제품금액 = Math.floor((orderDetails.총결제금액 - orderDetails.총원가금액) * 0.7 / 10) * 10;

                const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
                await orderDocRef.set(orderDetails, { merge: true });
                messageDiv.innerHTML += `<p>주문번호 ${orderNumber} 저장 성공!</p>`;
            } catch (error) {
                console.error("Error writing document: ", error);
                messageDiv.innerHTML += `<p>주문번호 ${orderNumber} 저장 중 오류 발생: ${error.message}</p>`;
            }
        }

        loadOrderNumbers(orderDropdown, messageDiv);        
    }
    

    async function processOrdersTogle(orders) {
        const ordersMap = {};
        const saveOrderMap = {};
        let itemcount = 0;
        console.log(orders);
        orders.forEach(order => {
            const orderNumber = order["주문번호"];
            const sellerCode = order["판매자 상품코드"];
            const option = order["옵션정보"].replace("선택: ", "");
            const productOrderNumber = order["상품주문번호"];
    
            const orderData = {
                상품주문번호: productOrderNumber || '',
                주문번호: orderNumber || '',
                SellerCode: sellerCode || '',
                상품명: order["상품명"] || '',
                상품수량: parseInt(order["상품 수량(출력용)"], 10) || 0,
                상품별총주문금액: parseFloat(order["상품결제금액"]) || 0,
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
                    택배접수번호: order["택배접수번호"] || '',
                    판매처: "스마트스토어",
                };
            }
            
            ordersMap[orderNumber].ProductOrders[productOrderNumber] = orderData;
            ordersMap[orderNumber].총수량 += orderData.상품수량;
            ordersMap[orderNumber].총주문금액 += orderData.상품별총주문금액;
            ordersMap[orderNumber].총결제금액 += orderData.상품결제금액;
        });
    
        for (let orderNumber in ordersMap) {
            const orderDetails = ordersMap[orderNumber];
            try {
                for (let productOrderNumber in orderDetails.ProductOrders) {
                    const orderData = orderDetails.ProductOrders[productOrderNumber];

                    
                    let sellerCode = orderData.SellerCode;
                    const option = orderData.옵션정보;
    
                    let productDocRef;
                    let productDocRefDivide;
                    let productData = null;
                    let setProductData
    
                    if (sellerCode.startsWith("SET_")) {                
                        // 이부분 코드 작성해줘orderDetails.ProductOrders[productOrderNumber] 를 제거하기
                        // "SET_"을 제거한 후 Firestore에서 해당 문서 참조
                        const sellerCodeDivide = sellerCode.replace("SET_", "");
                        productDocRef = firebase.firestore().collection('Products').doc(orderData.SellerCode);
                        productDocRefDivide = firebase.firestore().collection('Products').doc(sellerCodeDivide);
    
                        // Firestore에서 해당 문서 가져오기
                        const productDoc = await productDocRef.get();
                        const productDocDivide = await productDocRefDivide.get();
                        if (productDocDivide.exists && productDoc.exists) {                            
                            setProductData = productDoc.data();                            
                            const setCounts = setProductData.OptionDatas["옵션1"].Counts || '';
                            productData = productDocDivide.data();
                            
                            delete orderDetails.ProductOrders[productOrderNumber];
                            // 모든 옵션 데이터를 가져와서 처리
                            let optionCount = Object.keys(productData.OptionDatas).length;
                            for (let opt in productData.OptionDatas) {
                                itemcount++;
                                //console.log(optionCount);
                                const optData = productData.OptionDatas[opt];
                                const counts = setCounts || '';
                                const barcode = optData.바코드 || '';
                                const 원가 = parseFloat(productData.PriceBuy_kr) || 0;
                                const totalPrice = (orderData.상품별총주문금액 / optionCount) || 0;
                                const price = (orderData.상품결제금액 / optionCount) || 0;
                                const 입고차수 = productData.소분류명 ? productData.소분류명.replace("차입고", "") : '';
    
                                // 입고차수정보에 따른 이미지명 생성
                                const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(sellerCodeDivide, opt, 입고차수);
    
                                // SET_로 시작하는 제품의 경우, 판매자 상품코드(sellerCode)는 원래 값인 "SET_"가 포함된 값을 유지
                                orderDetails.ProductOrders[`${productOrderNumber}_${opt}`] = {
                                    상품주문번호: productOrderNumber,
                                    주문번호: orderData.주문번호,
                                    SellerCode: sellerCode, // 원래의 SET_가 붙은 sellerCode를 사용
                                    상품명: orderData.상품명,
                                    상품수량: orderData.상품수량,
                                    상품별총주문금액: totalPrice,
                                    상품결제금액: price,
                                    옵션정보: opt,
                                    Counts: counts, // SET_로 시작하는 제품의 옵션1 Counts 값
                                    바코드: barcode,
                                    입고차수: 입고차수,
                                    PriceBuy_kr: 원가,
                                    옵션이미지URL: 옵션이미지URL,
                                    실제이미지URL: 실제이미지URL
                                };
                                orderDetails.총원가금액 += 원가;
                            }
                        }
                    } else {
                        itemcount++;
                        // SET_로 시작하지 않는 일반 제품의 경우
                        productDocRef = firebase.firestore().collection('Products').doc(sellerCode);
    
                        // Firestore에서 해당 문서 가져오기
                        const productDoc = await productDocRef.get();
                        if (productDoc.exists) {
                            productData = productDoc.data();
                            if (productData.OptionDatas && productData.OptionDatas[option]) {
                                const counts = productData.OptionDatas[option].Counts || '';
                                const barcode = productData.OptionDatas[option].바코드 || '';
                                const 원가 = parseFloat(productData.PriceBuy_kr) || 0;
                                const 입고차수 = productData.소분류명 ? productData.소분류명.replace("차입고", "") : '';
    
                                // 입고차수정보에 따른 이미지명 생성
                                const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(sellerCode, option, 입고차수);
    
                                orderData.Counts = counts;
                                orderData.바코드 = barcode;
                                orderData.입고차수 = 입고차수;
                                orderData.PriceBuy_kr = 원가;
                                orderData.옵션이미지URL = 옵션이미지URL;
                                orderData.실제이미지URL = 실제이미지URL;
    
                                orderDetails.총원가금액 += 원가;
                            }
                        }
                    }
                }
    
                orderDetails.서비스제품금액 = Math.floor((orderDetails.총결제금액 - orderDetails.총원가금액) * 0.7 / 10) * 10;
                orderDetails.총수량 = itemcount;

                //orderDetails.ProductOrders.


    
                const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
                await orderDocRef.set(orderDetails, { merge: true });
                messageDiv.innerHTML += `<p>주문번호 ${orderNumber} 저장 성공!</p>`;
            } catch (error) {
                console.error("Error writing document: ", error);
                messageDiv.innerHTML += `<p>주문번호 ${orderNumber} 저장 중 오류 발생: ${error.message}</p>`;
            }
        }
    
        loadOrderNumbers(orderDropdown, messageDiv);
    }
    
    

    //loadOrderNumbers(orderDropdown, messageDiv);
});
