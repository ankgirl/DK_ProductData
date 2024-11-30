function generateProductDetailsHTML(data) {
    return `
        <p><strong>SellerCode:</strong> ${data.SellerCode || ''}</p>
        <p><strong>입고차수:</strong> ${data.소분류명 || ''}</p>        
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
                        <th>옵션이미지</th>
                        <th>실제이미지</th>
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
                ${(data.OptionDatas ? Object.entries(data.OptionDatas).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([optionName, optionValues], index, array) => {
                    return `
                        <tr>
                            <td>${optionName}</td>
                            <td class="image-container"><img src="${optionValues.옵션이미지URL}" alt="옵션이미지"></td>
                            <td class="image-container"><img src="${optionValues.실제이미지URL}" alt="실제이미지"></td>
                            <td>${optionValues.Price || ''}</td>
                            <td id="${optionName}_Counts">${optionValues.Counts || ''}</td>
                            <td><input type="number" name="${optionName}_newCount" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_newCount" class="input-field"></td>
                            <td><input type="number" name="${optionName}_increaseCount" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_increaseCount" class="input-field"></td>
                            <td><input type="number" name="${optionName}_decreaseCount" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_decreaseCount" class="input-field"></td>
                            <td id="${optionName}_바코드">${optionValues.바코드 || ''}</td>
                            <td><input type="text" name="${optionName}_newBarcode" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_newBarcode" class="input-field"></td>
                            <td><button type="button" class="clear-barcode" data-option="${optionName}">지우기</button></td>
                        </tr>
                    `;
                }).join('') : '')}
                
                </tbody>
            </table>
            <br><br><br><br><br><br><br><br><br><br>
            <button type="submit">적용</button>
            <br><br><br><br><br><br><br><br>
        </form>
        <h3>새 옵션 추가</h3>
        <form id="addOptionForm">
            <label>옵션 이름: <input type="text" id="newOptionName" required></label>
            <label>Price: <input type="number" id="newOptionPrice"></label>
            <label>Counts: <input type="number" id="newOptionCounts"></label>
            <label>바코드: <input type="text" id="newOptionBarcode"></label>
            <button id="buttonAddOption">옵션 추가</button>
        </form>
    `;
}

function displayProductData(data, container = document.getElementById("result")) {
    if (!data || !data.OptionDatas) {
        console.error("Invalid data:", data);
        return;
    }

    var index = 0;
    // Add option images URLs to data
    for (let optionName in data.OptionDatas) {
        index++;
        const option = optionName.replace("선택: ", "");
        if (option) {
            const { 옵션이미지URL, 실제이미지URL } = generateImageURLs(data.SellerCode, option, data.소분류명, data.GroupOptions);
            data.OptionDatas[optionName].옵션이미지URL = 옵션이미지URL;
            data.OptionDatas[optionName].실제이미지URL = 실제이미지URL;
        }
    }    
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

    document.getElementById('buttonAddOption').addEventListener('click', function (event) {
        saveNewOption(event); // 이벤트 객체 전달
    });

    document.querySelectorAll('#addOptionForm input').forEach(input => {
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // 기본 폼 제출 방지
                const formElements = Array.from(document.querySelectorAll('#addOptionForm input'));
                const currentIndex = formElements.indexOf(event.target);
                
                // 다음 입력 필드로 포커스 이동
                if (currentIndex < formElements.length - 1) {
                    formElements[currentIndex + 1].focus();
                }
            }
        });
    });

    async function saveNewOption(event) {
        event.preventDefault();
        const newOptionName = document.getElementById('newOptionName').value;
        const newOptionPrice = parseInt(document.getElementById('newOptionPrice').value, 10) || 0;
        const newOptionCounts = parseInt(document.getElementById('newOptionCounts').value, 10) || 0;
        const newOptionBarcode = document.getElementById('newOptionBarcode').value || "";
    
        if (data.OptionDatas[newOptionName]) {
            alert('이미 존재하는 옵션 이름입니다.');
            return;
        }
    
        const newOptionData = {
            Counts: newOptionCounts,
            Price: newOptionPrice,
            바코드: newOptionBarcode,
        };
    
        // 기존 데이터를 필터링하여 Counts, Price, 바코드만 유지
        const updatedOptionDatas = {};
        for (const [optionName, optionValue] of Object.entries(data.OptionDatas)) {
            updatedOptionDatas[optionName] = {
                Counts: optionValue.Counts,
                Price: optionValue.Price,
                바코드: optionValue.바코드,
            };
        }
    
        // 새로운 옵션 추가
        updatedOptionDatas[newOptionName] = newOptionData;
    
        try {
            // 비동기 데이터베이스 업데이트
            await db.collection('Products').doc(data.SellerCode).update({ OptionDatas: updatedOptionDatas });
    
            // 데이터 업데이트 후 UI 갱신
            displayProductData({ ...data, OptionDatas: updatedOptionDatas });
        } catch (error) {
            console.error('옵션 저장 중 오류 발생:', error);
            alert('옵션 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
    
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

                // OptionDatas가 존재하는지 확인 후 처리
                if (
                    data.Barcode === newBarcode ||
                    (data.OptionDatas && Object.values(data.OptionDatas).some(opt => opt.바코드 === newBarcode))
                ) {
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


function generateImageURLs(sellerCode, option, 입고차수, groupOptions) {
    if (!입고차수) {
        console.error("입고차수가 정의되지 않았습니다.");
        return { 옵션이미지URL: '', 실제이미지URL: '' };
    }

    const cleaned입고차수 = 입고차수.replace("차입고", "");
    let optionNumber = option.replace("옵션", "");
    const 입고차수정보 = parseInt(cleaned입고차수, 10);
    let 이미지명 = '';

    //console.warn(optionNumber);
    const optionNames = groupOptions ? groupOptions.split(",").map(opt => opt.trim()) : [];
    console.warn(optionNames);

    // optionNumber가 숫자인지 확인
    if (!isNaN(optionNumber)) {
        optionNumber = optionNumber.padStart(3, '0');
        if (입고차수정보 <= 23) {
            이미지명 = `${sellerCode}%20sku${optionNumber}.jpg`;
        } else {
            이미지명 = `${sellerCode}%20sku_${optionNumber}.jpg`;
        }
    } else {
        // optionNumber가 숫자가 아닐 경우, groupOptions에서 해당 옵션의 인덱스를 찾기
        const index = optionNames.indexOf(option);
        if (index === -1) {
            console.error(`옵션 '${option}'이 groupOptions에서 발견되지 않았습니다.`);
            return { 옵션이미지URL: '', 실제이미지URL: '' };
        }

        const optionIndex = (index + 1).toString().padStart(3, '0'); // 인덱스는 1부터 시작
        이미지명 = `${sellerCode}%20sku_${optionIndex}_[_${optionNumber}_].jpg`;
    }
    console.log(이미지명);

    const baseUrl = `https://dakkuharu.openhost.cafe24.com/1688/${cleaned입고차수}/${sellerCode}`;
    const 옵션이미지URL = `${baseUrl}/option/${이미지명}`;
    const 실제이미지URL = `${baseUrl}/real/${이미지명}`;

    return { 옵션이미지URL, 실제이미지URL };
}
