// order_processing2_upload.js

import { generateImageURLs } from './generateImageURLs.js';
import { getProductBySellerCode, reInitializeOrderMap, reInitializeProductMap } from './aGlobalMain.js';

// 드롭다운만 갱신 (change 핸들러 추가 없음 — display.js에서 관리)
async function refreshOrderDropdown(orderDropdown, messageDiv) {
    const snapshot = await firebase.firestore().collection('Orders').get();
    orderDropdown.innerHTML = "<option value=''>주문 번호 선택</option>";
    if (snapshot.empty) {
        messageDiv.innerHTML += '<p>주문 번호가 없습니다.</p>';
        return;
    }
    snapshot.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = doc.id;
        orderDropdown.appendChild(option);
    });
}

// ─── 스마트스토어 컬럼 매핑 ──────────────────────────────────────────────────
export const COLUMNS = {
    주문번호:       '주문번호',
    판매자상품코드: '판매자 상품코드',
    상품주문번호:   '상품주문번호',
    옵션:           '옵션정보',
    수량:           '상품 수량(출력용)',
    상품주문금액:   '상품별 총 주문금액',
    상품결제금액:   '상품결제금액',
    기본배송비:     '기본 배송비',
    배송메세지:     '배송 메세지',
    수취인이름:     '수취인 이름',
    운송장번호:     '운송장번호',
};

// ─── 행 하나를 주문 데이터 객체로 변환 ──────────────────────────────────────
/**
 * @param {Object} row - XLSX 한 행
 * @returns {Object} orderData
 */
export function parseOrderRow(row) {
    const option = (row[COLUMNS.옵션] || '').replace('선택: ', '');
    const 상품주문금액 = parseFloat(row[COLUMNS.상품주문금액]) || 0;
    const 상품결제금액 = parseFloat(row[COLUMNS.상품결제금액]) || 0;

    return {
        상품주문번호:           row[COLUMNS.상품주문번호] || '',
        주문번호:               row[COLUMNS.주문번호] || '',
        SellerCode:             row[COLUMNS.판매자상품코드] || '',
        상품명:                 row['상품명'] || '',
        상품수량:               parseInt(row[COLUMNS.수량], 10) || 0,
        상품별총주문금액:       상품결제금액,
        상품주문금액,
        상품결제금액,
        서비스를위한총결제금액: 0,
        서비스를위한총원가금액: 0,
        총원가금액:             0,
        할인율:                 상품주문금액 > 0 ? (1.0 - 상품결제금액 / 상품주문금액) * 100 : 0,
        옵션정보:               option,
    };
}

// ─── 행 배열을 주문번호별로 그룹핑 ──────────────────────────────────────────
/**
 * @param {Array} rows
 * @returns {Object} ordersMap  { [orderNumber]: { ProductOrders, 총수량, ... } }
 */
export function groupByOrderNumber(rows) {
    const ordersMap = {};

    rows.forEach(row => {
        const orderData          = parseOrderRow(row);
        const orderNumber        = orderData.주문번호;
        const productOrderNumber = orderData.상품주문번호;

        if (!ordersMap[orderNumber]) {
            ordersMap[orderNumber] = {
                ProductOrders:              {},
                총수량:                     0,
                총주문금액:                 0,
                총결제금액:                 0,
                서비스를위한총결제금액:     0,
                서비스를위한총원가금액:     0,
                총원가금액:                 0,
                기본배송비:                 row[COLUMNS.기본배송비] || '',
                배송메세지:                 row[COLUMNS.배송메세지] || '',
                수취인이름:                 row[COLUMNS.수취인이름] || '',
                운송장번호:                 row[COLUMNS.운송장번호] || '',
                판매처:                     '스마트스토어',
            };
        }

        ordersMap[orderNumber].ProductOrders[productOrderNumber] = orderData;
        ordersMap[orderNumber].총수량     += orderData.상품수량;
        ordersMap[orderNumber].총주문금액 += orderData.상품별총주문금액;
        ordersMap[orderNumber].총결제금액 += orderData.상품결제금액;
    });

    return ordersMap;
}

// ─── 서비스제품금액 계산 (순수 함수) ────────────────────────────────────────
/**
 * @param {number} 서비스를위한총결제금액
 * @param {number} 서비스를위한총원가금액
 * @returns {number}
 */
export function calcServiceFee(서비스를위한총결제금액, 서비스를위한총원가금액) {
    return Math.floor((서비스를위한총결제금액 - 서비스를위한총원가금액) * 0.8 / 10) * 10;
}

// ─── Firebase 연동: 개별 주문 세부사항 처리 ─────────────────────────────────
async function processOrderDetails(orderDetails, batch) {
    let itemcount = 0;

    for (let productOrderNumber in orderDetails.ProductOrders) {
        const orderData  = orderDetails.ProductOrders[productOrderNumber];
        const sellerCode = orderData.SellerCode;
        const option     = orderData.옵션정보;

        if (sellerCode.startsWith('SET_')) {
            const sellerCodeDivide = sellerCode.replace('SET_', '');
            const productDoc       = await getProductBySellerCode(sellerCode);
            const productDocDivide = await getProductBySellerCode(sellerCodeDivide);

            if (productDoc && productDocDivide) {
                const setCounts   = productDoc.OptionDatas['옵션1']?.Counts || '';
                delete orderDetails.ProductOrders[productOrderNumber];

                const optionCount = Object.keys(productDocDivide.OptionDatas).length;
                for (let opt in productDocDivide.OptionDatas) {
                    const optData    = productDocDivide.OptionDatas[opt];
                    const barcode    = optData.바코드 || '';
                    const 원가       = parseFloat(productDocDivide.원가) || 0;
                    const totalPrice = (orderData.상품별총주문금액 / optionCount) || 0;
                    const price      = (orderData.상품결제금액 / optionCount) || 0;
                    const 입고차수   = productDocDivide.소분류명?.replace('차입고', '') || '';

                    let 보여주기용옵션명, 옵션이미지URL, 실제이미지URL;
                    if (optData.옵션이미지URL) {
                        // 저장된 URL 사용 (sellerCode/소분류명 변경 후에도 원래 이미지 위치 유지)
                        옵션이미지URL = optData.옵션이미지URL;
                        실제이미지URL = optData.실제이미지URL;
                        보여주기용옵션명 = optData.보여주기용옵션명 || opt;
                    } else {
                        // 저장된 URL 없음 → 기존 방식으로 생성 (기존 상품 하위 호환)
                        ({ 보여주기용옵션명, 옵션이미지URL, 실제이미지URL } = generateImageURLs(sellerCodeDivide, opt, 입고차수, productDocDivide.GroupOptions));
                    }

                    orderDetails.ProductOrders[`${productOrderNumber}_${opt}`] = {
                        상품주문번호:     productOrderNumber,
                        주문번호:         orderData.주문번호,
                        SellerCode:       sellerCode,
                        상품명:           orderData.상품명,
                        상품수량:         orderData.상품수량,
                        상품별총주문금액: totalPrice,
                        상품결제금액:     price,
                        옵션정보:         opt,
                        Counts:           setCounts,
                        바코드:           barcode,
                        입고차수,
                        원가,
                        옵션이미지URL,
                        실제이미지URL,
                        보여주기용옵션명,
                        할인율:           orderData.할인율,
                    };

                    if (orderData.할인율 < 50) {
                        orderDetails.서비스를위한총결제금액 += price;
                        orderDetails.서비스를위한총원가금액 += 원가 * orderData.상품수량;
                    }
                    itemcount += orderData.상품수량;
                    orderDetails.총원가금액 += 원가 * orderData.상품수량;
                }
            }
        } else {
            const productDoc = await getProductBySellerCode(sellerCode);

            // SmartStore 옵션명(예: '활기찬 나비')으로 직접 키를 못 찾으면
            // OptionDatas 키 중 '_[_활기찬 나비_]' 를 포함하는 키를 탐색
            let optionKey = option;
            if (productDoc && !productDoc.OptionDatas?.[option]) {
                const matched = Object.keys(productDoc.OptionDatas || {})
                    .find(k => k.includes(`_[_${option}_]`));
                if (matched) optionKey = matched;
            }

            if (productDoc?.OptionDatas?.[optionKey]) {
                const optData  = productDoc.OptionDatas[optionKey];
                const barcode  = optData.바코드 || '';
                const 원가     = parseFloat(productDoc.원가) || 0;
                const 입고차수 = productDoc.소분류명?.replace('차입고', '') || '';

                let 보여주기용옵션명, 옵션이미지URL, 실제이미지URL;
                if (optData.옵션이미지URL) {
                    // 저장된 URL 사용 (sellerCode/소분류명 변경 후에도 원래 이미지 위치 유지)
                    옵션이미지URL = optData.옵션이미지URL;
                    실제이미지URL = optData.실제이미지URL;
                    보여주기용옵션명 = optData.보여주기용옵션명 || option;
                } else {
                    // 저장된 URL 없음 → 기존 방식으로 생성 (기존 상품 하위 호환)
                    ({ 보여주기용옵션명, 옵션이미지URL, 실제이미지URL } = generateImageURLs(sellerCode, option, 입고차수, productDoc.GroupOptions));
                }

                Object.assign(orderData, {
                    Counts: optData.Counts || '',
                    바코드: barcode,
                    입고차수,
                    원가,
                    옵션이미지URL,
                    실제이미지URL,
                    보여주기용옵션명,
                });

                if (orderData.할인율 < 50) {
                    orderDetails.서비스를위한총결제금액 += orderData.상품결제금액;
                    orderDetails.서비스를위한총원가금액 += 원가 * orderData.상품수량;
                }
                itemcount += orderData.상품수량;
                orderDetails.총원가금액 += 원가 * orderData.상품수량;
            }
        }
    }

    orderDetails.서비스제품금액 = calcServiceFee(
        orderDetails.서비스를위한총결제금액,
        orderDetails.서비스를위한총원가금액,
    );
    orderDetails.총수량 = itemcount;

    const firstOrder  = orderDetails.ProductOrders[Object.keys(orderDetails.ProductOrders)[0]];
    const orderDocRef = firebase.firestore().collection('Orders').doc(firstOrder.주문번호);
    batch.set(orderDocRef, orderDetails, { merge: true });
}

// ─── Firebase 연동: 전체 주문 처리 ──────────────────────────────────────────
async function processOrders(orders, messageDiv, orderDropdown) {
    const ordersMap = groupByOrderNumber(orders);
    const db        = firebase.firestore();
    const batch     = db.batch();

    for (const orderNumber in ordersMap) {
        try {
            await processOrderDetails(ordersMap[orderNumber], batch);
            messageDiv.innerHTML += `<p>주문번호 ${orderNumber} 배치에 추가!</p>`;
        } catch (error) {
            console.error('Error preparing batch:', error);
        }
    }

    try {
        await batch.commit();
        await reInitializeOrderMap();
        await reInitializeProductMap();
        messageDiv.innerHTML += `<p>모든 주문 저장 성공!</p>`;
    } catch (error) {
        console.error('Batch commit error:', error);
        messageDiv.innerHTML += `<p>배치 저장 중 오류 발생: ${error.message}</p>`;
    }

    refreshOrderDropdown(orderDropdown, messageDiv);
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────
const uploadForm    = document.getElementById('uploadForm');
const submitButton  = uploadForm.querySelector("button[type='submit']");
const messageDiv    = document.getElementById('message');
const orderDropdown = document.getElementById('orderDropdown');

uploadForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    submitButton.disabled = true;

    try {
        const xlsxFile = document.getElementById('xlsxFile').files[0];
        if (!xlsxFile) {
            alert('XLSX 파일을 선택해주세요.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const data      = new Uint8Array(e.target.result);
            const workbook  = XLSX.read(data, { type: 'array' });
            const worksheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            processOrders(worksheet, messageDiv, orderDropdown);
        };
        reader.readAsArrayBuffer(xlsxFile);
    } catch (error) {
        console.error('에러 발생:', error);
        alert('파일 처리 중 오류가 발생했습니다.');
    } finally {
        submitButton.disabled = false;
    }
});
