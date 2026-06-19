// csv_upload_smart_store.js — 스마트스토어 상품 CSV에서 SellerCode별 스토어 정보를 Products 문서에 병합 반영.
// (커밋 f6cd42f 에서 실수로 삭제됐던 기능 복원 + 보강)
//
// 보강 포인트(반복 사용 도구 원칙):
//  - 멱등성: 셀러코드 기준 중복 제거 후 set(..,{merge:true}) → 다시 올려도 중복/오염 없음.
//  - 라이브데이터 보존: merge 라서 Counts/OptionDatas/원가 등 기존 필드는 절대 건드리지 않음.
//  - 실패 silent pass 금지: 배치 실패 시 개별 재시도로 문제 셀러코드 특정, 결과를 화면+콘솔에 요약.
//  - 진행률 표시: 반영 중 N/total 갱신.

document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    const STORE_PREFIX = "https://smartstore.naver.com/secretgarden1000/products/";
    const BATCH_SIZE = 400; // Firestore 배치 상한(500) 미만의 안전값

    const form = document.getElementById("uploadForm");
    const messageDiv = document.getElementById("message");
    const submitBtn = form ? form.querySelector("button[type=submit]") : null;

    const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

    if (!form) return;

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        const csvFile = document.getElementById("csvFile").files[0];
        if (!csvFile) { alert("CSV 파일을 선택해주세요."); return; }

        if (submitBtn) submitBtn.disabled = true;
        messageDiv.innerHTML = "<p>CSV 파싱 중...</p>";

        Papa.parse(csvFile, {
            header: true,
            skipEmptyLines: true,
            complete: async function (results) {
                try {
                    await processRows(results.data || []);
                } catch (e) {
                    console.error("처리 중 예외:", e);
                    messageDiv.innerHTML = `<p style="color:#c0392b;">처리 중 예외: ${esc(e.message)}</p>`;
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            },
            error: function (error) {
                console.error("CSV 파싱 오류:", error);
                messageDiv.innerHTML = `<p style="color:#c0392b;">CSV 파싱 오류: ${esc(error.message)}</p>`;
                if (submitBtn) submitBtn.disabled = false;
            },
        });
    });

    async function processRows(rows) {
        // 1) 유효행 추출 + 셀러코드 기준 중복 제거(마지막 값 우선) → 멱등
        const bySeller = new Map();
        const skipped = [];
        for (const r of rows) {
            const sellerCode = (r["판매자상품코드"] || "").trim();
            const productNumber = (r["상품번호(스마트스토어)"] || "").trim();
            const name = (r["상품명"] || "").trim();
            if (!sellerCode || !productNumber || !name) {
                skipped.push({ sellerCode: sellerCode || "(빈 셀러코드)", reason: "필수값 누락(판매자상품코드/상품번호/상품명)" });
                continue;
            }
            bySeller.set(sellerCode, {
                SellerCode: sellerCode,
                ProductNumber: productNumber,
                SmartStoreURL: STORE_PREFIX + productNumber,
                스토어키워드네임: name,
            });
        }

        let entries = [...bySeller.entries()];
        if (!entries.length) {
            messageDiv.innerHTML = `<p>반영할 유효한 행이 없습니다.</p>` + renderSkipped(skipped);
            return;
        }

        // 1.5) 존재하는 셀러코드만 대상으로 필터 → 삭제/이름변경된 옛 코드를 되살리지 않음(부활 차단).
        //     스마트스토어에 옛 코드로 남아있는 행은 무시하고 리포트(=스토어에서 판매자상품코드 갱신 필요).
        messageDiv.innerHTML = "<p>기존 상품 목록 확인 중...</p>";
        const existingIds = new Set();
        (await db.collection("Products").get()).forEach(d => existingIds.add(d.id));
        const notFound = [];
        entries = entries.filter(([sellerCode]) => {
            if (existingIds.has(sellerCode)) return true;
            notFound.push({ sellerCode, reason: "DB에 없는 셀러코드(옛 코드일 수 있음) — 되살리지 않고 무시. 스토어에서 판매자상품코드 확인 필요" });
            return false;
        });
        skipped.push(...notFound);

        const total = entries.length;
        if (!total) {
            messageDiv.innerHTML = `<p>반영할(=DB에 존재하는) 행이 없습니다.</p>` + renderSkipped(skipped);
            return;
        }

        // 2) 배치 merge 쓰기 (위에서 존재 확인했으므로 merge가 새 문서를 만들지 않음, 기존 필드 보존)
        let done = 0, ok = 0;
        const failed = [];
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const chunk = entries.slice(i, i + BATCH_SIZE);
            const batch = db.batch();
            for (const [sellerCode, data] of chunk) {
                batch.set(db.collection("Products").doc(sellerCode), data, { merge: true });
            }
            try {
                await batch.commit();
                ok += chunk.length;
            } catch (e) {
                // 배치 실패 → 개별 재시도로 문제 셀러코드 특정 (실패를 묻어두지 않음)
                console.error("배치 커밋 실패, 개별 재시도:", e);
                for (const [sellerCode, data] of chunk) {
                    try {
                        await db.collection("Products").doc(sellerCode).set(data, { merge: true });
                        ok++;
                    } catch (e2) {
                        console.error(`${sellerCode} 반영 실패:`, e2);
                        failed.push({ sellerCode, reason: e2.message });
                    }
                }
            }
            done += chunk.length;
            messageDiv.innerHTML = `<p>반영 중... ${done}/${total} (성공 ${ok}, 실패 ${failed.length})</p>`;
        }

        // 3) 결과 요약
        renderSummary({ total, ok, failed, skipped });
    }

    function listBlock(title, arr, open) {
        if (!arr.length) return "";
        const lines = arr.slice(0, 50).map(x => `${esc(x.sellerCode)} — ${esc(x.reason)}`).join("<br>");
        return `<details${open ? " open" : ""}><summary>${esc(title)} ${arr.length}건</summary>`
            + `<p style="font-size:.85em;color:#888;">${lines}${arr.length > 50 ? "<br>…(이하 생략, 콘솔 참고)" : ""}</p></details>`;
    }
    function renderSkipped(skipped) { return listBlock("스킵", skipped, false); }

    function renderSummary({ total, ok, failed, skipped }) {
        const color = failed.length ? "#c0392b" : "#2e7d32";
        let html = `<h3 style="color:${color};">완료: ${ok}/${total} 반영`
            + `${failed.length ? ` · 실패 ${failed.length}` : ""}${skipped.length ? ` · 스킵 ${skipped.length}` : ""}</h3>`;
        html += `<p class="muted" style="color:#888;font-size:.85em;">※ 기존 상품은 스토어 정보(상품번호·URL·스토어키워드네임)만 갱신되고 수량·옵션 등은 보존됩니다. 같은 CSV를 다시 올려도 안전합니다.</p>`;
        html += listBlock("실패", failed, true);
        html += renderSkipped(skipped);
        messageDiv.innerHTML = html;
    }
});
