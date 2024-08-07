document.addEventListener("DOMContentLoaded", function() {
    const uploadForm = document.getElementById("uploadForm");
    const saveButton = document.getElementById("saveButton");
    const loadingDiv = document.getElementById("loading");

    console.log("DOMContentLoaded 이벤트 발생");
    console.log("uploadForm:", uploadForm);
    console.log("saveButton:", saveButton);
    console.log("loadingDiv:", loadingDiv);

    let mismatchList = [];
    let originalData = [];
    let fileName = '';

    uploadForm.addEventListener("submit", function(event) {
        event.preventDefault();
        console.log("폼 제출 이벤트 발생");

        const excelFile = document.getElementById("excelFile").files[0];
        if (!excelFile) {
            alert("Excel 파일을 선택해주세요.");
            return;
        }

        fileName = excelFile.name.split('.').slice(0, -1).join('.') + '_재고수정.xlsx';
        console.log("Excel 파일 선택됨:", excelFile);

        if (!loadingDiv) {
            console.error("loadingDiv 요소를 찾을 수 없음");
        } else {
            loadingDiv.style.display = "block"; // 로딩 표시 보이기
            console.log("로딩 표시 보이기");
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            console.log("FileReader onload 이벤트 발생");

            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

            console.log("Excel 데이터 읽기 완료:", jsonData);

            // jsonData 그대로 사용
            originalData = jsonData;

            // 첫 번째 행은 헤더
            processExcelData(jsonData.slice(1));
        };
        reader.readAsArrayBuffer(excelFile);
    });

    saveButton.addEventListener("click", function() {
        console.log("저장 버튼 클릭 이벤트 발생");
        updateExcelFile(mismatchList, originalData);
    });

    function processExcelData(data) {
        console.log("processExcelData 함수 호출");

        const db = firebase.firestore();

        // Excel 데이터 처리
        let promises = [];

        data.forEach((product, index) => {
            const sellerCode = product[1]; // 판매자상품코드
            if (!sellerCode) {
                return;
            }

            console.log(`판매자상품코드 ${sellerCode}에 대한 Firestore 조회`);

            const docRef = db.collection('Products').doc(sellerCode);
            promises.push(docRef.get().then((doc) => {
                if (!doc.exists) {
                    console.log(`Firestore에서 ${sellerCode}를 찾을 수 없음`);
                    return;
                }

                const options = product[10].split("\n"); // 옵션값
                const stockCounts = product[12].split("\n"); // 옵션 재고수량

                console.log(`옵션값: ${options}, 재고수량: ${stockCounts}`);

                options.forEach((option, idx) => {
                    try {
                        console.log(`현재 옵션: '${option}'`);
                        const dbOptionDatas = doc.data().OptionDatas;
                        console.log('Firestore 옵션 데이터:', dbOptionDatas);
                        const dbOptionData = dbOptionDatas[option.trim()]; // 옵션 키의 공백 제거

                        const excelCount = parseInt(stockCounts[idx], 10);
                        if (dbOptionData) {
                            console.log(`DB 옵션 데이터: ${JSON.stringify(dbOptionData)}, Excel 재고 수량: ${excelCount}`);
                            if (dbOptionData.Counts !== excelCount) {
                                mismatchList.push({
                                    index: index + 1, // 데이터가 헤더 이후부터 시작하므로 인덱스를 1부터 시작하게 합니다.
                                    sellerCode: sellerCode,
                                    option: option,
                                    dbCount: dbOptionData.Counts,
                                    excelCount: excelCount
                                });
                                console.log(`불일치 발견: ${sellerCode}, 옵션: ${option}, DB 재고수량: ${dbOptionData.Counts}, Excel 재고수량: ${excelCount}`);
                            }
                        } else {
                            console.log(`옵션 '${option}'에 대한 데이터가 Firestore에 없음`);
                        }
                    } catch (error) {
                        console.error(`옵션 데이터를 처리하는 중 오류 발생 (판매자상품코드: ${sellerCode}, 옵션: '${option}'):`, error);
                    }
                });

            }).catch((error) => {
                console.error(`Firestore 조회 중 오류 발생 (판매자상품코드: ${sellerCode}):`, error);
            }));
        });

        Promise.all(promises).then(() => {
            displayMismatchList();
            if (!loadingDiv) {
                console.error("loadingDiv 요소를 찾을 수 없음");
            } else {
                loadingDiv.style.display = "none"; // 로딩 표시 숨기기
                console.log("로딩 표시 숨기기");
            }
        });
    }

    function displayMismatchList() {
        console.log("displayMismatchList 함수 호출");

        const messageDiv = document.getElementById("message");
        messageDiv.innerHTML = ''; // 기존 내용을 비웁니다.

        const table = document.createElement("table");
        table.innerHTML = `
            <tr>
                <th>판매자상품코드</th>
                <th>옵션값</th>
                <th>DB 재고수량</th>
                <th>Excel 재고수량</th>
            </tr>
        `;

        let previousSellerCode = null;
        let rowSpan = 0; // 수정: 초기 rowSpan을 0으로 설정합니다.
        mismatchList.forEach((mismatch, index) => {
            const row = document.createElement("tr");

            if (previousSellerCode === mismatch.sellerCode) {
                row.innerHTML = `
                    <td></td> <!-- 수정: 빈 셀로 대체 -->
                    <td>${mismatch.option}</td>
                    <td>${mismatch.dbCount}</td>
                    <td>${mismatch.excelCount}</td>
                `;
                rowSpan++;
            } else {
                rowSpan = 1; // 수정: 새로운 판매자 상품 코드가 나타나면 rowSpan을 1로 초기화합니다.
                row.innerHTML = `
                    <td>${mismatch.sellerCode}</td>
                    <td>${mismatch.option}</td>
                    <td>${mismatch.dbCount}</td>
                    <td>${mismatch.excelCount}</td>
                `;
            }

            // 판매자 상품 코드 셀에 rowspan을 설정합니다.
            if (previousSellerCode !== mismatch.sellerCode && previousSellerCode !== null) {
                table.rows[table.rows.length - rowSpan].cells[0].rowSpan = rowSpan;
            }

            table.appendChild(row);
            previousSellerCode = mismatch.sellerCode;
        });

        // 마지막 판매자 상품 코드에 대해 rowspan을 설정합니다.
        if (previousSellerCode !== null) {
            table.rows[table.rows.length - rowSpan].cells[0].rowSpan = rowSpan;
        }

        messageDiv.appendChild(table);
        saveButton.style.display = "block"; // 저장 버튼 보이기
        console.log("불일치 리스트 표시 완료");
    }

    function updateExcelFile(mismatchList, originalData) {
        console.log("updateExcelFile 함수 호출");

        // 새로운 데이터 배열 생성
        const updatedData = [originalData[0]]; // 헤더 추가

        // SellerCode 기준으로 그룹화
        const sellerCodeMap = new Map();

        mismatchList.forEach((mismatch) => {
            if (!sellerCodeMap.has(mismatch.sellerCode)) {
                sellerCodeMap.set(mismatch.sellerCode, []);
            }
            sellerCodeMap.get(mismatch.sellerCode).push(mismatch);
        });

        // 각 SellerCode에 대해 한 번만 기록
        sellerCodeMap.forEach((mismatches, sellerCode) => {
            const mismatch = mismatches[0]; // 첫 번째 mismatch만 사용
            const product = [...originalData[mismatch.index]]; // 원본 데이터 복사
            const options = product[10].split("\n");
            const stockCounts = product[12].split("\n");

            options.forEach((option, idx) => {
                const dbOptionData = mismatches.find(m => m.option === option);
                if (dbOptionData) {
                    stockCounts[idx] = dbOptionData.dbCount; // DB 재고수량으로 업데이트
                }
            });

            product[12] = stockCounts.join("\n");
            updatedData.push(product);
        });

        // Excel 파일로 저장
        const worksheet = XLSX.utils.aoa_to_sheet(updatedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        XLSX.writeFile(workbook, fileName);

        

        console.log("Excel 파일 저장 완료");
    }
});
