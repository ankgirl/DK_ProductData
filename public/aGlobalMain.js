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
                        map.set(doc.id, { ...doc.data(), id: doc.id });
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
                map.set(doc.id, { ...doc.data(), id: doc.id });
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

/**
 * 캐시 무효화 — 셀러코드 변경/삭제 후 호출. 다음 조회 시 Firestore에서 새로 로드한다.
 * (캐시가 옛/삭제된 id를 들고 있어 set으로 되살아나던 문제의 근본 차단의 일부)
 */
export function invalidateProductCache() {
    productMap = null;
    window.allProductsSnapshot = null;
}

// 스마트스토어 재고/코드 변경 FastAPI (Cloud Run)
const SMARTSTORE_API_BASE = 'https://fastapi-inventory-689177215560.asia-northeast3.run.app/api/inventory';

/**
 * 스마트스토어 판매자상품코드(sellerManagementCode)를 old → new 로 변경 (best-effort).
 * 항상 결과 객체를 반환하고 throw 하지 않는다(호출부가 결과를 보고 경고만 띄움).
 * @returns {Promise<{oldCode, newCode, status:'OK'|'NOT_FOUND'|'Error', message:string}>}
 */
export async function changeSmartStoreSellerCode(oldCode, newCode) {
    try {
        const res = await fetch(`${SMARTSTORE_API_BASE}/change-seller-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_seller_code: oldCode, new_seller_code: newCode }),
        });
        const data = await res.json().catch(() => ({}));
        return { oldCode, newCode, status: data.status || (res.ok ? 'OK' : 'Error'), message: data.message || '' };
    } catch (e) {
        return { oldCode, newCode, status: 'Error', message: e.message };
    }
}

// 스토어 변경 결과를 사람이 읽을 한 줄 요약으로 (alert 뒤에 붙임)
function summarizeStoreResults(results) {
    const fails = results.filter(r => r.status === 'Error');
    if (fails.length) {
        return '\n\n⚠️ 스마트스토어 판매자상품코드 변경 실패:\n'
            + fails.map(r => ` - ${r.oldCode} → ${r.newCode} (${r.message})`).join('\n')
            + '\n스토어 관리에서 직접 판매자상품코드를 변경하세요. (안 하면 CSV로 옛 코드가 다시 유입될 수 있음)';
    }
    if (results.every(r => r.status === 'NOT_FOUND')) return '\n(스마트스토어 미등록 상품 — 스토어 코드 변경 생략)';
    return '\n✅ 스마트스토어 판매자상품코드도 변경됨';
}

/**
 * 셀러코드(+입고차수) 변경을 원자적으로 수행 — 중복 등록의 근본 차단.
 *  - 새 코드가 이미 있으면 거부(다른 상품 덮어쓰기/중복 방지).
 *  - batch로 [새 코드 생성 + 옛 코드 삭제] (SET_ 포함)를 한 번에 커밋 → 중간 실패로 둘 다 남는 일이 없음.
 *  - 끝나면 캐시 무효화(옛 id가 캐시에 남아 되살아나는 것 방지).
 *  - in-memory 캐시가 아닌 Firestore 최신본을 읽어 옮긴다(stale 복사 방지).
 * @param {string} currentSellerCode 현재 코드
 * @param {string} newSellerCode 새 코드
 * @param {boolean} withCategory 입고차수(소분류명)도 함께 변경할지
 * @param {(product:object)=>object} [lockImageURLs] 변경 전 이미지 URL 고정 변환(선택)
 * @returns {Promise<{newCategory: string|null, oldCategory: string, hadSet: boolean}>}
 */
export async function changeSellerCodeAtomic(currentSellerCode, newSellerCode, withCategory, lockImageURLs) {
    if (!currentSellerCode) throw new Error('현재 판매자 코드가 없습니다. 다시 검색하세요.');
    if (!newSellerCode) throw new Error('변경할 판매자 코드가 비어 있습니다.');
    if (newSellerCode === currentSellerCode) throw new Error('새 코드가 현재 코드와 같습니다.');

    const col = db.collection('Products');
    const curSnap = await col.doc(currentSellerCode).get();
    if (!curSnap.exists) throw new Error(`현재 상품(${currentSellerCode})을 찾을 수 없습니다. 다시 검색하세요.`);

    // 새 코드 충돌 검사 — 이미 존재하면 덮어쓰지 않고 중단(중복/데이터손실 방지)
    const newSnap = await col.doc(newSellerCode).get();
    if (newSnap.exists) throw new Error(`새 코드 '${newSellerCode}' 가 이미 존재합니다. 덮어쓰기 방지를 위해 변경을 중단했습니다.`);

    let newCategory = null;
    if (withCategory) {
        const prefix = newSellerCode.split('_')[0];
        newCategory = /^\d+$/.test(prefix) ? `${prefix}차입고` : prefix;
    }

    const currentProduct = curSnap.data();
    const setSnap = await col.doc(`SET_${currentSellerCode}`).get();
    if (setSnap.exists) {
        const newSetSnap = await col.doc(`SET_${newSellerCode}`).get();
        if (newSetSnap.exists) throw new Error(`새 SET 코드 'SET_${newSellerCode}' 가 이미 존재합니다. 변경을 중단했습니다.`);
    }

    const batch = db.batch();
    const locked = lockImageURLs ? lockImageURLs(currentProduct) : currentProduct;
    batch.set(col.doc(newSellerCode), { ...locked, SellerCode: newSellerCode, ...(withCategory && { 소분류명: newCategory }) });
    batch.delete(col.doc(currentSellerCode));
    if (setSnap.exists) {
        const setProduct = setSnap.data();
        batch.set(col.doc(`SET_${newSellerCode}`), { ...setProduct, SellerCode: `SET_${newSellerCode}`, ...(withCategory && { 소분류명: newCategory }) });
        batch.delete(col.doc(`SET_${currentSellerCode}`));
    }
    await batch.commit();      // 원자적: 전부 성공 또는 전부 실패
    invalidateProductCache();

    // 스마트스토어 판매자상품코드도 변경(best-effort). Firestore는 이미 바뀌었으므로 실패해도 롤백하지 않되,
    // 실패는 반드시 알린다(스토어에 옛 코드가 남으면 CSV로 재유입되어 중복이 다시 생기므로).
    const storeResults = [await changeSmartStoreSellerCode(currentSellerCode, newSellerCode)];
    if (setSnap.exists) storeResults.push(await changeSmartStoreSellerCode(`SET_${currentSellerCode}`, `SET_${newSellerCode}`));
    const storeNote = summarizeStoreResults(storeResults);

    return { newCategory, oldCategory: currentProduct.소분류명, hadSet: setSnap.exists, storeNote, storeResults };
}

/**
 * "존재할 때만" Products 문서를 갱신. 문서가 없으면 절대 만들지 않는다(되살림 방지).
 * 삭제/이름변경된 옛 코드로 재고가 다시 살아나는 문제의 핵심 차단.
 * @returns {Promise<boolean>} 실제로 갱신했으면 true, 문서가 없어 건너뛰었으면 false.
 */
export async function updateProductIfExists(id, fields) {
    const ref = db.collection('Products').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
        console.warn(`[updateProductIfExists] '${id}' 없음 → 되살리지 않고 건너뜀 (이름변경/삭제된 코드일 수 있음)`);
        return false;
    }
    await ref.update(fields);
    // 캐시도 동기화 (있을 때만)
    if (productMap && productMap.has(id)) {
        productMap.set(id, { ...productMap.get(id), ...fields });
    }
    return true;
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

// --- 바코드 중복-셀러코드 이메일 알림 ---
const NOTIFY_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
let _notifyCfgCache;

async function getNotifyConfig() {
    if (_notifyCfgCache !== undefined) return _notifyCfgCache;
    try {
        const mod = await import('./notifyConfig.js');
        const cfg = mod.NOTIFY_CONFIG;
        _notifyCfgCache = (cfg && cfg.EMAILJS_SERVICE_ID && cfg.EMAILJS_TEMPLATE_ID && cfg.EMAILJS_PUBLIC_KEY) ? cfg : null;
    } catch {
        _notifyCfgCache = null;
    }
    return _notifyCfgCache;
}

async function notifyDuplicateBarcode(barcode, matches) {
    const cfg = await getNotifyConfig();
    if (!cfg) return;
    try {
        const key = `notify_dup_${barcode}`;
        const last = localStorage.getItem(key);
        if (last && Date.now() - Number(last) < NOTIFY_DEDUP_TTL_MS) return;
        localStorage.setItem(key, String(Date.now()));
    } catch {}
    const sellerList = matches.map(m => `${m.sellerCode}${m.option ? `[${m.option}]` : '(본품)'}`).join(' / ');
    try {
        await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: cfg.EMAILJS_SERVICE_ID,
                template_id: cfg.EMAILJS_TEMPLATE_ID,
                user_id: cfg.EMAILJS_PUBLIC_KEY,
                template_params: {
                    to_email: cfg.RECIPIENT_EMAIL,
                    barcode,
                    match_count: matches.length,
                    seller_codes: sellerList,
                    page_url: location.href,
                    timestamp: new Date().toLocaleString('ko-KR'),
                },
            }),
        });
    } catch (e) {
        console.warn('[notifyDuplicateBarcode] 발송 실패:', e);
    }
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

    const matches = [];
    for (let [id, data] of productMap.entries()) {
        if (data.Barcode === barcode) {
            matches.push({ id, sellerCode: data.SellerCode || id, data, option: null });
            continue;
        }
        if (data.OptionDatas) {
            for (let option in data.OptionDatas) {
                if (data.OptionDatas[option].바코드 === barcode) {
                    matches.push({ id, sellerCode: data.SellerCode || id, data, option });
                }
            }
        }
    }

    if (matches.length === 0) {
        console.warn(`바코드 ${barcode}에 해당하는 제품을 찾을 수 없습니다.`);
        return null;
    }

    const uniqueSellerCodes = new Set(matches.map(m => m.sellerCode));
    if (uniqueSellerCodes.size >= 2) {
        console.warn(`바코드 ${barcode} 다중 셀러코드 감지:`, [...uniqueSellerCodes]);
        notifyDuplicateBarcode(barcode, matches);
    }

    // 중복 시 "고스트(doc id ≠ 내부 SellerCode)"는 피하고, id와 SellerCode가 일치하는 정상 문서를 우선 선택.
    // (옛 코드 doc을 계속 골라 재고를 옛 코드에 쓰며 중복을 영속화하던 문제 차단)
    const first = matches.find(m => m.id === (m.data.SellerCode || m.id)) || matches[0];
    // 주의: ...first.data 를 먼저 펼친 뒤 id를 덮어쓴다.
    // (이름변경된 문서는 data 안에 옛 id 필드가 남아있어, id를 앞에 두면 옛값으로 덮어써짐)
    return { ...first.data, id: first.id, matchedOption: first.option, GroupOptions: first.data.GroupOptions };
}

