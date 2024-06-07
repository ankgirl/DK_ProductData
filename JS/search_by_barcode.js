document.addEventListener("DOMContentLoaded", function() {
    const searchForm = document.getElementById("searchForm");

    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const barcode = document.getElementById("barcode").value;
        const resultDiv = document.getElementById("result");

        try {
            // Firestore에서 모든 제품 문서를 가져옴
            const allDocsSnapshot = await db.collection('Products').get();
            let productFound = false;

            allDocsSnapshot.forEach(doc => {
                const data = doc.data();
                // 제품의 바코드 필드 확인
                if (data.Barcode === barcode) {
                    displayProductData(data);
                    productFound = true;
                    return;
                }
                // 각 옵션의 바코드 필드 확인
                if (data.OptionDatas) {
                    for (let option in data.OptionDatas) {
                        if (data.OptionDatas[option].바코드 === barcode) {
                            displayProductData(data);
                            productFound = true;
                            return;
                        }
                    }
                }
            });

            if (!productFound) {
                resultDiv.innerHTML = "<p>No product found with the given barcode!</p>";
            }
        } catch (error) {
            console.error("Error getting documents:", error);
            resultDiv.innerHTML = "<p>Error getting document</p>";
        }
    });
});
