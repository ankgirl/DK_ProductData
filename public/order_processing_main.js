// order_processing_main.js

let allProductsSnapshot = null;
let allOrdersSnapshot = null;
let productMap = null;
let orderMap = null;

document.addEventListener("DOMContentLoaded", async function () {
    const db = firebase.firestore();
    
    productMap = await initializeMap(db, 'Products', 'allProductsSnapshot');
    console.log("Product map 초기화 완료");
    
    orderMap = await initializeMap(db, 'Orders', 'allOrdersSnapshot');
    console.log("Order map 초기화 완료");
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

    const map = new Map();
    snapshot.forEach(doc => {
        map.set(doc.id, {
            id: doc.id, // 문서 ID 포함
            ...doc.data()
        });
    });

    return map;
}

/**
 * sellerCode를 기준으로 제품 데이터를 가져오는 함수
 * @param {string} sellerCode - 검색할 sellerCode 값
 * @returns {Object|null} - 해당 제품 데이터
 */
export function getProductBySellerCode(sellerCode) {
    if (!productMap) {
        console.error("productMap이 초기화되지 않았습니다.");
        return null;
    }

    return productMap.get(sellerCode) || null;
}

/**
 * orderNumber를 기준으로 주문 데이터를 가져오는 함수
 * @param {string} orderNumber - 검색할 orderNumber 값
 * @returns {Object|null} - 해당 주문 데이터
 */
export function getOrderByOrderNumber(orderNumber) {
    if (!orderMap) {
        console.error("orderMap이 초기화되지 않았습니다.");
        return null;
    }

    return orderMap.get(orderNumber) || null;
}
