// search_by_barcode_changeinfo.js

import { getProductBySellerCode } from './aGlobalMain.js';
import { getCurrentSellerCode, getCurrentProduct } from './search_by_barcode.js';
import { generateImageURLs } from './generateImageURLs.js';

// 변경 전 셀러코드/소분류명으로 이미지 URL을 OptionDatas에 고정
function lockImageURLs(product) {
    if (!product.OptionDatas) return product;
    const 입고차수 = product.소분류명;
    const updatedOptionDatas = { ...product.OptionDatas };
    for (const optionName of Object.keys(updatedOptionDatas)) {
        if (!updatedOptionDatas[optionName].옵션이미지URL) {
            const option = optionName.replace('선택: ', '');
            const { 보여주기용옵션명, 옵션이미지URL, 실제이미지URL } = generateImageURLs(
                product.SellerCode, option, 입고차수, product.GroupOptions
            );
            updatedOptionDatas[optionName] = {
                ...updatedOptionDatas[optionName],
                옵션이미지URL,
                실제이미지URL,
                보여주기용옵션명,
            };
        }
    }
    return { ...product, OptionDatas: updatedOptionDatas };
}

document.addEventListener("DOMContentLoaded", function () {

    const afterSellerCodeInput = document.getElementById("changeAfterSellerCodeInput");
    const afterCategoryInput = document.getElementById("changeAfterCategory");
    const messageDiv = document.getElementById("message");
    const changeSellerCodeForm = document.getElementById("changeSellerCodeForm");
    const changeCategoryForm = document.getElementById("changeCategoryForm");

    changeSellerCodeForm?.addEventListener("submit", async function (event) {
        event.preventDefault();

        try {
            let currentSellerCode = await getCurrentSellerCode();

            let newSellerCode = afterSellerCodeInput.value.trim();
            const withCategory = document.getElementById("changeSellerCodeWithCategory").checked;

            if (!newSellerCode) {
                alert("변경할 판매자 코드를 입력해주세요.");
                return;
            }

            // Firestore에서 직접 최신 데이터 fetch
            const db = firebase.firestore();
            const docSnap = await db.collection("Products").doc(currentSellerCode).get();
            if (!docSnap.exists) {
                alert("현재 상품 데이터를 찾을 수 없습니다. 다시 검색해주세요.");
                return;
            }
            const currentProduct = docSnap.data();

            // 입고차수 계산 (체크박스 체크 시)
            let newCategory = null;
            if (withCategory) {
                const prefix = newSellerCode.split("_")[0];
                newCategory = /^\d+$/.test(prefix) ? `${prefix}차입고` : prefix;
            }

            const confirmMsg = withCategory
                ? `현재 판매자 코드: ${currentSellerCode}\n새 판매자 코드: ${newSellerCode}\n현재 입고차수: ${currentProduct.소분류명}\n새 입고차수: ${newCategory}\n판매자 코드와 입고차수를 변경하시겠습니까?`
                : `현재 판매자 코드: ${currentSellerCode}\n새 판매자 코드: ${newSellerCode}\n판매자 코드를 변경하시겠습니까?`;

            if (!confirm(confirmMsg)) return;

            const productWithLockedImages = lockImageURLs(currentProduct);
            const updatedProductData = {
                ...productWithLockedImages,
                SellerCode: newSellerCode,
                ...(withCategory && { 소분류명: newCategory }),
            };

            await db.collection("Products").doc(newSellerCode).set(updatedProductData);
            await db.collection("Products").doc(currentSellerCode).delete();

            const msg = withCategory
                ? `판매자 코드: ${currentSellerCode} → ${newSellerCode}, 입고차수: ${currentProduct.소분류명} → ${newCategory} 변경 완료`
                : `판매자 코드: ${currentSellerCode} → ${newSellerCode} 변경 완료`;

            alert(msg);
            messageDiv.textContent = msg;

        } catch (error) {
            console.error("에러 발생:", error);
            alert("판매자 코드 변경 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
    });

    changeCategoryForm?.addEventListener("submit", async function (event) {
        event.preventDefault();
        try {
            let currentSellerCode = await getCurrentSellerCode();
            let currentProduct = await getCurrentProduct();

            let newCategoryInput = afterCategoryInput.value;

            if (!newCategoryInput || newCategoryInput.trim() === "") {
                alert("변경할 카테고리를 입력해주세요.");
                return;
            }

            const confirmChange = confirm(
                `현재 카테고리: ${currentProduct.소분류명}\n를 새 카테고리: ${newCategoryInput}\n로 변경하시겠습니까?`
            );

            if (!confirmChange) {
                return;
            }

            const db = firebase.firestore();
            await db.collection("Products").doc(currentSellerCode).update({
                소분류명: newCategoryInput,
            });

            alert(`카테고리가 성공적으로 ${currentProduct.소분류명}에서 ${newCategoryInput}로 변경되었습니다.`);

        } catch (error) {
            console.error("에러 발생:", error);
            alert("카테고리 변경 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
    });
});
