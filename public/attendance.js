// attendance.js — 직원용 출퇴근·급여 페이지
// 본인 Gmail 로그인 → 본인 기록/예정급여/규칙/과거정산서. dakkuharu@gmail.com = 전체 조회·수정.

(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = { viewer: null, isAdmin: false, emp: null, year: 0, month: 0 };

  // 조용한 실패 방지: 처리 안 된 오류(권한/색인/스크립트)를 화면에 그대로 표시.
  // (모바일에서 콘솔을 못 볼 때도 원인이 바로 보이도록)
  function authInfo() {
    try {
      var u = firebase.auth().currentUser;
      if (!u) return 'auth=없음(로그인안됨)';
      var provs = (u.providerData || []).map(function (p) { return p.providerId; }).join(',');
      return 'auth=' + (u.email || '(이메일없음)') + (u.isAnonymous ? ' [익명]' : '') + ' provider=' + (provs || '-');
    } catch (e) { return 'auth=?'; }
  }
  function showError(msg) {
    var full = msg + '  ·  ' + authInfo();
    ['myrows', 'excList', 'pastArea'].forEach(function (id) {
      var el = $(id);
      if (el && /불러오는 중/.test(el.textContent)) {
        el.innerHTML = '<div style="padding:12px;color:#c0392b;font-size:.82em">⚠ ' + esc(full) + '</div>';
      }
    });
    var est = $('estimate');
    if (est && !est.innerHTML.trim()) {
      est.innerHTML = '<div class="lbl">⚠ 불러오기 오류</div><div class="sub">' + esc(full) + '</div>';
    }
  }
  window.addEventListener('unhandledrejection', function (ev) {
    var r = (ev && ev.reason) || {};
    showError((r.code ? '[' + r.code + '] ' : '') + (r.message || String(r)));
  });
  window.addEventListener('error', function (ev) { showError(ev.message || '스크립트 오류'); });

  document.addEventListener('DOMContentLoaded', function () {
    var tm = HR.thisMonth(); state.year = tm.year; state.month = tm.month;
    $('gateLogin').onclick = function () {
      var u = HR.auth().currentUser;
      var pre = (u && u.isAnonymous) ? HR.signOut() : Promise.resolve();
      pre.then(function () { return HR.signInGoogle(); }).catch(function (e) { $('gateMsg').textContent = '로그인 실패: ' + e.message; });
    };
    bindStatic();
    HR.auth().onAuthStateChanged(function (u) {
      clearData();
      if (!u || u.isAnonymous) return showGate('Gmail로 로그인해 주세요.', false);
      state.viewer = u.email.toLowerCase();
      state.isAdmin = HR.isAdmin(state.viewer);
      $('who').innerHTML = '👤 ' + u.email + ' · <a href="#" id="logout">로그아웃</a>';
      $('logout').onclick = function (e) { e.preventDefault(); HR.signOut(); };
      init();
    });
  });

  // 인증 전환/게이트 시 이전 계정의 렌더 잔상 제거 (미인증 계정에 옛 데이터가 남지 않도록).
  function clearData() {
    state.emp = null;
    $('adminbar').classList.add('hide');
    $('myrows').innerHTML = '불러오는 중…';
    $('excList').innerHTML = '불러오는 중…';
    $('pastArea').innerHTML = '불러오는 중…';
    $('estimate').innerHTML = '';
    $('title').textContent = '내 출퇴근 · 급여';
  }
  function showGate(msg, wrong) {
    clearData();
    $('gate').classList.remove('hide'); $('app').classList.add('hide');
    $('gateMsg').style.whiteSpace = 'pre-line'; $('gateMsg').textContent = msg;
    $('gateLogin').textContent = wrong ? '다른 계정으로 로그인' : 'Google로 로그인';
    $('gateLogin').onclick = function () {
      HR.signOut().then(function () { return HR.signInGoogle(); }).catch(function (e) { $('gateMsg').textContent = '로그인 실패: ' + e.message; });
    };
  }

  function init() {
    $('gate').classList.add('hide'); $('app').classList.remove('hide');
    if (state.isAdmin) {
      $('adminbar').classList.remove('hide');
      HR.listEmployees().then(function (list) {
        var sel = $('empSel'); sel.innerHTML = '';
        list.forEach(function (e) { var o = document.createElement('option'); o.value = e.empId; o.textContent = e.name + (e.active ? '' : ' (퇴사)'); sel.appendChild(o); });
        sel.onchange = function () { loadEmployee(sel.value); };
        if (list.length) loadEmployee(list[0].empId);
        else $('title').textContent = '등록된 직원이 없습니다.';
      }).catch(function (err) {
        showGate('직원 목록 조회 실패: ' + (err.code || err.message), true);
      });
    } else {
      HR.findEmployeeByEmail(state.viewer).then(function (emp) {
        if (!emp) { return showGate('등록된 직원 계정이 아닙니다.\n현재 로그인: ' + state.viewer + '\n직원 본인 Gmail로 로그인하거나 관리자에게 문의하세요.', true); }
        state.emp = emp; renderAll();
      }).catch(function (err) {
        showGate('접근 권한이 없거나 조회에 실패했습니다.\n(' + (err.code || err.message) + ')\n현재 로그인: ' + state.viewer, true);
      });
    }
  }
  function loadEmployee(empId) { HR.getEmployee(empId).then(function (e) { state.emp = e; renderAll(); }); }

  function renderAll() {
    var e = state.emp;
    $('title').textContent = state.isAdmin ? (e.name + '님 출퇴근 · 급여') : '내 출퇴근 · 급여';
    $('ruleWage').textContent = (e.hourlyWage || 11000).toLocaleString() + '원';
    HR.loadRange(e.empId, state.year, state.month).then(function (range) {
      var days = HR.mergeDays(range.atts, range.excs);
      var opts = HR.payrollOpts(e);
      var s = Payroll.settle(days, state.year, state.month, opts, []);
      renderEstimate(s, days);
      renderMyRows(s, range.atts);
    });
    renderExceptions();
    loadPast();
  }

  function renderEstimate(s, days) {
    var worked = s.rows.filter(function (r) { return !r.absent; }).length;
    var absent = s.rows.filter(function (r) { return r.absent; }).length;
    var fullWeeks = s.weeks.filter(function (w) { return w.juhyu > 0; }).length;
    $('estimate').innerHTML =
      '<div class="lbl">이번 달(' + state.year + '년 ' + state.month + '월) 지금까지 근무 기준 <b>예정 급여액</b></div>' +
      '<div class="big">₩ ' + s.net.toLocaleString() + '</div>' +
      '<div class="sub">정산 총액 ' + s.total.toLocaleString() + ' − 소득세 ' + s.incomeTax.toLocaleString() + ' − 지방세 ' + s.localTax.toLocaleString() + ' · 지급예정 ' + (state.month === 12 ? state.year + 1 : state.year) + '년 ' + (state.month === 12 ? 1 : state.month + 1) + '월</div>' +
      '<div class="chips"><span class="chip">용역수당 ' + s.용역수당.toLocaleString() + '</span><span class="chip">주휴수당 ' + s.주휴수당.toLocaleString() + '</span>' +
      '<span class="chip">근무 ' + worked + '일 · 결근 ' + absent + '일</span><span class="chip">개근주 ' + fullWeeks + '</span></div>';
  }

  function renderMyRows(s, atts) {
    var attMap = {}; (atts || []).forEach(function (a) { attMap[a.date] = a; });
    var tagTxt = { ab: '결근', ov: '초과', et: '조퇴→풀근무', ch: '시간변경' };
    var rows = s.rows.map(function (r) {
      var kind = r.absent ? 'ab' : (r.agreedIn ? 'ch' : (r.workedMin > 240 ? 'ov' : (r.workedMin === 240 ? 'et' : '')));
      var wd = ['일', '월', '화', '수', '목', '금', '토'][r.wd];
      var raw = attMap[r.date] || {};
      var inTxt = r.absent ? '-' : (raw.clockIn && raw.clockIn !== r.clampIn ? raw.clockIn + '→' + r.clampIn : (r.clampIn || '09:00'));
      var edited = (raw.editHistory && raw.editHistory.length) ? '<span class="edited" title="' + esc(lastEdit(raw.editHistory)) + '">✎수정됨</span>' : '';
      return '<tr><td>' + r.date.slice(5) + ' (' + wd + ')</td><td class="c">' + inTxt + '</td><td class="c">' + (r.clockOut || '-') + '</td>' +
        '<td class="r">' + (r.pay ? r.pay.toLocaleString() + '원' : '-') + '</td>' +
        '<td class="c">' + (kind && tagTxt[kind] ? '<span class="tag ' + kind + '">' + tagTxt[kind] + '</span>' : '') + ' ' + edited + '</td>' +
        '<td class="c"><button class="btn sm sec" data-edit="' + r.date + '">수정</button></td></tr>';
    }).join('');
    $('myrows').innerHTML = '<table><thead><tr><th>날짜</th><th class="c">출근</th><th class="c">퇴근</th><th class="r">용역수당</th><th class="c">비고</th><th class="c">수정</th></tr></thead><tbody>' + rows + '</tbody></table>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
      b.onclick = function () { openEdit(b.getAttribute('data-edit'), attMap[b.getAttribute('data-edit')] || {}); };
    });
  }
  function lastEdit(h) { var e = h[h.length - 1]; return e.field + ': ' + (e.old || '-') + '→' + e['new'] + ' (' + (e.at || '').slice(0, 10) + ' by ' + e.by + ')'; }

  // ---- 기록 수정 ----
  var editDate = null;
  function openEdit(date, raw) {
    editDate = date;
    $('editTitle').textContent = date + ' 기록 수정';
    $('editSub').textContent = state.isAdmin ? '관리자 수정 — 수정자·이력이 기록됩니다.' : '본인 수정 — 수정 이력이 기록됩니다.';
    $('editIn').value = raw.clockIn || ''; $('editOut').value = raw.clockOut || ''; $('editAbsent').checked = !!raw.absent;
    $('editMsg').textContent = ''; $('editM').classList.remove('hide');
  }
  function saveEdit() {
    var patch = { clockIn: $('editIn').value || null, clockOut: $('editOut').value || null, absent: $('editAbsent').checked };
    if (patch.absent) { patch.clockIn = null; patch.clockOut = null; }
    $('editMsg').textContent = '저장 중…';
    HR.editAttendance(state.emp.empId, editDate, patch, state.viewer).then(function () {
      $('editM').classList.add('hide'); renderAll();
    }).catch(function (e) { $('editMsg').textContent = '실패: ' + e.message; });
  }

  // ---- 사전등록 ----
  function renderExceptions() {
    HR.excCol(state.emp.empId).get().then(function (snap) {
      if (snap.empty) { $('excList').innerHTML = '<span class="muted">등록된 예정이 없습니다.</span>'; return; }
      var docs = []; snap.forEach(function (d) { docs.push(d); });
      docs.sort(function (a, b) { return a.id < b.id ? 1 : -1; });
      docs = docs.slice(0, 30);
      var rows = '';
      docs.forEach(function (d) {
        var e = d.data();
        var tag = e.type === '휴무' ? '<span class="tag ab">휴무</span>' : '<span class="tag ch">시간변경</span>';
        var content = e.type === '휴무' ? (e.memo || '결근') : ((e.plannedIn || '') + ' ~ ' + (e.plannedOut || ''));
        rows += '<tr><td>' + d.id + '</td><td>' + tag + '</td><td>' + esc(content) + '</td><td class="c"><button class="btn sm sec" data-exc-del="' + d.id + '">✕</button></td></tr>';
      });
      $('excList').innerHTML = '<table><thead><tr><th>날짜</th><th>구분</th><th>내용</th><th class="c">취소</th></tr></thead><tbody>' + rows + '</tbody></table>';
      Array.prototype.forEach.call(document.querySelectorAll('[data-exc-del]'), function (b) {
        b.onclick = function () { HR.excCol(state.emp.empId).doc(b.getAttribute('data-exc-del')).delete().then(renderExceptions).then(renderAll); };
      });
    });
  }

  // ---- 과거 정산서 ----
  function loadPast() {
    HR.payCol(state.emp.empId).get().then(function (snap) {
      if (snap.empty) { $('pastArea').innerHTML = '<div style="padding:12px" class="muted">저장된 정산서가 없습니다.</div>'; return; }
      var docs = []; snap.forEach(function (d) { docs.push(d); });
      docs.sort(function (a, b) { return a.id < b.id ? 1 : -1; });
      var rows = '';
      docs.forEach(function (d) {
        var p = d.data(); var s = p.settle || {};
        rows += '<tr><td>' + d.id + '</td><td class="r">' + (s.net ? s.net.toLocaleString() + '원' : '-') + '</td>' +
          '<td class="c">' + (p.status === 'sent' ? '<span class="tag ov">발송됨</span>' : '<span class="muted">준비중</span>') + '</td></tr>';
      });
      $('pastArea').innerHTML = '<table><thead><tr><th>정산월</th><th class="r">지급액</th><th class="c">상태</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div style="padding:8px 10px" class="muted">정산서 PDF는 관리자 발송 메일로 받으실 수 있습니다.</div>';
    });
  }

  // ---- 모달/바인딩 ----
  function bindStatic() {
    $('ruleToggle').onclick = function () { $('rule').classList.toggle('hide'); };
    $('btnOff').onclick = function () { $('offDate').value = HR.todayStr(); $('offM').classList.remove('hide'); };
    $('btnChg').onclick = function () { $('chgDate').value = HR.todayStr(); $('chgM').classList.remove('hide'); };
    $('offCancel').onclick = function () { $('offM').classList.add('hide'); };
    $('chgCancel').onclick = function () { $('chgM').classList.add('hide'); };
    $('editCancel').onclick = function () { $('editM').classList.add('hide'); };
    $('editSave').onclick = saveEdit;
    $('offSave').onclick = function () {
      var date = $('offDate').value; if (!date) return;
      HR.excCol(state.emp.empId).doc(date).set({ type: '휴무', memo: $('offMemo').value || '', createdBy: state.viewer, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { $('offM').classList.add('hide'); $('offMemo').value = ''; renderExceptions(); renderAll(); });
    };
    $('chgSave').onclick = function () {
      var date = $('chgDate').value; if (!date) return;
      HR.excCol(state.emp.empId).doc(date).set({ type: '시간변경', plannedIn: $('chgIn').value, plannedOut: $('chgOut').value, createdBy: state.viewer, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { $('chgM').classList.add('hide'); renderExceptions(); renderAll(); });
    };
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
})();
