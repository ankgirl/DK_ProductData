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

    // 폼 제출 이벤트 리스너 추가
    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const sellerCodeInput = document.getElementById("sellerCode").value;

        if (sellerCodeInput) {
            searchProductBySellerCode(sellerCodeInput);
        }
    });
});

async function searchProductBySellerCode(sellerCode) {
    try {
        // Firestore에서 문서 참조 가져오기
        const docRef = window.db.collection("Products").doc(sellerCode);
        const docSnap = await docRef.get();

        // 문서가 존재하면 데이터 표시, 아니면 "No such product found!" 메시지 표시
        if (docSnap.exists) {
            const productData = docSnap.data();
            displayProductData(productData);
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