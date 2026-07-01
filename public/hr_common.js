// hr_common.js — 직원/급여/출퇴근 공용 헬퍼 (관리자·직원·QR 페이지 공유)
//
// Firestore 구조 (HR branch — firestore.rules 에서 이메일 기반 잠금):
//   HR/{empId}                         직원 문서 {name,email,startDate,active,endDate,hourlyWage,sojeong,...}
//   HR/{empId}/attendance/{YYYY-MM-DD} 출퇴근 {date,clockIn,clockOut,absent,agreedIn,source,editHistory[]}
//   HR/{empId}/exceptions/{YYYY-MM-DD} 사전등록 {type:'휴무'|'시간변경',plannedIn,plannedOut,memo,createdBy}
//   HR/{empId}/payslips/{YYYY-MM}      월 정산 {yearMonth,settle{...},adjustments[],status,sentAt}
//
// 전역 노출: window.HR   (firebaseConfig.js 의 전역 db, firebase 사용)

(function (global) {
  'use strict';

  var ADMIN_EMAIL = 'dakkuharu@gmail.com';

  function db() { return global.db || firebase.firestore(); }
  function auth() { return firebase.auth(); }

  // ---- 경로 ----
  function hrCol() { return db().collection('HR'); }
  function empDoc(empId) { return hrCol().doc(empId); }
  function attCol(empId) { return empDoc(empId).collection('attendance'); }
  function excCol(empId) { return empDoc(empId).collection('exceptions'); }
  function payCol(empId) { return empDoc(empId).collection('payslips'); }

  // ---- 인증 ----
  function isAdmin(email) { return (email || '').toLowerCase() === ADMIN_EMAIL; }
  function currentUser() { return auth().currentUser; }
  function currentEmail() { var u = auth().currentUser; return u && u.email ? u.email.toLowerCase() : null; }

  // 인증 상태 1회 대기 (익명 포함). Promise<User|null>
  function waitForAuth() {
    return new Promise(function (resolve) {
      var unsub = auth().onAuthStateChanged(function (u) { unsub(); resolve(u); });
    });
  }
  function signInGoogle() {
    var p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return auth().signInWithPopup(p);
  }
  function signOut() { return auth().signOut(); }
  // QR 스캔용 익명 로그인(팝업 없음) — firestore.rules 가 request.auth!=null 만 요구
  function ensureAnonAuth() {
    return waitForAuth().then(function (u) {
      if (u) return u;
      return auth().signInAnonymously().then(function (c) { return c.user; });
    });
  }

  // ---- 직원 ----
  function listEmployees() {
    return hrCol().get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) { out.push(Object.assign({ empId: d.id }, d.data())); });
      out.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });
      return out;
    });
  }
  // 이메일 목록 정규화(소문자·trim·중복제거·빈값제거). 문자열/배열 모두 허용.
  function normEmails(arr) {
    var seen = {}, out = [];
    (Array.isArray(arr) ? arr : [arr]).forEach(function (e) {
      e = (e || '').trim().toLowerCase();
      if (e && !seen[e]) { seen[e] = 1; out.push(e); }
    });
    return out;
  }
  // 직원의 로그인 허용 이메일 목록. 신규 emails 배열 우선, 없으면 legacy email 단일. [0]=대표(정산서 수신).
  function empEmails(emp) {
    if (!emp) return [];
    if (Array.isArray(emp.emails) && emp.emails.length) return normEmails(emp.emails);
    return normEmails([emp.email]);
  }
  // 본인 직원문서 조회: emails 배열 멤버십 쿼리(여러 로그인 이메일 지원).
  // ※ 규칙(HR read)이 resource.data.emails 직접 참조라, 이 array-contains 쿼리만 규칙상 허용됨.
  //   → 모든 HR 문서에는 emails 배열이 있어야 함(addEmployee/setEmployeeEmails/시드 모두 기록).
  function findEmployeeByEmail(email) {
    email = (email || '').trim().toLowerCase();
    if (!email) return Promise.resolve(null);
    return hrCol().where('emails', 'array-contains', email).limit(1).get().then(function (snap) {
      if (snap.empty) return null;
      var d = snap.docs[0];
      return Object.assign({ empId: d.id }, d.data());
    });
  }
  function getEmployee(empId) {
    return empDoc(empId).get().then(function (d) {
      return d.exists ? Object.assign({ empId: d.id }, d.data()) : null;
    });
  }
  // 신규 입사 (empId 자동)
  function addEmployee(data) {
    var ref = hrCol().doc();
    var emails = normEmails(data.emails || data.email);
    var payload = {
      name: data.name,
      email: emails[0] || (data.email || '').toLowerCase(),
      emails: emails,
      startDate: data.startDate,
      active: true,
      endDate: null,
      hourlyWage: data.hourlyWage || 11000,
      sojeong: data.sojeong || { start: '09:00', end: '13:00', days: [1, 2, 3, 4, 5] },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    return ref.set(payload).then(function () { return Object.assign({ empId: ref.id }, payload); });
  }
  function retireEmployee(empId, endDate) {
    return empDoc(empId).update({ active: false, endDate: endDate || todayStr() });
  }
  // 로그인 허용 이메일 목록 설정(멱등). 첫 번째가 대표(정산서 수신) 이메일이 됨.
  // 테스트 이메일 + 실제 이메일을 함께 넣으면 둘 다 로그인 가능.
  function setEmployeeEmails(empId, emails) {
    var list = normEmails(emails);
    if (!list.length) return Promise.reject(new Error('이메일을 1개 이상 입력하세요.'));
    return empDoc(empId).update({ email: list[0], emails: list }).then(function () { return list; });
  }

  // ---- 급여 계산에 넘길 형태로 변환 ----
  // employee.sojeong → Payroll opts
  function payrollOpts(emp) {
    var so = (emp && emp.sojeong) || {};
    return {
      wage: (emp && emp.hourlyWage) || 11000,
      sojeongStart: so.start || '09:00',
      sojeongMin: 240,
      hireDate: emp && emp.startDate,
    };
  }

  // attendance 문서 + exceptions 병합 → Payroll computeDay 입력 배열
  // atts: [{id/date, clockIn, clockOut, absent, agreedIn}], excs: [{id/date, type, plannedIn}]
  function mergeDays(atts, excs) {
    var byDate = {};
    (atts || []).forEach(function (a) {
      var date = a.date || a.id;
      byDate[date] = {
        date: date,
        clockIn: a.clockIn || null,
        clockOut: a.clockOut || null,
        absent: !!a.absent,
        agreedIn: a.agreedIn || null,
        note: a.note || null,
        _edited: (a.editHistory && a.editHistory.length) ? a.editHistory : null,
      };
    });
    (excs || []).forEach(function (e) {
      var date = e.date || e.id;
      var d = byDate[date] || (byDate[date] = { date: date, clockIn: null, clockOut: null, absent: false });
      if (e.type === '휴무') { d.absent = true; d.note = '휴무(사전등록)'; }
      else if (e.type === '시간변경') { d.agreedIn = e.plannedIn || d.agreedIn; d.note = '시간변경 ' + (e.plannedIn || '') + '~' + (e.plannedOut || ''); }
    });
    return Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
  }

  // 특정 연·월 범위(인접월 포함: 전월 마지막주 + 다음달 첫주 커버 위해 ±1달) attendance/exceptions 로드
  function loadRange(empId, year, month) {
    // 넉넉히 전월~다음달 (달 경계 주 판정)
    var from = ymd(year, month - 1, 20);
    var to = ymd(year, month + 1, 10);
    var a = attCol(empId).where(firebase.firestore.FieldPath.documentId(), '>=', from)
      .where(firebase.firestore.FieldPath.documentId(), '<=', to).get();
    var e = excCol(empId).where(firebase.firestore.FieldPath.documentId(), '>=', from)
      .where(firebase.firestore.FieldPath.documentId(), '<=', to).get();
    return Promise.all([a, e]).then(function (r) {
      var atts = []; r[0].forEach(function (d) { atts.push(Object.assign({ date: d.id }, d.data())); });
      var excs = []; r[1].forEach(function (d) { excs.push(Object.assign({ date: d.id }, d.data())); });
      return { atts: atts, excs: excs };
    });
  }

  // ---- 출퇴근 기록(수정이력 포함) ----
  // QR/수동 기록. field='clockIn'|'clockOut'. by=이메일 또는 'QR'
  function recordPunch(empId, date, field, value, by, source) {
    var ref = attCol(empId).doc(date);
    return ref.get().then(function (snap) {
      var cur = snap.exists ? snap.data() : { date: date, clockIn: null, clockOut: null, absent: false, editHistory: [] };
      var old = cur[field] || null;
      cur[field] = value;
      cur.absent = false;
      cur.source = source || cur.source || 'manual';
      cur.editHistory = (cur.editHistory || []).concat([{
        by: by || 'unknown', at: new Date().toISOString(), field: field, old: old, 'new': value,
      }]);
      return ref.set(cur, { merge: true }).then(function () { return cur; });
    });
  }
  // 관리자/본인 수정 (이력 기록)
  function editAttendance(empId, date, patch, by) {
    var ref = attCol(empId).doc(date);
    return ref.get().then(function (snap) {
      var cur = snap.exists ? snap.data() : { date: date, editHistory: [] };
      var hist = cur.editHistory || [];
      Object.keys(patch).forEach(function (k) {
        if (cur[k] !== patch[k]) hist.push({ by: by, at: new Date().toISOString(), field: k, old: cur[k] == null ? null : cur[k], 'new': patch[k] });
      });
      var next = Object.assign({}, cur, patch, { editHistory: hist });
      return ref.set(next, { merge: true }).then(function () { return next; });
    });
  }

  // ---- 날짜 유틸 (로컬=KST 가정) ----
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { // m 0/13 등 넘겨도 정규화
    var dt = new Date(y, m - 1, d); return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function nowHM() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function prevMonth() { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; }
  function thisMonth() { var d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; }
  function ymLabel(y, m) { return y + '-' + pad2(m); }

  global.HR = {
    ADMIN_EMAIL: ADMIN_EMAIL,
    db: db, auth: auth,
    hrCol: hrCol, empDoc: empDoc, attCol: attCol, excCol: excCol, payCol: payCol,
    isAdmin: isAdmin, currentUser: currentUser, currentEmail: currentEmail,
    waitForAuth: waitForAuth, signInGoogle: signInGoogle, signOut: signOut, ensureAnonAuth: ensureAnonAuth,
    listEmployees: listEmployees, findEmployeeByEmail: findEmployeeByEmail, getEmployee: getEmployee,
    addEmployee: addEmployee, retireEmployee: retireEmployee,
    normEmails: normEmails, empEmails: empEmails, setEmployeeEmails: setEmployeeEmails,
    payrollOpts: payrollOpts, mergeDays: mergeDays, loadRange: loadRange,
    recordPunch: recordPunch, editAttendance: editAttendance,
    todayStr: todayStr, nowHM: nowHM, prevMonth: prevMonth, thisMonth: thisMonth, ymLabel: ymLabel, ymd: ymd,
  };

})(typeof window !== 'undefined' ? window : this);
