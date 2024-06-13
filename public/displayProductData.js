// displayProductData.js

function generateProductDetailsHTML(data) {
    return `
        <p><strong>SellerCode:</strong> ${data.SellerCode || ''}</p>
        <p><strong>대표이미지:</strong> <img src="${data.Cafe24URL || ''}" alt="대표이미지" width="100"></p>
        <p><strong>스토어링크:</strong> <a href="${data.스토어링크 || '#'}" target="_blank">${data.스토어링크 || ''}</a></p>
        <p><strong>SmartStoreURL:</strong> <a href="${data.SmartStoreURL || '#'}" target="_blank">${data.SmartStoreURL || ''}</a></p>
        <p><strong>ShopURL:</strong> <a href="${data.ShopURL || '#'}" target="_blank">${data.ShopURL || ''}</a></p>
        <p><strong>SellingPrice:</strong> ${data.DiscountedPrice || ''}</p>
        <p><strong>Option Datas:</strong></p>
        <form id="updateForm">
            <table>
                <thead>
                    <tr>
                        <th>옵션명</th>
                        <th>Price</th>
                        <th>Counts</th>
                        <th>새로운 Counts</th>
                        <th>재고 추가</th>
                        <th>재고 감소</th>
                        <th>바코드</th>
                        <th>새로운 바코드</th>
                        <th>바코드 지우기</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.OptionDatas ? Object.entries(data.OptionDatas).sort(([a], [b]) => a.localeCompare(b)).map(([optionName, optionValues], index, array) => `
                        <tr>
                            <td>${optionName}</td>
                            <td>${optionValues.Price || ''}</td>
                            <td id="${optionName}_Counts">${optionValues.Counts || ''}</td>
                            <td><input type="number" name="${optionName}_newCount" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_newCount" class="input-field"></td>
                            <td><input type="number" name="${optionName}_increaseCount" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_increaseCount" class="input-field"></td>
                            <td><input type="number" name="${optionName}_decreaseCount" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_decreaseCount" class="input-field"></td>
                            <td id="${optionName}_바코드">${optionValues.바코드 || ''}</td>
                            <td><input type="text" name="${optionName}_newBarcode" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_newBarcode" class="input-field"></td>
                            <td><button type="button" class="clear-barcode" data-option="${optionName}">지우기</button></td>
                        </tr>
                    `).join('') : '')}
                </tbody>
            </table>
            <button type="submit">적용</button>
        </form>
    `;
}

export function displayProductData(data, container = document.getElementById("result")) {
    container.innerHTML = generateProductDetailsHTML(data);

    document.getElementById('updateForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        const updatedOptionDatas = {};
        const formData = new FormData(event.target);
        let barcodeCheckNeeded = false;

        // 최신 데이터 가져오기
        const latestData = (await db.collection('Products').doc(data.SellerCode).get()).data().OptionDatas;

        for (let [key, value] of formData.entries()) {
            const [optionName, field] = key.split('_');
            if (value.trim() !== '') { // 입력된 값이 있을 때만 업데이트
                if (!updatedOptionDatas[optionName]) {
                    updatedOptionDatas[optionName] = { ...latestData[optionName] };
                }
                const currentCount = latestData[optionName].Counts;
                if (field === 'newCount') {
                    updatedOptionDatas[optionName]['Counts'] = parseInt(value, 10);
                    document.getElementById(`${optionName}_Counts`).textContent = value;
                    // 같은 줄의 재고 추가 및 재고 감소 입력란의 값 지우기
                    document.querySelector(`input[name="${optionName}_increaseCount"]`).value = '';
                    document.querySelector(`input[name="${optionName}_decreaseCount"]`).value = '';
                } else if (field === 'increaseCount') {
                    updatedOptionDatas[optionName]['Counts'] = currentCount + parseInt(value, 10);
                    document.getElementById(`${optionName}_Counts`).textContent = updatedOptionDatas[optionName]['Counts'];
                    // 같은 줄의 새로운 Counts 및 재고 감소 입력란의 값 지우기
                    document.querySelector(`input[name="${optionName}_newCount"]`).value = '';
                    document.querySelector(`input[name="${optionName}_decreaseCount"]`).value = '';
                } else if (field === 'decreaseCount') {
                    const newCount = currentCount - parseInt(value, 10);
                    if (newCount < 0) {
                        alert(`${optionName} 옵션의 재고가 마이너스가 됩니다 확인 후 다시 입력하세요.: ${newCount}`);
                    } else {
                        updatedOptionDatas[optionName]['Counts'] = newCount;
                        document.getElementById(`${optionName}_Counts`).textContent = updatedOptionDatas[optionName]['Counts'];
                        // 같은 줄의 새로운 Counts 및 재고 추가 입력란의 값 지우기
                        document.querySelector(`input[name="${optionName}_newCount"]`).value = '';
                        document.querySelector(`input[name="${optionName}_increaseCount"]`).value = '';
                    }
                } else if (field === 'newBarcode') {
                    updatedOptionDatas[optionName]['바코드'] = value;
                    const barcodeElement = document.getElementById(`${optionName}_바코드`);
                    if (barcodeElement) {
                        barcodeElement.textContent = value;
                    }
                    if (value.trim() !== '') {
                        barcodeCheckNeeded = true;
                    }
                }           
            }
        }

        if (barcodeCheckNeeded) {
            // 바코드 중복 확인
            const barcodeCheck = await checkBarcodeDuplicate(updatedOptionDatas);
            if (barcodeCheck.duplicate) {
                const userConfirmation = confirm(`중복된 바코드가 발견되었습니다: ${barcodeCheck.sellerCode}. 그래도 저장하시겠습니까?`);
                if (userConfirmation) {
                    await updateProductCountsAndBarcode(data.SellerCode, updatedOptionDatas);
                }
            } else {
                await updateProductCountsAndBarcode(data.SellerCode, updatedOptionDatas);
            }
        } else {
            await updateProductCountsAndBarcode(data.SellerCode, updatedOptionDatas);
        }
        
        // 폼의 입력 칸 초기화
        document.querySelectorAll('#updateForm input').forEach(input => {
            input.value = '';
        });
    });

    document.querySelectorAll('#updateForm input').forEach(input => {
        input.addEventListener('input', function () {
            const [optionName, field] = this.name.split('_');
            if (field === 'newCount') {
                document.querySelector(`input[name="${optionName}_increaseCount"]`).value = '';
                document.querySelector(`input[name="${optionName}_decreaseCount"]`).value = '';
            } else if (field === 'increaseCount') {
                document.querySelector(`input[name="${optionName}_newCount"]`).value = '';
                document.querySelector(`input[name="${optionName}_decreaseCount"]`).value = '';
            } else if (field === 'decreaseCount') {
                document.querySelector(`input[name="${optionName}_newCount"]`).value = '';
                document.querySelector(`input[name="${optionName}_increaseCount"]`).value = '';
            }
        });
        
        input.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                const nextInputName = this.dataset.next;
                const nextInput = document.querySelector(`input[name="${nextInputName}"]`);
                if (nextInput) {
                    nextInput.focus();
                }
            }
        });
    });

    document.querySelectorAll('.clear-barcode').forEach(button => {
        button.addEventListener('click', async function() {
            const optionName = this.dataset.option;
            await clearBarcode(data.SellerCode, optionName);
            document.getElementById(`${optionName}_바코드`).textContent = '';
        });
    });
}

async function clearBarcode(sellerCode, optionName) {
    try {
        const productDoc = await db.collection('Products').doc(sellerCode).get();
        const existingOptionDatas = productDoc.data().OptionDatas;
        existingOptionDatas[optionName]['바코드'] = '';

        await db.collection('Products').doc(sellerCode).update({ OptionDatas: existingOptionDatas });
    } catch (error) {
        console.error("Error clearing barcode:", error);
    }
}

async function checkBarcodeDuplicate(optionDatas) {
    let duplicate = false;
    let sellerCode = '';
    try {
        const allDocsSnapshot = await db.collection('Products').get();
        allDocsSnapshot.forEach(doc => {
            const data = doc.data();
            for (let option in optionDatas) {
                const newBarcode = optionDatas[option].바코드;
                if (data.Barcode === newBarcode || Object.values(data.OptionDatas).some(opt => opt.바코드 === newBarcode)) {
                    duplicate = true;
                    sellerCode = data.SellerCode;
                    break;
                }
            }
        });
    } catch (error) {
        console.error('Error checking barcode duplicates: ', error);
    }
    return { duplicate, sellerCode };
}

async function updateProductCountsAndBarcode(sellerCode, updatedOptionDatas) {
    const messageDiv = document.getElementById('message');
    try {
        const productDoc = await db.collection('Products').doc(sellerCode).get();
        const existingOptionDatas = productDoc.data().OptionDatas;

        for (let optionName in updatedOptionDatas) {
            existingOptionDatas[optionName] = { ...existingOptionDatas[optionName], ...updatedOptionDatas[optionName] };
        }

        await db.collection('Products').doc(sellerCode).update({ OptionDatas: existingOptionDatas });
        messageDiv.innerHTML = '<p>옵션 Counts와 바코드가 성공적으로 업데이트되었습니다.</p>';
    } catch (error) {
        console.error("Error updating document:", error);
        messageDiv.innerHTML = '<p>옵션 Counts와 바코드 업데이트 중 오류가 발생했습니다.</p>';
    }
}
