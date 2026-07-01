// hr_seed.js — 구본희 + 2026 3~6월 출퇴근 + 4·5·6월 정산서 시드 (멱등, 관리자 전용)
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var logEl;
  function log(s) { logEl.textContent += s + '\n'; }
  var EMP_ID = 'emp_gubonhee'; // 고정 ID로 upsert → 이메일만 바꿔 재실행해도 같은 직원/QR 유지

  // ── 실제 출퇴근 데이터 (xlsx/PDF 근거) ──
  // [date, clockIn, clockOut, agreedIn?]  / 결근은 absent 배열
  var WORK = [
    // 3월 (첫 근무 3/25)
    ['2026-03-25', '08:52', '13:08'], ['2026-03-26', '09:00', '13:01'], ['2026-03-27', '08:52', '12:58'],
    ['2026-03-30', '08:52', '13:26'], ['2026-03-31', '08:53', '13:02'],
    // 4월 (출근 표시 09:00, 04-30 시간변경 10:00)
    ['2026-04-01', '09:00', '13:08'], ['2026-04-02', '09:00', '13:00'], ['2026-04-03', '09:00', '13:07'],
    ['2026-04-06', '09:00', '14:03'], ['2026-04-07', '09:00', '14:44'], ['2026-04-08', '09:00', '13:41'],
    ['2026-04-09', '09:00', '13:03'], ['2026-04-10', '09:00', '12:57'], ['2026-04-13', '09:00', '13:35'],
    ['2026-04-14', '09:00', '13:01'], ['2026-04-15', '09:00', '15:22'], ['2026-04-16', '09:00', '13:03'],
    ['2026-04-17', '09:00', '13:00'], ['2026-04-20', '09:00', '13:30'], ['2026-04-21', '09:00', '13:28'],
    ['2026-04-22', '09:00', '13:00'], ['2026-04-23', '09:00', '13:02'], ['2026-04-24', '09:00', '13:01'],
    ['2026-04-27', '09:00', '13:43'], ['2026-04-28', '09:00', '13:01'], ['2026-04-29', '09:00', '12:59'],
    ['2026-04-30', '10:00', '14:06', '10:00'],
    // 5월 (05-08 지각 09:22, 05-11 시간변경 09:01)
    ['2026-05-06', '09:00', '12:59'], ['2026-05-07', '09:00', '13:09'], ['2026-05-08', '09:22', '12:59'],
    ['2026-05-11', '09:01', '14:28', '09:01'], ['2026-05-12', '09:00', '13:23'], ['2026-05-13', '09:00', '12:54'],
    ['2026-05-14', '09:00', '13:13'], ['2026-05-15', '09:00', '12:58'], ['2026-05-18', '09:00', '13:40'],
    ['2026-05-19', '09:00', '13:00'], ['2026-05-21', '09:00', '12:56'], ['2026-05-22', '09:00', '12:56'],
    ['2026-05-26', '09:00', '15:01'], ['2026-05-27', '09:00', '13:00'], ['2026-05-28', '09:00', '13:01'],
    ['2026-05-29', '09:00', '13:02'],
    // 6월 (실제 스캔 시각)
    ['2026-06-01', '08:56', '14:30'], ['2026-06-02', '08:55', '13:31'], ['2026-06-04', '08:52', '13:20'],
    ['2026-06-05', '08:59', '13:03'], ['2026-06-08', '08:55', '15:06'], ['2026-06-09', '08:55', '13:03'],
    ['2026-06-10', '08:55', '12:39'], ['2026-06-11', '08:52', '12:59'], ['2026-06-15', '08:52', '14:25'],
    ['2026-06-16', '08:53', '12:13'], ['2026-06-18', '08:52', '12:57'], ['2026-06-19', '08:55', '12:32'],
    ['2026-06-22', '08:57', '13:45'], ['2026-06-23', '09:00', '12:04'], ['2026-06-24', '08:50', '12:04'],
    ['2026-06-25', '08:57', '11:55'], ['2026-06-26', '08:55', '13:04'], ['2026-06-29', '08:54', '15:11'],
    ['2026-06-30', '08:54', '12:05'],
  ];
  var ABSENT = ['2026-05-01', '2026-05-04', '2026-05-05', '2026-05-20', '2026-05-25', '2026-06-03', '2026-06-12', '2026-06-17'];

  var PAYSLIP_MONTHS = [
    { y: 2026, m: 4, adj: [{ label: '3월 미지급분(30분)', amount: 5500 }], status: 'sent' },
    { y: 2026, m: 5, adj: [], status: 'sent' },
    { y: 2026, m: 6, adj: [], status: 'draft' },
  ];

  document.addEventListener('DOMContentLoaded', function () {
    logEl = $('log');
    $('login').onclick = function () { HR.signInGoogle(); };
    HR.auth().onAuthStateChanged(function (u) {
      if (!u) return;
      if (!HR.isAdmin(u.email)) { $('gate').innerHTML = '<p style="color:#c0392b">관리자 계정만 사용할 수 있습니다. 현재: ' + (u.email || '익명') + '</p>'; return; }
      $('gate').style.display = 'none'; $('app').style.display = '';
      $('who').textContent = '👤 ' + u.email;
    });
    $('run').onclick = run;
  });

  function run() {
    var email = $('empEmail').value.trim().toLowerCase();
    if (!email) { alert('직원 Gmail을 입력하세요.'); return; }
    $('run').disabled = true; logEl.textContent = '';
    log('직원 upsert 중… (empId=' + EMP_ID + ')');
    var ref = HR.hrCol().doc(EMP_ID);
    ref.get().then(function (snap) {
      var ex = snap.exists ? snap.data() : {};
      // 입력(쉼표 다중 가능) + 기존 emails/email 을 합집합. 첫 입력값이 대표(정산서 수신).
      var emails = HR.normEmails(email.split(',').concat(ex.emails || []).concat(ex.email ? [ex.email] : []));
      var base = { name: '구본희', email: emails[0], emails: emails, startDate: '2026-03-25', hourlyWage: 11000, active: true,
        sojeong: { start: '09:00', end: '13:00', days: [1, 2, 3, 4, 5] } };
      if (!snap.exists) base.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      return ref.set(base, { merge: true }).then(function () {
        log(snap.exists ? '직원 이메일 갱신(합집합): ' + emails.join(', ') + ' · 대표 ' + emails[0]
                        : '직원 생성: 구본희 (' + emails.join(', ') + ')');
        return Object.assign({ empId: EMP_ID }, base);
      });
    }).then(function (emp) {
      return seedAttendance(emp).then(function () { return seedPayslips(emp); });
    }).then(function () {
      log('\n✅ 시드 완료. admin_payroll.html / attendance.html 에서 확인하세요.');
      $('run').disabled = false;
    }).catch(function (e) { log('\n❌ 실패: ' + e.message); $('run').disabled = false; });
  }

  function seedAttendance(emp) {
    var batch = HR.db().batch();
    var col = HR.attCol(emp.empId);
    WORK.forEach(function (r) {
      var d = { date: r[0], clockIn: r[1], clockOut: r[2], absent: false, source: 'seed' };
      if (r[3]) d.agreedIn = r[3];
      batch.set(col.doc(r[0]), d, { merge: true });
    });
    ABSENT.forEach(function (dt) {
      batch.set(col.doc(dt), { date: dt, clockIn: null, clockOut: null, absent: true, source: 'seed' }, { merge: true });
    });
    return batch.commit().then(function () { log('출퇴근 시드: 근무 ' + WORK.length + '일 + 결근 ' + ABSENT.length + '일'); });
  }

  function seedPayslips(emp) {
    // 엔진 계산에 필요한 전체 days (인접월 포함) — 여기선 시드한 전체를 그대로 사용
    var days = WORK.map(function (r) { return { date: r[0], clockIn: r[1], clockOut: r[2], absent: false, agreedIn: r[3] || null }; })
      .concat(ABSENT.map(function (dt) { return { date: dt, clockIn: null, clockOut: null, absent: true }; }));
    var opts = HR.payrollOpts(emp);
    var chain = Promise.resolve();
    PAYSLIP_MONTHS.forEach(function (pm) {
      chain = chain.then(function () {
        var s = Payroll.settle(days, pm.y, pm.m, opts, pm.adj);
        var doc = {
          yearMonth: HR.ymLabel(pm.y, pm.m), empId: emp.empId, empName: emp.name, email: emp.email,
          hourlyWage: emp.hourlyWage || 11000,
          settle: {
            용역수당: s.용역수당, 주휴수당: s.주휴수당, adjustmentSum: s.adjustmentSum,
            total: s.total, incomeTax: s.incomeTax, localTax: s.localTax, net: s.net,
            weeks: s.weeks.map(function (w) { return { mondayStr: w.mondayStr, sundayStr: w.sundayStr, juhyu: w.juhyu, status: w.status, carryOut: w.carryOut }; }),
          },
          adjustments: pm.adj, status: pm.status, source: 'seed',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        return HR.payCol(emp.empId).doc(doc.yearMonth).set(doc, { merge: true }).then(function () {
          log('정산서 시드 ' + doc.yearMonth + ': 지급 ' + s.net.toLocaleString() + '원 (' + pm.status + ')');
        });
      });
    });
    return chain;
  }
})();
