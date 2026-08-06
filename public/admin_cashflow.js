// admin_cashflow.js — 사업 현금흐름 (관리자 전용)
// 카카오뱅크 거래내역 + 카드 사용내역(삼성·신한) 업로드 → 월별 현금흐름 그래프/표.
//
// 설계 핵심 (합의):
//  - 합계(수입/지출/순현금흐름)의 source of truth = 카카오뱅크 계좌내역.
//  - 카드는 합계에 더하지 않음. 계좌의 "○○카드" 출금 한 줄을 세부로 펼쳐보는 용도(드릴다운).
//  - 카드사는 CARDS 레지스트리 한 곳에서만 관리 → 카드가 늘면 여기에 한 줄 추가(파싱·분류·대사 자동 확장).
//  - 업로드한 카드 파일의 카드사는 내용으로 자동 판별(사용자가 고르지 않음).
//  - 재업로드 멱등: 거래마다 고유 hash → 문서ID. 이미 있으면 skip, 신규만 추가.
//  - 저장은 컬렉션 'CashFlowTx' 에만. 기존 Products/Orders 등은 절대 건드리지 않음.
(function () {
  'use strict';

  const BUILD = 'v2 · 2026-07-19 (세이프박스=자금이동 제외)';
  const COLLECTION = 'CashFlowTx';
  const BATCH_LIMIT = 400;

  let allTx = [];                 // 메모리 캐시 (Firestore 전체)
  const existingIds = new Set();  // 중복판별용 문서ID 집합
  let invByMonth = {};            // 월 → {id, cost}  (월말 재고 원가, InventorySnapshots)
  let chartMonthly = null, chartCat = null;
  let rangeMonths = 12;           // 그래프 범위 (0=전체)
  let selMonth = null;            // 상세 보기 월
  let showInv = false;            // 재고 반영 손익 보기 토글

  // ---------- DOM 헬퍼 ----------
  const $ = id => document.getElementById(id);
  const won = n => (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 숫자/날짜 정규화 ----------
  function stripNum(s) {
    if (s == null) return 0;
    if (typeof s === 'number') return s;
    const t = String(s).replace(/[,\s]/g, '').replace(/[^\d.\-]/g, '');
    const v = parseFloat(t);
    return isNaN(v) ? 0 : v;
  }
  function bankDate(s) { // "2025.06.25 03:28:30"
    const m = String(s).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
    if (!m) return null;
    const p = (x, n = 2) => String(x).padStart(n, '0');
    const date = `${m[1]}-${p(m[2])}-${p(m[3])}`;
    const ts = `${date} ${p(m[4] || 0)}:${p(m[5] || 0)}:${p(m[6] || 0)}`;
    return { date, ts };
  }
  function cardDate(s) { // "20260511"
    const t = String(s).replace(/\D/g, '');
    if (t.length < 8) return null;
    return { date: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` };
  }
  const monthOf = d => d.slice(0, 7);
  function prevMonth(m) { const [y, mo] = m.split('-').map(Number); const py = mo === 1 ? y - 1 : y, pm = mo === 1 ? 12 : mo - 1; return `${py}-${String(pm).padStart(2, '0')}`; }

  // ---------- 결정적 hash (cyrb53, 동기·secure-context 불필요) ----------
  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  const idOf = key => 'cf_' + cyrb53(key);

  // ---------- 카테고리 자동분류 ----------
  // 거래처(적요 포함어) → 분류. 위에서부터 먼저 맞는 규칙 적용.
  // ※ 단일 출처(여기 한 곳)에서만 관리 → 화면 편집/DB저장 UI로 확장 예정.
  const PAYEE_RULES = [
    { has: '카카오페이', cat: '매입' },        // 사입대금 결제 (가장 큼)
    { has: '일광', cat: '관리비' },            // 최성자(일광스타타워/아이프라)
    { has: '김경환', cat: '통관비' },          // 김경환(자유무역관세…) 수입통관비 — 괄호 유무 동일인
    { has: '관세법인', cat: '세금·공과' },     // 인천관세법인 (사용자 분류)
    { has: '중판', cat: '수입비용' },          // 중판 주식회사 - 수입을 위한 배송(수입원가성), 일반 배송과 분리
    { has: '가온드림', cat: '배송' },          // (주)가온드림 - 택배비(고객 배송)
    { has: '아뜰리에본', cat: '급여' },        // 구본희(아뜰리에본) - 직원급여
    { has: '김남원', cat: '급여' },            // 직원 급여
    { has: '유승훈', cat: '임대' },            // 월세
    { has: '김지훈', cat: '일회성비용' },      // 일회성 비용
    { has: '레온방재', cat: '일회성비용' },    // 주식회사레온방재기술 - 일회성
    { has: '김성호', cat: '본인출금' },        // 대표 개인계좌 출금(자금이동)
    { has: '국세', cat: '세금·공과' },
    { has: '사회보험', cat: '세금·공과' },
    { has: '국민연금', cat: '세금·공과' },
  ];
  // 성주현 타행자동이체 = 월세 750,000(지출) + 대표 개인계좌 출금(지출 아님)이 섞임.
  // → 금액 750,000 은 임대, 그 외는 '본인출금'(자금이동, 총지출에서 제외).
  const SAJU_RENT = 750000;
  // 자금이동(매출·비용 아님) — 총수입/총지출/도넛에서 제외, 표에는 표시
  // 세이프박스 = 카카오뱅크 임시보관함. 넣기/빼기 모두 같은 사업자금 이동일 뿐 수입·지출 아님.
  //   (넣기: 거래구분·내용 모두 '세이프박스', 금액 −  / 빼기: 거래구분 '일반입금'·내용 '세이프박스', 금액 +)
  //   이자는 별도 표시 안 됨 → 처리 대상에서 제외(무시).
  const EXCLUDED_CATS = new Set(['본인출금', '본인입금', '세이프박스']);
  const isExcluded = c => EXCLUDED_CATS.has(c);
  const isExpense = tx => tx.amount < 0 && !isExcluded(categorize(tx));
  const isIncome = tx => tx.amount > 0 && !isExcluded(categorize(tx));

  function categorize(tx) {
    const d = tx.desc || '';
    // 세이프박스(자금이동) — 넣기(-)/빼기(+) 모두 내용이 '세이프박스'. 수입·지출 분기보다 먼저 판정.
    if (/세이프박스/.test(d)) return '세이프박스';
    if (isCardSource(tx.source)) {
      // 가맹점명 기준 분류 (순서 중요: 구체적인 것 먼저). 카드사와 무관하게 같은 규칙을 쓴다.
      if (/택스앤톡|자비스앤빌런즈/.test(d)) return '세무사';          // 자비스앤빌런즈=삼쩜삼
      if (/건강보험|국민연금|사회보험/.test(d)) return '세금·공과';
      if (/선물하기/.test(d)) return '복리후생';                       // 카카오 선물하기 = 직원 명절보너스
      if (/우아한/.test(d)) return '식대';                            // 우아한형제들(배민)
      if (/잡코리아|사람인/.test(d)) return '채용';
      if (/LG전자/.test(d)) return '구독·HW';                         // LG전자 구독료
      // 네이버페이 = 쇼핑 결제(사입·비품) → 광고(네이버파이낸셜)보다 먼저 판정해야 함
      if (/네이버페이/.test(d)) return '매입';
      if (/FACEBK|FACEBOOK|메타|인스타|네이버/i.test(d)) return '광고'; // 네이버파이낸셜·네이버·페북
      if (/토빅스|쿠팡|박스|포장|비품|오피스|이케아|애플|마트킹|씨유/i.test(d)) return '비품';
      if (/LGU|SK통신|세븐모바일|\bKT\b|통신/i.test(d)) return '통신';
      if (/카페24|고도몰|호스팅|도메인/i.test(d)) return '구독·SW';     // 쇼핑몰 호스팅
      if (/OPENAI|CHATGPT|CLAUDE|ANTHROPIC|ADOBE|MICROSOFT|CAPCUT|SURFSHARK|GOOGLE|구글|미리디|토글랩스|바로알림|구독/i.test(d)) return '구독·SW';
      return '기타';
    }
    // bank
    if (tx.amount > 0) {
      if (d.includes('성주현')) return '본인입금';                     // 대표 자본투입 = 매출 아님
      if (/스토어|정산|네이버페이|페이먼트|매출/.test(d)) return '매출입금';
      return '기타수입';
    }
    if (CARD_BANK_RE.test(d)) return '카드대금';   // 계좌에서 빠져나간 카드 결제(모든 카드사)
    if (d.includes('성주현')) return Math.abs(tx.amount) === SAJU_RENT ? '임대' : '본인출금';
    for (const r of PAYEE_RULES) if (d.includes(r.has)) return r.cat;
    if (/급여|월급|상여/.test(d)) return '급여';
    if (/임대|월세|관리비/.test(d)) return '임대';
    if (/택배|배송|로젠|CJ|우체국/i.test(d)) return '배송';
    if (/매입|도매|사입/.test(d)) return '매입';
    return '기타지출';
  }

  // ---------- 파서 ----------
  function sheetRows(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }); }
  function findHeaderRow(rows, key) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].some(c => String(c).trim() === key)) return i;
    }
    return -1;
  }

  function parseBank(wb) {
    let bad = 0; const out = [];
    for (const sn of wb.SheetNames) {
      const rows = sheetRows(wb.Sheets[sn]);
      const hr = findHeaderRow(rows, '거래일시');
      if (hr < 0) continue;
      const H = rows[hr].map(c => String(c).trim());
      const idx = n => H.indexOf(n);
      const iD = idx('거래일시'), iAmt = idx('거래금액'), iBal = idx('거래 후 잔액'),
        iType = idx('거래구분'), iDesc = idx('내용'), iMemo = idx('메모');
      for (let r = hr + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !String(row[iD] || '').trim()) continue;
        const d = bankDate(row[iD]);
        if (!d) { bad++; continue; }
        const amount = stripNum(row[iAmt]);
        const balance = stripNum(row[iBal]);
        const desc = String(row[iDesc] || '').trim();
        const key = `bank_kakao|${d.ts}|${amount}|${balance}`;
        out.push({
          _id: idOf(key), source: 'bank_kakao', date: d.date, ts: d.ts, month: monthOf(d.date),
          amount, balance, txType: String(row[iType] || '').trim(), desc,
          memo: String(row[iMemo] || '').trim(),
        });
      }
      return { rows: out, bad };
    }
    throw new Error('카카오뱅크 형식이 아닙니다 (\'거래일시\' 헤더를 못 찾음).');
  }

  // ── 삼성카드 (엑셀: '이용일' 헤더, 시트별 일시불/할부) ──
  function parseSamsungCard(wb) {
    let bad = 0, found = false; const out = [];
    for (const sn of wb.SheetNames) {
      if (sn.includes('해외')) continue; // 해외이용 시트는 일시불에 이미 포함 → 중복 합산 방지
      const rows = sheetRows(wb.Sheets[sn]);
      const hr = findHeaderRow(rows, '이용일');
      if (hr < 0) continue;
      found = true;
      const H = rows[hr].map(c => String(c).trim());
      const idx = n => H.indexOf(n);
      const iD = idx('이용일'), iMer = idx('가맹점'), iUse = idx('이용금액'),
        iMon = idx('개월'), iSeq = idx('회차');
      for (let r = hr + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !String(row[iD] || '').trim()) continue;
        const mer = String(row[iMer] || '').trim();
        if (!mer || mer.includes('합계')) continue;       // 합계행 제외
        const d = cardDate(row[iD]);
        if (!d) { bad++; continue; }
        const use = Math.abs(stripNum(row[iUse]));
        if (!use) continue;
        const months = String(row[iMon] || '').trim();
        const seq = String(row[iSeq] || '').trim();
        const key = `card_samsung|${sn}|${d.date}|${mer}|${use}|${months}|${seq}`;
        out.push({
          _id: idOf(key), source: 'card_samsung', date: d.date, ts: d.date, month: monthOf(d.date),
          amount: -use, useAmount: use, desc: mer, sheet: sn,
          installMonths: months, installSeq: seq,
        });
      }
    }
    if (!found) return null;   // 이 카드사 형식이 아님 → 다음 카드사 파서가 시도
    return { rows: out, bad };
  }

  // ── 신한카드 (홈페이지에서 기간 지정해 받은 엑셀: '거래일'+'승인번호' 헤더, 시트 1개) ──
  // 특징:
  //  · 취소 건은 별도 행으로 음수 금액(매입구분 '승인취소', 취소상태 '취소') → 부호 그대로 합산하면 상쇄됨
  //  · 같은 거래가 '승인' → '결제확정' 으로 상태만 바뀌어 다시 내려옴
  //    → 중복 판별 키에 매입구분·취소상태를 넣지 않는다(넣으면 같은 거래가 두 번 쌓임)
  //  · 마지막 줄은 '총 N건' 합계행 → 거래일이 비어 있어 자동으로 걸러짐
  function parseShinhanCard(wb) {
    let bad = 0, found = false; const out = [];
    for (const sn of wb.SheetNames) {
      const rows = sheetRows(wb.Sheets[sn]);
      const hr = findHeaderRow(rows, '거래일');
      if (hr < 0) continue;
      const H = rows[hr].map(c => String(c).trim());
      const idx = n => H.indexOf(n);
      const iD = idx('거래일'), iMer = idx('가맹점명'), iAmt = idx('금액'), iAppr = idx('승인번호'),
        iUse = idx('이용구분'), iBuy = idx('매입구분'), iCancel = idx('취소상태'),
        iCard = idx('이용카드'), iCur = idx('거래통화'), iFx = idx('해외이용금액');
      if (iAppr < 0 || iAmt < 0) continue;   // '거래일'만 있고 승인번호가 없으면 신한 형식이 아님
      found = true;
      for (let r = hr + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !String(row[iD] || '').trim()) continue;      // 합계행('총 N건')은 거래일이 비어 있음
        const mer = String(row[iMer] || '').trim();
        if (!mer || /^총\s|합계/.test(mer)) continue;
        const d = bankDate(row[iD]);                               // '2026.08.06 11:05'
        if (!d) { bad++; continue; }
        const use = stripNum(row[iAmt]);                           // 취소는 음수 → 부호 유지
        if (!use) continue;
        const appr = String(row[iAppr] || '').trim();
        const useType = String(row[iUse] || '').trim();            // 일시불 / 할부(3개월) / 해외일시불
        const months = (useType.match(/(\d+)\s*개월/) || [])[1] || '';
        // 키에는 '변하지 않는 것'만 — 상태(매입구분/취소상태)는 재다운로드 때 바뀐다.
        const key = `card_shinhan|${appr || d.ts}|${d.date}|${mer}|${use}`;
        out.push({
          _id: idOf(key), source: 'card_shinhan', date: d.date, ts: d.ts, month: monthOf(d.date),
          amount: -use, useAmount: use, desc: mer,
          approvalNo: appr, useType: useType, installMonths: months, installSeq: '',
          buyStatus: String(row[iBuy] || '').trim(),
          canceled: !!String(row[iCancel] || '').trim(),
          cardName: String(row[iCard] || '').trim(),
          currency: iCur >= 0 ? String(row[iCur] || '').trim() : '',
          foreignAmount: iFx >= 0 ? String(row[iFx] || '').trim() : '',
        });
      }
    }
    if (!found) return null;
    return { rows: out, bad };
  }

  // ── 카드사 레지스트리 ──
  // 카드가 늘면 여기에 한 줄만 추가하면 파싱·분류·드릴다운·대사가 모두 따라온다.
  //   bankRe = 계좌내역에서 그 카드 결제 출금을 찾는 패턴(대사·'카드대금' 분류에 사용)
  const CARDS = [
    { key: 'card_samsung', label: '삼성카드', bankRe: /삼성카드/, parse: parseSamsungCard },
    { key: 'card_shinhan', label: '신한카드', bankRe: /신한카드/, parse: parseShinhanCard },
  ];
  const CARD_BANK_RE = new RegExp(CARDS.map(c => c.bankRe.source).join('|'));
  const isCardSource = s => CARDS.some(c => c.key === s);
  const cardDef = key => CARDS.find(c => c.key === key);

  // 업로드된 카드 파일이 어느 카드사인지 자동 판별 — 사용자가 고를 필요 없음
  function parseCard(wb) {
    for (const c of CARDS) {
      const r = c.parse(wb);
      if (r && r.rows.length) return Object.assign({ card: c }, r);
      if (r) return Object.assign({ card: c }, r);   // 형식은 맞는데 0건(빈 기간)
    }
    throw new Error('지원하는 카드 명세서 형식이 아닙니다 (' +
      CARDS.map(c => c.label).join(' / ') + ' 엑셀만 인식).');
  }

  // ---------- 업로드 ----------
  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = e => {
        try { resolve(XLSX.read(new Uint8Array(e.target.result), { type: 'array' })); }
        catch (err) { reject(err); }
      };
      fr.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      fr.readAsArrayBuffer(file);
    });
  }

  async function handleUpload(file, kind, resEl) {
    resEl.style.display = 'block';
    resEl.className = 'upload-result';
    resEl.textContent = '⏳ 읽는 중…';
    try {
      const wb = await readWorkbook(file);
      const parsed = kind === 'bank' ? parseBank(wb) : parseCard(wb);
      const { rows, bad } = parsed;

      // 신규 vs 중복 (메모리 셋 + 같은 파일 내 중복 제거)
      const seen = new Set();
      const fresh = [];
      let dup = 0;
      for (const tx of rows) {
        if (seen.has(tx._id)) { dup++; continue; }
        seen.add(tx._id);
        if (existingIds.has(tx._id)) { dup++; continue; }
        fresh.push(tx);
      }

      // 배치 저장 (CashFlowTx 에만)
      for (let i = 0; i < fresh.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        for (const tx of fresh.slice(i, i + BATCH_LIMIT)) {
          const { _id, ...data } = tx;
          batch.set(db.collection(COLLECTION).doc(_id), data);
        }
        await batch.commit();
      }

      // 메모리 반영
      for (const tx of fresh) { existingIds.add(tx._id); allTx.push(tx); }

      const label = kind === 'bank' ? '카카오뱅크' : parsed.card.label;   // 카드사는 파일에서 자동 판별
      resEl.className = 'upload-result ' + (bad ? 'warn' : 'ok');
      resEl.innerHTML = `✅ ${label} ${rows.length}건 읽음 · ` +
        `<b class="add">신규 ${fresh.length}건 추가</b> · ` +
        `<b class="dup">중복 ${dup}건 제외</b> · ` +
        `<b class="bad">형식오류 ${bad}건</b>`;
      rebuildAndRender();
    } catch (err) {
      console.error('[cashflow upload]', err);
      resEl.className = 'upload-result err';
      resEl.innerHTML = `❌ 업로드 실패: ${esc(err.message)}`;
    }
  }

  // ---------- 집계 ----------
  function monthsSorted() {
    return [...new Set(allTx.map(t => t.month))].sort();
  }
  function bankOf(month) {
    return allTx.filter(t => t.source === 'bank_kakao' && (!month || t.month === month));
  }
  // cardKey 를 주면 그 카드사만, 없으면 전 카드사
  function cardOf(month, cardKey) {
    return allTx.filter(t => isCardSource(t.source) && (!cardKey || t.source === cardKey) &&
      (!month || t.month === month));
  }
  // 계좌에서 그 달에 빠져나간 해당 카드 결제액
  function cardPaidOf(month, re) {
    return bankOf(month).filter(t => re.test(t.desc) && t.amount < 0).reduce((s, t) => s - t.amount, 0);
  }
  // 이번 달에 화면에 보여줄 카드사 = 사용내역이 있거나 계좌 결제가 잡힌 카드
  function activeCards(month) {
    return CARDS.filter(c => cardOf(month, c.key).length || cardPaidOf(month, c.bankRe));
  }

  // ---------- 렌더링 ----------
  function rebuildAndRender() {
    const months = monthsSorted();
    if (!months.length) {
      $('report').style.display = 'none';
      $('status').textContent = '아직 업로드된 거래가 없습니다. 위에서 파일을 올려주세요.';
      return;
    }
    $('status').textContent = `총 ${allTx.length.toLocaleString()}건 (계좌 ${bankOf().length.toLocaleString()} · 카드 ${cardOf().length.toLocaleString()})`;
    $('report').style.display = '';

    // 월 선택 옵션
    const sel = $('monthSel');
    if (!selMonth || !months.includes(selMonth)) selMonth = months[months.length - 1];
    sel.innerHTML = months.slice().reverse().map(m => `<option value="${m}">${m}</option>`).join('');
    sel.value = selMonth;

    // 분류 필터 옵션
    const cats = [...new Set(bankOf().map(categorize))].sort();
    $('fCat').innerHTML = '<option value="all">전체 분류</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    drawMonthly();
    renderMonth();
  }

  function drawMonthly() {
    let months = monthsSorted();
    if (rangeMonths > 0) months = months.slice(-rangeMonths);
    const income = months.map(m => bankOf(m).filter(isIncome).reduce((s, t) => s + t.amount, 0));
    const expense = months.map(m => bankOf(m).filter(isExpense).reduce((s, t) => s - t.amount, 0));
    const net = months.map((_, i) => income[i] - expense[i]);
    const netColors = net.map(v => v >= 0 ? '#1d7a3f' : '#b5283c'); // +초록 / -빨강
    // 점 크기 = 금액 절댓값에 비례 (3~14px)
    const maxAbs = Math.max(1, ...net.map(v => Math.abs(v)));
    const netRadius = net.map(v => 3 + Math.abs(v) / maxAbs * 11);
    if (chartMonthly) chartMonthly.destroy();
    chartMonthly = new Chart($('monthlyChart'), {
      data: {
        labels: months,
        datasets: [
          { type: 'bar', label: '수입', data: income, backgroundColor: '#5bb98c', order: 2 },
          { type: 'bar', label: '지출', data: expense, backgroundColor: '#e07a86', order: 2 },
          {
            type: 'line', label: '순현금흐름', data: net, borderColor: '#3a2b4d', backgroundColor: '#3a2b4d',
            tension: .25, pointRadius: netRadius, pointHoverRadius: netRadius.map(r => r + 2),
            pointBackgroundColor: netColors, pointBorderColor: netColors, order: 1,
            segment: { borderColor: ctx => (ctx.p0.parsed.y < 0 || ctx.p1.parsed.y < 0) ? '#d98a94' : '#3a2b4d' },
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: { display: true, text: '월별 수입 · 지출 · 순현금흐름 (계좌 기준)' },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${won(c.raw)}원` } },
        },
        scales: { y: { ticks: { callback: v => (v / 1e4).toLocaleString() + '만' } } },
      },
    });
  }

  function renderMonth() {
    const m = selMonth;
    const bank = bankOf(m);
    const income = bank.filter(isIncome).reduce((s, t) => s + t.amount, 0);
    const expense = bank.filter(isExpense).reduce((s, t) => s - t.amount, 0);
    const ownerDraw = bank.filter(t => categorize(t) === '본인출금').reduce((s, t) => s - t.amount, 0);
    const ownerIn = bank.filter(t => categorize(t) === '본인입금').reduce((s, t) => s + t.amount, 0);
    // 세이프박스 순이동(넣은 돈 − 뺀 돈). 자금이동이라 수입·지출엔 안 들어가고 참고용으로만 표시.
    const safeBox = bank.filter(t => categorize(t) === '세이프박스').reduce((s, t) => s - t.amount, 0);
    const byCat = {};
    bank.forEach(t => { if (isExpense(t)) { const c = categorize(t); byCat[c] = (byCat[c] || 0) - t.amount; } });
    const cardPaid = cardPaidOf(m, CARD_BANK_RE);      // 전 카드사 합계(요약 표시는 카드사별로 아래에서)

    const cardCell = (k, v, sub) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div><div class="sub">${sub || ''}</div></div>`;
    const profit = income - expense;
    $('summaryCards').innerHTML =
      cardCell('총수입', `<span class="pos">＋${won(income)}</span>`, '매출 · 본인입금 제외') +
      cardCell('총지출', `<span class="neg">－${won(expense)}</span>`, '비용 · 본인출금 제외') +
      cardCell('순이익', `<span class="${profit >= 0 ? 'pos' : 'neg'}">${profit >= 0 ? '＋' : '－'}${won(Math.abs(profit))}</span>`, '수입 − 지출') +
      cardCell('매입', won(byCat['매입'] || 0), '상품 사입') +
      cardCell('본인입금', won(ownerIn), '자금이동 · 매출 아님') +
      cardCell('본인출금', won(ownerDraw), '자금이동 · 지출 아님') +
      cardCell('세이프박스', `${safeBox >= 0 ? '＋' : '－'}${won(Math.abs(safeBox))}`, '자금이동 · 넣은−뺀(수입/지출 아님)') +
      // 카드사별 결제액 (사용내역이나 계좌 결제가 있는 카드만 표시)
      (activeCards(m).map(c => cardCell(c.label + ' 결제', won(cardPaidOf(m, c.bankRe)), '↓ 우측에서 분해')).join('') ||
        cardCell('카드 결제', won(cardPaid), '↓ 우측에서 분해'));

    renderNetBanner(m, income, expense, profit);
    drawCat(byCat, m);
    renderCardDrill(m);
    renderTable();
  }

  function renderNetBanner(m, income, expense, net) {
    // 수입 평균 대비 (전체 월 기준)
    const allM = monthsSorted();
    const incomes = allM.map(mm => bankOf(mm).filter(isIncome).reduce((s, t) => s + t.amount, 0));
    const avgIncome = incomes.length ? incomes.reduce((a, b) => a + b, 0) / incomes.length : 0;
    const incPct = avgIncome ? Math.round((income - avgIncome) / avgIncome * 100) : 0;

    // 재고 증감 (이번 달말 vs 지난 달말 재고 원가 둘 다 있을 때만)
    const ti = invByMonth[m], pi = invByMonth[prevMonth(m)];
    const hasInv = !!(ti && pi);
    const dInv = hasInv ? ti.cost - pi.cost : 0;
    const adj = net + dInv;                    // 매입으로 나간 현금이 재고로 남았으면 손실 아님

    // 토글: OFF=순현금흐름 / ON=재고반영 손익(데이터 있을 때)
    let bigLabel, bigVal, sub;
    if (showInv && hasInv) {
      bigLabel = `${m} 재고반영 손익 📦`;
      bigVal = adj;
      sub = `<div class="nb-inv">순현금흐름 ${net >= 0 ? '+' : '−'}${won(Math.abs(net))} · 재고 ${dInv >= 0 ? '+' : '−'}${won(Math.abs(dInv))}(원가)</div>`;
    } else if (showInv && !hasInv) {
      bigLabel = `${m} 순현금흐름 (수입−지출)`;
      bigVal = net;
      sub = `<div class="nb-inv muted2">📦 재고 반영 ON · 이 달은 재고 스냅샷이 없어 현금 기준 표시 (2026-06부터 기록)</div>`;
    } else {
      bigLabel = `${m} 순현금흐름 (수입−지출)`;
      bigVal = net;
      sub = '';
    }

    const b = $('netBanner');
    b.className = 'netbanner ' + (bigVal >= 0 ? 'pos' : 'neg');
    b.innerHTML =
      `<div><div class="nb-label">${bigLabel}</div>` +
      `<div class="amt">${bigVal >= 0 ? '＋' : '－'}${won(Math.abs(bigVal))} ` +
      `<span style="font-size:0.5em;">${bigVal >= 0 ? '흑자 🟢' : '적자 🔴'}</span></div></div>` +
      `<div class="nb-side">` +
      `<div>수입 ${won(income)} <span class="b ${incPct >= 0 ? 'up' : 'down'}">평균대비 ${incPct >= 0 ? '+' : ''}${incPct}%</span></div>` +
      `<div>지출 ${won(expense)}</div>` +
      sub +
      `</div>`;
  }

  function drawCat(byCat, m) {
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);
    const palette = ['#8884d8', '#e07a86', '#5bb98c', '#f0a44a', '#4aa3c7', '#b3a4c9', '#c7b04a', '#7a5fa6', '#bbb'];
    if (chartCat) chartCat.destroy();
    chartCat = new Chart($('catChart'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => palette[i % palette.length]) }] },
      options: {
        plugins: {
          title: { display: true, text: `${m} 지출 카테고리 (계좌)` },
          legend: { position: 'right' },
          tooltip: { callbacks: { label: c => `${c.label}: ${won(c.raw)}원` } },
        },
      },
    });
  }

  // 카드사별 드릴다운(사용내역이 있는 카드는 각각 한 블록). 카드가 늘어도 CARDS 만 보고 자동 확장.
  function renderCardDrill(m) {
    const cards = activeCards(m);
    if (!cards.length) {
      $('cardDrill').innerHTML =
        `<h3 style="margin-top:0;font-size:1em;">💳 ${m} 카드, 뭐에 썼나</h3>` +
        `<div class="recon warn">ℹ️ 이 달(${m})엔 카드 사용내역이 없습니다. 카드 파일을 올리면 여기에 세부가 표시됩니다. ` +
        `(지원: ${CARDS.map(c => c.label).join(' · ')})</div>`;
      return;
    }
    $('cardDrill').innerHTML = cards.map(c => cardDrillBlock(m, c)).join('') +
      `<p class="muted" style="margin-bottom:0;">※ 카드 '이용일' 기준 합계입니다. 계좌 결제(청구)와 시점이 달라 차이가 날 수 있어요. ` +
      `할부는 이용 시점에 전액으로 잡히므로 청구액과 다릅니다.</p>`;
  }
  function cardDrillBlock(m, c) {
    const card = cardOf(m, c.key);
    const bankPaid = cardPaidOf(m, c.bankRe);
    const detailSum = card.reduce((s, t) => s + t.useAmount, 0);
    const byCat = {};
    card.forEach(t => { const k = categorize(t); byCat[k] = (byCat[k] || 0) + t.useAmount; });
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td class="l">${esc(k)}</td><td>${won(v)}</td></tr>`).join('');

    let recon;
    if (!card.length) {
      recon = `<div class="recon warn">ℹ️ 계좌에서 ${won(bankPaid)}원이 결제됐는데 이 달 사용내역 파일이 없습니다. ` +
        `${esc(c.label)} 엑셀을 올리면 세부가 표시됩니다.</div>`;
    } else {
      const diff = detailSum - bankPaid;
      recon = `<div class="recon ${Math.abs(diff) < 1000 ? 'ok' : 'warn'}">` +
        (Math.abs(diff) < 1000
          ? `✅ 카드 세부합계 ${won(detailSum)} ≈ 계좌 카드결제 ${won(bankPaid)}`
          : `⚠️ 카드 사용 ${won(detailSum)} vs 계좌 결제 ${won(bankPaid)} · 차이 ${won(diff)} (할부·청구주기 차이일 수 있음)`) +
        `</div>`;
    }
    return `<h3 style="margin-top:0;font-size:1em;">💳 ${m} ${esc(c.label)}, 뭐에 썼나</h3>` + recon +
      (card.length ? `<table class="cf" style="margin-bottom:14px"><thead><tr><th class="l">분류</th><th>금액</th></tr></thead><tbody>${rows}` +
        `<tr style="font-weight:bold;background:#efe7f7;"><td class="l">합계(이용 기준)</td><td>${won(detailSum)}</td></tr></tbody></table>` : '');
  }

  function renderTable() {
    const allMonths = $('fAllMonths').checked;
    const type = $('fType').value;
    const cat = $('fCat').value;
    const q = $('fSearch').value.trim();
    let rows = bankOf(allMonths ? null : selMonth);
    if (type === 'in') rows = rows.filter(t => t.amount > 0);
    if (type === 'out') rows = rows.filter(t => t.amount < 0);
    if (cat !== 'all') rows = rows.filter(t => categorize(t) === cat);
    if (q) rows = rows.filter(t => (t.desc || '').includes(q) || (t.txType || '').includes(q));
    rows.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // 최신순

    const body = rows.slice(0, 500).map(t => {
      const inc = t.amount > 0 ? won(t.amount) : '';
      const out = t.amount < 0 ? won(-t.amount) : '';
      return `<tr><td class="l">${t.date}</td><td class="l">${esc(t.desc)}</td>` +
        `<td class="l">${esc(categorize(t))}</td>` +
        `<td class="pos">${inc}</td><td class="neg">${out}</td>` +
        `<td><span class="tag bank">계좌</span></td></tr>`;
    }).join('');
    $('txTable').innerHTML =
      `<table class="cf"><thead><tr><th class="l">날짜</th><th class="l">내용</th><th class="l">분류</th>` +
      `<th>수입</th><th>지출</th><th>출처</th></tr></thead><tbody>${body}</tbody></table>` +
      (rows.length > 500 ? `<p class="muted">상위 500건만 표시 (총 ${rows.length}건)</p>` : `<p class="muted">총 ${rows.length}건</p>`);
  }

  // ---------- 초기화/이벤트 ----------
  async function loadAll() {
    const snap = await db.collection(COLLECTION).get();
    allTx = []; existingIds.clear();
    snap.forEach(doc => { const x = doc.data(); x._id = doc.id; existingIds.add(doc.id); allTx.push(x); });
  }

  // 전체 재고 가치 스냅샷 → 월말 재고 원가 (있을 때만 재고반영 손익 계산)
  async function loadInventory() {
    invByMonth = {};
    try {
      const snap = await db.collection('InventorySnapshots').get();
      snap.forEach(doc => {
        const id = doc.id, m = id.slice(0, 7);
        const cost = doc.data().원가;
        const total = (cost && typeof cost === 'object') ? cost['전체'] : cost;
        if (typeof total === 'number' && (!invByMonth[m] || id > invByMonth[m].id)) {
          invByMonth[m] = { id, cost: total }; // 그 달의 가장 마지막(최신) 스냅샷
        }
      });
    } catch (e) { console.warn('[cashflow] 재고 스냅샷 로드 실패(재고반영 손익 생략):', e); }
  }

  function bindDrop(dropEl, inputEl, kind, resEl) {
    dropEl.addEventListener('dragover', e => { e.preventDefault(); dropEl.classList.add('hover'); });
    dropEl.addEventListener('dragleave', () => dropEl.classList.remove('hover'));
    dropEl.addEventListener('drop', e => {
      e.preventDefault(); dropEl.classList.remove('hover');
      if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0], kind, resEl);
    });
    inputEl.addEventListener('change', e => {
      if (e.target.files[0]) handleUpload(e.target.files[0], kind, resEl);
      e.target.value = '';
    });
  }

  function init() {
    $('buildStamp').textContent = '빌드 ' + BUILD;
    bindDrop($('dropBank'), $('fileBank'), 'bank', $('resBank'));
    bindDrop($('dropCard'), $('fileCard'), 'card', $('resCard'));

    document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); rangeMonths = parseInt(b.dataset.range, 10); drawMonthly();
    }));
    $('monthSel').addEventListener('change', e => { selMonth = e.target.value; renderMonth(); });
    $('invToggle').addEventListener('change', e => { showInv = e.target.checked; renderMonth(); });
    ['fType', 'fCat', 'fSearch', 'fAllMonths'].forEach(id =>
      $(id).addEventListener(id === 'fSearch' ? 'input' : 'change', renderTable));

    Promise.all([loadAll(), loadInventory()])
      .then(rebuildAndRender)
      .catch(err => { console.error(err); $('status').textContent = '⚠️ 불러오기 실패: ' + err.message; });
  }

  // 검증·디버깅용 훅 — 콘솔에서 파서를 직접 돌려 명세서 형식을 확인할 수 있다(읽기 전용, DB 접근 없음).
  //   예) CashflowInternals.parseCard(XLSX.read(buf, {type:'array'}))
  window.CashflowInternals = { CARDS, parseBank, parseCard, categorize, idOf };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
