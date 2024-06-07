document.addEventListener("DOMContentLoaded", function() {
    const searchForm = document.getElementById("searchForm");

    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const barcode = document.getElementById("barcode").value;
        const resultDiv = document.getElementById("result");

        try {
            // Firestore에서 모든 제품 문서를 가져옴
            const allDocsSnapshot = await db.collection('Products').get();
            let productsFound = [];

            allDocsSnapshot.forEach(doc => {
                const data = doc.data();
                // 제품의 바코드 필드 확인
                if (data.Barcode === barcode) {
                    productsFound.push(data);
                }
                // 각 옵션의 바코드 필드 확인
                if (data.OptionDatas) {
                    for (let option in data.OptionDatas) {
                        if (data.OptionDatas[option].바코드 === barcode) {
                            productsFound.push(data);
                            break;
                        }
                    }
                }
            });

            if (productsFound.length === 0) {
                resultDiv.innerHTML = "<p>No product found with the given barcode!</p>";
            } else if (productsFound.length === 1) {
                displayProductData(productsFound[0]);
            } else {
                // 드롭다운 추가
                let dropdownHTML = `
                    <label for="productSelect">Select a product:</label>
                    <select id="productSelect">
                        ${productsFound.map((product, index) => `<option value="${index}">${product.SellerCode}</option>`).join('')}
                    </select>
                `;
                resultDiv.innerHTML = dropdownHTML + '<div id="productDetails"></div>';

                // 첫 번째 제품 정보 표시
                const productDetailsDiv = document.getElementById("productDetails");
                displayProductData(productsFound[0], productDetailsDiv);

                // 드롭다운 변경 이벤트 리스너 추가
                const productSelect = document.getElementById("productSelect");
                productSelect.addEventListener("change", function() {
                    const selectedIndex = this.value;
                    displayProductData(productsFound[selectedIndex], productDetailsDiv);
                });
            }
        } catch (error) {
            console.error("Error getting documents:", error);
            resultDiv.innerHTML = "<p>Error getting document</p>";
        }
    });
});
