document.addEventListener("DOMContentLoaded", function() {
    const uploadForm = document.getElementById("uploadForm");

    uploadForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const csvFile = document.getElementById("csvFile").files[0];
        if (!csvFile) {
            alert("CSV 파일을 선택해주세요.");
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            const text = e.target.result;
            const data = csvToArray(text);
            const messageDiv = document.getElementById("message");
            
            for (let product of data) {
                const sellerCode = product.SellerCode;
                const optionDatas = generateOptionDatas(product);
                product.OptionDatas = optionDatas;
                
                try {
                    const docRef = db.collection('Products').doc(sellerCode);
                    const docSnap = await docRef.get();

                    if (docSnap.exists) {
                        // 기존 문서 업데이트
                        await docRef.update(product);
                        messageDiv.innerHTML += `<p>${sellerCode} 업데이트 성공!</p>`;
                    } else {
                        // 새 문서 추가
                        await docRef.set(product);
                        messageDiv.innerHTML += `<p>${sellerCode} 추가 성공!</p>`;
                    }
                } catch (error) {
                    console.error("Error writing document: ", error);
                    messageDiv.innerHTML += `<p>${sellerCode} 처리 중 오류 발생: ${error.message}</p>`;
                }
            }
        };
        reader.readAsText(csvFile);
    });
});

// CSV 파일을 파싱하여 배열로 변환하는 함수
function csvToArray(str, delimiter = ",") {
    const headers = str.slice(0, str.indexOf("\n")).trim().split(delimiter);
    const rows = str.slice(str.indexOf("\n") + 1).trim().split("\n");

    return rows.filter(row => row.trim() !== "").map(function(row) {
        const values = parseCSVRow(row, delimiter);
        let obj = {};
        headers.forEach((header, index) => {
            obj[header.trim()] = values[index] ? values[index].trim() : "";
        });
        return obj;
    });
}

// CSV 행을 파싱하여 배열로 변환하는 함수
function parseCSVRow(row, delimiter) {
    const regex = new RegExp(`(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|([^\"${delimiter}\\n]*))(${delimiter}|\\n|$)`, "g");
    const result = [];
    let match = [];
    let lastIndex = 0;

    while ((match = regex.exec(row)) !== null) {
        const matchedValue = match[1] ? match[1].replace(/""/g, "\"") : match[2];
        result.push(matchedValue);
        lastIndex = regex.lastIndex;
        if (match[3] !== delimiter) {
            break;
        }
    }

    // 마지막으로 파싱되지 않은 부분 추가
    if (lastIndex < row.length) {
        result.push(row.slice(lastIndex).trim());
    }

    return result;
}

// 옵션 데이터를 생성하는 함수
function generateOptionDatas(product) {
    const optionNames = product.GroupOptions.split(",").map(opt => opt.trim());
    const optionCounts = product.OptionCounts.split(",").map(count => parseInt(count.trim()));
    const optionPrices = product.OptionPrices.split(",").map(price => parseInt(price.trim()));
    const discountedPrice = parseInt(product.DiscountedPrice);

    let optionDatas = {};

    optionNames.forEach((optionName, index) => {
        optionDatas[optionName] = {
            Counts: optionCounts[index],
            Price: discountedPrice + optionPrices[index]
        };
    });

    return optionDatas;
}
