// barcode_search.js
import {getProductBySellerCode } from './aGlobalMain.js';


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
                        console.log(data.OptionDatas)
                        productsFound.push({
                            id: doc.id,
                            ...data,
                            matchedOption: option,                            
                            GroupOptions: data.GroupOptions // 전체 옵션 데이터를 포함
                        });                        
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

        // set(merge) 대신 변경된 필드만 update → 없는 문서를 되살리지 않음(부활 차단)
        if (product.OptionDatas) {
            await db.collection('Products').doc(product.id).update({ OptionDatas: product.OptionDatas });
        } else {
            await db.collection('Products').doc(product.id).update({ Counts: product.Counts });
        }
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


        // in-memory productMap이 아닌 Firebase에서 직접 읽어 최신 Counts 사용
        const productDoc = await db.collection('Products').doc(sellerCode).get();
        if (!productDoc.exists) throw new Error(`Product ${sellerCode} not found`);
        const product = { id: sellerCode, ...productDoc.data() };
        console.log("Products found:", product);

        let updatedCounts;
        const currentCounts = product.OptionDatas["옵션1"].Counts || 0;
        console.log("currentCounts", currentCounts);
        updatedCounts = currentCounts - quantity;
        console.log("updatedCounts", updatedCounts);
        product.OptionDatas["옵션1"].Counts = updatedCounts;
        console.log("Products", product);
        // 이미 위에서 존재 확인(get)했고, set(merge) 대신 OptionDatas만 update → 되살림 없음
        await db.collection('Products').doc(sellerCode).update({ OptionDatas: product.OptionDatas });
        console.log("Updated product in DB:", product);
        return updatedCounts;
    } catch (error) {
        console.error("Error updating product counts:", error);
        throw new Error("Error updating product counts");
    }
}
