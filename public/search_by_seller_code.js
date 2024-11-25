
//search_by_seller_code.js


let currentSellercode = null;
let currentProduct = null;

document.addEventListener("DOMContentLoaded", function() {
    console.log("DOMContentLoaded event fired");
    console.log("Firestore DB instance:", window.db);

    // URL 쿼리 매개변수에서 sellerCode 값 가져오기
    const urlParams = new URLSearchParams(window.location.search);
    const sellerCode = urlParams.get('sellerCode');

    if (sellerCode) {
        searchProductBySellerCode(sellerCode);
    }

    // 폼 요소 선택
    const searchForm = document.getElementById("searchForm");

    // <input> 요소에 포커스 설정
    const sellerCodeInput = document.getElementById("sellerCode");
    sellerCodeInput.focus();

    // 폼 제출 이벤트 리스너 추가
    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const sellerCodeValue = sellerCodeInput.value;

        if (sellerCodeValue) {
            await searchProductBySellerCode(sellerCodeValue);
            sellerCodeInput.value = '';  // 폼 제출 후 입력 필드 비우기
        }
    });
});

export function getCurrentSellerCode() {
    return currentSellercode;
}

export function getCurrentProduct() {
    return currentProduct;
}

async function searchProductBySellerCode(sellerCode) {
    try {
        currentSellercode = sellerCode;
        // Firestore에서 문서 참조 가져오기
        const docRef = window.db.collection("Products").doc(sellerCode);
        const docSnap = await docRef.get();        

        // 문서가 존재하면 데이터 표시, 아니면 "No such product found!" 메시지 표시
        if (docSnap.exists) {
            currentProduct = docSnap.data();
            displayProductData(currentProduct);
        } else {
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = "<p>No such product found!</p>";
        }
    } catch (error) {
        console.error("Error getting document:", error);
        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = "<p>Error getting document</p>";
    }
}
