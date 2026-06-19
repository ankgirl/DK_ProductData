// functions/index.js — 매일 자정(KST) 전체 재고 가치 스냅샷 자동 기록
//
// 계산 로직(computeInventory)은 public/inventory_compute.js 단일 소스를 공유한다.
// 배포 시 predeploy 단계에서 이 폴더로 복사된다 (firebase.json 참고).
// → 화면(admin_inventory_value.js)에 보이는 값과 자정 기록 값이 항상 동일.

"use strict";

const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {computeInventory} = require("./inventory_compute");

initializeApp();
const db = getFirestore();

/**
 * 자정(KST) 기준 날짜 문자열 "YYYY-MM-DD".
 * 런타임은 UTC이므로 +9h 보정 후 ISO 날짜를 잘라 쓴다.
 * @return {string} "YYYY-MM-DD"
 */
function kstDateStr() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

exports.dailyInventorySnapshot = onSchedule(
    {
      schedule: "0 0 * * *",
      timeZone: "Asia/Seoul",
      region: "asia-northeast3",
    },
    async () => {
      const id = kstDateStr();
      try {
        // 제외목록 (관리자 화면과 동일한 AdminConfig/inventoryExclude)
        const exRef = db.collection("AdminConfig").doc("inventoryExclude");
        const exSnap = await exRef.get();
        const exclude = new Set(
            (exSnap.exists && exSnap.data().sellerCodes) || [],
        );

        // Products 전체 로드 → Map<id, data> (화면과 동일 인터페이스)
        const prodSnap = await db.collection("Products").get();
        const docs = new Map();
        prodSnap.forEach((d) => docs.set(d.id, d.data()));

        if (docs.size === 0) {
          // 0건이면 계산해봤자 0원 스냅샷이 남아 추이를 오염시킴 → 실패로 처리.
          throw new Error("Products 0건 로드됨 (권한/네트워크 의심). 스냅샷 기록 중단.");
        }

        const {acc, flags} = computeInventory(docs, exclude);

        await db.collection("InventorySnapshots").doc(id).set({
          날짜: id,
          기록시각: FieldValue.serverTimestamp(),
          원가: acc.원가,
          실판매가: acc.실판매가,
          정가: acc.정가,
          자동: true, // 자정 자동 기록 표식 (수동 저장과 구분)
        });

        logger.info("[dailyInventorySnapshot] 기록 완료", {
          날짜: id,
          상품수: docs.size,
          제외: flags.제외,
          환산세트: flags.환산세트.length,
          고아세트: flags.고아세트.length,
          원가미입력: flags.원가미입력.length,
          재고원가전체: acc.원가.전체,
        });
      } catch (err) {
        // 실패를 silent pass 하지 않음: error 로그 남기고 re-throw → 실행이 "실패"로 마킹되어
        // Cloud Monitoring 경고(이메일)가 트리거됨.
        logger.error("[dailyInventorySnapshot] 기록 실패", {
          날짜: id,
          error: err.message,
          stack: err.stack,
        });
        throw err;
      }
    },
);
