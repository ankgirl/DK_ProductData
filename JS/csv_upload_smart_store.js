document.addEventListener("DOMContentLoaded", function() {
    const uploadForm = document.getElementById("uploadForm");

    uploadForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const csvFile = document.getElementById("csvFile").files[0];
        if (!csvFile) {
            alert("CSV 파일을 선택해주세요.");
            return;
        }

        const storePrefix = "https://smartstore.naver.com/secretgarden1000/products/";

        Papa.parse(csvFile, {
            header: true,
            skipEmptyLines: true,
            complete: async function(results) {
                const data = results.data;
                const messageDiv = document.getElementById("message");
                
                for (let product of data) {
                    const sellerCode = product["판매자상품코드"];
                    const productNumber = product["상품번호(스마트스토어)"];
                    const storeKeywordName = product["상품명"];
                    
                    if (!sellerCode || !productNumber || !storeKeywordName) {
                        messageDiv.innerHTML += `<p>상품번호, 판매자상품코드 또는 상품명이 누락된 항목이 있습니다. 건너뜁니다.</p>`;
                        continue;
                    }

                    const smartStoreURL = storePrefix + productNumber;

                    const productData = {
                        SellerCode: sellerCode,
                        ProductNumber: productNumber,
                        SmartStoreURL: smartStoreURL,
                        스토어키워드네임: storeKeywordName
                    };
                    
                    try {
                        const docRef = db.collection('Products').doc(sellerCode);
                        const docSnap = await docRef.get();

                        if (docSnap.exists) {
                            // 기존 문서 업데이트
                            await docRef.update(productData);
                            messageDiv.innerHTML += `<p>${sellerCode} 업데이트 성공!</p>`;
                        } else {
                            // 새 문서 추가
                            await docRef.set(productData);
                            messageDiv.innerHTML += `<p>${sellerCode} 추가 성공!</p>`;
                        }
                    } catch (error) {
                        console.error("Error writing document: ", error);
                        messageDiv.innerHTML += `<p>${sellerCode} 처리 중 오류 발생: ${error.message}</p>`;
                    }
                }
            },
            error: function(error) {
                console.error("Error parsing CSV: ", error);
                messageDiv.innerHTML = `<p>CSV 파싱 중 오류 발생: ${error.message}</p>`;
            }
        });
    });
});
