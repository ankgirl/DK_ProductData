// hr_docs.js — 계약서 사진 보관 + 관리자 문서함(재사용 양식) 공용 모듈
//
// Firestore 구조 (모두 관리자 전용 — firestore.rules 참고):
//   HR/{empId}/contracts/{contractId}            메타 {title,type,docDate,memo,pageCount,thumb,createdAt,by}
//   HR/{empId}/contracts/{contractId}/pages/{i}  페이지 {idx,dataUrl,w,h,bytes}
//   HRDocTemplates/{templateId}                  양식 {name,body,updatedAt,by}
//
// 사진은 업로드 시 브라우저에서 축소(JPEG)해 dataURL 로 저장한다.
// Firestore 문서 상한(1MB)을 넘지 않도록 목표 용량까지 품질·크기를 자동으로 낮춘다.
// 목록 화면은 메타(썸네일)만 읽어 큰 이미지를 건드리지 않는다 → 빠르고 읽기 비용도 작다.
//
// 전역 노출: window.HRDocs   (firebaseConfig.js 의 전역 db·firebase, hr_common.js 의 HR 사용)

(function (global) {
  'use strict';

  var PAGE_MAX_BYTES = 700 * 1024;  // dataURL 기준 상한(문서 1MB 여유). 초과하면 더 줄임
  var PAGE_MAX_PX = 1600;           // 장변 최대 픽셀
  var THUMB_PX = 260;

  function db() { return global.db || firebase.firestore(); }
  function contractsCol(empId) { return db().collection('HR').doc(empId).collection('contracts'); }
  function pagesCol(empId, cid) { return contractsCol(empId).doc(cid).collection('pages'); }
  function templatesCol() { return db().collection('HRDocTemplates'); }
  function nowIso() { return new Date().toISOString(); }
  function who() { return (global.HR && HR.currentEmail && HR.currentEmail()) || 'admin'; }

  // ---------- 이미지 축소 ----------
  // 파일 → {dataUrl,w,h,bytes}. 목표 용량을 넘으면 품질 → 크기 순으로 자동 재시도.
  function loadBitmap(file) {
    if (global.createImageBitmap) {
      // 휴대폰 사진의 EXIF 회전을 반영(눕지 않게)
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return loadViaImg(file); });
    }
    return loadViaImg(file);
  }
  function loadViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다: ' + file.name)); };
      img.src = url;
    });
  }
  function drawToDataUrl(src, maxPx, quality) {
    var w = src.width, h = src.height;
    var scale = Math.min(1, maxPx / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch); // 투명 PNG 대비(계약서는 흰 배경이 자연스러움)
    cx.drawImage(src, 0, 0, cw, ch);
    return { dataUrl: cv.toDataURL('image/jpeg', quality), w: cw, h: ch };
  }
  function compressImage(file, opts) {
    opts = opts || {};
    var maxPx = opts.maxPx || PAGE_MAX_PX;
    var maxBytes = opts.maxBytes || PAGE_MAX_BYTES;
    var qualities = [0.72, 0.6, 0.5, 0.42];
    return loadBitmap(file).then(function (src) {
      var out = null;
      for (var round = 0; round < 3; round++) {           // 품질을 다 낮춰도 크면 크기를 줄여 재시도
        for (var i = 0; i < qualities.length; i++) {
          out = drawToDataUrl(src, maxPx, qualities[i]);
          out.bytes = out.dataUrl.length;
          if (out.bytes <= maxBytes) return out;
        }
        maxPx = Math.round(maxPx * 0.75);
      }
      return out; // 마지막 시도 결과(그래도 크면 저장 단계에서 걸러 알림)
    });
  }

  // ---------- 계약서 ----------
  function listContracts(empId) {
    return contractsCol(empId).get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
      out.sort(function (a, b) { return (b.docDate || '') < (a.docDate || '') ? -1 : 1; }); // 최신 문서일자 먼저
      return out;
    });
  }
  // files: File[] (사진 여러 장 = 여러 페이지). onProgress(done,total)
  function addContract(empId, meta, files, onProgress) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return Promise.reject(new Error('사진을 1장 이상 선택하세요.'));
    if (!meta || !meta.title) return Promise.reject(new Error('제목을 입력하세요.'));
    var cid = contractsCol(empId).doc().id;
    var pages = [];
    var chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        return compressImage(f).then(function (img) {
          if (img.bytes > 1000 * 1024) throw new Error(f.name + ' 은(는) 축소 후에도 너무 큽니다. 사진을 나눠 올려주세요.');
          pages.push(img);
          if (onProgress) onProgress(i + 1, files.length);
        });
      });
    });
    return chain.then(function () {
      return compressImage(files[0], { maxPx: THUMB_PX, maxBytes: 60 * 1024 });
    }).then(function (thumb) {
      var batch = db().batch();
      batch.set(contractsCol(empId).doc(cid), {
        title: meta.title,
        type: meta.type || '기타',
        docDate: meta.docDate || '',
        memo: meta.memo || '',
        pageCount: pages.length,
        thumb: thumb.dataUrl,
        createdAt: nowIso(),
        by: who(),
      });
      pages.forEach(function (p, i) {
        batch.set(pagesCol(empId, cid).doc(String(i)), { idx: i, dataUrl: p.dataUrl, w: p.w, h: p.h, bytes: p.bytes });
      });
      return batch.commit();   // 메타+페이지를 한 번에 → 중간에 끊겨 반쪽 문서가 남지 않음
    }).then(function () { return cid; });
  }
  function getPages(empId, cid) {
    return pagesCol(empId, cid).get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) { out.push(d.data()); });
      out.sort(function (a, b) { return a.idx - b.idx; });
      return out;
    });
  }
  function deleteContract(empId, cid) {
    return pagesCol(empId, cid).get().then(function (snap) {
      var batch = db().batch();
      snap.forEach(function (d) { batch.delete(d.ref); });
      batch.delete(contractsCol(empId).doc(cid));
      return batch.commit();
    });
  }

  // ---------- 문서함(재사용 양식) ----------
  function listTemplates() {
    return templatesCol().get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
      out.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });
      return out;
    });
  }
  function saveTemplate(id, data) {
    var payload = { name: data.name, body: data.body, updatedAt: nowIso(), by: who() };
    var ref = id ? templatesCol().doc(id) : templatesCol().doc();
    return ref.set(payload, { merge: true }).then(function () { return ref.id; });
  }
  function deleteTemplate(id) { return templatesCol().doc(id).delete(); }

  // ---------- 양식 치환 ----------
  // 본문의 {{키}} 를 값으로 바꾼다. 값 형식은 자동 정리:
  //   · 'YYYY-MM-DD' → '2026년 9월 1일'   (날짜 입력칸을 그대로 써도 문서 문구가 자연스럽게)
  //   · 숫자          → 12,000            (금액 천단위 구분)
  function extractKeys(body) {
    var out = [], seen = {};
    (String(body || '').match(/\{\{\s*[^}]+\s*\}\}/g) || []).forEach(function (m) {
      var k = m.replace(/[{}]/g, '').trim();
      if (k && !seen[k]) { seen[k] = 1; out.push(k); }
    });
    return out;
  }
  function formatValue(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return Number(m[1]) + '년 ' + Number(m[2]) + '월 ' + Number(m[3]) + '일';
    if (/^\d{4,}$/.test(s)) return Number(s).toLocaleString('ko-KR');
    return s;
  }
  function fillTemplate(body, values) {
    values = values || {};
    return String(body || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, function (whole, key) {
      var k = key.trim();
      return Object.prototype.hasOwnProperty.call(values, k) ? formatValue(values[k]) : whole;
    });
  }

  // ---------- 인쇄 ----------
  // 숨김 iframe 으로 인쇄 — 팝업 차단에 걸리지 않고 페이지 CSS 와도 섞이지 않는다.
  function printHTML(innerHtml, title) {
    var old = document.getElementById('hrPrintFrame');
    if (old) old.parentNode.removeChild(old);
    var f = document.createElement('iframe');
    f.id = 'hrPrintFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    var doc = f.contentWindow.document;
    doc.open();
    doc.write('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + (title || '문서') + '</title><style>' +
      '@page{ size:A4; margin:18mm 16mm; }' +
      'body{ font-family:"맑은 고딕","Malgun Gothic",sans-serif; font-size:11.5pt; line-height:1.75; color:#000; }' +
      'h1{ font-size:17pt; text-align:center; margin:0 0 18px; letter-spacing:2px; }' +
      '.doc{ white-space:pre-wrap; }' +
      'img{ max-width:100%; page-break-inside:avoid; margin-bottom:8px; }' +
      '</style></head><body>' + innerHtml + '</body></html>');
    doc.close();
    var go = function () { f.contentWindow.focus(); f.contentWindow.print(); };
    // 이미지가 있으면 로드 후 인쇄(빈 페이지 방지)
    var imgs = doc.images;
    if (!imgs || !imgs.length) return setTimeout(go, 60);
    var left = imgs.length;
    var done = function () { if (--left <= 0) setTimeout(go, 60); };
    Array.prototype.forEach.call(imgs, function (im) {
      if (im.complete) done(); else { im.onload = done; im.onerror = done; }
    });
  }

  global.HRDocs = {
    PAGE_MAX_PX: PAGE_MAX_PX,
    compressImage: compressImage,
    listContracts: listContracts, addContract: addContract, getPages: getPages, deleteContract: deleteContract,
    listTemplates: listTemplates, saveTemplate: saveTemplate, deleteTemplate: deleteTemplate,
    extractKeys: extractKeys, fillTemplate: fillTemplate, formatValue: formatValue,
    printHTML: printHTML,
  };

})(typeof window !== 'undefined' ? window : this);
