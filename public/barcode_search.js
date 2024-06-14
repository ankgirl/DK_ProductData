// barcode_search.js
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
        const productsFound = await searchByBarcode(barcode, db);
        if (!productsFound) {
            throw new Error("No product found with the given barcode");
        }

        const product = productsFound[0];
        let updatedCounts;
        console.log("barcode: ", barcode);
        console.log("quantity: ", quantity);
        console.log("product: ", product);

        if (product.OptionDatas) {
            for (let optionKey in product.OptionDatas) {
                if (product.OptionDatas[optionKey].바코드 === barcode) {
                    updatedCounts = (product.OptionDatas[optionKey].Counts || 0) - quantity;
                    product.OptionDatas[optionKey].Counts = updatedCounts;
                }
            }
        } else {
            updatedCounts = (product.Counts || 0) - quantity;
            product.Counts = updatedCounts;
        }
        console.log("updatedCounts: ", updatedCounts);
        console.log("product.Counts: ", product.Counts);

        await db.collection('Products').doc(product.id).set(product, { merge: true });
        console.log("Updated product in DB: ", product);
        return updatedCounts;
    } catch (error) {
        console.error("Error updating product counts:", error);
        throw new Error("Error updating product counts");
    }
}
