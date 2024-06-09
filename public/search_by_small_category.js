document.addEventListener("DOMContentLoaded", function () {
    const searchForm = document.getElementById("searchForm");

    searchForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const smallCategoryInput = document.getElementById("smallCategory").value;
        const smallCategory = smallCategoryInput === "-1" ? null : smallCategoryInput + "차입고";
        const resultDiv = document.getElementById("result");

        try {
            // 현재 사용자 확인
            const user = firebase.auth().currentUser;
            if (user) {
                console.log("Authenticated user UID:", user.uid);
            } else {
                console.error("No user authenticated");
                resultDiv.innerHTML = `
                    <p>로그인이 필요합니다.</p>
                    <button id="loginButton">로그인 페이지로 이동</button>
                `;

                // 로그인 버튼 클릭 이벤트 추가
                const loginButton = document.getElementById("loginButton");
                loginButton.addEventListener("click", function() {
                    window.location.href = "/login.html";
                });

                return;
            }


            // Firestore에서 모든 제품 문서를 가져옴
            const allDocsSnapshot = await db.collection('Products').get();
            let productsFound = [];

            allDocsSnapshot.forEach(doc => {
                const data = doc.data();
                // 소분류명이 없거나 빈 문자열인 제품을 찾음
                if (smallCategory === null) {
                    if (!data.소분류명 || data.소분류명 === "") {
                        productsFound.push(data);
                    }
                } else if (data.소분류명 && data.소분류명.includes(smallCategory)) {
                    productsFound.push(data);
                }
            });

            // SellerCode 오름차순으로 정렬
            productsFound.sort((a, b) => a.SellerCode.localeCompare(b.SellerCode));

            // 로그로 제품 갯수 출력
            console.log(`Found ${productsFound.length} products.`);

            if (productsFound.length === 0) {
                resultDiv.innerHTML = "<p>No products found in this small category!</p>";
            } else {
                // 각 제품의 정보를 테이블 형식으로 표시
                resultDiv.innerHTML = generateTableHTML(productsFound);
                setupDownloadButton(productsFound, smallCategoryInput);
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
        const sortedOptionNames = Object.keys(optionDatas).sort((a, b) => a.localeCompare(b));

        if (sortedOptionNames.length === 0) {
            tableHTML += `
                <tr>
                    <td class="fixed-width" data-label="SellerCode">${sellerCode}</td>
                    <td class="fixed-width" data-label="Image"><img src="${image}" alt="대표이미지" width="100"></td>
                    <td class="flexible-width" data-label="스토어키워드네임">${storeKeywordName}</td>
                    <td class="flexible-width" data-label="ShopURL"><a href="${shopURL}" target="_blank">${shopURL}</a></td>
                    <td class="flexible-width" data-label="SmartStoreURL"><a href="${smartStoreURL}" target="_blank">${smartStoreURL}</a></td>
                    <td colspan="4" class="no-options">No Option Data</td>
                </tr>
            `;
        } else {
            const productInfoRow = `
                <tr>
                    <td rowspan="${sortedOptionNames.length}" class="fixed-width" data-label="SellerCode">${sellerCode}</td>
                    <td rowspan="${sortedOptionNames.length}" class="fixed-width" data-label="Image"><img src="${image}" alt="대표이미지" width="100"></td>
                    <td rowspan="${sortedOptionNames.length}" class="flexible-width" data-label="스토어키워드네임">${storeKeywordName}</td>
                    <td rowspan="${sortedOptionNames.length}" class="flexible-width" data-label="ShopURL"><a href="${shopURL}" target="_blank">${shopURL}</a></td>
                    <td rowspan="${sortedOptionNames.length}" class="flexible-width" data-label="SmartStoreURL"><a href="${smartStoreURL}" target="_blank">${smartStoreURL}</a></td>
            `;

            let optionRows = '';
            sortedOptionNames.forEach((optionName, index) => {
                const optionData = optionDatas[optionName];
                const counts = optionData.Counts || '';
                const price = optionData.Price || '';
                const barcode = optionData.바코드 || '';

                optionRows += `
                    ${index === 0 ? productInfoRow : '<tr>'}
                        <td data-label="Option Name">${optionName}</td>
                        <td data-label="Counts">${counts}</td>
                        <td data-label="Price">${price}</td>
                        <td data-label="Barcode">${barcode}</td>
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
