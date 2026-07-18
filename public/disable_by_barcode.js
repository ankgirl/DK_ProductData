import { refineInputValue, getProductByBarcode } from './aGlobalMain.js';
import { esc, copyWithFeedback, setRowStatus, runBatchSequential } from './batchScanShared.js';

// 판매중지 처리(여러 개 한꺼번에):
//  - 바코드/셀러코드를 연속으로 찍으면 목록(이미지·이름·셀러코드)에 쌓인다.
//  - "전체 판매중지 처리"를 누르면 목록을 하나씩 순차대로 판매중지 처리한다.
// 스캔목록/복사/순차처리 뼈대는 공용 batchScanShared.js 에서 가져온다(취소·반품 페이지와 공유).
// 판매중지 로직은 공용 disableProduct.js(window.disableProduct)에서 가져온다 (중복 제거).
// 대표이미지/상품이름 추출도 공용 window.getMainImage(displayProductData.js) 재사용.

const items = [];          // [{ sellerCode, name, img, hasSet, status, els:{...} }]
const byCode = new Map();  // sellerCode -> item  (중복 스캔 방지)

document.addEventListener("DOMContentLoaded", function () {
    const barcodeForm = document.getElementById("searchByBarcodeForm");
    const sellerCodeForm = document.getElementById("searchBySellerCodeForm");
    const barcodeInput = document.getElementById("barcode");
    const sellerCodeInput = document.getElementById("sellerCode");
    const disableAllBtn = document.getElementById("disableAllBtn");
    const copyCodesBtn = document.getElementById("copyCodesBtn");
    const clearAllBtn = document.getElementById("clearAllBtn");

    barcodeInput.focus();

    barcodeForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        let barcode = refineInputValue(barcodeInput.value.trim());
        barcodeInput.value = '';
        barcodeInput.focus();
        if (!barcode) return;
        await addByBarcode(barcode);
    });

    sellerCodeForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        let sellerCode = sellerCodeInput.value.trim().replace(/^SET_/, '');
        sellerCodeInput.value = '';
        barcodeInput.focus();
        if (!sellerCode) return;
        await addBySellerCode(sellerCode);
    });

    clearAllBtn.addEventListener("click", function () {
        if (items.length && !confirm("목록을 모두 비우시겠습니까?")) return;
        items.length = 0;
        byCode.clear();
        renderTable();
        setMsg("");
        document.getElementById("summary").textContent = "";
        barcodeInput.focus();
    });

    disableAllBtn.addEventListener("click", processAll);
    copyCodesBtn.addEventListener("click", copyAllCodes);
});

// 목록의 모든 셀러코드를 콤마로 이어 클립보드에 복사
async function copyAllCodes() {
    if (items.length === 0) return;
    // 세트가 있는 상품은 기준코드 + SET_기준코드 를 함께 복사(판매중지가 세트까지 처리하는 것과 동일 기준).
    const codeList = items.flatMap(it => it.hasSet ? [it.sellerCode, "SET_" + it.sellerCode] : [it.sellerCode]);
    const codes = codeList.join(",");
    await copyWithFeedback(document.getElementById("copyCodesBtn"), codes, {
        restoreLabel: `셀러코드 전체 복사 (${items.length})`,
        doneLabel: `복사됨! (${codeList.length}개)`,
        setMsg,
        okMsg: `📋 셀러코드 ${codeList.length}개 복사됨 (상품 ${items.length}건, 세트 포함): ${esc(codes)}`,
        failMsg: "❌ 클립보드 복사에 실패했습니다.",
    });
}

function setMsg(html, color = "#333") {
    const el = document.getElementById("scanMsg");
    el.style.color = color;
    el.innerHTML = html;
}

// ---- 목록에 추가 ----
async function addByBarcode(barcode) {
    try {
        const product = await getProductByBarcode(barcode);
        if (!product) {
            setMsg(`❌ 바코드 <b>${esc(barcode)}</b> — 상품을 찾을 수 없습니다.`, "#c0392b");
            return;
        }
        await addProduct(product);
    } catch (e) {
        console.error("바코드 조회 실패:", e);
        setMsg(`❌ 바코드 조회 오류: ${esc(e.message)}`, "#c0392b");
    }
}

async function addBySellerCode(sellerCode) {
    try {
        const snap = await window.db.collection("Products").doc(sellerCode).get();
        if (!snap.exists) {
            setMsg(`❌ 셀러코드 <b>${esc(sellerCode)}</b> — 상품을 찾을 수 없습니다.`, "#c0392b");
            return;
        }
        await addProduct({ ...snap.data(), id: snap.id });
    } catch (e) {
        console.error("셀러코드 조회 실패:", e);
        setMsg(`❌ 셀러코드 조회 오류: ${esc(e.message)}`, "#c0392b");
    }
}

async function addProduct(data) {
    const sellerCode = String(data.SellerCode || data.id || "").replace(/^SET_/, "");
    if (!sellerCode) {
        setMsg("❌ 셀러코드를 확인할 수 없는 상품입니다.", "#c0392b");
        return;
    }
    if (byCode.has(sellerCode)) {
        setMsg(`⚠️ <b>${esc(sellerCode)}</b> 는 이미 목록에 있습니다.`, "#b8860b");
        return;
    }
    const name = data.스토어키워드네임 || data.상품명 || "";
    const img = (window.getMainImage ? window.getMainImage(data) : (data.Cafe24URL || ""));
    // 세트(SET_) 문서 존재 여부 확인 — 판매중지·복사 모두 세트까지 포함하기 위함(disable 로직과 동일 기준).
    let hasSet = false;
    try {
        hasSet = (await window.db.collection("Products").doc("SET_" + sellerCode).get()).exists;
    } catch (e) {
        console.warn("SET_ 존재 확인 실패:", sellerCode, e);
    }
    const item = { sellerCode, name, img, hasSet, status: "대기", els: {} };
    items.push(item);
    byCode.set(sellerCode, item);
    renderTable();
    setMsg(`➕ 추가됨: <b>${esc(name || sellerCode)}</b> (${esc(sellerCode)}${hasSet ? " +세트" : ""}) — 현재 ${items.length}건`, "#1a7a1a");
    if (typeof window.playDingDong === "function") { try { window.playDingDong(); } catch (e) {} }
}

// ---- 목록 렌더링 ----
function renderTable() {
    const tbody = document.getElementById("scanTableBody");
    document.getElementById("disableAllBtn").textContent = `전체 판매중지 처리 (${items.length})`;
    document.getElementById("disableAllBtn").disabled = items.length === 0;
    document.getElementById("copyCodesBtn").textContent = `셀러코드 전체 복사 (${items.length})`;
    document.getElementById("copyCodesBtn").disabled = items.length === 0;

    if (items.length === 0) {
        tbody.innerHTML = `<tr id="emptyRow"><td colspan="6" style="color:#999; padding:20px;">아직 찍은 상품이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    items.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${item.img ? `<img src="${esc(item.img)}" alt="${esc(item.sellerCode)}" onerror="tryAlternativeExtension(this)">` : '<span style="color:#bbb;">없음</span>'}</td>
            <td class="name-cell">${esc(item.name) || '<span style="color:#bbb;">(이름 없음)</span>'}</td>
            <td>${esc(item.sellerCode)}${item.hasSet ? '<br><span class="set-tag">+ SET_' + esc(item.sellerCode) + '</span>' : ''}</td>
            <td class="status-cell"></td>
            <td><button type="button" class="row-remove" title="이 상품 제거">✕</button></td>
        `;
        const statusCell = tr.querySelector(".status-cell");
        item.els.statusCell = statusCell;
        setRowStatus(item, item.status);

        tr.querySelector(".row-remove").addEventListener("click", () => removeItem(item.sellerCode));
        tbody.appendChild(tr);
    });
}

function removeItem(sellerCode) {
    const idx = items.findIndex(it => it.sellerCode === sellerCode);
    if (idx === -1) return;
    items.splice(idx, 1);
    byCode.delete(sellerCode);
    renderTable();
    document.getElementById("barcode").focus();
}

// ---- 전체 순차 판매중지 ----
async function processAll() {
    const pending = items.filter(it => it.status !== "완료");
    if (pending.length === 0) {
        alert("판매중지 처리할 상품이 없습니다. (모두 완료됨)");
        return;
    }

    const confirmed = confirm(
        `총 ${pending.length}개 상품의 모든 옵션 재고를 0으로 만들고\n스마트스토어에서 판매중지 처리합니다.\n(SET_ 상품이 있으면 함께 처리됩니다)\n\n되돌릴 수 없습니다. 계속하시겠습니까?`
    );
    if (!confirmed) return;

    const disableAllBtn = document.getElementById("disableAllBtn");
    const clearAllBtn = document.getElementById("clearAllBtn");
    const summary = document.getElementById("summary");
    disableAllBtn.disabled = true;
    clearAllBtn.disabled = true;

    // 공용 순차 처리기 사용 — silent:true 로 건별 alert 억제(팝업 폭탄 방지), 결과는 목록 상태로 표시.
    const { success, fail, failed } = await runBatchSequential(items, {
        skipIf: it => it.status === "완료",   // 이미 완료된 건 재처리 안 함(멱등)
        action: it => window.disableProduct.disableAllOptions(it.sellerCode, { silent: true }),
        onProgress: (done, total) => { summary.textContent = `처리 중... (${done}/${total})`; },
    });

    disableAllBtn.disabled = items.length === 0;
    clearAllBtn.disabled = false;

    const msg = `판매중지 처리 완료 — 성공 ${success}건 / 실패 ${fail}건`;
    summary.textContent = msg;
    if (fail > 0) {
        summary.style.color = "#c0392b";
        alert(`${msg}\n\n실패한 셀러코드:\n${failed.map(it => it.sellerCode).join(", ")}\n\n실패한 상품은 목록에 남아있으니 다시 시도할 수 있습니다.`);
    } else {
        summary.style.color = "#1a7a1a";
        alert(msg);
    }
    document.getElementById("barcode").focus();
}
