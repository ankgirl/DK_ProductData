import { refineInputValue, getProductByBarcode } from './aGlobalMain.js';
import { esc, copyWithFeedback, setRowStatus, runBatchSequential } from './batchScanShared.js';

// 취소·반품 처리(여러 개 한꺼번에):
//  - 바코드를 연속으로 찍으면, 그 바코드의 "단품 옵션"이 목록에 쌓인다(같은 옵션 또 찍으면 수량 +1 누적).
//  - "전체 수량 추가 처리"를 누르면 목록을 하나씩 순차대로 처리 → 각 옵션 재고에 그 수량만큼 더하고
//    스마트스토어(네이버)에도 반영(pushOptionStockToSmartStore, 수량추가 시 쓰는 API).
// 스캔목록/복사/순차처리 뼈대는 공용 batchScanShared.js (판매중지 페이지와 공유).

const items = [];          // [{ sellerCode, option, optionName, name, img, before, qty, status, els:{...} }]
const byKey = new Map();   // 'sellerCode|option' -> item  (같은 옵션은 한 행에 수량 누적)
const keyOf = (code, option) => code + '|' + option;

// Firestore 필드 단위 저장 (다른 옵션/세트/바코드는 불변) — 재입고 스캔과 동일 방식.
function saveField(docId, pathSegments, value) {
    const fp = new firebase.firestore.FieldPath(...pathSegments);
    return window.db.collection('Products').doc(docId).update(fp, value);
}

document.addEventListener("DOMContentLoaded", function () {
    const barcodeForm = document.getElementById("searchByBarcodeForm");
    const barcodeInput = document.getElementById("barcode");
    const processBtn = document.getElementById("processBtn");
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

    clearAllBtn.addEventListener("click", function () {
        if (items.length && !confirm("목록을 모두 비우시겠습니까?")) return;
        items.length = 0;
        byKey.clear();
        renderTable();
        setMsg("");
        document.getElementById("summary").textContent = "";
        barcodeInput.focus();
    });

    processBtn.addEventListener("click", processAll);
    copyCodesBtn.addEventListener("click", copyAllCodes);
});

function setMsg(html, color = "#333") {
    const el = document.getElementById("scanMsg");
    el.style.color = color;
    el.innerHTML = html;
}

// ---- 목록에 추가 (바코드 → 단품 옵션) ----
async function addByBarcode(barcode) {
    let product;
    try {
        product = await getProductByBarcode(barcode);
    } catch (e) {
        console.error("바코드 조회 실패:", e);
        setMsg(`❌ 바코드 조회 오류: ${esc(e.message)}`, "#c0392b");
        return;
    }
    if (!product) {
        setMsg(`❌ 바코드 <b>${esc(barcode)}</b> — 상품을 찾을 수 없습니다.`, "#c0392b");
        return;
    }

    const rawCode = String(product.SellerCode || product.id || "");
    if (rawCode.startsWith("SET_")) {
        setMsg(`⛔ <b>${esc(barcode)}</b> 는 세트(SET_) 바코드입니다. 취소·반품은 단품만 처리합니다.`, "#c0392b");
        return;
    }
    const option = product.matchedOption;
    if (!option) {
        setMsg(`⛔ <b>${esc(barcode)}</b> 는 옵션 바코드가 아닙니다. (단품 옵션 바코드를 찍어주세요)`, "#c0392b");
        return;
    }

    const sellerCode = rawCode.replace(/^SET_/, "");
    const key = keyOf(sellerCode, option);
    const disp = window.ImageUrlUtils
        ? window.ImageUrlUtils.optionImage(product, option)
        : { 옵션이미지URL: '', 실제이미지URL: '', 보여주기용옵션명: option };
    const optionName = disp.보여주기용옵션명 || option;
    const before = Number((product.OptionDatas && product.OptionDatas[option] || {}).Counts) || 0;

    let item = byKey.get(key);
    if (item) {
        // 이미 목록에 있는 옵션: 완료된 건은 "새 추가"로 초기화(중복가산 방지), 대기/실패면 수량 누적.
        if (item.status === "완료") { item.qty = 1; }
        else { item.qty += 1; }
        item.before = before;
        setRowStatus(item, "대기");
    } else {
        item = {
            sellerCode, option, optionName,
            name: product.스토어키워드네임 || product.상품명 || "",
            img: disp.옵션이미지URL || disp.실제이미지URL || (window.getMainImage ? window.getMainImage(product) : ""),
            before, qty: 1, status: "대기", els: {},
        };
        items.push(item);
        byKey.set(key, item);
    }
    renderTable();
    setMsg(`➕ ${esc(item.name || sellerCode)} · <b>${esc(optionName)}</b> (${esc(sellerCode)}) — 추가수량 <b>${item.qty}</b>`, "#1a7a1a");
    if (typeof window.playDingDong === "function") { try { window.playDingDong(); } catch (e) {} }
}

// ---- 목록의 셀러코드(중복 제거)를 콤마로 이어 복사 ----
async function copyAllCodes() {
    if (items.length === 0) return;
    const codeList = [...new Set(items.map(it => it.sellerCode))];
    const codes = codeList.join(",");
    await copyWithFeedback(document.getElementById("copyCodesBtn"), codes, {
        restoreLabel: `셀러코드 전체 복사 (${codeList.length})`,
        doneLabel: `복사됨! (${codeList.length}개)`,
        setMsg,
        okMsg: `📋 셀러코드 ${codeList.length}개 복사됨: ${esc(codes)}`,
        failMsg: "❌ 클립보드 복사에 실패했습니다.",
    });
}

// ---- 목록 렌더링 ----
function renderTable() {
    const tbody = document.getElementById("scanTableBody");
    const uniqueCodes = new Set(items.map(it => it.sellerCode)).size;
    const totalQty = items.reduce((s, it) => s + it.qty, 0);
    const processBtn = document.getElementById("processBtn");
    const copyBtn = document.getElementById("copyCodesBtn");
    processBtn.textContent = `전체 수량 추가 처리 (${items.length}옵션 · +${totalQty})`;
    processBtn.disabled = items.length === 0;
    copyBtn.textContent = `셀러코드 전체 복사 (${uniqueCodes})`;
    copyBtn.disabled = items.length === 0;

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="color:#999; padding:20px;">아직 찍은 상품이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    items.forEach((item, idx) => {
        const tr = document.createElement("tr");
        const done = item.status === "완료";
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${item.img ? `<img src="${esc(item.img)}" alt="${esc(item.option)}" onerror="tryAlternativeExtension(this)">` : '<span style="color:#bbb;">없음</span>'}</td>
            <td class="name-cell">${esc(item.name) || '<span style="color:#bbb;">(이름 없음)</span>'}</td>
            <td>${esc(item.optionName)}</td>
            <td>${esc(item.sellerCode)}</td>
            <td class="qty-cell">
                ${done ? '' : '<button type="button" class="qty-btn" data-d="-1">−</button>'}
                <span class="qty-val">+${item.qty}</span>
                ${done ? '' : '<button type="button" class="qty-btn" data-d="1">＋</button>'}
            </td>
            <td class="stock-cell">${item.after != null ? `${item.before} → <b>${item.after}</b>` : `<span style="color:#999;">현재 ${item.before}</span>`}</td>
            <td class="status-cell"></td>
            <td><button type="button" class="row-remove" title="이 옵션 제거">✕</button></td>
        `;
        item.els.statusCell = tr.querySelector(".status-cell");
        item.els.stockCell = tr.querySelector(".stock-cell");
        setRowStatus(item, item.status);

        tr.querySelectorAll(".qty-btn").forEach(btn => {
            btn.addEventListener("click", () => bumpQty(item, parseInt(btn.dataset.d, 10)));
        });
        tr.querySelector(".row-remove").addEventListener("click", () => removeItem(item));
        tbody.appendChild(tr);
    });
}

function bumpQty(item, delta) {
    if (item.status === "완료") return;      // 완료 건은 ± 불가(다시 찍으면 새 추가로 시작)
    item.qty = Math.max(1, item.qty + delta);
    renderTable();
    document.getElementById("barcode").focus();
}

function removeItem(item) {
    const idx = items.indexOf(item);
    if (idx === -1) return;
    items.splice(idx, 1);
    byKey.delete(keyOf(item.sellerCode, item.option));
    renderTable();
    document.getElementById("barcode").focus();
}

// ---- 항목별 처리: 그 옵션 재고에 qty 만큼 더하고 스마트스토어에 반영 ----
// 순서(스마트스토어 → DB)는 둘 다 "절대값" 저장이라 멱등: 중간 실패 시 DB 미변경으로 재시도해도 중복가산 없음.
async function addOneToOption(item) {
    const ref = window.db.collection("Products").doc(item.sellerCode);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`상품(${item.sellerCode}) 문서 없음`);
    const od = snap.data().OptionDatas || {};
    if (!od[item.option]) throw new Error(`옵션 '${item.option}' 없음`);

    const current = Number(od[item.option].Counts) || 0;   // 최신값을 매번 직접 읽어 stale 방지
    const after = current + item.qty;

    // 1) 스마트스토어(네이버) 옵션 재고 반영 — 실패 시 throw → DB 미변경(재시도 안전)
    await window.pushOptionStockToSmartStore(item.sellerCode, item.option, after);
    // 2) Firestore Counts 저장(필드 단위)
    await saveField(item.sellerCode, ["OptionDatas", item.option, "Counts"], after);

    item.before = current;
    item.after = after;
    if (item.els.stockCell) item.els.stockCell.innerHTML = `${current} → <b>${after}</b>`;
}

// ---- 전체 순차 처리 ----
async function processAll() {
    const pending = items.filter(it => it.status !== "완료");
    if (pending.length === 0) {
        alert("처리할 항목이 없습니다. (모두 완료됨)");
        return;
    }
    const totalQty = pending.reduce((s, it) => s + it.qty, 0);
    const confirmed = confirm(
        `총 ${pending.length}개 옵션의 재고를 더합니다. (합계 +${totalQty})\n각 옵션 재고에 표시된 수량만큼 더하고\n스마트스토어(네이버)에도 반영합니다.\n\n계속하시겠습니까?`
    );
    if (!confirmed) return;

    const processBtn = document.getElementById("processBtn");
    const clearAllBtn = document.getElementById("clearAllBtn");
    const summary = document.getElementById("summary");
    processBtn.disabled = true;
    clearAllBtn.disabled = true;

    const { success, fail, failed } = await runBatchSequential(items, {
        skipIf: it => it.status === "완료",   // 완료 건 재처리 안 함(멱등)
        action: addOneToOption,
        onProgress: (done, total) => { summary.textContent = `처리 중... (${done}/${total})`; },
    });

    processBtn.disabled = items.length === 0;
    clearAllBtn.disabled = false;
    renderTable();  // 완료행의 ± 버튼 제거 등 반영

    const msg = `취소·반품 수량 추가 완료 — 성공 ${success}건 / 실패 ${fail}건`;
    summary.textContent = msg;
    if (fail > 0) {
        summary.style.color = "#c0392b";
        alert(`${msg}\n\n실패한 옵션:\n${failed.map(it => `${it.sellerCode} [${it.optionName}]`).join("\n")}\n\n실패한 건은 목록에 남아있으니 다시 시도할 수 있습니다.`);
    } else {
        summary.style.color = "#1a7a1a";
        alert(msg);
    }
    document.getElementById("barcode").focus();
}
