/**
 * 웹앱에서 수집한 옵션 객체 데이터를 FastAPI 모델(List[OptionStock])에 맞는 배열로 변환합니다.
 * @param {Object} optionsObject - { "옵션 이름": { Counts: 0, ... } } 형태의 원본 데이터 객체
 * @returns {Array<Object>} - [ { option_code: "옵션 이름", stock_quantity: 0 }, ... ] 형태의 배열
 */
function transformOptionsData(optionsObject) {
    if (!optionsObject || typeof optionsObject !== 'object') {
        console.warn("Input is invalid (not an object). Returning empty array.");
        return [];
    }

    // Object.keys()를 사용하여 옵션 코드를 추출하고 순회하며 배열로 변환
    const mappedOptions = Object.keys(optionsObject).map(optionName => {
        const optionDetails = optionsObject[optionName];
        
        // stock_quantity는 Counts 필드의 정수 값이어야 합니다.
        const stockCount = (optionDetails.Counts !== undefined && optionDetails.Counts !== null) 
                            ? parseInt(optionDetails.Counts) 
                            : 0;

        return {
            option_code: optionName, // '옵션 이름'이 option_code가 됨
            stock_quantity: stockCount // Counts 필드를 stock_quantity로 사용
        };
    });
    
    // 유효하지 않은 재고 수량(NaN)이 발생하지 않도록 필터링
    return mappedOptions.filter(option => !isNaN(option.stock_quantity));
}

/**
 * 여러 상품의 재고 정보를 FastAPI 서버의 배치 엔드포인트로 전송합니다.
 * @param {Array<Object>} rawBatchData - seller_code, options 등의 원본 데이터 리스트
 */
export async function sendBatchInventoryUpdate(rawBatchData) {
    // 1. FastAPI 서버의 엔드포인트 URL 설정 (라우터 접두사 '/api/inventory' 및 배치 엔드포인트)
    const API_URL = 'http://127.0.0.1:8000/api/inventory/batch-update-inventory';

    // 2. 배치 데이터 변환: FastAPI Pydantic 모델(List[InventoryUpdate])에 맞게 가공
    const transformedPayload = rawBatchData.map(item => {
        // 옵션 객체를 List[OptionStock] 배열로 변환
        const optionsArray = transformOptionsData(item.options);

        // set_stock_quantity (전체 재고) 계산 로직 변경: 
        // options 객체 내의 '옵션1'.Counts 값을 전체 재고로 사용합니다.
        let totalStockFromInput = 0;
        const option1Data = item.options["옵션1"]; // item.options는 setStock 역할을 수행

        if (option1Data && option1Data.Counts !== undefined && option1Data.Counts !== null) {
            totalStockFromInput = parseInt(option1Data.Counts);
            console.log(`[DEBUG] ${item.seller_code}: '옵션1' Counts(${option1Data.Counts})를 전체 재고로 사용.`);
        } else {
             console.warn(`[WARN] ${item.seller_code}: '옵션1' Counts 값을 찾을 수 없어 0으로 설정.`);
        }


        return {
            seller_code: item.seller_code,
            options: optionsArray,      // List[OptionStock] 배열
            set_stock_quantity: totalStockFromInput // '옵션1'.Counts 값 (단순 숫자)
        };
    });

    console.log("--- 전송할 배치 데이터 준비 완료 ---");
    console.log("변환된 최종 Payload (List[InventoryUpdate]):", transformedPayload);
    console.log("JSON 본문:", JSON.stringify(transformedPayload));

    try {
        // 3. fetch를 사용하여 POST 요청 전송
        const response = await fetch(API_URL, {
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json',
            },
            // JavaScript 객체 배열을 JSON 문자열로 변환하여 본문(Body)에 담아 전송
            body: JSON.stringify(transformedPayload) 
        });

        // 4. 응답 확인 및 처리
        const result = await response.json();

        if (response.ok) {
            console.log('✅ 배치 업데이트 성공 응답 수신:', result);
            console.log(`[성공] ${result.message}`);
            return result;
        } else {
            console.error('❌ 배치 업데이트 실패 응답 수신:', result);
            
            // 422 오류 시 상세 오류 메시지 출력 (디버깅 필수)
            if (response.status === 422 && result.detail) {
                console.error("FastAPI 유효성 검사 오류 (422):", result.detail);
                throw new Error("422 Unprocessable Content: 데이터 형식을 서버 요구사항에 맞게 수정해야 합니다.");
            }
            
            console.error(`[실패] 업데이트 실패: ${result.message}`);
            throw new Error(result.message || "Server response error occurred.");
        }
    } catch (error) {
        console.error('API 요청 중 치명적인 오류 발생:', error);
        console.error(`[요청 오류] Could not connect to the server. Check if the server is running.`);
        return null;
    }
}

// --- 배치 전송을 위한 샘플 원본 데이터 ---
// '옵션1' 키를 추가하여 전체 재고 값을 추출할 수 있도록 수정했습니다.
const sampleRawBatchData = [
    {
        seller_code: "59_0101",
        options: {
            // 이 옵션의 Counts(20)이 set_stock_quantity로 사용됩니다.
            "옵션1": { "Counts": 20, "Price": 1000 }, 
            "추억 속 작은 것": { "Counts": 5, "Price": 1500 }
        }
    },
    {
        seller_code: "59_0102",
        options: {
            "오후 라운드 테이블": { "Counts": 10, "Price": 99000 },
            "소금 자국": { "Counts": 20, "Price": 12000 }
            // '옵션1' 키가 없으므로 set_stock_quantity는 0이 됩니다.
        }
    }
];


// --- 함수 실행 (테스트하려면 아래 주석을 제거하세요) ---
// sendBatchInventoryUpdate(sampleRawBatchData);

console.warn("-----------------------------------------");
console.warn("배치 업데이트 함수가 정의되었습니다. sendBatchInventoryUpdate(...)를 호출하세요.");
console.warn("set_stock_quantity는 이제 각 상품의 'options[\"옵션1\"].Counts' 값으로 설정됩니다.");
console.warn("-----------------------------------------");

export function generateBatchContent(payloadList, productUpdatesMap) {    

    console.warn(`[DEBUG: generateBatchContent] 배치 내용 생성 시작...`, productUpdatesMap);
    
    let counts = 0;           // <-- 없는 경우 대비 초기화

    for (const index of Object.keys(productUpdatesMap)) {
        
        const sellerCode = productUpdatesMap[index].id;
        const optionDatas = productUpdatesMap[index]?.data?.OptionDatas ?? [];
        const setStock = optionDatas;
        const transformedOptions = transformOptionsData(optionDatas);

        if (setStock && setStock["옵션1"] && setStock["옵션1"].Counts) {
            counts = setStock["옵션1"].Counts;
        }

        
        console.warn(`[DEBUG] sellerCode`, sellerCode);
        console.warn(`[DEBUG] optionDatas`, optionDatas);
        console.warn(`[DEBUG] transformedOptions`, transformedOptions);
        console.warn(`[DEBUG] setStock`, counts);

        const requestPayload = {
            seller_code: index,
            options: transformedOptions,
            set_stock_quantity: counts 
        };

        payloadList.push(requestPayload);   // <-- 리스트에 추가

        console.warn(`[DEBUG] Payload 생성됨`, requestPayload);
    }

    return payloadList;   // <-- 리스트 반환
}
