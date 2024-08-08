

//search_from_database.js

export async function searchProductsBySmallCategory(smallCategoryInputValue) {
    const resultDiv = document.getElementById("result");
    try {
        // Firestore에서 모든 제품 문서를 가져옴
        const allDocsSnapshot = await firebase.firestore().collection('Products').get();
        let productsFound = [];

        allDocsSnapshot.forEach(doc => {
            const data = doc.data();
            let 소분류명 = data.소분류명 || "";

            // "차입고"를 제거한 나머지 부분
            let strippedCategory = 소분류명.replace("차입고", "").trim();

            // 소분류명이 없거나 빈 문자열인 제품을 찾음
            if (smallCategoryInputValue === "") {
                if (소분류명 === "") {
                    productsFound.push(data);
                }
            } else {
                // 정확한 일치를 확인
                if (strippedCategory === smallCategoryInputValue) {
                    productsFound.push(data);
                }
            }
        });

        // SellerCode 오름차순으로 정렬
        productsFound.sort((a, b) => a.SellerCode.localeCompare(b.SellerCode));

        // 로그로 제품 갯수 출력
        console.log(`Found ${productsFound.length} products.`);

        if (productsFound.length === 0) {
            resultDiv.innerHTML = "<p>No products found in this small category!</p>";
        }
        return productsFound;

    } catch (error) {
        console.error("Error getting documents:", error);
        resultDiv.innerHTML = "<p>Error getting document</p>";
    }
}