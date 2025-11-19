import { searchByBarcode } from './barcode_search.js';
//import { displayProductData } from './displayProductData.js';
import { refineInputValue } from './aGlobalMain.js';

let currentSellercode = null;
let currentProduct = null;
let currentSellerCodeSet = null;

document.addEventListener("DOMContentLoaded", function() {


    const searchForm = document.getElementById("searchForm");

    // <input> 요소에 포커스 설정
    const barcodeInput = document.getElementById("barcode");
    barcodeInput.focus();
    

    searchForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        let barcode = barcodeInput.value;
        barcode = refineInputValue(barcode);
        searchProductByBarcode(barcode)
        barcodeInput.value = '';
    });
});


async function searchProductByBarcode(barcode) {
    const resultDiv = document.getElementById("result");
    try {
        const productsFound = await searchByBarcode(barcode, db);

        if (!productsFound) {
            resultDiv.innerHTML = "<p>No product found with the given barcode!</p>";
        } else if (productsFound.length === 1) {              
            searchProductBySellerCode(productsFound[0].SellerCode)
        }
    } catch (error) {
        console.error("Error getting documents:", error);
        resultDiv.innerHTML = "<p>Error getting document</p>";
    }
}
export function getCurrentSellerCode() {
    return currentSellercode;
}
export function getCurrentProduct() {
    return currentProduct;
}


async function searchProductBySellerCode(sellerCode) {
    try {

        if(sellerCode.includes("SET_")) {
            sellerCode = sellerCode.replace("SET_", "");
        }

        currentSellercode = sellerCode;
        // Firestore에서 문서 참조 가져오기
        // sellerCode와 "SET_"+sellerCode 둘 다 가져오기
        const docRef = window.db.collection("Products").doc(sellerCode);
        const setDocRef = window.db.collection("Products").doc("SET_" + sellerCode);

        // 두 문서를 동시에 가져옴
        const [docSnap, setDocSnap] = await Promise.all([docRef.get(), setDocRef.get()]);

        // 문서가 존재하면 데이터 표시, 아니면 "No such product found!" 메시지 표시
        if (docSnap.exists) {
            currentProduct = docSnap.data();
            currentSellerCodeSet = setDocSnap.data();
            displayProductData(currentProduct, currentSellerCodeSet);
        } else {
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = "<p>No such product found!</p>";
        }
    } catch (error) {
        console.error("Error getting document:", error);
        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = "<p>Error getting document</p>";
    }
}
