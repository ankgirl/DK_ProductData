document.addEventListener("DOMContentLoaded", function() {
    console.log("DOMContentLoaded event fired");
    console.log("Firestore DB instance:", window.db);

    // 폼 요소 선택
    const searchForm = document.getElementById("searchForm");

    // <input> 요소에 포커스 설정
    const QRCodeInput = document.getElementById("QRCode");
    QRCodeInput.focus();
    

    // 폼 제출 이벤트 리스너 추가
    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const QRCode = QRCodeInput.value;
        await searchProductByQRCode(QRCode);
        QRCodeInput.value = '';

    });
});

async function searchProductByQRCode(QRCode) {
    try {
        // Firestore에서 Products 컬렉션의 모든 문서 가져오기
        const productsSnapshot = await window.db.collection("Products").get();
        let productFound = false;

        productsSnapshot.forEach((doc) => {
            const productData = doc.data();
            if (productData.SmartStoreURL === QRCode) {
                displayProductData(productData);
                productFound = true;
            }
        });

        if (!productFound) {
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = "<p>No such product found!</p>";
        }
    } catch (error) {
        console.error("Error getting documents:", error);
        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = "<p>Error getting documents</p>";
    }
}
