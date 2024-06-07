//search_by_seller_code.js
document.addEventListener("DOMContentLoaded", function() {
    console.log("DOMContentLoaded event fired");
    console.log("Firestore DB instance:", window.db);

    // 폼 요소 선택
    const searchForm = document.getElementById("searchForm");

    // 폼 제출 이벤트 리스너 추가
    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const sellerCode = document.getElementById("sellerCode").value;

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
    });
});
