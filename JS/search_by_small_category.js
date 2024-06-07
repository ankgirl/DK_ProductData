document.addEventListener("DOMContentLoaded", function() {
    const searchForm = document.getElementById("searchForm");

    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        const smallCategoryInput = document.getElementById("smallCategory").value;
        const smallCategory = smallCategoryInput + "차입고";
        const resultDiv = document.getElementById("result");

        try {
            // Firestore에서 모든 제품 문서를 가져옴
            const allDocsSnapshot = await db.collection('Products').get();
            let productsFound = [];

            allDocsSnapshot.forEach(doc => {
                const data = doc.data();
                // 소분류명이 "XX차입고"인 제품을 찾음
                if (data.소분류명 && data.소분류명.includes(smallCategory)) {
                    productsFound.push(data);
                }
            });

            if (productsFound.length === 0) {
                resultDiv.innerHTML = "<p>No products found in this small category!</p>";
            } else {
                // 각 제품의 정보를 테이블 형식으로 표시
                resultDiv.innerHTML = generateTableHTML(productsFound);
            }
        } catch (error) {
            console.error("Error getting documents:", error);
            resultDiv.innerHTML = "<p>Error getting document</p>";
        }
    });
});

function generateTableHTML(products) {
    let tableHTML = `
        <table class="styled-table">
            <thead>
                <tr>
                    <th>SellerCode</th>
                    <th>Image</th>
                    <th>ShopURL</th>
                    <th>Option Name</th>
                    <th>Counts</th>
                    <th>Price</th>
                    <th>Barcode</th>
                </tr>
            </thead>
            <tbody>
    `;

    products.forEach(product => {
        const sellerCode = product.SellerCode || '';
        const image = product.대표이미지 || '';
        const shopURL = product.ShopURL || '';
        const optionDatas = product.OptionDatas || {};

        // Option Name을 오름차순으로 정렬
        const sortedOptionNames = Object.keys(optionDatas).sort((a, b) => a.localeCompare(b));

        const productInfoRow = `
            <tr>
                <td rowspan="${sortedOptionNames.length}">${sellerCode}</td>
                <td rowspan="${sortedOptionNames.length}"><img src="${image}" alt="대표이미지" width="100"></td>
                <td rowspan="${sortedOptionNames.length}"><a href="${shopURL}" target="_blank">${shopURL}</a></td>
        `;

        let optionRows = '';
        sortedOptionNames.forEach((optionName, index) => {
            const optionData = optionDatas[optionName];
            const counts = optionData.Counts || '';
            const price = optionData.Price || '';
            const barcode = optionData.바코드 || '';

            optionRows += `
                ${index === 0 ? productInfoRow : '<tr>'}
                    <td>${optionName}</td>
                    <td>${counts}</td>
                    <td>${price}</td>
                    <td>${barcode}</td>
                </tr>
            `;
        });

        tableHTML += optionRows;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    return tableHTML;
}
