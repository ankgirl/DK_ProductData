import { searchByBarcode } from './barcode_search.js';
//import { displayProductData } from './displayProductData.js';

document.addEventListener("DOMContentLoaded", function() {


    const searchForm = document.getElementById("searchForm");

    // <input> 요소에 포커스 설정
    const barcodeInput = document.getElementById("barcode");
    barcodeInput.focus();
    

    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const barcode = barcodeInput.value;
        searchProductByBarcode(barcode)
        barcodeInput.value = '';
    });
});


async function searchProductByBarcode(barcode) {
    const resultDiv = document.getElementById("result");
    try {
        const productsFound = await searchByBarcode(barcode, db);

        if (!productsFound) {
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
}