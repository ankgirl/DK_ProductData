let allProductsSnapshot = null;
let allOrdersSnapshot = null;
let productMap = null;

document.addEventListener("DOMContentLoaded", async function () {

    console.log("order_processing_main loaded");
    const batch = firebase.firestore().batch();
    console.log("batch 생성.");
    const db = firebase.firestore();    
    allProductsSnapshot = await db.collection('Products').get();
    initializeProductMap();
    console.log("allProductsSnapshot 생성");
    allOrdersSnapshot = await db.collection('Orders').get();
    console.log("allOrdersSnapshot 생성");
    // const sellerCode = "30_0101"; // 검색할 sellerCode
    // const product = getProductBySellerCode(sellerCode);
    // console.log("30_0101 검색결과:", product);
});

function initializeProductMap() {
    if (!allProductsSnapshot) {
        console.error("allProductsSnapshot이 아직 생성되지 않았습니다.");
        return;
    }

    productMap = new Map();
    allProductsSnapshot.forEach(doc => {
        productMap.set(doc.id, {
            id: doc.id, // 문서 ID 포함
            ...doc.data()
        });
    });

    console.log("Product map 초기화 완료");
}

export function getProductBySellerCode(sellerCode) {
    if (!productMap) {
        console.error("productMap이 초기화되지 않았습니다.");
        return null;
    }

    return productMap.get(sellerCode) || null;
}