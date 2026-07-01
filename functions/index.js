// functions/index.js — 매일 자정(KST) 전체 재고 가치 스냅샷 자동 기록
//
// 계산 로직(computeInventory)은 public/inventory_compute.js 단일 소스를 공유한다.
// 배포 시 predeploy 단계에서 이 폴더로 복사된다 (firebase.json 참고).
// → 화면(admin_inventory_value.js)에 보이는 값과 자정 기록 값이 항상 동일.

"use strict";

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {computeInventory} = require("./inventory_compute");
const nodemailer = require("nodemailer");

initializeApp();
const db = getFirestore();

// Gmail 앱 비밀번호(2단계인증 발급). 콘솔/CLI 로만 주입되는 서버 시크릿.
//   설정: firebase functions:secrets:set GMAIL_APP_PASSWORD
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const SENDER = "dakkuharu@gmail.com";

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

/**
 * 급여 정산서(PDF 첨부) 메일 발송 — 관리자 전용 콜러블.
 * 브라우저(admin_payroll)가 base64 PDF 와 함께 호출한다.
 * 자격증명(앱 비밀번호)은 서버 시크릿에만 있고 클라이언트에 노출되지 않는다.
 */
exports.sendPayslip = onCall(
    {
      region: "asia-northeast3",
      secrets: [GMAIL_APP_PASSWORD],
      cors: true,
    },
    async (req) => {
      const email = req.auth && req.auth.token && req.auth.token.email;
      if (email !== SENDER) {
        throw new HttpsError("permission-denied", "관리자만 발송할 수 있습니다.");
      }
      const d = req.data || {};
      if (!d.to || !d.contentBase64) {
        throw new HttpsError("invalid-argument", "수신자 또는 첨부가 없습니다.");
      }
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: {user: SENDER, pass: GMAIL_APP_PASSWORD.value()},
      });
      try {
        await transport.sendMail({
          from: `다꾸하루 <${SENDER}>`,
          to: d.to,
          subject: d.subject || "[다꾸하루] 용역비 정산서",
          text: d.message || "정산서를 첨부합니다.",
          attachments: [{
            filename: d.filename || "정산서.pdf",
            content: Buffer.from(d.contentBase64, "base64"),
            contentType: "application/pdf",
          }],
        });
      } catch (err) {
        logger.error("[sendPayslip] 발송 실패", {
          to: d.to, error: err.message,
        });
        throw new HttpsError("internal", "메일 발송 실패: " + err.message);
      }
      logger.info("[sendPayslip] 발송 완료", {to: d.to, file: d.filename});
      return {ok: true};
    },
);
