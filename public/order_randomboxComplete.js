import { playBeep } from './playsound.js';




export async function packingRandomboxComplete(orderData, messageDiv) {
    try {
        if (!orderData || !orderData.ProductRandomboxItem || orderData.ProductRandomboxItem.length === 0) {
            console.log("포장할 제품 정보가 없습니다.");
            return;
        }

        const batch = firebase.firestore().batch();
        const db = firebase.firestore();
        console.log("batch 생성.");

        for (const product of orderData.ProductRandomboxItem) {
            
            const barcode = product.바코드;
            const sellerCode = product.판매자상품코드;
            const optionKey = product.옵션정보;            
            const quantity = product.수량;

            if (barcode && quantity > 0) {
                const productRef = db.collection('Products').doc(sellerCode);

                // 문서가 존재하는지 확인
                const docSnapshot = await productRef.get();
                if (docSnapshot.exists) {
                    const optionPath = `OptionDatas.${optionKey}.Counts`;
                    batch.update(productRef, { [optionPath]: firebase.firestore.FieldValue.increment(-quantity) });
                    console.log(`바코드: ${barcode}, 옵션명: ${optionKey}, 수량: ${quantity} 감소 예정`);
                } else {
                    // 문서가 존재하지 않으면 새로 생성
                    playBeep();
                    console.error("제품 수량 업데이트 중 오류 발생: ", error);
                    
                }
            } else {
                console.log(`제품을 찾지 못함. (${sellerCode}))`);
            }
        }

        console.log("batch 커밋.");
        await batch.commit();
        
        if (messageDiv) {
            messageDiv.innerHTML += `<p>모든 바코드와 수량이 성공적으로 업데이트되었습니다.</p>`;
        } else {
            console.log("messageDiv가 유효하지 않습니다.");
        }

        console.log("모든 바코드와 수량이 성공적으로 업데이트되었습니다.");

    } catch (error) {
        if (messageDiv) {
            messageDiv.innerHTML += `<p>제품 수량 업데이트 중 오류 발생: ${error.message}</p>`;
        }
        console.error("제품 수량 업데이트 중 오류 발생: ", error);
    }
}
