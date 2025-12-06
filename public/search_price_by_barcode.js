import { searchByBarcode } from './barcode_search.js';
import { refineInputValue } from './aGlobalMain.js';
// displayProductData, clearDisplayElements, formatPrice 함수가 이 파일에 포함됩니다.

let currentSellercode = null;
let currentProduct = null;
let currentSellerCodeSet = null;

document.addEventListener("DOMContentLoaded", function() {
    const searchForm = document.getElementById("searchForm");
    // <input> 요소에 포커스 설정
    const barcodeInput = document.getElementById("barcode");
    barcodeInput.focus();
    
    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        let barcode = barcodeInput.value;
        barcode = refineInputValue(barcode);
        console.log("barcode:", barcode);
        searchProductByBarcode(barcode);
        
        barcodeInput.value = '';
    });
});

/**
 * 바코드를 사용하여 제품을 검색합니다.
 * @param {string} barcode - 검색할 바코드
 */
async function searchProductByBarcode(barcode) {
    const resultDiv = document.getElementById("result");
    clearDisplayElements(); // 새로운 검색 시작 시 화면 초기화
    
    try {
        // 'db'는 window.db로 Firebase Config 파일에서 전역 설정되어 있다고 가정합니다.
        const productsFound = await searchByBarcode(barcode, window.db); 

        if (!productsFound || productsFound.length === 0) {
            resultDiv.innerHTML = "<p>바코드와 일치하는 제품을 찾을 수 없습니다!</p>";
        } else if (productsFound.length === 1) {
            searchProductBySellerCode(productsFound[0].SellerCode);
        } else {
            // 바코드 하나에 여러 제품이 매칭될 경우 처리 로직 추가 필요
            resultDiv.innerHTML = "<p>경고: 이 바코드에 여러 제품이 매칭됩니다. (SellerCode: " + productsFound.map(p => p.SellerCode).join(', ') + ")</p>";
            // 일단 첫 번째 SellerCode로 검색을 진행합니다.
            searchProductBySellerCode(productsFound[0].SellerCode);
        }
    } catch (error) {
        console.error("Error getting documents:", error);
        document.getElementById("message").innerHTML = "<p>문서 검색 중 오류가 발생했습니다.</p>";
    }
}

/**
 * SellerCode를 사용하여 제품 상세 정보를 검색합니다.
 * @param {string} sellerCode - 검색할 SellerCode
 */
async function searchProductBySellerCode(sellerCode) {
    const resultDiv = document.getElementById("result");
    try {
        let baseSellerCode = sellerCode;

        if(sellerCode.includes("SET_")) {
            baseSellerCode = sellerCode.replace("SET_", "");
        }

        currentSellercode = baseSellerCode;
        
        // Firestore에서 문서 참조 가져오기
        const docRef = window.db.collection("Products").doc(baseSellerCode);
        const setDocRef = window.db.collection("Products").doc("SET_" + baseSellerCode);

        // 두 문서를 동시에 가져옴
        const [docSnap, setDocSnap] = await Promise.all([docRef.get(), setDocRef.get()]);

        // 문서가 존재하면 데이터 표시, 아니면 "No such product found!" 메시지 표시
        if (docSnap.exists) {
            currentProduct = docSnap.data();
            currentSellerCodeSet = setDocSnap.exists ? setDocSnap.data() : null; // 세트가 없을 수도 있음
            
            // 데이터 표시 함수 호출
            displayProductData(currentProduct, currentSellerCodeSet); 
        } else {
            resultDiv.innerHTML = "<p>일치하는 제품 정보를 찾을 수 없습니다!</p>";
        }
    } catch (error) {
        console.error("Error getting document:", error);
        document.getElementById("message").innerHTML = "<p>제품 정보 검색 중 오류가 발생했습니다.</p>";
    }
}

// =========================================================================
// displayPriceData.js 파일의 핵심 기능 (표시 및 유틸리티 함수)
// =========================================================================


/**
 * Firestore에서 가져온 제품 데이터를 HTML 요소에 표시합니다.
 * @param {Object} productData - SellerCode (단품)의 제품 데이터
 * @param {Object} setProductData - SET_SellerCode (세트)의 제품 데이터 (있을 경우)
 */
export function displayProductData(productData, setProductData) {
    
    console.log("productData", productData);

    // 1. 초기화는 검색 시작 시 clearDisplayElements()를 호출하므로 여기서는 생략
    
    // 2. 제품명 및 이미지 표시
    const productNameDisplay = document.getElementById("productNameDisplay");
    const productImageDisplay = document.getElementById("productImageDisplay");

    // 제품명은 'ProductNameKr' 필드를 사용
    if (productData.ProductNameKr) {
        productNameDisplay.textContent = productData.ProductNameKr;
    }

    // 이미지 경로는 '로컬이미지경로' 필드를 사용 (drive.google.com/uc?id=... 형태)
    if (productData.로컬이미지경로) {
        productImageDisplay.src = productData.productImageDisplay;
        productImageDisplay.style.display = 'block'; // 이미지가 있을 경우 보이도록 설정
    }

    // 3. 가격 및 SellerCode 정보 표시
    const sellerCodeDisplay = document.getElementById("sellerCodeDisplay");
    const originalPriceDisplay = document.getElementById("originalPriceDisplay");
    const discountedPriceDisplay = document.getElementById("discountedPriceDisplay");
    
    // SellerCode는 단품 데이터의 SellerCode를 사용
    if (productData.SellerCode) {
        sellerCodeDisplay.textContent = productData.SellerCode;
    }

    // 가격 정보 추출 (기본적으로 단품 SellingPrice를 사용)
    // SellingPrice가 문자열로 되어 있으므로 숫자로 변환
    let priceToDisplay = parseInt(productData.SellingPrice) || 0;
    
    // 세트 상품 데이터가 유효하고, 세트 상품 가격이 더 높으면 세트 가격을 사용
    // 세트 상품 가격도 SellingPrice (문자열)에서 가져와서 비교/사용합니다.
    const setPrice = setProductData ? parseInt(setProductData.SellingPrice) : 0;
    
    if (setPrice > priceToDisplay) {
        priceToDisplay = setPrice;
        // 세트 가격 사용 시 SellerCode도 SET_코드로 표시
        if (setProductData.SellerCode) {
            sellerCodeDisplay.textContent = setProductData.SellerCode;
        }
    }

    // 가격을 포맷하여 표시
    const formattedPrice = formatPrice(priceToDisplay);
    originalPriceDisplay.textContent = formattedPrice;

    // 50% 할인 가격 계산 및 표시
    // Math.floor는 소수점 이하를 버림
    const discountedPrice = Math.floor(priceToDisplay * 0.5); 
    const formattedDiscountedPrice = formatPrice(discountedPrice);
    discountedPriceDisplay.textContent = formattedDiscountedPrice;
    
    // 옵션 정보를 표시합니다 (사용자 지정 옵션 정보를 포함)
    displayOptions(productData.OptionDatas, document.getElementById("result"));
}


/**
 * 옵션 정보를 테이블 형태로 result Div에 표시합니다.
 * @param {Object} optionDatas - 제품의 OptionDatas 객체
 * @param {HTMLElement} targetDiv - 테이블을 삽입할 HTML 요소
 */
function displayOptions(optionDatas, targetDiv) {
    if (!optionDatas || Object.keys(optionDatas).length === 0) {
        return;
    }

    let tableHTML = '<h3>옵션 정보</h3>';
    tableHTML += '<table><thead><tr><th>옵션명</th><th>가격</th><th>바코드</th><th>재고(Counts)</th></tr></thead><tbody>';
    
    // 사용자 지정 옵션 정보
    const specialOptions = [
        "옵션1", "옵션2", "옵션3", "옵션4", "옵션5", "옵션6" // 예시
    ]; 

    // 옵션 데이터 반복
    for (const optionKey of specialOptions) {
        const option = optionDatas[optionKey];
        if (option) {
            const counts = option.Counts !== undefined ? option.Counts : 'N/A';
            const price = option.Price !== undefined ? formatPrice(option.Price) : 'N/A';
            const barcode = option.바코드 || 'N/A';
            
            tableHTML += `<tr>
                <td>${optionKey}</td>
                <td>${price}</td>
                <td>${barcode}</td>
                <td>${counts}</td>
            </tr>`;
        }
    }

    tableHTML += '</tbody></table>';
    targetDiv.innerHTML += tableHTML;
}


/**
 * HTML 결과 표시 요소를 초기화합니다.
 */
function clearDisplayElements() {
    // 상품 정보 초기화
    document.getElementById("productNameDisplay").textContent = '';
    
    const productImageDisplay = document.getElementById("productImageDisplay");
    productImageDisplay.src = '';
    productImageDisplay.style.display = 'none'; // 이미지 숨김

    // 가격/코드 정보 초기화
    document.getElementById("sellerCodeDisplay").textContent = '';
    document.getElementById("originalPriceDisplay").textContent = '';
    document.getElementById("discountedPriceDisplay").textContent = '';
    
    // 테이블 및 메시지 초기화
    document.getElementById("result").innerHTML = '';
    document.getElementById("message").innerHTML = '';
}

/**
 * 숫자를 통화 형식(원화, 쉼표)으로 포맷합니다.
 * @param {number} number - 포맷할 숫자
 * @returns {string} 포맷된 문자열
 */
function formatPrice(number) {
    if (typeof number !== 'number' || isNaN(number)) {
        return '0원';
    }
    return number.toLocaleString('ko-KR') + '원';
}

// // 내보내기 함수 (필요한 경우)
// export { getCurrentSellerCode, getCurrentProduct }; // 이미 제공된 함수