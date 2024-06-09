document.addEventListener("DOMContentLoaded", function() {
    const uploadForm = document.getElementById("uploadForm");

    uploadForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const csvFile = document.getElementById("csvFile").files[0];
        if (!csvFile) {
            alert("CSV 파일을 선택해주세요.");
            return;
        }

        Papa.parse(csvFile, {
            header: true,
            skipEmptyLines: true,
            complete: async function(results) {
                const data = results.data;
                const messageDiv = document.getElementById("message");
                
                for (let product of data) {
                    const sellerCode = product.SellerCode;
                    
                    try {
                        const docRef = db.collection('Products').doc(sellerCode);
                        const docSnap = await docRef.get();

                        if (docSnap.exists) {
                            // 기존 데이터 가져오기
                            const existingData = docSnap.data();
                            // OptionDatas 생성 및 기존 데이터 유지
                            const optionDatas = existingData.OptionDatas || {};
                            const newOptionDatas = generateOptionDatas(product, optionDatas);
                            product.OptionDatas = newOptionDatas;
                            // 기존 데이터에 새로운 데이터 병합
                            const updatedData = { ...existingData, ...product };
                            // 기존 문서 업데이트
                            await docRef.update(updatedData);
                            messageDiv.innerHTML += `<p>${sellerCode} 업데이트 성공!</p>`;
                        } else {
                            // OptionDatas 생성
                            const optionDatas = generateOptionDatas(product, {});
                            product.OptionDatas = optionDatas;
                            // 새 문서 추가
                            await docRef.set(product);
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

// 옵션 데이터를 생성하는 함수
function generateOptionDatas(product, existingOptionDatas) {
    const optionNames = product.GroupOptions ? product.GroupOptions.split(",").map(opt => opt.trim()) : [];
    const optionCounts = product.OptionCounts ? product.OptionCounts.split(",").map(count => parseInt(count.trim())) : [];
    const optionPrices = product.OptionPrices ? product.OptionPrices.split(",").map(price => parseInt(price.trim())) : [];
    const discountedPrice = product.DiscountedPrice ? parseInt(product.DiscountedPrice) : 0;

    let optionDatas = { ...existingOptionDatas };

    optionNames.forEach((optionName, index) => {
        if (!optionDatas[optionName]) {
            optionDatas[optionName] = {};
        }
        optionDatas[optionName].Counts = optionCounts[index] !== undefined ? optionCounts[index] : optionDatas[optionName].Counts;
        optionDatas[optionName].Price = discountedPrice + (optionPrices[index] !== undefined ? optionPrices[index] : 0);
    });

    return optionDatas;
}
