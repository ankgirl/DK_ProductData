// attendance_scan.js — QR 스캔 랜딩. 익명 로그인으로 로그인 없이 출/퇴근 시각 기록(신뢰기반).
// 예외: 퇴근 찍었는데 오늘 출근 없음 → 출근 수동입력 / 출근 찍었는데 지난 퇴근 없음 → 지난 퇴근 입력.

(function () {
  'use strict';
  var app = document.getElementById('app');
  var Q = new URLSearchParams(location.search);
  var empId = Q.get('emp');
  var type = (Q.get('type') || 'in').toLowerCase();  // in=출근, out=퇴근
  var name = Q.get('name') || '직원';
  var today = HR.todayStr();
  var now = HR.nowHM();

  if (!empId) { return fail('QR 정보가 올바르지 않습니다. (emp 누락)'); }

  HR.ensureAnonAuth()
    .then(function () { return HR.attCol(empId).doc(today).get(); })
    .then(function (snap) {
      var cur = snap.exists ? snap.data() : null;
      if (type === 'out') return handleOut(cur);
      return handleIn(cur);
    })
    .catch(function (e) { fail('기록 실패: ' + e.message); });

  // ---- 출근 ----
  function handleIn(cur) {
    // 지난번 퇴근 누락 탐지: 오늘 이전 가장 최근 기록이 출근O·퇴근X·결근X 인가?
    return findDanglingClockOut().then(function (dangling) {
      if (dangling) return askPrevOut(dangling);
      return doPunch('clockIn', function () {
        renderSuccess('in', '출근 기록 완료', now, name,
          '오늘도 좋은 하루 되세요! 퇴근 시 <b>퇴근 QR</b>을 스캔해 주세요.');
      });
    });
  }
  // ---- 퇴근 ----
  function handleOut(cur) {
    var hasIn = cur && cur.clockIn && !cur.absent;
    if (!hasIn) return askMissingIn();
    return doPunch('clockOut', function () {
      var mins = Payroll.toMin(now) - Payroll.toMin(cur.clockIn < '09:00' ? '09:00' : cur.clockIn);
      renderSuccess('out', '퇴근 기록 완료', now, name,
        '오늘 근무 기록됨. 수고하셨습니다! 👋');
    });
  }

  function doPunch(field, onOK) {
    return HR.recordPunch(empId, today, field, now, 'QR', 'qr').then(onOK);
  }

  // 오늘 이전(최근 3주), 출근했으나 퇴근 미기록인 가장 최근 날짜 찾기 (색인 불필요: 범위+클라 정렬)
  function findDanglingClockOut() {
    var dt = new Date(); dt.setDate(dt.getDate() - 21);
    var from = HR.ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    return HR.attCol(empId)
      .where(firebase.firestore.FieldPath.documentId(), '>=', from)
      .where(firebase.firestore.FieldPath.documentId(), '<', today).get()
      .then(function (snap) {
        var docs = []; snap.forEach(function (d) { docs.push({ id: d.id, v: d.data() }); });
        docs.sort(function (a, b) { return a.id < b.id ? 1 : -1; }); // 내림차순(최근 우선)
        var found = null;
        docs.forEach(function (x) {
          if (found) return;
          if (x.v.clockIn && !x.v.clockOut && !x.v.absent) found = { date: x.id, clockIn: x.v.clockIn };
        });
        return found;
      });
  }

  // ---- 화면 ----
  function renderSuccess(dir, title, time, who, noteHTML) {
    app.innerHTML =
      '<div class="phone"><div class="phead in"><div class="t">🟢 ' + esc(title) + '</div></div>' +
      '<div class="pbody"><div class="bigcheck">✅</div><div class="who">' + esc(who) + ' 님</div>' +
      '<div class="sub">' + (dir === 'in' ? '출근' : '퇴근') + ' 시각</div>' +
      '<div class="time in">' + esc(time) + '</div>' +
      '<div class="sub">' + today + '</div>' +
      '<div class="note">' + noteHTML + '</div></div></div>';
  }

  // 퇴근 QR인데 오늘 출근 기록 없음 → 출근 시각 입력(빨강)
  function askMissingIn() {
    app.innerHTML =
      '<div class="phone"><div class="phead out"><div class="t">🔴 퇴근 QR</div></div>' +
      '<div class="pbody"><div class="bigcheck" style="color:#b5283c">⚠️</div><div class="who">' + esc(name) + ' 님</div>' +
      '<div class="warn"><div class="h">⚠ 오늘 출근 기록이 없어요</div>오늘 <b>출근 QR</b>이 찍히지 않았습니다. 출근 시각을 입력해 주세요.</div>' +
      '<div class="field"><span>출근</span><input type="time" id="mIn" value="09:00"><span>~ 퇴근 ' + now + '</span></div>' +
      '<div style="display:flex;gap:8px;justify-content:center;margin-top:10px">' +
      '<button class="btn sec" id="mSkip">출근없이 퇴근만</button>' +
      '<button class="btn red" id="mSave">저장하고 퇴근</button></div></div></div>';
    document.getElementById('mSave').onclick = function () {
      var inv = document.getElementById('mIn').value || '09:00';
      HR.recordPunch(empId, today, 'clockIn', inv, 'QR-manual', 'qr')
        .then(function () { return HR.recordPunch(empId, today, 'clockOut', now, 'QR', 'qr'); })
        .then(function () { renderSuccess('out', '퇴근 기록 완료', now, name, '출근 ' + inv + ' · 퇴근 ' + now + ' 저장됨. 수고하셨습니다!'); })
        .catch(function (e) { fail(e.message); });
    };
    document.getElementById('mSkip').onclick = function () {
      HR.recordPunch(empId, today, 'clockOut', now, 'QR', 'qr')
        .then(function () { renderSuccess('out', '퇴근 기록 완료', now, name, '출근 미기록 상태로 퇴근만 저장(관리자 검토 필요).'); })
        .catch(function (e) { fail(e.message); });
    };
  }

  // 출근 QR인데 지난 퇴근 누락 → 지난 퇴근 입력(빨강)
  function askPrevOut(dangling) {
    app.innerHTML =
      '<div class="phone"><div class="phead out"><div class="t">🔴 출근 QR</div></div>' +
      '<div class="pbody"><div class="bigcheck" style="color:#b5283c">⚠️</div><div class="who">' + esc(name) + ' 님</div>' +
      '<div class="warn"><div class="h">⚠ 지난번 퇴근 기록이 없어요</div><b>' + dangling.date + '</b> 퇴근 QR이 찍히지 않았습니다. 그날 퇴근 시각을 입력해 주세요. (출근 ' + esc(dangling.clockIn) + ')</div>' +
      '<div class="field"><span>' + dangling.date.slice(5) + ' 퇴근</span><input type="time" id="pOut" value="13:00"></div>' +
      '<div style="display:flex;gap:8px;justify-content:center;margin:10px 0">' +
      '<button class="btn sec" id="pLater">나중에</button>' +
      '<button class="btn red" id="pSave">저장하고 출근</button></div>' +
      '<div class="note">저장 후 오늘 출근(' + now + ')도 함께 기록됩니다.</div></div></div>';
    document.getElementById('pSave').onclick = function () {
      var outv = document.getElementById('pOut').value || '13:00';
      HR.recordPunch(empId, dangling.date, 'clockOut', outv, 'QR-manual', 'qr')
        .then(function () { return HR.recordPunch(empId, today, 'clockIn', now, 'QR', 'qr'); })
        .then(function () { renderSuccess('in', '출근 기록 완료', now, name, dangling.date + ' 퇴근 ' + outv + ' 저장 + 오늘 출근 기록됨.'); })
        .catch(function (e) { fail(e.message); });
    };
    document.getElementById('pLater').onclick = function () {
      HR.recordPunch(empId, today, 'clockIn', now, 'QR', 'qr')
        .then(function () { renderSuccess('in', '출근 기록 완료', now, name, '지난 퇴근은 미입력 상태입니다. 나중에 정리해 주세요.'); })
        .catch(function (e) { fail(e.message); });
    };
  }

  function fail(msg) {
    app.innerHTML = '<div class="phone"><div class="phead out"><div class="t">🔴 기록 실패</div></div>' +
      '<div class="pbody"><div class="bigcheck" style="color:#b5283c">⚠️</div><div class="note">' + esc(msg) + '</div></div></div>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
})();
