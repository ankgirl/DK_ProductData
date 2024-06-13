// barcode_search.js
export async function searchByBarcode(barcode, db) {
    try {
        const allDocsSnapshot = await db.collection('Products').get();
        let productsFound = [];

        allDocsSnapshot.forEach(doc => {
            const data = doc.data();
            // 제품의 바코드 필드 확인
            if (data.Barcode === barcode) {
                productsFound.push(data);
            }
            // 각 옵션의 바코드 필드 확인
            if (data.OptionDatas) {
                for (let option in data.OptionDatas) {
                    if (data.OptionDatas[option].바코드 === barcode) {
                        productsFound.push(data);
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
