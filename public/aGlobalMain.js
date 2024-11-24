// aGlobalMain.js

let allProductsSnapshot = null;
let allOrdersSnapshot = null;
let productMap = null;
let orderMap = null;

document.addEventListener("DOMContentLoaded", async function () {
    const db = firebase.firestore();
    
    // productMap = await initializeMap(db, 'Products', 'allProductsSnapshot');
    // console.log("Product map 초기화 완료");
    
    // orderMap = await initializeMap(db, 'Orders', 'allOrdersSnapshot');
    // console.log("Order map 초기화 완료");
});

/**
 * Firestore 데이터를 Map으로 초기화하는 공통 함수
 * @param {Object} db - Firestore 인스턴스
 * @param {string} collectionName - 초기화할 Firestore 컬렉션 이름
 * @param {string} snapshotVariableName - 전역 변수에 저장할 스냅샷 이름
 * @returns {Map} - 초기화된 Map 객체
 */
async function initializeMap(db, collectionName, snapshotVariableName) {
    const snapshot = await db.collection(collectionName).get();
    if (!snapshot) {
        console.error(`${snapshotVariableName}이 아직 생성되지 않았습니다.`);
        return null;
    }

    // 전역 변수에 스냅샷 저장
    if (snapshotVariableName === 'allProductsSnapshot') {
        allProductsSnapshot = snapshot;
    } else if (snapshotVariableName === 'allOrdersSnapshot') {
        allOrdersSnapshot = snapshot;
    }    
    console.log("allOrdersSnapshot", allOrdersSnapshot);
    const map = new Map();
    snapshot.forEach(doc => {
        map.set(doc.id, {
            id: doc.id, // 문서 ID 포함
            ...doc.data()
        });
    });

    console.log("map", map);
    return map;
}

/**
 * sellerCode를 기준으로 제품 데이터를 가져오는 함수
 * @param {string} sellerCode - 검색할 sellerCode 값
 * @returns {Object|null} - 해당 제품 데이터
 */
export async function getProductBySellerCode(sellerCode) {
    if (!productMap) {
        console.log("productMap이 초기화되지 않았습니다.");
        productMap = await initializeMap(db, 'Products', 'allProductsSnapshot');
        console.log("Product map 초기화 완료");        
        productMap.get(sellerCode) || null;
    }

    return productMap.get(sellerCode) || null;
}


export async function reInitializeProductMap() {
    productMap = await initializeMap(db, 'Products', 'allProductsSnapshot');
    console.log("reInitializeOrderMap", productMap);
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
        productMap = await initializeMap(db, 'Products', 'allProductsSnapshot');
        if (!productMap) {
            console.error("productMap이 초기화되지 않았습니다.");
            return null;
        }
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
                    return { id, ...data, matchedOption: option };
                }
            }
        }
    }

    console.warn(`바코드 ${barcode}에 해당하는 제품을 찾을 수 없습니다.`);
    return null;
}
