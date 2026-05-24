import { refineInputValue, getProductByBarcode } from './aGlobalMain.js';

const API_BASE = 'https://fastapi-inventory-689177215560.asia-northeast3.run.app';

let currentSellerCode = null;

document.addEventListener("DOMContentLoaded", function () {
    const barcodeForm = document.getElementById("searchByBarcodeForm");
    const sellerCodeForm = document.getElementById("searchBySellerCodeForm");
    const barcodeInput = document.getElementById("barcode");
    const sellerCodeInput = document.getElementById("sellerCode");
    const disableArea = document.getElementById("disableArea");
    const disableBtn = document.getElementById("disableBtn");

    barcodeInput.focus();

    barcodeForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        let barcode = barcodeInput.value;
        barcode = refineInputValue(barcode);
        await searchProductByBarcode(barcode);
        barcodeInput.value = '';
        barcodeInput.focus();
    });

    sellerCodeForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        let sellerCode = sellerCodeInput.value.trim();
        await searchAndDisplayBySellerCode(sellerCode);
        sellerCodeInput.value = '';
        barcodeInput.focus();
    });

    disableBtn.addEventListener("click", async function () {
        if (!currentSellerCode) {
            alert("먼저 바코드로 상품을 검색하세요.");
            return;
        }

        const confirmed = confirm(
            `[${currentSellerCode}] 상품의 모든 옵션 재고를 0으로 만들고 판매중지 처리합니다.\n계속하시겠습니까?`
        );
        if (!confirmed) return;

        disableBtn.disabled = true;
        disableBtn.textContent = "처리 중...";

        try {
            const result = await disableAllOptions(currentSellerCode);
            if (result) {
                document.getElementById("message").innerHTML =
                    `<p style="color: green; font-weight: bold;">판매중지 완료: ${currentSellerCode}</p>`;
            }
        } catch (error) {
            console.error("판매중지 처리 실패:", error);
            document.getElementById("message").innerHTML =
                `<p style="color: red;">판매중지 처리 실패: ${error.message}</p>`;
        } finally {
            disableBtn.disabled = false;
            disableBtn.textContent = "판매중지 (모든 옵션 재고 0 + 판매중지)";
        }
    });
});

async function searchProductByBarcode(barcode) {
    const resultDiv = document.getElementById("result");
    const disableArea = document.getElementById("disableArea");
    const messageDiv = document.getElementById("message");
    messageDiv.innerHTML = "";

    try {
        const productsFound = await getProductByBarcode(barcode);

        if (!productsFound) {
            resultDiv.innerHTML = "<p>No product found with the given barcode!</p>";
            disableArea.style.display = "none";
            currentSellerCode = null;
            return;
        }

        const sellerCode = productsFound.SellerCode.replace("SET_", "");
        currentSellerCode = sellerCode;

        const docRef = window.db.collection("Products").doc(sellerCode);
        const setDocRef = window.db.collection("Products").doc("SET_" + sellerCode);
        const [docSnap, setDocSnap] = await Promise.all([docRef.get(), setDocRef.get()]);

        const productData = docSnap.exists ? docSnap.data() : null;
        const setProductData = setDocSnap.exists ? setDocSnap.data() : null;

        if (productData) {
            displayProductData(productData, setProductData);
            disableArea.style.display = "block";
        } else {
            resultDiv.innerHTML = "<p>No such product found!</p>";
            disableArea.style.display = "none";
            currentSellerCode = null;
        }
    } catch (error) {
        console.error("Error searching product:", error);
        resultDiv.innerHTML = "<p>Error getting document</p>";
        disableArea.style.display = "none";
        currentSellerCode = null;
    }
}

async function searchAndDisplayBySellerCode(sellerCode) {
    const resultDiv = document.getElementById("result");
    const disableArea = document.getElementById("disableArea");
    const messageDiv = document.getElementById("message");
    messageDiv.innerHTML = "";

    if (sellerCode.includes("SET_")) {
        sellerCode = sellerCode.replace("SET_", "");
    }

    try {
        const docRef = window.db.collection("Products").doc(sellerCode);
        const setDocRef = window.db.collection("Products").doc("SET_" + sellerCode);
        const [docSnap, setDocSnap] = await Promise.all([docRef.get(), setDocRef.get()]);

        const productData = docSnap.exists ? docSnap.data() : null;
        const setProductData = setDocSnap.exists ? setDocSnap.data() : null;

        if (productData) {
            currentSellerCode = sellerCode;
            displayProductData(productData, setProductData);
            disableArea.style.display = "block";
        } else {
            resultDiv.innerHTML = "<p>No such product found!</p>";
            disableArea.style.display = "none";
            currentSellerCode = null;
        }
    } catch (error) {
        console.error("Error searching product:", error);
        resultDiv.innerHTML = "<p>Error getting document</p>";
        disableArea.style.display = "none";
        currentSellerCode = null;
    }
}

async function setAllCountsToZero(sellerCode) {
    const db = window.db;

    const productDoc = await db.collection('Products').doc(sellerCode).get();
    if (productDoc.exists) {
        const optionDatas = productDoc.data().OptionDatas;
        for (const optionName in optionDatas) {
            optionDatas[optionName].Counts = 0;
        }
        await db.collection('Products').doc(sellerCode).update({ OptionDatas: optionDatas });
        console.log(`Firestore 재고 0 처리 완료: ${sellerCode}`);
    }

    const setSellerCode = "SET_" + sellerCode;
    const setDoc = await db.collection('Products').doc(setSellerCode).get();
    if (setDoc.exists && setDoc.data().OptionDatas) {
        const setOptionDatas = setDoc.data().OptionDatas;
        for (const optionName in setOptionDatas) {
            setOptionDatas[optionName].Counts = 0;
        }
        await db.collection('Products').doc(setSellerCode).update({ OptionDatas: setOptionDatas });
        console.log(`Firestore 재고 0 처리 완료: ${setSellerCode}`);
    }
}

async function disableAllOptions(sellerCode) {
    const url = `${API_BASE}/api/inventory/disable-all-options`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller_code: sellerCode }),
    });

    const result = await response.json();

    if (response.ok) {
        console.log("판매중지 성공:", result);
        await setAllCountsToZero(sellerCode);
        alert(`성공: ${result.message} (${result.seller_code})`);
        return result;
    } else {
        console.error("판매중지 실패:", result);
        alert(`실패: ${result.message}`);
        throw new Error(result.message || "서버 응답 오류");
    }
}
