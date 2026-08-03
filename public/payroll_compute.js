// payroll_compute.js — 다꾸하루 급여 계산 공용 엔진 (순수함수, DB/DOM 의존 없음)
//
// 관리자 급여 페이지(admin_payroll)와 직원 출퇴근 페이지(attendance)가 공유한다.
// 로직은 _scratch/verify_v2.js 로 4·5월 실제 정산서(1,203,406 / 775,806)와
// 원 단위까지 일치 검증됨. 규칙 출처: 다꾸하루_급여계산규칙_및_정산내역.pdf
//
// 핵심 규칙
//  · 일별 용역수당 = round(시급 × 근무분 / 60)
//    - 출근 클램프: 09:00 이전/단순지각 → 소정시작(09:00). 시간변경합의 시 합의시각.
//    - 조퇴 보정: max(근무분, 소정분(240)). 초과근무는 실제 퇴근까지.
//    - 결근: 0원.
//  · 주휴수당(월~일): 소정근무일 개근 & 주 소정 15h↑ → (소정시간/40)×8×시급.
//    - 결근 1일이라도 → 0. 달 경계 미완성 주(일요일이 다음달) → 다음달 이월.
//  · 공제(급여유형별) — EMPLOYMENT_TYPES 참조. 유형은 직원문서 employmentType 필드.
//    - freelancer(프리랜서): 소득세=floor10(총액×3%), 지방세=floor10(소득세×10%)  → 3.3%
//    - employee(근로자)   : 고용보험=floor10(총액×0.9%). 산재는 사업주 전액부담 → 공제 없음.
//
// 전역 노출: window.Payroll

(function (global) {
  'use strict';

  var DEFAULT_WAGE = 11000;
  var DEFAULT_SOJEONG_MIN = 240; // 1일 소정 4시간
  var DEFAULT_START = '09:00';
  var DEFAULT_END = '13:00';
  var DEFAULT_SOJEONG_DAYS = [1, 2, 3, 4, 5]; // 월~금 (0=일)

  // ---- 급여 유형(공제 방식) ----
  // 직원마다 계약형태가 달라 공제가 다르다. 새 유형은 여기에만 추가하면 전 화면(정산·정산서·직원페이지)에 반영됨.
  //   deductions[].of : 공제 기준액 키('total' 또는 앞선 공제 key)
  var DEFAULT_EMP_TYPE = 'freelancer';
  var EMPLOYMENT_TYPES = {
    freelancer: {
      key: 'freelancer', label: '프리랜서', short: '3.3% 원천징수',
      docTitle: '용역비 정산서', payName: '용역수당', feeName: '용역비',
      totalName: '정산 총액', netName: '최종 지급액',
      deductions: [
        { key: 'incomeTax', label: '소득세 (3%)', rate: 0.03, of: 'total' },
        { key: 'localTax', label: '지방소득세 (0.3%)', rate: 0.10, of: 'incomeTax' },
      ],
      notes: ['사업소득 원천징수 3.3% (소득세 3% + 지방소득세 0.3%, 각 10원 미만 절사)'],
    },
    employee: {
      key: 'employee', label: '근로자', short: '고용·산재보험',
      // 용어는 세무대리 급여대장과 동일하게(기본급 / 지급액계 / 차인지급액) — 대조하기 쉽도록
      docTitle: '급여 정산서', payName: '기본급', feeName: '급여',
      totalName: '지급액계', netName: '차인지급액',
      deductions: [
        { key: 'employmentIns', label: '고용보험 (0.9%)', rate: 0.009, of: 'total' },
      ],
      notes: [
        '고용보험 근로자부담 0.9% 공제 (10원 미만 절사)',
        '산재보험 — 사업주 전액 부담(급여에서 공제하지 않음)',
        '국민연금·건강보험·장기요양 미가입 (공제 0원)',
        '소득세·지방소득세 원천징수 없음',
      ],
    },
  };
  function empTypeDef(type) { return EMPLOYMENT_TYPES[type] || EMPLOYMENT_TYPES[DEFAULT_EMP_TYPE]; }
  function empTypeLabel(type) { var t = empTypeDef(type); return t.label + '(' + t.short + ')'; }

  function toMin(hhmm) {
    if (!hhmm) return null;
    var p = String(hhmm).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function minToHHMM(m) { return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
  function round(x) { return Math.round(x); }
  function floor10(x) { return Math.floor(x / 10) * 10; }

  // UTC 기준 날짜 유틸 (타임존 영향 제거)
  function ymdToUTC(y, m, d) { return Date.UTC(y, m - 1, d); }
  function parseYMD(s) { var p = s.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function ymdStr(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  // 요일 0=일 … 6=토
  function weekday(y, m, d) { return new Date(ymdToUTC(y, m, d)).getUTCDay(); }
  // 해당 날짜가 속한 주의 월요일(Date, UTC)
  function mondayOf(y, m, d) {
    var dt = new Date(ymdToUTC(y, m, d));
    var wd = (dt.getUTCDay() + 6) % 7; // 0=월
    dt.setUTCDate(dt.getUTCDate() - wd);
    return dt;
  }
  function fmtWon(n) { return (n == null ? 0 : n).toLocaleString('ko-KR') + '원'; }
  function fmtDur(min) {
    if (!min) return '-';
    return Math.floor(min / 60) + '시간 ' + pad2(min % 60) + '분';
  }

  // ---- 일별 계산 ----
  // day: {
  //   date:'YYYY-MM-DD', clockIn:'HH:MM'|null, clockOut:'HH:MM'|null,
  //   absent?:bool,              // 결근(휴무 포함) 명시
  //   agreedIn?:'HH:MM',         // 출근시간 변경 합의(사전등록)
  //   agreedOut?:'HH:MM'         // (참고용, 계산엔 실제 clockOut 사용)
  // }
  // opts: { wage, sojeongMin, sojeongStart }
  function computeDay(day, opts) {
    opts = opts || {};
    var wage = opts.wage || DEFAULT_WAGE;
    var sojeongMin = opts.sojeongMin || DEFAULT_SOJEONG_MIN;
    var sojeongStart = toMin(opts.sojeongStart || DEFAULT_START);

    if (day.absent || !day.clockOut) {
      return { absent: true, workedMin: 0, pay: 0, clampIn: null };
    }
    // 클램프 기준: 합의시각 있으면 그 시각, 없으면 소정시작(09:00)
    var base = day.agreedIn ? toMin(day.agreedIn) : sojeongStart;
    var outM = toMin(day.clockOut);
    var worked = outM - base;
    if (worked < sojeongMin) worked = sojeongMin; // 조퇴 보정(풀근무 보장)
    var pay = round(wage * worked / 60);
    return { absent: false, workedMin: worked, pay: pay, clampIn: minToHHMM(base) };
  }

  // ---- 월 정산 ----
  // allDays: 전체 근무 데이터 배열(달 경계 주 판정 위해 인접월 포함 권장). 각 항목 computeDay 입력 형태.
  // year, month: 정산 대상. opts: { wage, sojeongMin, sojeongStart, hireDate:'YYYY-MM-DD', weeklyStd:40, dailyStd:8 }
  function computeMonth(allDays, year, month, opts) {
    opts = opts || {};
    var wage = opts.wage || DEFAULT_WAGE;
    var weeklyStd = opts.weeklyStd || 40;
    var dailyStd = opts.dailyStd || 8;
    var hireUTC = opts.hireDate ? (function () { var p = parseYMD(opts.hireDate); return ymdToUTC(p.y, p.m, p.d); })() : -Infinity;

    // 일별 계산 + 메타
    var rows = allDays.map(function (d) {
      var p = parseYMD(d.date);
      var r = computeDay(d, opts);
      var mon = mondayOf(p.y, p.m, p.d);
      return {
        date: d.date, y: p.y, m: p.m, d: p.d,
        wd: weekday(p.y, p.m, p.d),
        weekKey: mon.toISOString().slice(0, 10),
        clockIn: d.clockIn || null, clockOut: d.clockOut || null,
        agreedIn: d.agreedIn || null,
        absent: r.absent, workedMin: r.workedMin, pay: r.pay, clampIn: r.clampIn,
        missing: !!d.missing,
        note: d.note || null,
      };
    });

    // 용역수당 = 이번 달 날짜만
    var monthRows = rows.filter(function (r) { return r.y === year && r.m === month; });
    var 용역 = monthRows.reduce(function (s, r) { return s + r.pay; }, 0);

    // 주별 그룹(월요일 키)
    var weekMap = {};
    rows.forEach(function (r) { (weekMap[r.weekKey] || (weekMap[r.weekKey] = [])).push(r); });

    // 주휴: "일요일이 이번 달"인 주만 이번 달 귀속. 개근판정은 그 주 전체(인접월 포함)로.
    var weeks = [];
    Object.keys(weekMap).sort().forEach(function (wk) {
      var mon = new Date(wk + 'T00:00:00Z');
      var sun = new Date(mon); sun.setUTCDate(sun.getUTCDate() + 6);
      var endsThisMonth = (sun.getUTCFullYear() === year && sun.getUTCMonth() + 1 === month);
      var startsThisMonth = (mon.getUTCFullYear() === year && mon.getUTCMonth() + 1 === month);
      // 이번 달과 무관한 주는 스킵(용역엔 이미 반영, 주휴는 일요일 귀속 달에서 처리)
      if (!endsThisMonth && !startsThisMonth) return;

      // 소정근무일 = 그 주 월~금 중 입사일 이후 날짜 수
      var soDays = 0;
      for (var i = 0; i < 5; i++) {
        var dt = new Date(mon); dt.setUTCDate(dt.getUTCDate() + i);
        if (dt.getTime() >= hireUTC) soDays++;
      }
      var days = weekMap[wk];
      var hasMissing = days.some(function (x) { return x.missing; });
      var hasAbsent = days.some(function (x) { return x.absent && !x.missing; });
      var workedDays = days.filter(function (x) { return !x.absent; }).length;
      var sojeongHours = soDays * 4;

      var juhyu = 0, status;
      if (!endsThisMonth) { status = '미완성→다음달 이월'; }
      else if (soDays === 0) { status = '소정일 없음'; }
      else if (hasMissing) { status = '미기록 있음→미발생'; }
      else if (hasAbsent) { status = '결근→미발생'; }
      else if (sojeongHours < 15) { status = '주 15h미만→미발생'; }
      else if (workedDays < soDays) { status = '근무<소정→미발생'; }
      else { juhyu = round((sojeongHours / weeklyStd) * dailyStd * wage); status = '개근 ' + sojeongHours + 'h'; }

      // 이번 달에 귀속(일요일이 이번 달)일 때만 주휴 합산
      weeks.push({
        weekKey: wk,
        mondayStr: wk,
        sundayStr: sun.toISOString().slice(0, 10),
        endsThisMonth: endsThisMonth,
        soDays: soDays, workedDays: workedDays, hasAbsent: hasAbsent, hasMissing: hasMissing,
        juhyu: endsThisMonth ? juhyu : 0,
        carryOut: !endsThisMonth,   // 다음달 이월 표시
        status: status,
        rows: days.filter(function (x) { return x.y === year && x.m === month; }),
      });
    });

    var 주휴 = weeks.reduce(function (s, w) { return s + w.juhyu; }, 0);

    return { year: year, month: month, rows: monthRows, weeks: weeks, 용역수당: 용역, 주휴수당: 주휴 };
  }

  // ---- 미기록 소정근무일 채우기 ----
  // 기록이 아예 없는 소정근무일을 {missing:true, absent:true} 행으로 채워 "누락"을 화면에 드러낸다.
  // ※ 급여 결과는 불변 — 미기록은 원래도 용역 0원이고, 주휴는 workedDays<soDays 로 이미 미발생이었다.
  //   달라지는 건 "안 보이던 누락일이 보이고, 그 자리에서 보충 등록할 수 있다"는 것.
  // opts: { sojeongDays:[0~6], hireDate, endDate, today:'YYYY-MM-DD' }
  function fillMissing(days, year, month, opts) {
    opts = opts || {};
    var wdays = opts.sojeongDays || DEFAULT_SOJEONG_DAYS;
    var hire = opts.hireDate || null;
    var end = opts.endDate || null;
    var today = opts.today || todayLocal();
    var have = {};
    (days || []).forEach(function (d) { have[d.date] = 1; });

    // 커버 범위 = 이 달이 걸친 주 전체(첫날의 월요일 ~ 마지막날의 일요일). 달 경계 주휴 판정 구간까지 포함.
    var cur = mondayOf(year, month, 1);
    var lastDate = new Date(ymdToUTC(year, month + 1, 0)).getUTCDate();
    var end2 = mondayOf(year, month, lastDate); end2.setUTCDate(end2.getUTCDate() + 6);

    var out = (days || []).slice();
    while (cur.getTime() <= end2.getTime()) {
      var s = cur.toISOString().slice(0, 10);
      var skip = have[s] || wdays.indexOf(cur.getUTCDay()) < 0 ||
        s > today || (hire && s < hire) || (end && s > end);
      if (!skip) out.push({ date: s, clockIn: null, clockOut: null, absent: true, missing: true, note: '미기록' });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return out;
  }
  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // ---- 공제(급여유형별) ----
  // 반환: { deductions:[{key,label,amount}], deductionSum, net, incomeTax, localTax, employmentIns, ... }
  // incomeTax/localTax 는 하위호환용으로 항상 존재(해당 없으면 0).
  function withholding(total, type) {
    var t = empTypeDef(type);
    var base = { total: total };
    var list = t.deductions.map(function (d) {
      var amt = floor10((base[d.of] || 0) * d.rate);
      base[d.key] = amt;
      return { key: d.key, label: d.label, amount: amt };
    });
    var sum = list.reduce(function (s, d) { return s + d.amount; }, 0);
    return {
      employmentType: t.key, typeLabel: t.label, typeShort: t.short, notes: t.notes,
      docTitle: t.docTitle, payName: t.payName, feeName: t.feeName,
      totalName: t.totalName, netName: t.netName,
      deductions: list, deductionSum: sum,
      incomeTax: base.incomeTax || 0, localTax: base.localTax || 0, employmentIns: base.employmentIns || 0,
      net: total - sum,
    };
  }

  // ---- 월 정산 전체(이월/조정 포함) ----
  // adjustments: [{label, amount}] (양수/음수 모두 가능). 예: 전월 이월 주휴, 3월 미지급분 등.
  function settle(allDays, year, month, opts, adjustments) {
    var base = computeMonth(allDays, year, month, opts);
    adjustments = adjustments || [];
    var adjSum = adjustments.reduce(function (s, a) { return s + (a.amount || 0); }, 0);
    var total = base.용역수당 + base.주휴수당 + adjSum;
    var wh = withholding(total, opts && opts.employmentType);
    return {
      year: year, month: month,
      rows: base.rows, weeks: base.weeks,
      용역수당: base.용역수당, 주휴수당: base.주휴수당,
      adjustments: adjustments, adjustmentSum: adjSum,
      total: total,
      employmentType: wh.employmentType, typeLabel: wh.typeLabel, typeShort: wh.typeShort, typeNotes: wh.notes,
      docTitle: wh.docTitle, payName: wh.payName, feeName: wh.feeName,
      totalName: wh.totalName, netName: wh.netName,
      deductions: wh.deductions, deductionSum: wh.deductionSum,
      incomeTax: wh.incomeTax, localTax: wh.localTax, employmentIns: wh.employmentIns,
      net: wh.net,
    };
  }

  global.Payroll = {
    DEFAULT_WAGE: DEFAULT_WAGE,
    DEFAULT_SOJEONG_MIN: DEFAULT_SOJEONG_MIN,
    DEFAULT_START: DEFAULT_START,
    DEFAULT_END: DEFAULT_END,
    DEFAULT_SOJEONG_DAYS: DEFAULT_SOJEONG_DAYS,
    EMPLOYMENT_TYPES: EMPLOYMENT_TYPES, DEFAULT_EMP_TYPE: DEFAULT_EMP_TYPE,
    empTypeDef: empTypeDef, empTypeLabel: empTypeLabel,
    toMin: toMin, minToHHMM: minToHHMM, round: round, floor10: floor10,
    weekday: weekday, mondayOf: mondayOf, ymdStr: ymdStr, parseYMD: parseYMD,
    fmtWon: fmtWon, fmtDur: fmtDur, todayLocal: todayLocal,
    fillMissing: fillMissing,
    computeDay: computeDay,
    computeMonth: computeMonth,
    withholding: withholding,
    settle: settle,
  };

  // node(_scratch 검증)에서도 사용 가능하게
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Payroll;

})(typeof window !== 'undefined' ? window : this);
