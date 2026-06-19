// search_by_barcode_changeinfo.js

import { getProductBySellerCode, changeSellerCodeAtomic } from './aGlobalMain.js';
import { getCurrentSellerCode, getCurrentProduct, searchProductBySellerCode } from './search_by_barcode.js';
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
            const currentSellerCode = await getCurrentSellerCode();
            const newSellerCode = afterSellerCodeInput.value.trim();
            const withCategory = document.getElementById("changeSellerCodeWithCategory").checked;

            if (!newSellerCode) {
                alert("변경할 판매자 코드를 입력해주세요.");
                return;
            }

            // 확인창용 새 입고차수 미리보기 (실제 적용은 원자적 함수 내부에서 동일 규칙으로)
            let newCategoryPreview = null;
            if (withCategory) {
                const prefix = newSellerCode.split("_")[0];
                newCategoryPreview = /^\d+$/.test(prefix) ? `${prefix}차입고` : prefix;
            }
            const confirmMsg = withCategory
                ? `현재 판매자 코드: ${currentSellerCode}\n새 판매자 코드: ${newSellerCode}\n새 입고차수: ${newCategoryPreview}\n판매자 코드와 입고차수를 변경하시겠습니까?`
                : `현재 판매자 코드: ${currentSellerCode}\n새 판매자 코드: ${newSellerCode}\n판매자 코드를 변경하시겠습니까?`;
            if (!confirm(confirmMsg)) return;

            if (messageDiv) messageDiv.textContent = "변경 중... (스마트스토어 반영 포함, 수 초 소요)";

            // 원자적 변경(새 코드 충돌 검사 + batch set/delete + 캐시 무효화) + 스마트스토어 코드 변경 — 공용 로직
            const { newCategory, oldCategory, storeNote } =
                await changeSellerCodeAtomic(currentSellerCode, newSellerCode, withCategory, lockImageURLs);

            const msg = (withCategory
                ? `판매자 코드: ${currentSellerCode} → ${newSellerCode}, 입고차수: ${oldCategory} → ${newCategory} 변경 완료`
                : `판매자 코드: ${currentSellerCode} → ${newSellerCode} 변경 완료`) + (storeNote || '');
            alert(msg);
            messageDiv.textContent = msg;

            // 새 셀러코드로 화면 갱신
            await searchProductBySellerCode(newSellerCode);

        } catch (error) {
            console.error("에러 발생:", error);
            alert("판매자 코드 변경 실패: " + error.message);
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

            // 화면 갱신
            await searchProductBySellerCode(currentSellerCode);

        } catch (error) {
            console.error("에러 발생:", error);
            alert("카테고리 변경 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
    });
});
