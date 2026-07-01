// admin_payroll.js — 직원 급여 관리(관리자 전용)
// payroll_compute.js(Payroll) + hr_common.js(HR) 사용. 관리자=dakkuharu@gmail.com 만 접근.

(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var BUILD = '2026-07-01';
  var ctx = { emp: null, year: 0, month: 0, days: [], settle: null, adjustments: [] };
  var employees = [];

  document.addEventListener('DOMContentLoaded', function () {
    $('build').textContent = 'build ' + BUILD;
    $('gateLogin').onclick = function () {
      // 다른(비관리자) 계정으로 로그인돼 있으면 먼저 로그아웃 후 계정 선택창 → 관리자 계정 선택 유도
      var u = HR.auth().currentUser;
      var pre = (u && !HR.isAdmin(u.email)) ? HR.signOut() : Promise.resolve();
      pre.then(function () { return HR.signInGoogle(); }).catch(function (e) { $('gateMsg').textContent = '로그인 실패: ' + e.message; });
    };
    HR.auth().onAuthStateChanged(function (u) {
      if (!u || u.isAnonymous) return showGate('관리자 로그인이 필요합니다.', false);
      if (!HR.isAdmin(u.email)) return showGate('관리자(' + HR.ADMIN_EMAIL + ') 계정만 접근할 수 있습니다.\n현재 로그인: ' + (u.email || '익명') + ' → 아래 버튼으로 관리자 계정을 선택하세요.', true);
      showApp(u);
    });
  });

  function showGate(msg, wrong) {
    $('gate').classList.remove('hide'); $('app').classList.add('hide');
    $('gateMsg').style.whiteSpace = 'pre-line'; $('gateMsg').textContent = msg;
    $('gateLogin').textContent = wrong ? '다른 계정으로 로그인 (관리자)' : 'Google로 로그인';
  }
  function showApp(u) {
    $('gate').classList.add('hide'); $('app').classList.remove('hide');
    $('whoami').innerHTML = '👤 ' + u.email + ' <a href="#" id="logout">로그아웃</a>';
    $('logout').onclick = function (e) { e.preventDefault(); HR.signOut(); };
    initMonthSelect();
    bindStatic();
    loadEmployees();
  }

  function bindStatic() {
    $('toggleAdd').onclick = function () { $('addForm').classList.toggle('hide'); };
    $('saveEmp').onclick = onSaveEmp;
    $('btnSettle').onclick = onSettle;
    $('btnQr').onclick = renderQR;
    $('btnQrPrint').onclick = printQR;
    $('settleEmp').onchange = loadPast;
    $('qrEmp').onchange = function () { $('qrArea').innerHTML = ''; };
    $('sendCancel').onclick = function () { $('sendM').classList.add('hide'); };
    $('sendGo').onclick = doSend;
  }

  function initMonthSelect() {
    var pm = HR.prevMonth();
    var sel = $('settleMonth'); sel.innerHTML = '';
    var d = new Date(); d.setDate(1);
    for (var i = 0; i < 15; i++) {
      var y = d.getFullYear(), m = d.getMonth() + 1;
      var o = document.createElement('option');
      o.value = y + '-' + m; o.textContent = HR.ymLabel(y, m) + (y === pm.year && m === pm.month ? ' (직전달)' : '');
      sel.appendChild(o);
      d.setMonth(d.getMonth() - 1);
    }
    sel.value = pm.year + '-' + pm.month;
  }

  // ---------- 직원 ----------
  function loadEmployees() {
    HR.listEmployees().then(function (list) {
      employees = list;
      renderEmpTable();
      fillEmpSelects();
      loadPast();
    }).catch(function (e) { $('empTable').innerHTML = '<span class="neg">직원 로드 실패: ' + e.message + '</span>'; });
  }
  function renderEmpTable() {
    if (!employees.length) { $('empTable').innerHTML = '<span class="muted">등록된 직원이 없습니다. 아래에서 입사 등록하세요.</span>'; return; }
    var rows = employees.map(function (e) {
      var mails = HR.empEmails(e);
      var mailCell = esc(mails[0] || '-') + (mails.length > 1 ? ' <span class="muted">외 ' + (mails.length - 1) + '</span>' : '');
      return '<tr><td>' + esc(e.name) + '</td><td>' + mailCell + '</td><td>' + esc(e.startDate || '-') + '</td>' +
        '<td class="r">' + (e.hourlyWage || 11000).toLocaleString() + '원</td>' +
        '<td class="c">' + (e.active ? '<span class="pill on">재직</span>' : '<span class="pill off">퇴사 ' + (e.endDate || '') + '</span>') + '</td>' +
        '<td class="c"><button class="btn sm sec" data-emails="' + e.empId + '">✉ 이메일</button> ' +
        (e.active ? '<button class="btn sm danger" data-retire="' + e.empId + '">퇴사 처리</button>' : '') + '</td></tr>';
    }).join('');
    $('empTable').innerHTML = '<table><thead><tr><th>이름</th><th>로그인 Gmail</th><th>근무 시작일</th><th class="r">시급</th><th class="c">상태</th><th class="c">관리</th></tr></thead><tbody>' + rows + '</tbody></table>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-emails]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-emails');
        var emp = employees.filter(function (e) { return e.empId === id; })[0];
        var cur = HR.empEmails(emp);
        var input = prompt('로그인 허용 Gmail (여러 개는 쉼표로 구분).\n첫 번째가 정산서 수신 대표 이메일이 됩니다.\n예: 실제이메일, 테스트이메일', cur.join(', '));
        if (input === null) return;
        HR.setEmployeeEmails(id, input.split(',')).then(function (list) {
          alert('저장 완료\n로그인 허용: ' + list.join(', ') + '\n대표(정산서 수신): ' + list[0]);
          loadEmployees();
        }).catch(function (err) { alert('실패: ' + err.message); });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-retire]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-retire');
        var end = prompt('퇴사일(YYYY-MM-DD)을 입력하세요.', HR.todayStr());
        if (!end) return;
        HR.retireEmployee(id, end).then(loadEmployees);
      };
    });
  }
  function fillEmpSelects() {
    ['settleEmp', 'qrEmp'].forEach(function (sid) {
      var sel = $(sid); var prev = sel.value; sel.innerHTML = '';
      employees.forEach(function (e) { var o = document.createElement('option'); o.value = e.empId; o.textContent = e.name + (e.active ? '' : ' (퇴사)'); sel.appendChild(o); });
      if (prev) sel.value = prev;
    });
  }
  function onSaveEmp() {
    var name = $('fName').value.trim(), email = $('fEmail').value.trim(), start = $('fStart').value, wage = parseInt($('fWage').value, 10) || 11000;
    if (!name || !email || !start) { $('addMsg').textContent = '이름·Gmail·근무시작일을 모두 입력하세요.'; return; }
    $('saveEmp').disabled = true; $('addMsg').textContent = '저장 중…';
    HR.addEmployee({ name: name, email: email, startDate: start, hourlyWage: wage }).then(function () {
      $('fName').value = ''; $('fEmail').value = ''; $('fStart').value = ''; $('fWage').value = '11000';
      $('addMsg').textContent = '등록 완료'; $('saveEmp').disabled = false; $('addForm').classList.add('hide');
      loadEmployees();
    }).catch(function (e) { $('addMsg').textContent = '실패: ' + e.message; $('saveEmp').disabled = false; });
  }

  // ---------- 정산 ----------
  function onSettle() {
    var empId = $('settleEmp').value; if (!empId) return;
    var ym = $('settleMonth').value.split('-'); var year = +ym[0], month = +ym[1];
    var emp = employees.filter(function (e) { return e.empId === empId; })[0];
    $('settleResult').classList.remove('hide');
    $('settleResult').innerHTML = '<div class="card">불러오는 중…</div>';
    // 기존 저장된 정산서(이월/조정, 상태) 있으면 불러오기
    Promise.all([HR.loadRange(empId, year, month), HR.payCol(empId).doc(HR.ymLabel(year, month)).get()])
      .then(function (r) {
        var range = r[0]; var saved = r[1].exists ? r[1].data() : null;
        var days = HR.mergeDays(range.atts, range.excs);
        var adjustments = (saved && saved.adjustments) || [];
        ctx = { emp: emp, year: year, month: month, days: days, adjustments: adjustments, status: (saved && saved.status) || 'none' };
        recompute();
      }).catch(function (e) { $('settleResult').innerHTML = '<div class="card neg">정산 로드 실패: ' + e.message + '</div>'; });
  }

  function recompute() {
    var opts = HR.payrollOpts(ctx.emp);
    ctx.settle = Payroll.settle(ctx.days, ctx.year, ctx.month, opts, ctx.adjustments);
    renderSettle();
  }

  function renderSettle() {
    var s = ctx.settle, emp = ctx.emp;
    var nextY = ctx.month === 12 ? ctx.year + 1 : ctx.year, nextM = ctx.month === 12 ? 1 : ctx.month + 1;
    var html = '<div class="card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
      '<div><b>' + esc(emp.name) + '</b> · ' + ctx.year + '년 ' + ctx.month + '월 정산 <span class="muted">(시급 ' + (emp.hourlyWage || 11000).toLocaleString() + '원 · 지급예정 ' + nextY + '년 ' + nextM + '월)</span></div>' +
      '<div class="muted">주(週) 기준: 월~일 실제 달력</div></div>';

    // 주별
    html += renderWeeks(s);

    // 이월·조정 편집
    html += '<h3 style="font-size:.95em;margin:16px 0 6px;">이월 · 조정 <span class="muted">(자동계산 외 수동 항목 — 예: 이전월 미지급분)</span></h3>';
    html += '<table id="adjTable"><tbody>';
    ctx.adjustments.forEach(function (a, i) {
      html += '<tr><td><input data-adj-label="' + i + '" value="' + esc(a.label) + '" style="width:100%"></td>' +
        '<td class="r" style="width:170px"><input data-adj-amount="' + i + '" type="number" value="' + a.amount + '" style="width:120px;text-align:right"> 원</td>' +
        '<td class="c" style="width:1%"><button class="btn sm sec" data-adj-del="' + i + '">✕</button></td></tr>';
    });
    html += '</tbody></table>';
    html += '<button class="btn sm sec" id="adjAdd" style="margin-top:6px">+ 조정 항목 추가</button>';

    // 합계
    html += '<table style="margin-top:14px;"><tbody>' +
      row('용역수당 합계', Payroll.fmtWon(s.용역수당)) +
      row('주휴수당 합계', Payroll.fmtWon(s.주휴수당)) +
      row('이월·조정', Payroll.fmtWon(s.adjustmentSum)) +
      '<tr class="row-tot"><td>정산 총액</td><td class="r">' + Payroll.fmtWon(s.total) + '</td></tr>' +
      '<tr><td>소득세 (3%)</td><td class="r neg">-' + s.incomeTax.toLocaleString() + '원</td></tr>' +
      '<tr><td>지방소득세 (0.3%)</td><td class="r neg">-' + s.localTax.toLocaleString() + '원</td></tr>' +
      '<tr class="row-final"><td>최종 지급액</td><td class="r">' + Payroll.fmtWon(s.net) + '</td></tr>' +
      '</tbody></table>';

    var carry = s.weeks.filter(function (w) { return w.carryOut; });
    if (carry.length) html += '<p class="muted">※ ' + carry.map(function (w) { return w.mondayStr.slice(5) + '~' + w.sundayStr.slice(5); }).join(', ') + ' 주휴수당은 주 완성 후 ' + nextM + '월 정산에 이월됩니다.</p>';

    html += '<div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">' +
      '<button class="btn sec" id="btnSaveDraft">💾 저장(임시)</button>' +
      '<button class="btn sec" id="btnPreview">👁 정산서 미리보기</button>' +
      '<button class="btn sec" id="btnPdf">⬇ PDF 다운로드</button>' +
      '<button class="btn gold" id="btnSend">📧 정산서 발송</button>' +
      '<span id="statusPill">' + statusPill(ctx.status) + '</span>' +
      '<span id="settleMsg" class="muted"></span></div>';
    html += '</div>';
    $('settleResult').innerHTML = html;

    // 바인딩
    $('adjAdd').onclick = function () { ctx.adjustments.push({ label: '', amount: 0 }); recompute(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-adj-label]'), function (el) { el.onchange = function () { ctx.adjustments[+el.getAttribute('data-adj-label')].label = el.value; }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-adj-amount]'), function (el) { el.onchange = function () { ctx.adjustments[+el.getAttribute('data-adj-amount')].amount = parseInt(el.value, 10) || 0; recompute(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-adj-del]'), function (el) { el.onclick = function () { ctx.adjustments.splice(+el.getAttribute('data-adj-del'), 1); recompute(); }; });
    $('btnSaveDraft').onclick = function () { savePayslip('draft'); };
    $('btnPreview').onclick = preview;
    $('btnPdf').onclick = function () { buildPDF().then(function (pdf) { pdf.save(pdfName()); }); };
    $('btnSend').onclick = openSend;
  }

  function renderWeeks(s) {
    var tagTxt = { ab: '결근', ov: '초과', et: '조퇴→풀근무', ch: '시간변경' };
    return s.weeks.map(function (w, i) {
      var label = weekLabel(s, w, i);
      var body = w.rows.map(function (r) {
        var kind = r.absent ? 'ab' : (r.agreedIn ? 'ch' : (r.workedMin > 240 ? 'ov' : (r.workedMin === 240 ? 'et' : '')));
        var wd = ['일', '월', '화', '수', '목', '금', '토'][r.wd];
        return '<tr><td>' + r.date.slice(5) + ' (' + wd + ')</td><td class="c">' + (r.absent ? '-' : (r.clampIn || '09:00')) + '</td>' +
          '<td class="c">' + (r.clockOut || '-') + '</td><td class="r">' + (r.pay ? r.pay.toLocaleString() + '원' : '-') + '</td>' +
          '<td class="c">' + (kind && tagTxt[kind] ? '<span class="tag ' + kind + '">' + tagTxt[kind] + '</span>' : '') + '</td></tr>';
      }).join('');
      var sub = w.rows.reduce(function (a, r) { return a + r.pay; }, 0);
      var juhyuTxt = w.carryOut ? '이월' : Payroll.fmtWon(w.juhyu);
      return '<div class="weekbox"><div class="weekhd"><span>' + label + '</span><span class="muted">' + esc(w.status) + '</span></div>' +
        '<table><thead><tr><th>날짜</th><th class="c">출근</th><th class="c">퇴근</th><th class="r">용역수당</th><th class="c">비고</th></tr></thead><tbody>' +
        body + '<tr class="row-tot"><td colspan="3">용역 소계</td><td class="r">' + Payroll.fmtWon(sub) + '</td><td></td></tr>' +
        '<tr><td colspan="3">주휴수당</td><td class="r">' + juhyuTxt + '</td><td></td></tr></tbody></table></div>';
    }).join('');
  }
  function weekLabel(s, w, i) {
    return (i + 1) + '주 ' + w.mondayStr.slice(5).replace('-', '/') + '(월)~' + w.sundayStr.slice(5).replace('-', '/') + '(일)';
  }
  function row(k, v) { return '<tr><td>' + k + '</td><td class="r">' + v + '</td></tr>'; }
  function statusPill(st) {
    if (st === 'sent') return '<span class="pill sent">발송됨</span>';
    if (st === 'draft') return '<span class="pill off">임시저장</span>';
    return '<span class="pill off">미저장</span>';
  }

  // ---------- 저장/발송 ----------
  function savePayslip(status) {
    var s = ctx.settle;
    var doc = {
      yearMonth: HR.ymLabel(ctx.year, ctx.month),
      empId: ctx.emp.empId, empName: ctx.emp.name, email: ctx.emp.email,
      hourlyWage: ctx.emp.hourlyWage || 11000,
      settle: stripSettle(s),
      adjustments: ctx.adjustments,
      status: status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (status === 'sent') doc.sentAt = firebase.firestore.FieldValue.serverTimestamp();
    return HR.payCol(ctx.emp.empId).doc(doc.yearMonth).set(doc, { merge: true }).then(function () {
      ctx.status = status;
      if ($('statusPill')) $('statusPill').innerHTML = statusPill(status);
      if ($('settleMsg')) $('settleMsg').textContent = (status === 'sent' ? '발송/저장 완료' : '임시저장 완료');
      loadPast();
    });
  }
  function stripSettle(s) {
    // Firestore 저장용 요약(주별 rows 는 요약만)
    return {
      용역수당: s.용역수당, 주휴수당: s.주휴수당, adjustmentSum: s.adjustmentSum,
      total: s.total, incomeTax: s.incomeTax, localTax: s.localTax, net: s.net,
      weeks: s.weeks.map(function (w) { return { mondayStr: w.mondayStr, sundayStr: w.sundayStr, juhyu: w.juhyu, status: w.status, carryOut: w.carryOut }; }),
    };
  }

  function openSend() {
    var tos = HR.empEmails(ctx.emp);
    if (!tos.length) { alert('직원 이메일이 없습니다.'); return; }
    $('sendTo').innerHTML = '받는사람: <b>' + esc(tos.join(', ')) + '</b> · 첨부: ' + pdfName();
    $('defaultMsg').textContent = '“' + ctx.month + '월 정산내역 전달 드립니다.”';
    $('extraMsg').value = '';
    $('sendMsg').textContent = '';
    $('sendM').classList.remove('hide');
  }
  function doSend() {
    $('sendGo').disabled = true; $('sendMsg').textContent = 'PDF 생성 중…';
    var extra = $('extraMsg').value.trim();
    var message = ctx.month + '월 정산내역 전달 드립니다.' + (extra ? '\n\n' + extra : '');
    buildPDF().then(function (pdf) {
      $('sendMsg').textContent = '메일 발송 중…';
      var base64 = pdf.output('datauristring').split(',')[1];
      return sendEmail({
        to_email: HR.empEmails(ctx.emp).join(','), to_name: ctx.emp.name,
        subject: '[다꾸하루] ' + ctx.year + '년 ' + ctx.month + '월 용역비 정산서',
        message: message, filename: pdfName(), content: base64,
      }).then(function () {
        return savePayslip('sent');
      }).then(function () {
        $('sendMsg').textContent = '✅ 발송 완료';
        setTimeout(function () { $('sendM').classList.add('hide'); }, 1200);
      });
    }).catch(function (e) {
      // 발송 실패 시 사용자가 직접 첨부할 수 있게 PDF 다운로드
      $('sendMsg').innerHTML = '<span class="neg">발송 실패: ' + esc(e.message) + '</span><br>PDF를 다운로드하니 직접 첨부해 주세요.';
      buildPDF().then(function (pdf) { pdf.save(pdfName()); });
    }).then(function () { $('sendGo').disabled = false; });
  }

  // 정산서 발송 — Cloud Function(sendPayslip, asia-northeast3) 경유로 Gmail 발송.
  // EmailJS 불필요. PDF(base64)를 그대로 서버로 넘기고, 자격증명은 서버 시크릿에만 존재.
  function sendEmail(params) {
    var fns = firebase.app().functions('asia-northeast3');
    return fns.httpsCallable('sendPayslip')({
      to: params.to_email,
      toName: params.to_name,
      subject: params.subject,
      message: params.message,
      filename: params.filename,
      contentBase64: params.content,
    }).then(function (res) { return res.data; });
  }

  // ---------- 정산서 문서(PDF/미리보기) ----------
  function pdfName() { return '용역비정산서_' + (ctx.emp.name || '') + '_' + HR.ymLabel(ctx.year, ctx.month) + '.pdf'; }
  function renderPayslipDoc() {
    var s = ctx.settle, emp = ctx.emp;
    var nextM = ctx.month === 12 ? 1 : ctx.month + 1;
    var h = '<h2>용역비 정산서</h2><div class="sub">' + ctx.year + '년 ' + pad2(ctx.month) + '월</div>';
    h += '<table><tbody><tr><th style="width:90px">성명</th><td>' + esc(emp.name) + '</td><th style="width:90px">지급 예정일</th><td>' + ctx.year + '년 ' + pad2(nextM) + '월</td></tr>' +
      '<tr><th>계약 시급</th><td>' + (emp.hourlyWage || 11000).toLocaleString() + '원</td><th>정산월</th><td>' + ctx.year + '년 ' + pad2(ctx.month) + '월</td></tr></tbody></table>';
    s.weeks.forEach(function (w, i) {
      h += '<div class="wk">' + weekLabel(s, w, i) + '</div>';
      h += '<table><thead><tr><th>날짜</th><th>출근</th><th>퇴근</th><th>근무시간</th><th>금액</th></tr></thead><tbody>';
      if (!w.rows.length) h += '<tr><td colspan="5" style="text-align:center;color:#999">근무 없음</td></tr>';
      w.rows.forEach(function (r) {
        var wd = ['일', '월', '화', '수', '목', '금', '토'][r.wd];
        h += '<tr><td>' + r.date.slice(5).replace('-', '.') + ' ' + wd + '</td><td>' + (r.absent ? '-' : (r.clampIn || '09:00')) + '</td><td>' + (r.clockOut || '-') + '</td><td>' + Payroll.fmtDur(r.workedMin) + '</td><td style="text-align:right">' + (r.pay ? r.pay.toLocaleString() + '원' : '-') + '</td></tr>';
      });
      var sub = w.rows.reduce(function (a, r) { return a + r.pay; }, 0);
      h += '<tr><td colspan="4">용역 소계</td><td style="text-align:right">' + sub.toLocaleString() + '원</td></tr>';
      h += '<tr><td colspan="4">주휴수당</td><td style="text-align:right">' + (w.carryOut ? '이월' : (w.juhyu ? w.juhyu.toLocaleString() + '원' : (w.status.indexOf('개근') >= 0 ? '개근' : '미발생'))) + '</td></tr>';
      h += '</tbody></table>';
    });
    h += '<div class="wk">정산 내역</div><table><tbody>';
    h += '<tr><td>용역수당 합계</td><td style="text-align:right">' + s.용역수당.toLocaleString() + '원</td></tr>';
    h += '<tr><td>주휴수당 합계</td><td style="text-align:right">' + s.주휴수당.toLocaleString() + '원</td></tr>';
    ctx.adjustments.forEach(function (a) { if (a.amount) h += '<tr><td>' + esc(a.label || '조정') + '</td><td style="text-align:right">' + a.amount.toLocaleString() + '원</td></tr>'; });
    h += '<tr><td><b>정산 총액</b></td><td style="text-align:right"><b>' + s.total.toLocaleString() + '원</b></td></tr>';
    h += '<tr><td>소득세 (3%)</td><td style="text-align:right;color:#c0392b">-' + s.incomeTax.toLocaleString() + '원</td></tr>';
    h += '<tr><td>지방소득세 (0.3%)</td><td style="text-align:right;color:#c0392b">-' + s.localTax.toLocaleString() + '원</td></tr>';
    h += '<tr style="background:#333;color:#fff"><td><b>최종 지급액</b></td><td style="text-align:right"><b>' + s.net.toLocaleString() + '원</b></td></tr>';
    h += '</tbody></table>';
    var carry = s.weeks.filter(function (w) { return w.carryOut; });
    if (carry.length) h += '<p style="color:#888;font-size:11px">* ' + carry.map(function (w) { return w.mondayStr.slice(5) + '~' + w.sundayStr.slice(5); }).join(', ') + ' 주휴수당은 주 완성 후 ' + nextM + '월 정산에 포함하여 지급됩니다.</p>';
    h += '<p style="text-align:center;margin-top:18px">위와 같이 용역비를 정산합니다.</p><p style="text-align:center;font-weight:bold">다꾸하루</p>';
    return h;
  }
  function preview() {
    var inner = renderPayslipDoc();
    var w = window.open('', '_blank');
    w.document.write('<html><head><meta charset="utf-8"><title>' + pdfName() + '</title>' +
      '<style>body{font-family:Malgun Gothic,sans-serif;background:#eee;margin:0}' +
      '#doc{width:720px;margin:20px auto;background:#fff;padding:34px 40px;font-size:13px;color:#222}' +
      '#doc h2{text-align:center;margin:0}#doc .sub{text-align:center;color:#888;margin:2px 0 18px}' +
      '#doc table{border-collapse:collapse;width:100%;font-size:12px;margin:6px 0}' +
      '#doc th,#doc td{border:1px solid #ccc;padding:5px 7px}#doc thead th{background:#333;color:#fff}' +
      '#doc .wk{font-weight:bold;margin:12px 0 3px;font-size:12px}</style></head>' +
      '<body><div id="doc">' + inner + '</div></body></html>');
    w.document.close();
  }
  function buildPDF() {
    var el = document.getElementById('payslipDoc');
    el.innerHTML = renderPayslipDoc();
    return html2canvas(el, { scale: 2, backgroundColor: '#ffffff' }).then(function (canvas) {
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF('p', 'mm', 'a4');
      var pw = 210, ph = 297;
      var iw = pw, ih = canvas.height * pw / canvas.width;
      var img = canvas.toDataURL('image/jpeg', 0.92);
      var left = ih, pos = 0;
      pdf.addImage(img, 'JPEG', 0, pos, iw, ih);
      left -= ph;
      while (left > 0) { pos = left - ih; pdf.addPage(); pdf.addImage(img, 'JPEG', 0, pos, iw, ih); left -= ph; }
      return pdf;
    });
  }

  // ---------- 과거 정산 ----------
  function loadPast() {
    var empId = $('settleEmp').value; if (!empId) { $('pastArea').innerHTML = '<span class="muted">직원 없음</span>'; return; }
    HR.payCol(empId).get().then(function (snap) {
      if (snap.empty) { $('pastArea').innerHTML = '<span class="muted">저장된 정산 기록이 없습니다.</span>'; return; }
      var docs = []; snap.forEach(function (d) { docs.push(d); });
      docs.sort(function (a, b) { return a.id < b.id ? 1 : -1; }); // 문서ID(YYYY-MM) 내림차순
      var rows = '';
      docs.forEach(function (d) {
        var p = d.data(); var s = p.settle || {};
        rows += '<tr><td>' + d.id + '</td><td class="r">' + (s.total ? s.total.toLocaleString() + '원' : '-') + '</td><td class="r">' + (s.net ? s.net.toLocaleString() + '원' : '-') + '</td>' +
          '<td class="c">' + statusPill(p.status) + '</td></tr>';
      });
      $('pastArea').innerHTML = '<table><thead><tr><th>정산월</th><th class="r">정산 총액</th><th class="r">지급액</th><th class="c">상태</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }).catch(function (e) { $('pastArea').innerHTML = '<span class="neg">' + e.message + '</span>'; });
  }

  // ---------- QR ----------
  function renderQR() {
    var empId = $('qrEmp').value; if (!empId) return;
    var emp = employees.filter(function (e) { return e.empId === empId; })[0];
    var base = location.origin + '/attendance_scan.html?emp=' + encodeURIComponent(empId) + '&name=' + encodeURIComponent(emp.name || '');
    $('qrArea').innerHTML = '<div style="text-align:center"><div id="qrIn"></div><div style="margin-top:6px;font-weight:bold;color:#1d7a3f">🟢 출근 QR</div><div class="muted">' + esc(emp.name) + '</div></div>' +
      '<div style="text-align:center"><div id="qrOut"></div><div style="margin-top:6px;font-weight:bold;color:#b5283c">🔴 퇴근 QR</div><div class="muted">' + esc(emp.name) + '</div></div>';
    new QRCode(document.getElementById('qrIn'), { text: base + '&type=in', width: 150, height: 150 });
    new QRCode(document.getElementById('qrOut'), { text: base + '&type=out', width: 150, height: 150 });
  }
  // qrcodejs 가 그린 canvas 에서 PNG dataURL 추출(없으면 img.src). 프린트 창에서 확실히 렌더됨.
  function qrDataUrl(id) {
    var box = document.getElementById(id);
    if (!box) return '';
    var c = box.querySelector('canvas');
    if (c) { try { return c.toDataURL('image/png'); } catch (e) { /* fallthrough */ } }
    var img = box.querySelector('img');
    return img ? img.src : '';
  }
  function printQR() {
    if (!document.getElementById('qrIn')) renderQR();
    setTimeout(function () {
      var emp = employees.filter(function (e) { return e.empId === $('qrEmp').value; })[0];
      var inUrl = qrDataUrl('qrIn'), outUrl = qrDataUrl('qrOut');
      var w = window.open('', '_blank');
      // 출근=위 / 퇴근=아래로 세로 배치. 두 QR 사이를 넉넉히 띄워 스캔 간섭 방지. A4 1장.
      w.document.write(
        '<html><head><meta charset="utf-8"><title>출퇴근 QR</title><style>' +
        '@page{size:A4;margin:0;}' +
        'body{font-family:"Malgun Gothic",sans-serif;text-align:center;margin:0;}' +
        'h2{margin:18mm 0 0;font-size:24px;}' +
        '.blk{margin-top:24mm;page-break-inside:avoid;}' +
        '.blk.out{margin-top:40mm;}' +
        '.blk h3{font-size:22px;margin:0 0 6mm;}' +
        '.blk img{width:60mm;height:60mm;image-rendering:pixelated;}' +
        '.hint{color:#888;font-size:13px;margin-top:3mm;}' +
        '</style></head><body>' +
        '<h2>' + esc(emp.name) + '님 출퇴근 QR</h2>' +
        '<div class="blk"><h3 style="color:#1d7a3f">🟢 출근 · 아침에 스캔</h3>' +
        '<img src="' + inUrl + '"><div class="hint">' + esc(emp.name) + ' · 출근</div></div>' +
        '<div class="blk out"><h3 style="color:#b5283c">🔴 퇴근 · 갈 때 스캔</h3>' +
        '<img src="' + outUrl + '"><div class="hint">' + esc(emp.name) + ' · 퇴근</div></div>' +
        '</body></html>');
      w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 400);
    }, 300);
  }

  // ---------- util ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
})();
