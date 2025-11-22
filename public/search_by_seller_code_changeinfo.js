// search_by_seller_code_changeinfo.js

import { getProductBySellerCode } from './aGlobalMain.js';
import { getCurrentSellerCode, getCurrentProduct } from './search_by_seller_code.js';

document.addEventListener("DOMContentLoaded", function () {
    console.log("search_by_seller_code_changeinfo loaded");

    const afterSellerCodeInput = document.getElementById("changeAfterSellerCodeInput");
    const afterCategoryInput = document.getElementById("changeAfterCategory");
    const messageDiv = document.getElementById("message");
    const changeSellerCodeForm = document.getElementById("changeSellerCodeForm");
    const changeCategoryForm = document.getElementById("changeCategoryForm");
    

    // submit 이벤트 리스너 등록
    changeSellerCodeForm?.addEventListener("submit", async function (event) {
        event.preventDefault(); // 기본 폼 제출 동작 중단

        try {
            // 1. 현재 상품 정보 가져오기
            let currentSellerCode = await getCurrentSellerCode();
            let currentProduct = await getCurrentProduct();

            let newSellerCode = afterSellerCodeInput.value; // 입력된 새로운 판매자 코드

            // 입력된 값 검증
            if (!newSellerCode || newSellerCode.trim() === "") {
                alert("변경할 판매자 코드를 입력해주세요.");
                return;
            }

            // 2. 변경 여부 확인 팝업 띄우기
            const confirmChange = confirm(
                `현재 판매자 코드: ${currentSellerCode}\n새 판매자 코드: ${newSellerCode}\n판매자 코드를 변경하시겠습니까?`
            );

            if (!confirmChange) {
                return; // 사용자가 취소하면 종료
            }

            // 3. 데이터 복사 및 업데이트
            const db = firebase.firestore(); // Firebase Firestore 객체
            const updatedProductData = {
                ...currentProduct,
                SellerCode: newSellerCode, // SellerCode 필드 업데이트
            };

            await db.collection("Products").doc(newSellerCode).set(updatedProductData);

            // 기존 데이터 삭제
            await db.collection("Products").doc(currentSellerCode).delete();

            // 4. 성공 팝업 띄우기
            alert(`판매자 코드가 ${currentSellerCode}에서 ${newSellerCode}로 성공적으로 변경되었습니다.`);

            // 화면에 메시지 표시
            messageDiv.textContent = `판매자 코드가 ${currentSellerCode}에서 ${newSellerCode}로 변경되었습니다.`;

        } catch (error) {
            console.error("에러 발생:", error);
            alert("판매자 코드 변경 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
    });

    changeCategoryForm?.addEventListener("submit", async function (event) {
        event.preventDefault(); // 기본 폼 제출 동작 중단
        try {
            // 1. 현재 상품 정보 가져오기
            let currentSellerCode = await getCurrentSellerCode();
            let currentProduct = await getCurrentProduct();

            let newCategoryInput = afterCategoryInput.value; // 입력된 새로운 판매자 코드

            // 입력된 값 검증
            if (!newCategoryInput || newCategoryInput.trim() === "") {
                alert("변경할 카테고리를 입력해주세요.");
                return;
            }

            // 2. 변경 여부 확인 팝업 띄우기
            const confirmChange = confirm(
                `현재 카테고리: ${currentProduct.소분류명}\n를 새 카테고리: ${newCategoryInput}\n로 변경하시겠습니까?`
            );

            if (!confirmChange) {
                return; // 사용자가 취소하면 종료
            }

            // 3. 소분류명 값 변경. 소분류명은 키값이 아니기때문에 필드만 변경
            const db = firebase.firestore(); // Firebase Firestore 객체
            await db.collection("Products").doc(currentSellerCode).update({
                소분류명: newCategoryInput, // 새로운 카테고리 값으로 업데이트
            });

            // 4. 성공 팝업 띄우기
            alert(`카테고리가 성공적으로 ${currentProduct.소분류명}에서 ${newCategoryInput}로 변경되었습니다.`);

        } catch (error) {
            console.error("에러 발생:", error);
            alert("카테고리 변경 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
    });
});

