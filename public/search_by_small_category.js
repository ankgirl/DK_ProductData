import { searchProductsBySmallCategory } from './search_from_database.js';

document.addEventListener("DOMContentLoaded", function () {

    const searchForm = document.getElementById("searchForm");

    // <input> 요소에 포커스 설정
    const smallCategoryInput = document.getElementById("smallCategory");
    smallCategoryInput.focus();

    searchForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const smallCategoryInputValue = smallCategoryInput.value.trim();

        let productsFound = [];
        productsFound = await searchProductsBySmallCategory(smallCategoryInputValue);


        if (null!= productsFound) {
            // 각 제품의 정보를 테이블 형식으로 표시
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = generateTableHTML(productsFound);
            setupDownloadButton(productsFound, smallCategoryInputValue);
        }
        smallCategoryInput.value = '';

    });
});

function generateTableHTML(products) {
    let tableHTML = `
        <table class="styled-table">
            <thead>
                <tr>
                    <th>SellerCode</th>
                    <th>Image</th>
                    <th>스토어키워드네임</th>
                    <th>ShopURL</th>
                    <th>SmartStoreURL</th>
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
        const image = product.Cafe24URL || '';
        const shopURL = product.ShopURL || '';
        const smartStoreURL = product.SmartStoreURL || '';
        const storeKeywordName = product.스토어키워드네임 || '';
        const optionDatas = product.OptionDatas || {};

        // Option Name을 오름차순으로 정렬
        const sortedOptionNames = Object.keys(optionDatas).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        if (sortedOptionNames.length === 0) {
            tableHTML += `
                <tr>
                    <td class="option-width" data-label="SellerCode"><a href="search_by_seller_code.html?sellerCode=${sellerCode}" target="_blank">${sellerCode}</a></td>
                    <td class="option-width" data-label="Image"><img src="${image}" alt="대표이미지" width="100"></td>
                    <td class="store-keyword-width" data-label="스토어키워드네임">${storeKeywordName}</td>
                    <td class="url-width" data-label="ShopURL"><a href="${shopURL}" target="_blank">${shopURL}</a></td>
                    <td class="url-width" data-label="SmartStoreURL"><a href="${smartStoreURL}" target="_blank">${smartStoreURL}</a></td>
                    <td colspan="4" class="no-options">No Option Data</td>
                </tr>                
            `;
        } else {
            const productInfoRow = `
                <tr>
                    <td rowspan="${sortedOptionNames.length}" class="option-width" data-label="SellerCode"><a href="search_by_seller_code.html?sellerCode=${sellerCode}" target="_blank">${sellerCode}</a></td>
                    <td rowspan="${sortedOptionNames.length}" class="option-width" data-label="Image"><img src="${image}" alt="대표이미지" width="100"></td>
                    <td rowspan="${sortedOptionNames.length}" class="store-keyword-width" data-label="스토어키워드네임">${storeKeywordName}</td>
                    <td rowspan="${sortedOptionNames.length}" class="url-width" data-label="ShopURL"><a href="${shopURL}" target="_blank">${shopURL}</a></td>
                    <td rowspan="${sortedOptionNames.length}" class="url-width" data-label="SmartStoreURL"><a href="${smartStoreURL}" target="_blank">${smartStoreURL}</a></td>
            `;

            let optionRows = '';
            sortedOptionNames.forEach((optionName, index) => {
                const optionData = optionDatas[optionName];
                const counts = optionData.Counts || '';
                const price = optionData.Price || '';
                const barcode = optionData.바코드 || '';

                optionRows += `
                     ${index === 0 ? productInfoRow : '<tr>'}
                        <td class="option-width" data-label="Option Name">${optionName}</td>
                        <td class="option-width" data-label="Counts">${counts}</td>
                        <td class="option-width" data-label="Price">${price}</td>
                        <td class="option-width" data-label="Barcode">${barcode}</td>
                    </tr>
                `;
            });

            tableHTML += optionRows;
        }
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    return tableHTML;
}

function setupDownloadButton(products, smallCategoryInput) {
    const downloadButton = document.getElementById("downloadExcel");

    downloadButton.addEventListener("click", function () {
        const worksheetData = products.map(product => {
            return {
                SellerCode: product.SellerCode || '',
                스토어키워드네임: product.스토어키워드네임 || '',
                SmartStoreURL: product.SmartStoreURL || ''
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

        const fileName = `${smallCategoryInput}_창고용정보.xlsx`;
        XLSX.writeFile(workbook, fileName);
    });
}