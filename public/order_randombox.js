// order_randombox.js

import { generateOrderNumber } from './generateOrderNumber.js';
import { clearOrderData, ShowOrderData } from './order_randombox_showInfo.js';
import { searchByBarcode } from './barcode_search.js';


let globalOrderData = null;  // 전역 변수로 선언
console.log("Script Loaded Outside DOMContentLoaded");
document.addEventListener("DOMContentLoaded", async function() {
    console.log("DOMContentLoaded - Script Loaded"); // DOMContentLoaded 이벤트가 성공적으로 실행되었는지 확인

    const createEmptyOrderButtonVintage = document.getElementById("CreateNewOrderButton_vintage29800");
    const createEmptyOrderButtonSensitivity = document.getElementById("CreateNewOrderButton_sensitivity29800");
    const createEmptyOrderButtonCute = document.getElementById("CreateNewOrderButton_cute29800");
    const randomBoxNumberDropdown = document.getElementById("randomBoxNumberDropdown");
    const barcodeInput = document.getElementById("barcodeInput");
    barcodeInput.focus();
    const messageDiv = document.getElementById("message");
    
    
    



    console.log("Buttons and Inputs Initialized"); // 각 버튼 및 입력 요소들이 제대로 초기화되었는지 확인

    setupCreateOrderButton(createEmptyOrderButtonVintage, 29800, "빈티지");
    setupCreateOrderButton(createEmptyOrderButtonSensitivity, 29800, "감성");
    setupCreateOrderButton(createEmptyOrderButtonCute, 29800, "큐트");

    console.log("Setup Create Order Buttons Completed"); // 각 주문 생성 버튼에 대한 초기화가 완료되었는지 확인

    // Firestore에서 랜덤박스 주문 문서 이름을 가져와서 드롭다운에 추가
    console.log("populateRandomBoxDropdown Called");
    await populateRandomBoxDropdown(randomBoxNumberDropdown);

    console.log("Dropdown Populated"); // 드롭다운에 문서들이 성공적으로 추가되었는지 확인

    // 드롭다운이 변경되면 선택된 값으로 ShowOrderData 호출
    randomBoxNumberDropdown.addEventListener("change", async function () {
        const selectedOrderNumber = randomBoxNumberDropdown.value;
        console.log("Dropdown Changed, Selected Order Number: ", selectedOrderNumber);
        if (!selectedOrderNumber) return;

        globalOrderData = await getOrderData(selectedOrderNumber);
        console.log("Order Data Fetched: ", globalOrderData); // 주문 데이터를 제대로 가져왔는지 확인

        globalOrderData.orderNumber = selectedOrderNumber;  // orderNumber 값을 orderData에 추가
        ShowOrderData(globalOrderData);
        console.log("ShowOrderData Called with: ", globalOrderData); // 주문 데이터 표시 함수 호출 확인
    });

    barcodeInput.addEventListener("keypress", async function(event) {
        if (event.key === 'Enter') {
            const barcode = barcodeInput.value.trim();
            console.log("Barcode Entered: ", barcode); // 사용자가 입력한 바코드 확인
            if (barcode) {
                await checkBarcode(barcode, messageDiv);
                console.log("CheckBarcode Completed for: ", barcode); // 바코드 체크가 완료되었는지 확인
                barcodeInput.value = '';  // 입력 후 입력란 지우기
            }
        }
    });

    console.log("Event Listeners Attached");
});


function generateImageURLs(sellerCode, option, 입고차수) {
    if (!입고차수) {
        console.error("입고차수가 정의되지 않았습니다.");
        return { 옵션이미지URL: '', 실제이미지URL: '' };
    }

    const cleaned입고차수 = 입고차수.replace("차입고", "");
    const optionNumber = option.replace("옵션", "").padStart(3, '0');
    const 입고차수정보 = parseInt(cleaned입고차수, 10);
    let 이미지명 = '';

    if (입고차수정보 <= 23) {
        이미지명 = `${sellerCode}%20sku${optionNumber}.jpg`;
    } else {
        이미지명 = `${sellerCode}%20sku_${optionNumber}.jpg`;
    }

    const baseUrl = `https://dakkuharu.openhost.cafe24.com/1688/${cleaned입고차수}/${sellerCode}`;
    const 옵션이미지URL = `${baseUrl}/option/${이미지명}`;
    const 실제이미지URL = `${baseUrl}/real/${이미지명}`;

    return { 옵션이미지URL, 실제이미지URL };
}

export async function checkBarcode(barcode, messageDiv) {
    try {
        const productsFound = await searchByBarcode(barcode, firebase.firestore());
        if (!productsFound) {
            alert("바코드가 일치하는 제품을 찾을 수 없습니다.");
            return;
        }
        const productData = productsFound[0];
        const optionKey = productData.matchedOption || ''; 
        const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(productData.SellerCode, optionKey, productData.소분류명);

        productData.옵션이미지URL = 옵션이미지URL;
        productData.실제이미지URL = 실제이미지URL;
        console.log(productData);
        // globalOrderData 사용
        if (!globalOrderData.ProductRandomboxItem) {
            globalOrderData.ProductRandomboxItem = [];
        }

        const randomboxItemData = {
            판매자상품코드: productData.SellerCode || '',
            옵션정보: optionKey,
            수량: 1,
            원가: productData.원가 || '',
            할인가: productData.DiscountedPrice || '',
            판매가: productData.SellingPrice || '',
            바코드: barcode || '',
            옵션이미지: productData.옵션이미지URL || '',
            실제이미지: productData.실제이미지URL || '',
            제품명: productData.스토어키워드네임 || '',
            스토어링크: productData.SmartStoreURL || '',
        };

        globalOrderData.ProductRandomboxItem.push(randomboxItemData);
        

        // 제품수량 계산
        globalOrderData.제품수량 = globalOrderData.ProductRandomboxItem.length;

        // 총제품가격 계산
        globalOrderData.총제품가격 = globalOrderData.ProductRandomboxItem.reduce((acc, item) => {
            return acc + (parseFloat(item.판매가) || 0);
        }, 0);

        // 총제품원가 계산
        globalOrderData.총제품원가 = globalOrderData.ProductRandomboxItem.reduce((acc, item) => {
            return acc + (parseFloat(item.원가) || 0);
        }, 0);


        const orderDocRef = firebase.firestore().collection('RandomboxOrders').doc(globalOrderData.id);
        await orderDocRef.set(globalOrderData, { merge: true });

        messageDiv.innerHTML += `<p>랜덤박스 바코드 ${barcode} 저장 성공!</p>`;

        ShowOrderData(globalOrderData);  // UI 갱신

        return globalOrderData;
    } catch (error) {
        console.error("Error processing barcode: ", error);
        messageDiv.innerHTML += `<p>바코드 처리 중 오류 발생: ${error.message}</p>`;
    }
    return null;
}


// Firestore에서 'RandomboxOrders' 컬렉션의 문서 이름을 드롭다운에 추가하는 함수
async function populateRandomBoxDropdown(dropdown) {
    try {
        const ordersSnapshot = await firebase.firestore().collection('RandomboxOrders').get();
        
        if (!ordersSnapshot.empty) {
            let index = 0;  // 인덱스를 수동으로 관리
            ordersSnapshot.forEach(async (doc) => {
                const option = document.createElement("option");
                option.value = doc.id;
                option.textContent = doc.id;
                dropdown.appendChild(option);

                // 첫 번째 문서의 주문 번호로 기본값 설정
                if (index === 0) {
                    dropdown.value = doc.id;
                    globalOrderData = await getOrderData(doc.id);  // 문서 데이터를 가져옴
                    ShowOrderData(globalOrderData);  // 데이터를 ShowOrderData에 넘김
                }
                index++;  // 인덱스 증가
            });
        } else {
            console.error("No orders found in the RandomboxOrders collection.");
        }
    } catch (error) {
        console.error("Error fetching orders from Firestore:", error);
    }
}


function setupCreateOrderButton(createEmptyOrderButton, price, style) {
    createEmptyOrderButton.addEventListener("click", async function () {
        const orderNumber = await CreateNewOrder(price, style);
        if (orderNumber !== -1) {
            globalOrderData = await getOrderData(orderNumber);  // 새로 생성된 주문서 데이터를 가져옴
            ShowOrderData(globalOrderData);  // 데이터를 ShowOrderData에 넘김
        }
    });
}


async function CreateNewOrder(price, style) {
    const messageDiv = document.getElementById("message");
    const orderNumber = generateOrderNumber();

    const emptyOrderData = {
        ProductRandomboxItem: [],  // 배열로 초기화
        제품수량: 0,
        럭키랜덤박스가격: price,
        총제품가격: 0,
        총제품원가: 0,
        스타일: style,
    };

    try {
        const orderDocRef = firebase.firestore().collection('RandomboxOrders').doc(orderNumber);
        await orderDocRef.set(emptyOrderData, { merge: true });
        messageDiv.innerHTML += `<p>빈 주문서 ${orderNumber} 생성 성공!</p>`;
        return orderNumber;
    } catch (error) {
        console.error("Error writing document: ", error);
        messageDiv.innerHTML += `<p>빈 주문서 ${orderNumber} 생성 중 오류 발생: ${error.message}</p>`;
        return -1;
    }
}


export async function getOrderData(orderNumber) {
    const orderDocRef = firebase.firestore().collection('RandomboxOrders').doc(orderNumber);
    const orderDoc = await orderDocRef.get();
    if (orderDoc.exists) {
        globalOrderData = orderDoc.data();  
        globalOrderData.id = orderDoc.id;  // 문서 ID를 추가
        return globalOrderData;
    }
    throw new Error("선택된 주문 번호에 대한 정보를 찾을 수 없습니다.");
}


document.getElementById("deleteOrderButton").addEventListener("click", async function() {
    const randomBoxNumberDropdown = document.getElementById("randomBoxNumberDropdown");
    const selectedOrderNumber = randomBoxNumberDropdown.value;

    if (!selectedOrderNumber) {
        alert("삭제할 주문서를 선택하세요.");
        return;
    }

    const confirmation = confirm(`정말로 주문서 ${selectedOrderNumber}을(를) 삭제하시겠습니까?`);

    if (confirmation) {
        try {
            await deleteOrder(selectedOrderNumber);
            alert(`주문서 ${selectedOrderNumber} 삭제 성공`);

            // 드롭다운에서 삭제한 주문서 제거
            const optionToRemove = randomBoxNumberDropdown.querySelector(`option[value="${selectedOrderNumber}"]`);
            if (optionToRemove) {
                optionToRemove.remove();
            }

            // 삭제 후 기본 선택값 변경
            if (randomBoxNumberDropdown.options.length > 0) {
                randomBoxNumberDropdown.selectedIndex = 0;
                const firstOrderNumber = randomBoxNumberDropdown.value;
                globalOrderData = await getOrderData(firstOrderNumber);  // 새 데이터를 불러옴
                ShowOrderData(globalOrderData);
            } else {
                clearOrderData();
            }
            
        } catch (error) {
            console.error("Error deleting order: ", error);
            alert(`주문서 삭제 중 오류 발생: ${error.message}`);
        }
    }
});

async function deleteOrder(orderNumber) {
    try {
        const orderDocRef = firebase.firestore().collection('RandomboxOrders').doc(orderNumber);
        await orderDocRef.delete();
        console.log(`주문서 ${orderNumber} 삭제 성공`);
    } catch (error) {
        console.error(`주문서 삭제 중 오류 발생: ${error.message}`);
        throw error;
    }
}



