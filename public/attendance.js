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
    renderMonthNav();
    renderRule(e);
    $('myrows').innerHTML = '불러오는 중…';
    // loadDays = 기록 병합 + 미기록 소정일 채움(공용). 관리자 정산 화면과 동일한 날짜 집합을 본다.
    HR.loadDays(e, state.year, state.month).then(function (r) {
      var s = Payroll.settle(r.days, state.year, state.month, r.opts, []);
      renderEstimate(s);
      renderMyRows(s, r.atts);
    }).catch(function (err) {
      $('myrows').innerHTML = '<div style="padding:12px;color:#c0392b;font-size:.82em">⚠ 기록 조회 실패: ' + esc(err.code || err.message) + '</div>';
    });
    renderExceptions();
    loadPast();
  }

  // ---- 월 이동 ----
  // 과거 달을 자유롭게 조회. 미래 달은 데이터가 없으므로 이번 달까지만.
  function renderMonthNav() {
    var now = HR.thisMonth();
    var sel = $('mSel'); sel.innerHTML = '';
    var d = new Date(now.year, now.month - 1, 1);
    var found = false;
    for (var i = 0; i < 24; i++) {
      var y = d.getFullYear(), m = d.getMonth() + 1;
      var o = document.createElement('option');
      o.value = y + '-' + m; o.textContent = HR.ymLabel(y, m) + (y === now.year && m === now.month ? ' (이번 달)' : '');
      sel.appendChild(o);
      if (y === state.year && m === state.month) found = true;
      d.setMonth(d.getMonth() - 1);
    }
    // 24개월보다 이전으로 이동한 경우에도 선택값이 유지되도록 항목을 보충
    if (!found) {
      var o2 = document.createElement('option');
      o2.value = state.year + '-' + state.month; o2.textContent = HR.ymLabel(state.year, state.month);
      sel.appendChild(o2);
    }
    sel.value = state.year + '-' + state.month;
    $('mNext').disabled = (state.year === now.year && state.month === now.month);
  }
  function goMonth(y, m) {
    var d = new Date(y, m - 1, 1);
    var now = HR.thisMonth();
    if (d.getFullYear() > now.year || (d.getFullYear() === now.year && d.getMonth() + 1 > now.month)) return;
    state.year = d.getFullYear(); state.month = d.getMonth() + 1;
    renderAll();
  }

  // ---- 급여 규칙(급여유형별) ----
  function renderRule(emp) {
    var t = Payroll.empTypeDef(HR.empType(emp));
    // 오늘 기준 유효 시급(시급 변경 이력 반영). hourlyWage 필드는 예약 변경 전까지 옛 값일 수 있어 직접 쓰지 않는다.
    $('ruleWage').textContent = HR.currentWage(emp).toLocaleString() + '원';
    $('ruleType').textContent = t.label + ' · ' + t.short;
    $('ruleDeduct').innerHTML = t.notes.map(function (n) { return '· ' + esc(n); }).join('<br>');
  }

  function renderEstimate(s) {
    var worked = s.rows.filter(function (r) { return !r.absent; }).length;
    var absent = s.rows.filter(function (r) { return r.absent && !r.missing; }).length;
    var missing = s.rows.filter(function (r) { return r.missing; }).length;
    var fullWeeks = s.weeks.filter(function (w) { return w.juhyu > 0; }).length;
    var now = HR.thisMonth();
    var isNow = (state.year === now.year && state.month === now.month);
    var dedTxt = s.deductions.map(function (d) { return ' − ' + d.label.replace(/\s*\(.*\)/, '') + ' ' + d.amount.toLocaleString(); }).join('');
    $('estimate').innerHTML =
      '<div class="lbl">' + state.year + '년 ' + state.month + '월 ' + (isNow ? '지금까지 근무 기준 <b>예정 급여액</b>' : '<b>급여액</b>') +
      ' <span style="opacity:.8">· ' + esc(s.typeLabel) + '</span></div>' +
      '<div class="big">₩ ' + s.net.toLocaleString() + '</div>' +
      '<div class="sub">' + esc(s.totalName) + ' ' + s.total.toLocaleString() + dedTxt + ' · 지급예정 ' + (state.month === 12 ? state.year + 1 : state.year) + '년 ' + (state.month === 12 ? 1 : state.month + 1) + '월</div>' +
      '<div class="chips"><span class="chip">' + esc(s.payName) + ' ' + s.용역수당.toLocaleString() + '</span><span class="chip">주휴수당 ' + s.주휴수당.toLocaleString() + '</span>' +
      '<span class="chip">근무 ' + worked + '일 · 결근 ' + absent + '일</span>' +
      (missing ? '<span class="chip" style="background:rgba(255,190,90,.35)">⚠ 미기록 ' + missing + '일</span>' : '') +
      '<span class="chip">개근주 ' + fullWeeks + '</span></div>';
  }

  function renderMyRows(s, atts) {
    var attMap = {}; (atts || []).forEach(function (a) { attMap[a.date] = a; });
    var tagTxt = { ms: '미기록', ab: '결근', ov: '초과', et: '조퇴→풀근무', ch: '시간변경' };
    var missing = 0;
    var rows = s.rows.map(function (r) {
      if (r.missing) missing++;
      var kind = r.missing ? 'ms' : (r.absent ? 'ab' : (r.agreedIn ? 'ch' : (r.workedMin > 240 ? 'ov' : (r.workedMin === 240 ? 'et' : ''))));
      var wd = ['일', '월', '화', '수', '목', '금', '토'][r.wd];
      var raw = attMap[r.date] || {};
      var inTxt = r.absent ? '-' : (raw.clockIn && raw.clockIn !== r.clampIn ? raw.clockIn + '→' + r.clampIn : (r.clampIn || '09:00'));
      var edited = (raw.editHistory && raw.editHistory.length) ? '<span class="edited" title="' + esc(lastEdit(raw.editHistory)) + '">✎수정됨</span>' : '';
      return '<tr' + (r.missing ? ' class="miss"' : '') + '><td>' + r.date.slice(5) + ' (' + wd + ')</td><td class="c">' + inTxt + '</td><td class="c">' + (r.clockOut || '-') + '</td>' +
        '<td class="r">' + (r.pay ? r.pay.toLocaleString() + '원' : '-') + '</td>' +
        '<td class="c">' + (kind && tagTxt[kind] ? '<span class="tag ' + kind + '">' + tagTxt[kind] + '</span>' : '') + ' ' + edited + '</td>' +
        '<td class="c"><button class="btn sm ' + (r.missing ? '' : 'sec') + '" data-edit="' + r.date + '" data-new="' + (r.missing ? 1 : 0) + '">' + (r.missing ? '＋등록' : '수정') + '</button></td></tr>';
    }).join('');
    $('myrows').innerHTML =
      (missing ? '<div class="misswarn">⚠ 기록이 없는 근무일이 <b>' + missing + '일</b> 있습니다. 실제로 근무했다면 <b>＋등록</b>으로 보충해 주세요. (미기록이 있는 주는 주휴수당이 발생하지 않습니다)</div>' : '') +
      '<table><thead><tr><th>날짜</th><th class="c">출근</th><th class="c">퇴근</th><th class="r">' + esc(s.payName) + '</th><th class="c">비고</th><th class="c">수정</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div style="padding:9px 10px;border-top:1px solid var(--line)"><button class="btn sm sec" id="btnAddRec">＋ 다른 날짜 기록 추가</button> ' +
      '<span class="muted">주말·공휴일 근무 등 표에 없는 날짜</span></div>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
      b.onclick = function () {
        var date = b.getAttribute('data-edit');
        openEdit(date, attMap[date] || {}, { isNew: b.getAttribute('data-new') === '1' });
      };
    });
    // 기본 날짜 = 조회 중인 달 기준(이번 달이면 오늘, 지난 달이면 그 달 말일)
    $('btnAddRec').onclick = function () { openEdit(defaultAddDate(), {}, { isNew: true, pickDate: true }); };
  }
  function lastEdit(h) { var e = h[h.length - 1]; return e.field + ': ' + (e.old || '-') + '→' + e['new'] + ' (' + (e.at || '').slice(0, 10) + ' by ' + e.by + ')'; }

  // ---- 기록 수정 / 누락분 보충 등록 ----
  // 수정과 신규 등록은 같은 모달·같은 저장 경로(editAttendance = set merge + 이력)를 쓴다.
  var editDate = null, editPick = false;
  function defaultAddDate() {
    var now = HR.thisMonth();
    if (state.year === now.year && state.month === now.month) return HR.todayStr();
    return HR.ymd(state.year, state.month + 1, 0); // 그 달 말일
  }
  function openEdit(date, raw, o) {
    o = o || {};
    editDate = date; editPick = !!o.pickDate;
    var so = (state.emp && state.emp.sojeong) || {};
    $('editTitle').textContent = o.isNew ? '출퇴근 기록 등록' : (date + ' 기록 수정');
    $('editSub').textContent = o.isNew
      ? '누락된 기록을 보충 등록합니다 — 등록자·이력이 남습니다. 실제 근무한 시각으로 입력하세요.'
      : (state.isAdmin ? '관리자 수정 — 수정자·이력이 기록됩니다.' : '본인 수정 — 수정 이력이 기록됩니다.');
    $('editDateRow').classList.toggle('hide', !editPick);
    $('editDate').value = date;
    $('editDate').max = HR.todayStr();          // 미래 기록 방지
    $('editDate').min = state.emp.startDate || '';
    // 보충 등록은 소정시간을 기본값으로 채워 한 번에 저장할 수 있게 한다.
    $('editIn').value = raw.clockIn || (o.isNew ? (so.start || '09:00') : '');
    $('editOut').value = raw.clockOut || (o.isNew ? (so.end || '13:00') : '');
    $('editAbsent').checked = o.isNew ? false : !!raw.absent;
    $('editMsg').textContent = ''; $('editM').classList.remove('hide');
  }
  function saveEdit() {
    var date = editPick ? $('editDate').value : editDate;
    if (!date) { $('editMsg').textContent = '날짜를 선택하세요.'; return; }
    var patch = { date: date, clockIn: $('editIn').value || null, clockOut: $('editOut').value || null, absent: $('editAbsent').checked };
    if (patch.absent) { patch.clockIn = null; patch.clockOut = null; }
    else if (!patch.clockOut) { $('editMsg').textContent = '퇴근 시각을 입력하세요. (없으면 급여가 0원으로 계산됩니다)'; return; }
    $('editSave').disabled = true; $('editMsg').textContent = '저장 중…';
    HR.editAttendance(state.emp.empId, date, patch, state.viewer).then(function () {
      $('editM').classList.add('hide');
      // 다른 달 기록을 등록했으면 그 달로 이동 — "저장했는데 안 보인다"를 막는다.
      var p = date.split('-');
      if (+p[0] !== state.year || +p[1] !== state.month) goMonth(+p[0], +p[1]);
      else renderAll();
    }).catch(function (e) { $('editMsg').textContent = '실패: ' + e.message; })
      .then(function () { $('editSave').disabled = false; });
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
    $('mSel').onchange = function () { var p = $('mSel').value.split('-'); goMonth(+p[0], +p[1]); };
    $('mPrev').onclick = function () { goMonth(state.year, state.month - 1); };
    $('mNext').onclick = function () { goMonth(state.year, state.month + 1); };
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
