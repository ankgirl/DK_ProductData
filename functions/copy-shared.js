// copy-shared.js — 배포(predeploy) 시 공유 계산 로직을 functions 폴더로 복사.
// 단일 소스 = ../public/inventory_compute.js. 인라인 node -e 는 Windows 따옴표 문제로 깨져서
// 별도 스크립트로 분리(크로스플랫폼). __dirname 기준이라 실행 위치(CWD) 무관.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "public", "inventory_compute.js");
const dst = path.join(__dirname, "inventory_compute.js");

fs.copyFileSync(src, dst);
console.log("[copy-shared] " + src + " -> " + dst);
