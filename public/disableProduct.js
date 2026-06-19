// disableProduct.js — "모든 옵션 재고 0 + 판매중지" 공용 로직 (비모듈 전역).
// disable_by_barcode 페이지와 셀러코드/바코드 검색 페이지(displayProductData 인라인 버튼)가 공유한다.
// 같은 로직을 복사하지 않기 위해 한 곳(여기)에서만 정의.

(function () {
    "use strict";

    const API_BASE = "https://fastapi-inventory-689177215560.asia-northeast3.run.app";

    // Firestore 재고(Counts) 0 처리 (일반 + SET_)
    async function setAllCountsToZero(sellerCode) {
        const db = window.db;

        const productDoc = await db.collection("Products").doc(sellerCode).get();
        if (productDoc.exists) {
            const optionDatas = productDoc.data().OptionDatas;
            for (const optionName in optionDatas) {
                optionDatas[optionName].Counts = 0;
            }
            await db.collection("Products").doc(sellerCode).update({ OptionDatas: optionDatas });
            console.log(`Firestore 재고 0 처리 완료: ${sellerCode}`);
        }

        const setSellerCode = "SET_" + sellerCode;
        const setDoc = await db.collection("Products").doc(setSellerCode).get();
        if (setDoc.exists && setDoc.data().OptionDatas) {
            const setOptionDatas = setDoc.data().OptionDatas;
            for (const optionName in setOptionDatas) {
                setOptionDatas[optionName].Counts = 0;
            }
            await db.collection("Products").doc(setSellerCode).update({ OptionDatas: setOptionDatas });
            console.log(`Firestore 재고 0 처리 완료: ${setSellerCode}`);
        }
    }

    async function disableAllOptions(sellerCode) {
        const url = `${API_BASE}/api/inventory/disable-all-options`;

        async function disableOne(code) {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ seller_code: code }),
            });
            const result = await response.json();
            return { ok: response.ok, result };
        }

        // 1. 일반 상품 판매중지
        const main = await disableOne(sellerCode);
        if (!main.ok) {
            console.error("판매중지 실패:", main.result);
            alert(`실패: ${main.result.message}`);
            throw new Error(main.result.message || "서버 응답 오류");
        }
        console.log("판매중지 성공:", main.result);

        // 2. SET_ 상품이 Firestore에 존재하면 SmartStore에도 판매중지 호출
        const setCode = "SET_" + sellerCode;
        const setDoc = await window.db.collection("Products").doc(setCode).get();
        let setMsg = "";
        if (setDoc.exists) {
            try {
                const setRes = await disableOne(setCode);
                if (setRes.ok) {
                    console.log("SET_ 판매중지 성공:", setRes.result);
                    setMsg = `\nSET_ 처리: ${setRes.result.message}`;
                } else {
                    console.warn("SET_ 판매중지 실패:", setRes.result);
                    setMsg = `\nSET_ 처리 실패: ${setRes.result.message}`;
                }
            } catch (e) {
                console.warn("SET_ 판매중지 호출 오류:", e);
                setMsg = `\nSET_ 호출 오류: ${e.message}`;
            }
        }

        // 3. Firestore 재고 0 처리 (일반 + SET_)
        await setAllCountsToZero(sellerCode);

        alert(`성공: ${main.result.message} (${main.result.seller_code})${setMsg}`);
        return main.result;
    }

    window.disableProduct = { setAllCountsToZero, disableAllOptions };
})();
