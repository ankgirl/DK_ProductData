// aGlobalMain.js


let allProductsSnapshot = null;
let allOrdersSnapshot = null;
let productMap = null;
let orderMap = null;

document.addEventListener("DOMContentLoaded", async function () {
    const db = firebase.firestore();
});

async function initializeMap(db, collectionName, snapshotVariableName) {
    const map = new Map();
    let allDocs = [];

    console.log(`${collectionName} 로딩 시작 (모드: ${snapshotVariableName === 'allProductsSnapshot' ? '병렬' : '단일'})`);

    try {
        if (snapshotVariableName === 'allProductsSnapshot') {
            /**
             * 1. 상품 스냅샷: 패턴 기반 병렬 로드 (5개 채널 동시 요청)
             */
            // const ranges = [
            //     { start: '0', end: '2999' },      // 2023..., 2024... 날짜형
            //     { start: '3', end: '9' },         // 30_..., 62_... 일반 숫자형
            //     { start: 'A', end: 'Z' },         // SET_... 대문자
            //     { start: 'a', end: 'z' },         // room... 소문자
            //     { start: '\uf8ff', end: null }    // 기타 예외 범위
            // ];

            const ranges = [
                // 1-99 및 숫자형 ID 세분화 (데이터 밀집 구역)
                { start: '1', end: '1\uf8ff' },    // 1, 10~19 등
                { start: '2', end: '2\uf8ff' },    // 2, 20~29 등 (2023... 날짜형도 여기서 잡힘)
                { start: '3', end: '3\uf8ff' },    // 3, 30~39 등
                { start: '4', end: '5\uf8ff' },    // 4~5로 시작하는 ID
                { start: '6', end: '9\uf8ff' },    // 6~9로 시작하는 ID
                
                // 나머지 범위
                { start: 'A', end: 'Z\uf8ff' },    // 영문 대문자
                { start: 'a', end: 'z\uf8ff' },    // 영문 소문자
                { start: '\uf8ff', end: null }     // 기타
            ];            

            const promises = ranges.map(range => {
                let q = db.collection(collectionName).orderBy('__name__');
                if (range.start) q = q.startAt(range.start);
                if (range.end) q = q.endAt(range.end);
                return q.get();
            });

            const snapshots = await Promise.all(promises);
            
            snapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    if (!map.has(doc.id)) {
                        map.set(doc.id, { id: doc.id, ...doc.data() });
                        allDocs.push(doc);
                    }
                });
            });

        } else {
            /**
             * 2. 기타 (주문 등): 단일 통째로 로드
             */
            const snapshot = await db.collection(collectionName).get();
            snapshot.forEach(doc => {
                map.set(doc.id, { id: doc.id, ...doc.data() });
                allDocs.push(doc);
            });
        }

        // 3. 전역 변수 저장 (기존 로직 유지)
        const mockSnapshot = { docs: allDocs, size: allDocs.length };
        if (snapshotVariableName === 'allProductsSnapshot') {
            window.allProductsSnapshot = mockSnapshot;
        } else if (snapshotVariableName === 'allOrdersSnapshot') {
            window.allOrdersSnapshot = mockSnapshot;
        }

        console.log(`${collectionName} 로드 완료: ${map.size}건`);
        return map;

    } catch (error) {
        console.error(`${collectionName} 로드 중 에러 발생:`, error);
        return map;
    }
}
/**
 * sellerCode를 기준으로 제품 데이터를 가져오는 함수
 * @param {string} sellerCode - 검색할 sellerCode 값
 * @returns {Object|null} - 해당 제품 데이터
 */
export async function getProductBySellerCode(sellerCode) {
    if (!productMap) {
        productMap = await reInitializeProductMap()
        productMap.get(sellerCode) || null;
    }
    return productMap.get(sellerCode) || null;
}

export function refineInputValue(input) {
    // 특수문자 ( ) * 제거    
    let refined = input.replace(/[()*]/g, "");
    
    // 한글 자모를 영어 키보드 대응 문자로 변환하는 매핑 테이블
    const koreanToEnglishMap = {
        'ㄱ': 'R', 'ㄲ': 'RR', 'ㄴ': 'S', 'ㄷ': 'E', 'ㄸ': 'EE', 'ㄹ': 'F', 'ㅁ': 'A', 'ㅂ': 'Q', 'ㅃ': 'QQ', 'ㅅ': 'T', 'ㅆ': 'TT', 'ㅇ': 'D', 'ㅈ': 'W', 'ㅉ': 'WW', 'ㅊ': 'C', 'ㅋ': 'Z', 'ㅌ': 'X', 'ㅍ': 'V', 'ㅎ': 'G',
        'ㅏ': 'K', 'ㅐ': 'O', 'ㅑ': 'I', 'ㅒ': 'OI', 'ㅓ': 'J', 'ㅔ': 'P', 'ㅕ': 'U', 'ㅖ': 'PU', 'ㅗ': 'H', 'ㅘ': 'HK', 'ㅙ': 'HO', 'ㅚ': 'HL', 'ㅛ': 'Y', 'ㅜ': 'N', 'ㅝ': 'NJ', 'ㅞ': 'NP', 'ㅟ': 'NL', 'ㅠ': 'B', 'ㅡ': 'M', 'ㅢ': 'ML', 'ㅣ': 'L',
        '가': 'RK', '나': 'SK', '다': 'EK', '라': 'FK', '마': 'AK', '바': 'QK', '사': 'TK', '아': 'DK', '자': 'WK', '차': 'CK', '카': 'ZK', '타': 'XK', '파': 'VK', '하': 'GK',
        '이': 'DL', '어': 'J', '리': 'DJFL', '느': 'SM'
    };
    
    // 한글 변환
    refined = refined.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, (match) => koreanToEnglishMap[match] || '');
    
    return refined;
}



export async function reInitializeProductMap() {
    productMap = await initializeMap(db, 'Products', 'allProductsSnapshot');
    if (!productMap) {
        console.error("productMap이 초기화되지 않았습니다.");
        return null;
    }
    else{
        console.log("reInitializeOrderMap", productMap);
    }

    return productMap;
}

export async function reInitializeOrderMap() {
    orderMap = await initializeMap(db, 'Orders', 'allOrdersSnapshot');
    console.log("reInitializeOrderMap", orderMap);
    return orderMap;
}

/**
 * orderNumber를 기준으로 주문 데이터를 가져오는 함수
 * @param {string} orderNumber - 검색할 orderNumber 값
 * @returns {Object|null} - 해당 주문 데이터
 */



export async function getOrderByOrderNumber(orderNumber) {
    if (!orderMap) {
        console.log("orderMap이 초기화되지 않았습니다.");
        orderMap = await initializeMap(db, 'Orders', 'allOrdersSnapshot');
        console.log("Order map 초기화 완료");
        console.log(orderMap);
        return orderMap.get(orderNumber) || null;
    }

    return orderMap.get(orderNumber) || null;
}

export async function getAllOrders() {
    if (!orderMap) {
        console.log("orderMap이 초기화되지 않았습니다.");
        orderMap = await initializeMap(db, 'Orders', 'allOrdersSnapshot');
        console.log("Order map 초기화 완료");
        console.log(orderMap);
        return orderMap;
    }

    return orderMap;  
}

export async function getOrderNumberByDeliveryNumber(deliveryNumber) {
    if (!orderMap) {
        console.log("orderMap이 초기화되지 않았습니다.");
        orderMap = await initializeMap(db, 'Orders', 'allOrdersSnapshot');
        console.log("Order map 초기화 완료");
        console.log(orderMap);
        //return orderMap.get(orderNumber) || null;
    }

    var returnOrder;
    
    orderMap.forEach(order => {
        console.log(order);
        console.log(order.운송장번호);
        console.log(deliveryNumber);
        if (order.운송장번호 == deliveryNumber)
        {
            returnOrder = order;
        }
    });
    console.log(returnOrder);

    return returnOrder;
}

export function getOrderMap () {
    return orderMap;

}

export function updateOrderInfo(orderNumber, productOrderNumber, currentPackingQuantity) {
    var order = orderMap.get(orderNumber);
    const productOrderKeys = Object.keys(order.ProductOrders);
    let key;
    if (productOrderNumber instanceof HTMLElement) {
        key = productOrderNumber.textContent.trim(); // HTML 요소에서 텍스트 추출
    } else {
        key = String(productOrderNumber).trim(); // 일반 문자열 변환
    }
    const matchingKey = productOrderKeys.find(k => k === key);
    if (matchingKey) {
        order.ProductOrders[matchingKey].currentPackingQuantity = currentPackingQuantity;
        if (order.ProductOrders[matchingKey].currentPackingQuantity == order.ProductOrders[matchingKey].상품수량){
            order.ProductOrders[matchingKey].found = true;
        }
        else{
            order.ProductOrders[matchingKey].found = false;
        }
    } else {
    }
}
export function updateOrderProductService (orderNumber, productService) {
    console.warn("updateOrderProductService")
    console.log("orderNumber", orderNumber);
    console.log("orderNumber", productService);
    var order = orderMap.get(orderNumber);
    order.productService = productService;
    console.log(order.productService)
}

/**
 * 바코드를 기준으로 제품 데이터를 검색하는 함수
 * @param {string} barcode - 검색할 바코드 값
 * @returns {Object|null} - 해당 바코드를 가진 제품 데이터 (옵션 포함)
 */
export async function getProductByBarcode(barcode) {
    
    if (!productMap) {
        productMap = await reInitializeProductMap()
    }

    // Map을 순회하며 바코드 확인
    for (let [id, data] of productMap.entries()) {
        // 제품의 바코드 확인
        if (data.Barcode === barcode) {
            return { id, ...data, matchedOption: null };
        }

        // 각 옵션의 바코드 확인
        if (data.OptionDatas) {
            for (let option in data.OptionDatas) {
                if (data.OptionDatas[option].바코드 === barcode) {
                    console.warn(`바코드 ${barcode}`);
                    return { id, ...data, matchedOption: option, GroupOptions: data.GroupOptions };
                }
            }
        }
    }

    console.warn(`바코드 ${barcode}에 해당하는 제품을 찾을 수 없습니다.`);
    return null;
}

