

async function sendInventoryUpdate(sellerCode, optionsData, setStock) {
    // 1. FastAPI 서버의 엔드포인트 URL 설정 (서버가 로컬에서 실행 중이라고 가정)
    const API_URL_single = 'http://127.0.0.1:8000/api/inventory/update-inventory';

    let counts = 0;

    if (setStock && setStock["옵션1"] && setStock["옵션1"].Counts) {
        counts = setStock["옵션1"].Counts;
    }

    const transformedOptions = transformOptionsData(optionsData);

    // 2. FastAPI 서버가 기대하는 JSON 데이터 구조 생성
    const requestPayload = {
        seller_code: sellerCode,
        options: transformedOptions,
        set_stock_quantity: counts // <-- 새 필드 추가
    };

    console.log("전송할 데이터:", requestPayload);
    console.log(JSON.stringify(requestPayload));
    

    try {
        // 3. fetch를 사용하여 POST 요청 전송
        const response = await fetch(API_URL_single, {
            method: 'POST', // HTTP 메서드: POST
            headers: {
                // 서버에 JSON 데이터를 보낸다고 명시
                'Content-Type': 'application/json',
                // CORS 문제 발생 시 추가적인 헤더가 필요할 수 있습니다.
            },
            // JavaScript 객체를 JSON 문자열로 변환하여 본문(Body)에 담아 전송
            body: JSON.stringify(requestPayload) 
        });

        // 4. 응답 확인 및 처리
        const result = await response.json();

        if (response.ok) {
            // HTTP 상태 코드가 200번대인 경우 (성공)
            console.log('재고 업데이트 성공 응답 수신:', result);
            alert(`성공: ${result.message} (상품 코드: ${result.seller_code})`);
            return result;
        } else {
            // HTTP 상태 코드가 4xx 또는 5xx인 경우 (실패)
            console.error('재고 업데이트 실패 응답 수신:', result);
            alert(`업데이트 실패: ${result.message}`);
            // 필요하다면 서버 오류 메시지를 사용자에게 표시
            throw new Error(result.message || "서버 응답 오류 발생");
        }
    } catch (error) {
        console.error('API 요청 중 치명적인 오류 발생:', error);
        alert(`요청 오류: 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.`);
        return null;
    }
}


function transformOptionsData(optionsObject) {
    console.log("--- [DEBUG: transformOptionsData] 시작 ---");
    console.log("1. 입력 원본 객체 (optionsObject):", optionsObject);

    if (!optionsObject || typeof optionsObject !== 'object') {
        console.log("-> 입력이 유효하지 않음 (null 또는 객체가 아님). 빈 배열 반환.");
        console.log("--- [DEBUG: transformOptionsData] 종료 ---");
        return [];
    }

    const optionKeys = Object.keys(optionsObject);
    console.log("2. 추출된 옵션 키 (optionName 목록):", optionKeys);

    const mappedOptions = optionKeys.map(optionName => {
        const optionDetails = optionsObject[optionName];
        
        console.log(`3. 현재 처리 중인 옵션: '${optionName}'`);
        console.log("   -> 옵션 상세 정보:", optionDetails);

        // optionDetails.Counts 값이 존재하고 null이 아닌 경우에만 parseInt를 시도합니다.
        const stockCount = (optionDetails.Counts !== undefined && optionDetails.Counts !== null) 
                            ? parseInt(optionDetails.Counts) 
                            : 0;

        console.log(`4. 'Counts' 값 처리 결과 (stockCount): ${stockCount} (원본: ${optionDetails.Counts})`);

        const result = {
            option_code: optionName, // "애니메이션 팬텀"이 option_code가 됨
            stock_quantity: stockCount // Counts 필드를 stock_quantity로 사용
        };
        console.log("5. Pydantic 형식으로 변환된 객체:", result);
        return result;
    });

    console.log("6. 맵핑 완료된 옵션 배열 (필터링 전):", mappedOptions);
    
    const finalFilteredArray = mappedOptions.filter(option => {
        const isValid = !isNaN(option.stock_quantity);
        if (!isValid) {
            console.warn(`7. [경고] 재고 수량(stock_quantity: ${option.stock_quantity})이 숫자가 아니어서 제외됨.`);
        }
        return isValid;
    });
    
    console.log("8. 최종 필터링된 옵션 배열:", finalFilteredArray);
    console.log("--- [DEBUG: transformOptionsData] 종료 ---");

    return finalFilteredArray;

}
// --- 사용 예시 ---

// 1. 업데이트할 옵션 데이터 준비
const sampleOptions = [
    { option_code: "구름을 품은 하얀 새", stock_quantity: 3 },
    { option_code: "추억 속 작은 것", stock_quantity: 3 },
    { option_code: "오후 라운드 테이블", stock_quantity: 3 }
];

// 2. 전체 재고 수량 (예시)
const sampleTotalStock = 9;

// 3. 함수 호출 (세 번째 인수로 totalStock 추가)
// sendInventoryUpdate("58_0101", sampleOptions, sampleTotalStock); // 실제 실행 시 주석 해제

console.log("함수가 정의되었습니다. 실제로 실행하려면 sendInventoryUpdate(...)를 호출하세요.");