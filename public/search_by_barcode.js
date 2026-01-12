import { searchByBarcode } from './barcode_search.js';
//import { displayProductData } from './displayProductData.js';
import { refineInputValue, getProductByBarcode, getProductBySellerCode } from './aGlobalMain.js';

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
        await searchProductByBarcode(barcode)        
        barcodeInput.value = '';
    });
});


async function searchProductByBarcode(barcode) {
    const resultDiv = document.getElementById("result");
    try {
        const productsFound = await getProductByBarcode (barcode);
        console.log(productsFound);
        //const productsFound = await searchByBarcode(barcode, db);
        console.log("1");
        console.log(productsFound.SellerCode);

        if (!productsFound) {
            resultDiv.innerHTML = "<p>No product found with the given barcode!</p>";
        } else {              
            console.log("2");
            console.log(productsFound.SellerCode);            
            await searchProductBySellerCode(productsFound.SellerCode)
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

        console.log("3");
        console.log(sellerCode);

        if(sellerCode.includes("SET_")) {
            sellerCode = sellerCode.replace("SET_", "");
        }

        currentSellercode = sellerCode;
        // Firestore에서 문서 참조 가져오기
        // sellerCode와 "SET_"+sellerCode 둘 다 가져오기
        
        // const docRef = window.db.collection("Products").doc(sellerCode);
        // const setDocRef = window.db.collection("Products").doc("SET_" + sellerCode);

        // // 두 문서를 동시에 가져옴
        // const [docSnap, setDocSnap] = await Promise.all([docRef.get(), setDocRef.get()]);
        console.log(sellerCode);
        console.log("SET_" + sellerCode);
        const currentProduct = await getProductBySellerCode (sellerCode);
        const currentSellerCodeSet = await getProductBySellerCode ("SET_" + sellerCode);

        // 문서가 존재하면 데이터 표시, 아니면 "No such product found!" 메시지 표시
        if (currentProduct) {
            console.log("docSnap.exists");
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
