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
//  · 원천징수: 소득세=floor10(총액×3%), 지방세=floor10(소득세×10%). 지급=총액-소득세-지방세.
//
// 전역 노출: window.Payroll

(function (global) {
  'use strict';

  var DEFAULT_WAGE = 11000;
  var DEFAULT_SOJEONG_MIN = 240; // 1일 소정 4시간
  var DEFAULT_START = '09:00';
  var DEFAULT_END = '13:00';

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
      var hasAbsent = days.some(function (x) { return x.absent; });
      var workedDays = days.filter(function (x) { return !x.absent; }).length;
      var sojeongHours = soDays * 4;

      var juhyu = 0, status;
      if (!endsThisMonth) { status = '미완성→다음달 이월'; }
      else if (soDays === 0) { status = '소정일 없음'; }
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
        soDays: soDays, workedDays: workedDays, hasAbsent: hasAbsent,
        juhyu: endsThisMonth ? juhyu : 0,
        carryOut: !endsThisMonth,   // 다음달 이월 표시
        status: status,
        rows: days.filter(function (x) { return x.y === year && x.m === month; }),
      });
    });

    var 주휴 = weeks.reduce(function (s, w) { return s + w.juhyu; }, 0);

    return { year: year, month: month, rows: monthRows, weeks: weeks, 용역수당: 용역, 주휴수당: 주휴 };
  }

  // ---- 원천징수 ----
  function withholding(total) {
    var incomeTax = floor10(total * 0.03);
    var localTax = floor10(incomeTax * 0.10);
    return { incomeTax: incomeTax, localTax: localTax, net: total - incomeTax - localTax };
  }

  // ---- 월 정산 전체(이월/조정 포함) ----
  // adjustments: [{label, amount}] (양수/음수 모두 가능). 예: 전월 이월 주휴, 3월 미지급분 등.
  function settle(allDays, year, month, opts, adjustments) {
    var base = computeMonth(allDays, year, month, opts);
    adjustments = adjustments || [];
    var adjSum = adjustments.reduce(function (s, a) { return s + (a.amount || 0); }, 0);
    var total = base.용역수당 + base.주휴수당 + adjSum;
    var wh = withholding(total);
    return {
      year: year, month: month,
      rows: base.rows, weeks: base.weeks,
      용역수당: base.용역수당, 주휴수당: base.주휴수당,
      adjustments: adjustments, adjustmentSum: adjSum,
      total: total,
      incomeTax: wh.incomeTax, localTax: wh.localTax, net: wh.net,
    };
  }

  global.Payroll = {
    DEFAULT_WAGE: DEFAULT_WAGE,
    DEFAULT_SOJEONG_MIN: DEFAULT_SOJEONG_MIN,
    DEFAULT_START: DEFAULT_START,
    DEFAULT_END: DEFAULT_END,
    toMin: toMin, minToHHMM: minToHHMM, round: round, floor10: floor10,
    weekday: weekday, mondayOf: mondayOf, ymdStr: ymdStr, parseYMD: parseYMD,
    fmtWon: fmtWon, fmtDur: fmtDur,
    computeDay: computeDay,
    computeMonth: computeMonth,
    withholding: withholding,
    settle: settle,
  };

  // node(_scratch 검증)에서도 사용 가능하게
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Payroll;

})(typeof window !== 'undefined' ? window : this);
