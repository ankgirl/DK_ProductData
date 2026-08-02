// generatedBarcodeStore.js — 생성 바코드(DK########) 기록 공용 모듈 (window.GeneratedBarcodeStore)
//
// 왜 별도 기록을 두는가:
//  1) 한 곳에서 전부 조회 — "언제 · 어떤 제품 · 어떤 옵션에 발급했나"를 모아 본다(구글시트를 대체).
//  2) 중복 재발급 원천 차단 — 문서ID = 바코드 값. 같은 값을 두 번 만들 수 없다(DB 차원 보장).
//     상품에서 지워졌거나 아직 저장 전인 값도 여기 남아 있어 "예전에 뽑았던 번호"가 재사용되지 않는다.
//  3) 프린트 이력 — 무엇을 몇 장 뽑았는지 남겨, 다시 눌러도(멱등) 중복 인쇄를 눈으로 확인할 수 있다.
//
// 컬렉션: GeneratedBarcodes / 문서ID = 바코드
//   barcode · sellerCode · option · 소분류명 · productName · count(생성 시점 수량 스냅샷)
//   createdAt(serverTimestamp) · dateKey(YYYY-MM-DD, KST) · source('생성'|'시트임포트')
//   printedAt · printCount(누적 인쇄 장수) · lastPrintQty
//
// ※ 화면 표시용 수량은 이 기록의 count(옛 스냅샷)가 아니라 Products의 현재 수량을 쓴다(최신 유지).
(function (root) {
    'use strict';

    const COLLECTION = 'GeneratedBarcodes';
    const col = () => db.collection(COLLECTION);
    const todayKey = () => new Date().toLocaleDateString('sv-SE'); // 로컬(KST) YYYY-MM-DD

    // 전체 기록 로드 → Map(barcode -> data)
    async function loadAll() {
        const snap = await col().get();
        const map = new Map();
        snap.forEach(d => map.set(d.id, d.data()));
        return map;
    }

    /**
     * 생성 즉시 기록(예약). 상품에 저장하기 "전에" 불러서 번호를 선점한다.
     * 상품 저장이 실패해도 기록은 남는다 → 그 번호는 폐기될 뿐 재사용되지 않음(안전한 방향).
     * 멱등: 같은 (바코드, 셀러코드, 옵션)이면 아무것도 안 하고 통과. 주인이 다르면 에러(재추첨 유도).
     */
    async function reserve(entry) {
        const barcode = String(entry.barcode || '').trim();
        if (!barcode) throw new Error('바코드 값이 비어 있습니다.');
        const ref = col().doc(barcode);

        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (snap.exists) {
                const d = snap.data() || {};
                if (d.sellerCode === entry.sellerCode && d.option === entry.option) return; // 같은 주인 → 멱등 통과
                throw new Error(`이미 발급된 바코드입니다: ${barcode} → ${d.sellerCode || '?'} [${d.option || '?'}]`);
            }
            tx.set(ref, {
                barcode,
                sellerCode: entry.sellerCode || '',
                option: entry.option || '',
                소분류명: entry.소분류명 || '',
                productName: entry.productName || '',
                count: typeof entry.count === 'number' ? entry.count : null,
                source: entry.source || '생성',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                dateKey: todayKey(),
                printCount: 0,
            });
        });
    }

    /**
     * 프린트 이력 기록. items: [{barcode, qty}]
     * printCount 는 누적(increment) — 재실행해도 값이 어긋나지 않는다.
     */
    async function markPrinted(items) {
        const list = (items || []).filter(it => it && it.barcode);
        if (!list.length) return 0;
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const inc = n => firebase.firestore.FieldValue.increment(n);

        let done = 0;
        for (let i = 0; i < list.length; i += 400) {      // batch 한도(500) 여유 있게 분할
            const batch = db.batch();
            list.slice(i, i + 400).forEach(it => {
                batch.set(col().doc(it.barcode), {
                    printedAt: now,
                    printedDateKey: todayKey(),
                    printCount: inc(Number(it.qty) || 0),
                    lastPrintQty: Number(it.qty) || 0,
                }, { merge: true });
            });
            await batch.commit();
            done += Math.min(400, list.length - i);
        }
        return done;
    }

    root.GeneratedBarcodeStore = { COLLECTION, loadAll, reserve, markPrinted, todayKey };
})(window);
