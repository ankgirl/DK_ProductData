// search_by_barcode_changeinfo.js

import { getProductBySellerCode } from './aGlobalMain.js';
import { getCurrentSellerCode, getCurrentProduct } from './search_by_barcode.js';

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
            let currentProduct = await getCurrentProduct();

            let newSellerCode = afterSellerCodeInput.value;

            if (!newSellerCode || newSellerCode.trim() === "") {
                alert("변경할 판매자 코드를 입력해주세요.");
                return;
            }

            const confirmChange = confirm(
                `현재 판매자 코드: ${currentSellerCode}\n새 판매자 코드: ${newSellerCode}\n판매자 코드를 변경하시겠습니까?`
            );

            if (!confirmChange) {
                return;
            }

            const db = firebase.firestore();
            const updatedProductData = {
                ...currentProduct,
                SellerCode: newSellerCode,
            };

            await db.collection("Products").doc(newSellerCode).set(updatedProductData);
            await db.collection("Products").doc(currentSellerCode).delete();

            alert(`판매자 코드가 ${currentSellerCode}에서 ${newSellerCode}로 성공적으로 변경되었습니다.`);
            messageDiv.textContent = `판매자 코드가 ${currentSellerCode}에서 ${newSellerCode}로 변경되었습니다.`;

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
