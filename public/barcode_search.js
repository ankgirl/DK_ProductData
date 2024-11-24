// barcode_search.js
import { getProductByBarcode } from './aGlobalMain.js';


export async function searchByBarcode(barcode, db) {
    try {
        const allDocsSnapshot = await db.collection('Products').get();
        let productsFound = [];

        allDocsSnapshot.forEach(doc => {
            const data = doc.data();
            // 제품의 바코드 필드 확인
            if (data.Barcode === barcode) {
                productsFound.push({ id: doc.id, ...data, matchedOption: null });
            }
            // 각 옵션의 바코드 필드 확인
            if (data.OptionDatas) {
                for (let option in data.OptionDatas) {
                    if (data.OptionDatas[option].바코드 === barcode) {
                        productsFound.push({ id: doc.id, ...data, matchedOption: option });
                        break;
                    }
                }
            }
        });

        return productsFound.length > 0 ? productsFound : null;
    } catch (error) {
        console.error("Error getting documents:", error);
        throw new Error("Error getting document");
    }
}





export async function updateProductCounts(barcode, quantity, db) {
    try {
        console.log("Starting updateProductCounts function");
        console.log("Received barcode:", barcode);
        console.log("Received quantity:", quantity);

        const productsFound = await searchByBarcode(barcode, db);
        console.log("Products found:", productsFound);

        if (!productsFound) {
            throw new Error("No product found with the given barcode");
        }

        const product = productsFound[0];
        let updatedCounts;
        console.log("Found product:", product);

        if (product.OptionDatas) {
            console.log("Product has OptionDatas");
            for (let optionKey in product.OptionDatas) {
                console.log(`Checking optionKey: ${optionKey}`);
                if (product.OptionDatas[optionKey].바코드 === barcode) {
                    console.log(`Matching barcode found in OptionDatas with optionKey: ${optionKey}`);
                    const currentCounts = product.OptionDatas[optionKey].Counts || 0;
                    updatedCounts = currentCounts - quantity;
                    product.OptionDatas[optionKey].Counts = updatedCounts;
                    console.log(`Updated counts for optionKey ${optionKey}:`, updatedCounts);
                }
            }
        } else {
            console.log("Product does not have OptionDatas");
            const currentCounts = product.Counts || 0;
            updatedCounts = currentCounts - quantity;
            product.Counts = updatedCounts;
            console.log("Updated product counts:", updatedCounts);
        }

        await db.collection('Products').doc(product.id).set(product, { merge: true });
        console.log("Updated product in DB:", product);

        return updatedCounts;
    } catch (error) {
        console.error("Error updating product counts:", error);
        throw new Error("Error updating product counts");
    }
}

export async function updateSetProductCounts(sellerCode, quantity, db) {
    try {
        console.log("Starting updateProductCounts function");
        console.log("Received sellerCode:", sellerCode);
        console.log("Received quantity:", quantity);

        //const productsFound  = await db.collection('Products').doc(sellerCode).get();
        const product = await getProductByBarcode (barcode);
        console.log("Products found:", product);
        console.error("Products found:", product);

        // if (!productsFound) {
        //     throw new Error("No product found with the given barcode");
        // }
        
        // const product = productsFound.data();
        let updatedCounts;
        const currentCounts = product.OptionDatas["옵션1"].Counts || 0;
        console.log("currentCounts", currentCounts);
        updatedCounts = currentCounts - quantity;
        console.log("updatedCounts", updatedCounts);
        product.OptionDatas["옵션1"].Counts = updatedCounts;
        console.log("Products", product);        
        await db.collection('Products').doc(sellerCode).set(product, { merge: true });
        console.log("Updated product in DB:", product);
        return updatedCounts;
    } catch (error) {
        console.error("Error updating product counts:", error);
        throw new Error("Error updating product counts");
    }
}
