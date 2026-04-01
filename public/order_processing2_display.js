// order_processing2_display.js

import { checkServiceBarcode, checkBarcode } from './orderHelpers.js';
import { playDingDong, playBeep } from './playsound.js';
import {
    getProductByBarcode,
    getProductBySellerCode,
    refineInputValue,
    reInitializeOrderMap,
    reInitializeProductMap,
    getOrderByOrderNumber,
    updateOrderInfo,
    getOrderMap,
    getOrderNumberByDeliveryNumber,
} from './aGlobalMain.js';
import { generateBatchContent, sendBatchInventoryUpdate } from './aSaveInventoryBatchToSmartStore.js';
import { findNegativeStockSellerCodes } from './order_processing_support.js';

// ─── 순수 함수 (테스트 가능) ─────────────────────────────────────────────────

/**
 * ProductOrders 객체를 SellerCode → 옵션명 순으로 정렬하여 배열로 반환.
 * SET_ 접두사는 정렬 키에서 제거.
 * @param {Object} productOrders
 * @returns {Array}
 */
export function sortProductOrders(productOrders) {
    return Object.values(productOrders).sort((a, b) => {
        const codeA = (a.SellerCode || '').replace(/^SET_/, '');
        const codeB = (b.SellerCode || '').replace(/^SET_/, '');
        if (codeA < codeB) return -1;
        if (codeA > codeB) return 1;
        if ((a.보여주기용옵션명 || '') < (b.보여주기용옵션명 || '')) return -1;
        if ((a.보여주기용옵션명 || '') > (b.보여주기용옵션명 || '')) return 1;
        return 0;
    });
}

// ─── 템플릿 헬퍼 ─────────────────────────────────────────────────────────────

function fillField(node, fieldName, value) {
    const el = node.querySelector(`[data-field="${fieldName}"]`);
    if (el) el.textContent = value ?? '';
}

function fillImg(node, imgName, src) {
    const el = node.querySelector(`[data-img="${imgName}"]`);
    if (el) el.src = src || '';
}

// ─── 렌더링 함수 ─────────────────────────────────────────────────────────────

/**
 * 주문 요약 정보를 #orderSummaryTemplate으로 렌더링.
 * @param {Object} orderData
 * @param {string} orderNumber
 * @param {HTMLElement} container  - 비워지고 채워질 div
 * @param {number} totalCost
 * @param {number} serviceTotalSales
 */
export function renderOrderSummary(orderData, orderNumber, container, totalCost, serviceTotalSales) {
    const tmpl  = document.getElementById('orderSummaryTemplate');
    const clone = tmpl.content.cloneNode(true);

    fillField(clone, 'order-number',        orderNumber);
    fillField(clone, '운송장번호',           orderData.운송장번호);
    fillField(clone, '서비스제품금액',       orderData.서비스제품금액);
    fillField(clone, '서비스총판매가금액',   serviceTotalSales);
    fillField(clone, '기본배송비',           orderData.기본배송비);
    fillField(clone, '배송메세지',           orderData.배송메세지);
    fillField(clone, '수취인이름',           orderData.수취인이름);
    fillField(clone, '총수량',               orderData.총수량);
    fillField(clone, '총결제금액',           orderData.총결제금액);
    fillField(clone, '주문원가합산금액',     totalCost);

    container.innerHTML = '';
    container.appendChild(clone);
}

/**
 * 상품 테이블을 #orderTableTemplate + #orderRowTemplate으로 렌더링.
 * @param {Array}       sortedOrders
 * @param {HTMLElement} container
 */
export function renderOrderTable(sortedOrders, container) {
    const tableTmpl = document.getElementById('orderTableTemplate');
    const tableNode = tableTmpl.content.cloneNode(true);
    const tbody     = tableNode.querySelector('#orderTableBody');

    sortedOrders.forEach(order => {
        const rowTmpl = document.getElementById('orderRowTemplate');
        const rowNode = rowTmpl.content.cloneNode(true);

        fillField(rowNode, '상품주문번호', order.상품주문번호);
        fillField(rowNode, '판매자상품코드', order.SellerCode);
        fillField(rowNode, '입고차수',      order.입고차수);
        fillField(rowNode, '옵션정보',      order.보여주기용옵션명);
        fillField(rowNode, '총가격',        order.상품별총주문금액);
        fillField(rowNode, '원가',          order.원가);
        fillField(rowNode, 'Counts',        order.Counts);
        fillField(rowNode, '바코드',        order.바코드);
        fillImg(rowNode, '옵션이미지URL',   order.옵션이미지URL);
        fillImg(rowNode, '실제이미지URL',   order.실제이미지URL);

        // 수량 — 2개 초과 시 bold red
        const quantityTd = rowNode.querySelector('[data-field="수량"]');
        if (quantityTd) {
            quantityTd.textContent = order.상품수량;
            if (order.상품수량 !== 1) {
                quantityTd.style.fontWeight = 'bold';
                quantityTd.style.color      = 'red';
            }
        }

        // 포장수량 input
        const packingInput = rowNode.querySelector('[data-input="packingQuantity"]');
        if (packingInput) {
            packingInput.max   = order.상품수량;
            packingInput.value = order.currentPackingQuantity !== undefined ? order.currentPackingQuantity : 0;
        }

        // 체크박스
        const checkbox = rowNode.querySelector('[data-input="barcodeCheck"]');
        if (checkbox) checkbox.checked = !!order.found;

        tbody.appendChild(rowNode);
    });

    container.appendChild(tableNode);
}

/**
 * 서비스 상품 테이블을 #serviceTableTemplate + #serviceRowTemplate으로 렌더링.
 * @param {Array}       productServices
 * @param {HTMLElement} container
 * @param {string}      orderNumber
 * @param {HTMLElement} orderDropdown
 * @param {HTMLElement} messageDiv
 */
export function renderServiceTable(productServices, container, orderNumber, orderDropdown, messageDiv) {
    const tableTmpl = document.getElementById('serviceTableTemplate');
    const tableNode = tableTmpl.content.cloneNode(true);
    const tbody     = tableNode.querySelector('#serviceTableBody');

    productServices.forEach(service => {
        const rowTmpl = document.getElementById('serviceRowTemplate');
        const rowNode = rowTmpl.content.cloneNode(true);

        fillField(rowNode, '판매자상품코드', service.SellerCode);
        fillField(rowNode, '바코드',         service.바코드);
        fillField(rowNode, 'SellingPrice',   service.SellingPrice);
        fillField(rowNode, '원가',           service.원가);
        fillImg(rowNode, '옵션이미지URL',    service.옵션이미지URL);
        fillImg(rowNode, '실제이미지URL',    service.실제이미지URL);

        const deleteBtn = rowNode.querySelector('.deleteServiceButton');
        if (deleteBtn) deleteBtn.dataset.barcode = service.바코드;

        tbody.appendChild(rowNode);
    });

    // wrapper div로 감싸서 추가
    const wrapper = document.createElement('div');
    wrapper.appendChild(tableNode);
    container.appendChild(wrapper);

    // 삭제 버튼 이벤트
    container.querySelectorAll('.deleteServiceButton').forEach(btn => {
        btn.addEventListener('click', async function () {
            const barcode = this.dataset.barcode;
            if (orderNumber && barcode) {
                const { deleteServiceProduct } = await import('./orderHelpers.js');
                await deleteServiceProduct(orderNumber, barcode, messageDiv);
                orderDropdown.dispatchEvent(new Event('change'));
            }
        });
    });

    // barcodeCheck 체크박스 이벤트
    container.querySelectorAll('.barcodeCheck').forEach(check => {
        check.addEventListener('change', function () {
            const row = this.closest('tr');
            if (!row) return;
            const input = row.querySelector('.packingQuantity');
            if (!input) return;
            const current = parseInt(input.value, 10) || 0;
            input.value = this.checked ? current + 1 : 0;
        });
    });
}

// ─── Firebase 연동: 주문번호 목록 로드 + 드롭다운 + change 핸들러 ───────────

export async function loadOrderNumbers2(orderDropdown, messageDiv) {
    try {
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
    } catch (error) {
        console.error('Error loading order numbers:', error);
        messageDiv.innerHTML += `<p>주문번호 로드 중 오류 발생: ${error.message}</p>`;
    }
}

// 현재 렌더링된 상품 테이블의 체크박스·포장수량 상태를 바코드 기준으로 저장
function saveCheckState(orderDetailsDiv) {
    const state = new Map(); // barcode → { checked, packingQty }
    orderDetailsDiv.querySelectorAll('tbody tr').forEach(row => {
        const barcode      = row.querySelector('[data-field="바코드"]')?.textContent?.trim();
        const checkbox     = row.querySelector('.barcodeCheck');
        const packingInput = row.querySelector('.packingQuantity');
        if (barcode && checkbox) {
            state.set(barcode, {
                checked:    checkbox.checked,
                packingQty: packingInput ? packingInput.value : '0',
            });
        }
    });
    return state;
}

// 저장된 상태를 새로 렌더링된 테이블에 복원
function restoreCheckState(orderDetailsDiv, state) {
    if (!state || state.size === 0) return;
    orderDetailsDiv.querySelectorAll('tbody tr').forEach(row => {
        const barcode      = row.querySelector('[data-field="바코드"]')?.textContent?.trim();
        const saved        = state.get(barcode);
        if (!saved) return;
        const checkbox     = row.querySelector('.barcodeCheck');
        const packingInput = row.querySelector('.packingQuantity');
        if (checkbox)     checkbox.checked   = saved.checked;
        if (packingInput) packingInput.value  = saved.packingQty;
    });
}

let _orderChangeHandler = null;

function attachOrderChangeHandler(orderDropdown, orderDetailsDiv, messageDiv) {
    // 기존 핸들러 제거 → 중복 등록 방지
    if (_orderChangeHandler) {
        orderDropdown.removeEventListener('change', _orderChangeHandler);
    }

    _orderChangeHandler = async function () {
        const orderNumber = orderDropdown.value;
        if (!orderNumber) return;

        try {
            // 재렌더링 전 체크 상태 저장
            const checkState = saveCheckState(orderDetailsDiv);

            const orderData       = await getOrderByOrderNumber(orderNumber);
            const productOrders   = orderData.ProductOrders  || {};
            const productServices = orderData.ProductService || [];
            const serviceTotalSales = orderData.서비스총판매가금액 || 0;
            const totalCost         = orderData.주문원가합산금액  || 0;

            const sorted = sortProductOrders(productOrders);

            orderDetailsDiv.innerHTML = '';
            renderOrderSummary(orderData, orderNumber, orderDetailsDiv, totalCost, serviceTotalSales);
            renderOrderTable(sorted, orderDetailsDiv);
            renderServiceTable(productServices, orderDetailsDiv, orderNumber, orderDropdown, messageDiv);

            // 재렌더링 후 체크 상태 복원
            restoreCheckState(orderDetailsDiv, checkState);

        } catch (error) {
            console.error('Error loading order details:', error);
            orderDetailsDiv.innerHTML = `<p>주문 정보 로드 중 오류 발생: ${error.message}</p>`;
        }
    };

    orderDropdown.addEventListener('change', _orderChangeHandler);
}

// ─── Firebase 연동: Firestore 배치 업데이트 헬퍼들 ───────────────────────────

async function batchUpdateOrder(orderUpdates, db) {
    const batch = db.batch();
    orderUpdates.forEach((data, id) => {
        const docRef = db.collection('Orders').doc(id);
        if (data && typeof data === 'object') {
            batch.set(docRef, data, { merge: true });
        }
    });
    await batch.commit();
}

async function batchUpdateProductCounts(productUpdates, db) {
    const batch = db.batch();
    productUpdates.forEach(({ id, data }) => {
        const docRef = db.collection('Products').doc(id);
        batch.set(docRef, data, { merge: true });
    });
    await batch.commit();
}

// ─── Phase 1: 수량 집계 (순수 데이터 수집) ──────────────────────────────────

function collectDemand(orderDetailsDiv, orderData) {
    const barcodeDemand = {};  // { barcode: totalQuantity }
    const setDemand = {};      // { "SET_xxx": quantity }

    for (const row of orderDetailsDiv.querySelectorAll('tbody tr')) {
        const sellerCode = row.querySelector('[data-field="판매자상품코드"]')?.textContent || '';
        const packingInput = row.querySelector('.packingQuantity');
        if (!packingInput || packingInput.value === '') continue;
        const qty = parseInt(packingInput.value, 10);

        if (sellerCode.startsWith('SET_')) {
            // SET 상품은 6개 옵션 행으로 펼쳐지지만 실제로는 1개 주문
            // → 첫 번째 행의 수량만 사용, 나머지 무시
            if (!setDemand[sellerCode]) {
                setDemand[sellerCode] = qty;
            }
        } else {
            const barcode = row.querySelector('[data-field="바코드"]')?.textContent;
            if (barcode) barcodeDemand[barcode] = (barcodeDemand[barcode] || 0) + qty;
        }
    }

    for (const service of (orderData.ProductService || [])) {
        if (service.바코드) {
            barcodeDemand[service.바코드] = (barcodeDemand[service.바코드] || 0) + 1;
        }
    }

    return { barcodeDemand, setDemand };
}

// ─── Phase 2: 차감 계산 + SET 보정 ─────────────────────────────────────────

async function computeUpdates(barcodeDemand, setDemand, db) {
    // 2a: barcode → product/option 매핑 + productId별 그룹핑
    const productGroups = {};
    const setProductIds = new Set(Object.keys(setDemand));

    for (const [barcode, qty] of Object.entries(barcodeDemand)) {
        const product = await getProductByBarcode(barcode);
        if (!product) continue;

        let optionKey;
        for (const k in product.OptionDatas) {
            if (product.OptionDatas[k].바코드 === barcode) { optionKey = k; break; }
        }

        if (!productGroups[product.id]) {
            productGroups[product.id] = { product, options: {} };
            const setProduct = await getProductBySellerCode('SET_' + product.id);
            if (setProduct) setProductIds.add(setProduct.id);
        }
        productGroups[product.id].options[optionKey] =
            (productGroups[product.id].options[optionKey] || 0) + qty;
    }

    // 2b: SET 제품 Firebase 일괄 조회 (최신 Counts)
    const setCountsMap = {};
    for (const setId of setProductIds) {
        const doc = await db.collection('Products').doc(setId).get();
        if (doc.exists) {
            setCountsMap[setId] = doc.data().OptionDatas?.['옵션1']?.Counts || 0;
        }
    }

    // SET 직접 주문 먼저 반영
    for (const [setId, qty] of Object.entries(setDemand)) {
        if (setCountsMap[setId] !== undefined) {
            setCountsMap[setId] -= qty;
        }
    }

    // 2c: 제품별 차감 + SET 보정
    const productUpdatesMap = {};

    for (const [productId, group] of Object.entries(productGroups)) {
        // deep clone OptionDatas (productMap 오염 방지)
        const clonedOptions = {};
        for (const k in group.product.OptionDatas) {
            clonedOptions[k] = { ...group.product.OptionDatas[k] };
        }

        // 차감
        for (const [optKey, qty] of Object.entries(group.options)) {
            if (clonedOptions[optKey]) {
                clonedOptions[optKey].Counts = (clonedOptions[optKey].Counts || 0) - qty;
            }
        }

        // SET 보정 필요 여부
        const setId = 'SET_' + productId;
        const setAvailable = setCountsMap[setId] ?? 0;

        if (setAvailable > 0) {
            let setsNeeded = 0;
            for (const optKey in clonedOptions) {
                const deficit = -(clonedOptions[optKey].Counts ?? 0);
                if (deficit > setsNeeded) setsNeeded = deficit;
            }
            setsNeeded = Math.min(setsNeeded, setAvailable);

            if (setsNeeded > 0) {
                for (const optKey in clonedOptions) {
                    clonedOptions[optKey].Counts += setsNeeded;
                }
                setCountsMap[setId] -= setsNeeded;
            }
        }

        // 남은 음수는 0으로 클램프
        for (const optKey in clonedOptions) {
            if (clonedOptions[optKey].Counts < 0) clonedOptions[optKey].Counts = 0;
        }

        productUpdatesMap[productId] = {
            id: productId,
            data: { ...group.product, OptionDatas: clonedOptions },
        };
    }

    // SET 결과 정리 (generateBatchContent 호환)
    const setResults = {};
    for (const [setId, counts] of Object.entries(setCountsMap)) {
        setResults[setId] = { UpdatedCounts: counts };
    }

    return { productUpdatesMap, setResults, setCountsMap };
}

// ─── 포장 검증 ───────────────────────────────────────────────────────────────

async function validatePacking(orderData, orderDetailsDiv, barcodeInput) {
    const totalQuantityFromOrder = orderData.총수량;
    let totalPackedQuantity = 0;

    const productRows = orderDetailsDiv.querySelectorAll('tbody tr');
    for (const row of productRows) {
        const input = row.querySelector('.packingQuantity');
        if (input && input.value !== '') {
            totalPackedQuantity += parseInt(input.value, 10) || 0;
        }
    }

    if (totalPackedQuantity !== totalQuantityFromOrder) {
        playBeep();
        barcodeInput.focus();
        return false;
    }

    playDingDong();
    return true;
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

const orderDropdown         = document.getElementById('orderDropdown');
const orderDetailsDiv       = document.getElementById('orderDetails');
const messageDiv            = document.getElementById('message');
const barcodeInput          = document.getElementById('barcodeInput');
const serviceBarcodeInput   = document.getElementById('serviceBarcodeInput');
const packingCompleteButton = document.getElementById('packingCompleteButton');
const saveCurrentStateButton = document.getElementById('saveCurrentStateButton');
const manualBarcodeButton   = document.getElementById('manualBarcodeButton');
const deleteOrderButton        = document.getElementById('deleteOrderButton');
const deleteAllOrdersButton    = document.getElementById('deleteAllOrdersButton');
const orderNumberInput      = document.getElementById('orderNumberInput');
const deliveryNumberInput   = document.getElementById('deliveryNumberInput');

loadOrderNumbers2(orderDropdown, messageDiv);
attachOrderChangeHandler(orderDropdown, orderDetailsDiv, messageDiv);

    // 주문번호 직접 입력
    orderNumberInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        let inputValue = refineInputValue(orderNumberInput.value.trim());
        if (!inputValue) { messageDiv.textContent = 'Please enter a valid order number.'; return; }

        const match = Array.from(orderDropdown.options).find(o => o.value.includes(inputValue));
        if (match) {
            orderDropdown.value = match.value;
            messageDiv.textContent = `Order ${match.value} selected.`;
            orderDropdown.dispatchEvent(new Event('change'));
            serviceBarcodeInput.focus();
        } else {
            messageDiv.textContent = `Order containing ${inputValue} not found.`;
        }
    });

    // 운송장번호 입력
    deliveryNumberInput.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        let inputValue = refineInputValue(deliveryNumberInput.value.trim());
        deliveryNumberInput.value = '';
        if (!inputValue) { messageDiv.textContent = 'Please enter a valid order number.'; return; }

        const orderData = await getOrderNumberByDeliveryNumber(inputValue);
        if (orderData) {
            orderDropdown.value = orderData.id;
            messageDiv.textContent = `OrderNumber ${orderData.id} selected.`;
            orderDropdown.dispatchEvent(new Event('change'));
            serviceBarcodeInput.focus();
        } else {
            messageDiv.textContent = `Order containing ${inputValue} not found.`;
        }
    });

    // 구매 상품 바코드 스캔
    barcodeInput.addEventListener('keypress', function (event) {
        if (event.key !== 'Enter') return;
        let barcode = refineInputValue(barcodeInput.value.trim());
        if (!barcode) return;
        if (barcode === '1111111111') {
            packingCompleteButton.click();
        } else {
            checkBarcode(barcode, orderDetailsDiv);
        }
        barcodeInput.value = '';
    });

    // 서비스 상품 바코드 스캔
    serviceBarcodeInput.addEventListener('keypress', async function (event) {
        if (event.key !== 'Enter') return;
        let barcode = refineInputValue(serviceBarcodeInput.value.trim());
        if (!barcode) return;
        if (barcode === '9999999999') {
            barcodeInput.focus();
        } else {
            await checkServiceBarcode(barcode, orderDropdown, messageDiv);
        }
        serviceBarcodeInput.value = '';
    });

    // 바코드 수동처리
    manualBarcodeButton.addEventListener('click', function () {
        orderDetailsDiv.querySelectorAll('tbody tr').forEach(row => {
            const quantityTd = row.querySelector('[data-field="수량"]');
            const packingInput = row.querySelector('.packingQuantity');
            const checkbox     = row.querySelector('.barcodeCheck');
            if (quantityTd && packingInput && checkbox) {
                packingInput.value = quantityTd.textContent;
                checkbox.checked   = true;
            }
        });
    });

    // 현재상태저장
    saveCurrentStateButton.addEventListener('click', async function () {
        playDingDong();
        const orderNumber = orderDropdown.value;
        if (!orderNumber) return;

        orderDetailsDiv.querySelectorAll('tbody tr').forEach(row => {
            const productOrderNumber = row.querySelector('[data-field="상품주문번호"]');
            const packingInput       = row.querySelector('.packingQuantity');
            if (packingInput && packingInput.value !== '') {
                const qty = parseInt(packingInput.value, 10) || 0;
                updateOrderInfo(orderNumber, productOrderNumber, qty);
            }
        });

        await batchUpdateOrder(getOrderMap(), firebase.firestore());
        playDingDong();
    });

    // 포장완료
    packingCompleteButton.addEventListener('click', async function () {
        packingCompleteButton.disabled = true;
        try {
            const orderNumber = orderDropdown.value;
            if (!orderNumber) return;

            const db          = firebase.firestore();
            const orderDocRef = db.collection('Orders').doc(orderNumber);
            const orderData   = await getOrderByOrderNumber(orderNumber);
            if (!orderData) return;
            if (!await validatePacking(orderData, orderDetailsDiv, barcodeInput)) return;

            // Phase 1: 수량 집계
            const { barcodeDemand, setDemand } = collectDemand(orderDetailsDiv, orderData);

            // Phase 2: 차감 계산 + SET 보정
            const { productUpdatesMap, setResults, setCountsMap } =
                await computeUpdates(barcodeDemand, setDemand, db);

            // Phase 3: SmartStore API + Firebase 단일 배치 저장
            const productUpdates = Object.values(productUpdatesMap);
            const payloadList    = [];
            generateBatchContent(payloadList, productUpdates);
            generateBatchContent(payloadList, setResults);

            const negativeStockCodes = findNegativeStockSellerCodes(payloadList);
            if (negativeStockCodes.length > 0) {
                console.warn('재고 음수 seller_code:', negativeStockCodes);
            }

            await sendBatchInventoryUpdate(payloadList);

            // 일반 + SET 통합 배치 쓰기
            const allUpdates = [...productUpdates];
            for (const [setId, counts] of Object.entries(setCountsMap)) {
                allUpdates.push({
                    id: setId,
                    data: { OptionDatas: { '옵션1': { Counts: counts } } },
                });
            }
            await batchUpdateProductCounts(allUpdates, db);

            orderData.주문처리날짜 = new Date();
            orderData.배송메시지   = '';
            orderData.수취인이름   = '';

            await db.collection('CompletedOrders').doc(orderNumber).set(orderData);
            await orderDocRef.delete();
            await reInitializeOrderMap();
            await reInitializeProductMap();

            orderDetailsDiv.innerHTML = '';
            orderDropdown.value = '';
            messageDiv.innerHTML = '<p>모든 선택된 상품의 Counts가 업데이트되었으며, 주문이 완료되었습니다.</p>';

            playDingDong();
            alert('포장이 완료되었습니다.');
            await loadOrderNumbers2(orderDropdown, messageDiv);
            attachOrderChangeHandler(orderDropdown, orderDetailsDiv, messageDiv);
            deliveryNumberInput.focus();

        } catch (error) {
            console.error('Error completing packing:', error);
            messageDiv.innerHTML = `<p>포장 완료 중 오류 발생: ${error.message}</p>`;
            playBeep();
            barcodeInput.focus();
            alert('포장 중 오류 발생');
        } finally {
            packingCompleteButton.disabled = false;
        }
    });

    // 주문서 삭제
    deleteOrderButton.addEventListener('click', async function () {
        const orderNumber = orderDropdown.value;
        if (!orderNumber) { messageDiv.innerHTML = '<p>선택된 주문서가 없습니다.</p>'; return; }

        try {
            const orderDocRef = firebase.firestore().collection('Orders').doc(orderNumber);
            const doc         = await orderDocRef.get();
            if (doc.exists) {
                await orderDocRef.delete();
                messageDiv.innerHTML = `<p>주문서 ${orderNumber}가 성공적으로 삭제되었습니다.</p>`;
                orderDetailsDiv.innerHTML = '';
                orderDropdown.value = '';
                await loadOrderNumbers2(orderDropdown, messageDiv);
                attachOrderChangeHandler(orderDropdown, orderDetailsDiv, messageDiv);
            } else {
                messageDiv.innerHTML = `<p>주문서 ${orderNumber}를 찾을 수 없습니다.</p>`;
            }
        } catch (error) {
            messageDiv.innerHTML = `<p>주문서 삭제 중 오류 발생: ${error.message}</p>`;
        }
    });

    // 전체 주문서 삭제
    deleteAllOrdersButton.addEventListener('click', async function () {
        const confirmed = window.confirm(
            '⚠️ 경고: 모든 주문서를 삭제합니다.\n\n이 작업은 되돌릴 수 없습니다.\n정말로 전체 주문서를 삭제하시겠습니까?'
        );
        if (!confirmed) return;

        const doubleConfirmed = window.confirm('마지막 확인: 전체 주문서를 삭제하시겠습니까?');
        if (!doubleConfirmed) return;

        try {
            deleteAllOrdersButton.disabled = true;
            const snapshot = await firebase.firestore().collection('Orders').get();
            if (snapshot.empty) {
                messageDiv.innerHTML = '<p>삭제할 주문서가 없습니다.</p>';
                return;
            }

            // Firebase batch 최대 500건 제한 처리
            const batchSize = 500;
            const docs = snapshot.docs;
            for (let i = 0; i < docs.length; i += batchSize) {
                const batch = firebase.firestore().batch();
                docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }

            await reInitializeOrderMap();
            await reInitializeProductMap();
            orderDetailsDiv.innerHTML = '';
            messageDiv.innerHTML = `<p>전체 주문서 ${docs.length}건 삭제 완료.</p>`;
            loadOrderNumbers2(orderDropdown, messageDiv);
            attachOrderChangeHandler(orderDropdown, orderDetailsDiv, messageDiv);
        } catch (error) {
            console.error('전체 삭제 오류:', error);
            messageDiv.innerHTML = `<p>전체 삭제 중 오류 발생: ${error.message}</p>`;
        } finally {
            deleteAllOrdersButton.disabled = false;
        }
    });

