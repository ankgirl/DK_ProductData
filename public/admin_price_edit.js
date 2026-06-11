// admin_price_edit.js — 셀러코드로 상품을 불러와 정가/할인가·옵션별 할인가를 스마트스토어에 반영 (관리자 전용)
// 서버: POST /api/inventory/update-price (단건 객체). 성공 판정은 응답 JSON의 status === "OK".
// 본품 + SET_ 둘 다 변경. 서버 성공 시 Firestore의 Price/DiscountedPrice/SellingPrice 동기화(Counts는 절대 건드리지 않음).
(function () {
    'use strict';

    // 기존 재고 코드(aSaveInventoryToSmartStore.js)와 동일 서버, path만 update-price
    // const API_BASE = 'http://127.0.0.1:8000';
    const API_BASE = 'https://fastapi-inventory-689177215560.asia-northeast3.run.app';
    const PRICE_URL = API_BASE + '/api/inventory/update-price';

    const $ = (id) => document.getElementById(id);
    const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');

    let mainDoc = null;   // { id, data }
    let setDoc = null;    // { id, data } | null
    let optKeys = [];     // 본품 옵션 키(option_code) — 화면 행 index와 1:1

    // displayProductData.js의 이미지 확장자 fallback과 동일
    window.tryAlternativeExtension = function (img) {
        const exts = ['png', 'jpg', 'webp', 'jpeg'];
        const idx = parseInt(img.dataset.extTry || '0', 10);
        if (idx < exts.length) {
            img.dataset.extTry = idx + 1;
            img.src = img.src.replace(/\.[^.]+$/, '.' + exts[idx]);
        } else {
            img.onerror = null;
        }
    };

    function setStatus(msg, cls) {
        const el = $('status');
        el.textContent = msg || '';
        el.className = cls || '';
    }
    function setResult(msg, cls) {
        const el = $('result');
        el.textContent = msg || '';
        el.className = cls || '';
    }
    function intVal(v) {
        const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
        return isNaN(n) ? null : n;
    }

    // 셀러코드 변경 직후 stale 캐시 함정 회피 위해 Firestore 직접 fetch
    async function fetchDoc(code) {
        const snap = await db.collection('Products').doc(code).get();
        return snap.exists ? { id: code, data: snap.data() || {} } : null;
    }

    // ---- 불러오기 ----
    async function load() {
        const code = $('sellerCode').value.trim();
        if (!code) { setStatus('셀러코드를 입력하세요.', 'err'); return; }
        if (code.startsWith('SET_')) {
            setStatus('SET_ 코드가 아니라 본품 셀러코드를 입력하세요. (세트는 자동으로 함께 처리됩니다)', 'err');
            return;
        }
        hideAll();
        setResult('');
        setStatus('불러오는 중...');
        $('loadBtn').disabled = true;
        try {
            mainDoc = await fetchDoc(code);
            if (!mainDoc) {
                setStatus('해당 셀러코드 상품을 찾을 수 없습니다: ' + code, 'err');
                return;
            }
            setDoc = await fetchDoc('SET_' + code);
            renderMain();
            renderSet();
            $('submitBar').classList.remove('hidden');
            setStatus('불러오기 완료' + (setDoc ? ' (세트 포함)' : ''), 'ok');
        } catch (e) {
            console.error(e);
            setStatus('불러오기 오류: ' + e.message, 'err');
        } finally {
            $('loadBtn').disabled = false;
        }
    }

    function hideAll() {
        $('mainSection').classList.add('hidden');
        $('setSection').classList.add('hidden');
        $('submitBar').classList.add('hidden');
    }

    function renderMain() {
        const d = mainDoc.data;
        $('mainCodeLabel').textContent = mainDoc.id;
        // 사전 채우기: 정가/할인가는 저장값(DiscountedPrice/SellingPrice) 있으면 사용, 없으면 비워둠
        $('salePrice').value = d.SellingPrice ? Number(d.SellingPrice) : '';
        $('baseDiscount').value = d.DiscountedPrice ? Number(d.DiscountedPrice) : '';

        const od = d.OptionDatas || {};
        // displayProductData.js와 동일 정렬: 보여주기용옵션명 localeCompare
        const entries = Object.entries(od).sort(([ak, av], [bk, bv]) => {
            const a = (av && av.보여주기용옵션명) || ak || '';
            const b = (bv && bv.보여주기용옵션명) || bk || '';
            return a.localeCompare(b);
        });

        optKeys = [];
        const rows = entries.map(([key, v], i) => {
            optKeys.push(key);
            const name = (v && v.보여주기용옵션명) || key;
            const imgUrl = (v && v.옵션이미지URL) || '';
            const price = (v && v.Price != null) ? Number(v.Price) : '';
            const img = imgUrl
                ? `<img src="${imgUrl}" alt="옵션" onerror="tryAlternativeExtension(this)">`
                : '<span class="muted">—</span>';
            return `
                <tr>
                    <td>${img}</td>
                    <td class="opt-name">${name}</td>
                    <td class="num">${price === '' ? '' : won(price)}</td>
                    <td class="num"><input type="number" id="optprice_${i}" min="0" step="10" value="${price}"></td>
                </tr>`;
        });
        $('optBody').innerHTML = rows.join('');
        $('mainSection').classList.remove('hidden');
    }

    function setOptionKey() {
        // SET_ 문서의 단일 옵션 키 (보통 '옵션1')
        const od = (setDoc && setDoc.data.OptionDatas) || {};
        const keys = Object.keys(od);
        return keys.length ? keys[0] : '옵션1';
    }

    function renderSet() {
        if (!setDoc) { $('setSection').classList.add('hidden'); return; }
        const d = setDoc.data;
        const od = d.OptionDatas || {};
        const opt = od[setOptionKey()] || {};
        const cur = (opt.Price != null) ? Number(opt.Price)
            : (d.DiscountedPrice != null ? Number(d.DiscountedPrice) : '');
        $('setCodeLabel').textContent = setDoc.id;
        $('setSalePrice').value = d.SellingPrice ? Number(d.SellingPrice) : (cur || '');
        $('setDiscount').value = (d.DiscountedPrice != null && d.DiscountedPrice !== '') ? Number(d.DiscountedPrice) : cur;
        $('setSection').classList.remove('hidden');
    }

    // ---- 검증 + 수집 ----
    function collectMain() {
        const sale = intVal($('salePrice').value);
        const baseDisc = intVal($('baseDiscount').value);
        const errs = [];
        if (sale == null || sale <= 0) errs.push('본품 정가를 올바르게 입력하세요.');
        if (baseDisc == null || baseDisc <= 0) errs.push('본품 기본 할인가를 올바르게 입력하세요.');
        if (sale != null && baseDisc != null && baseDisc > sale) errs.push('본품 기본 할인가가 정가보다 큽니다.');

        const options = optKeys.map((key, i) => {
            const dp = intVal($(`optprice_${i}`).value);
            if (dp == null || dp <= 0) errs.push(`옵션 "${key}" 할인가를 올바르게 입력하세요.`);
            else if (sale != null && dp > sale) errs.push(`옵션 "${key}" 할인가가 정가보다 큽니다.`);
            return { option_code: key, discount_price: dp };
        });

        const payload = { seller_code: mainDoc.id, sale_price: sale, discount_price: baseDisc };
        if (options.length) payload.options = options;
        return { payload, errs, sale, baseDisc, options };
    }

    function collectSet() {
        if (!setDoc) return null;
        const sale = intVal($('setSalePrice').value);
        const disc = intVal($('setDiscount').value);
        const errs = [];
        if (sale == null || sale <= 0) errs.push('세트 정가를 올바르게 입력하세요.');
        if (disc == null || disc <= 0) errs.push('세트 할인가를 올바르게 입력하세요.');
        if (sale != null && disc != null && disc > sale) errs.push('세트 할인가가 정가보다 큽니다.');
        // 세트는 단일상품 → options 생략
        const payload = { seller_code: setDoc.id, sale_price: sale, discount_price: disc };
        return { payload, errs, sale, disc };
    }

    // ---- 전송 ----
    async function postPrice(payload) {
        const res = await fetch(PRICE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        let json;
        try { json = await res.json(); } catch (_) { json = {}; }
        return json;
    }

    // 서버 성공 시 Firestore 동기화 — Price/DiscountedPrice/SellingPrice만, Counts는 절대 건드리지 않음
    async function syncMain(sale, baseDisc, options) {
        const FieldPath = firebase.firestore.FieldPath;
        const ref = db.collection('Products').doc(mainDoc.id);
        const args = [];
        for (const o of options) {
            args.push(new FieldPath('OptionDatas', o.option_code, 'Price'), o.discount_price);
        }
        args.push('DiscountedPrice', baseDisc);
        args.push('SellingPrice', sale);
        await ref.update(...args);
    }
    async function syncSet(sale, disc) {
        const FieldPath = firebase.firestore.FieldPath;
        const ref = db.collection('Products').doc(setDoc.id);
        await ref.update(
            new FieldPath('OptionDatas', setOptionKey(), 'Price'), disc,
            'DiscountedPrice', disc,
            'SellingPrice', sale
        );
    }

    async function submit() {
        if (!mainDoc) return;
        const m = collectMain();
        const s = collectSet();
        const allErrs = [...m.errs, ...(s ? s.errs : [])];
        if (allErrs.length) {
            setResult('입력 오류:\n- ' + allErrs.join('\n- '), 'err');
            return;
        }

        $('submitBtn').disabled = true;
        setResult('전송 중... 서버가 네이버와 통신하고 있습니다.');
        const lines = [];
        try {
            // 1) 본품
            const mr = await postPrice(m.payload);
            const mOk = mr && mr.status === 'OK';
            lines.push(`[본품 ${mainDoc.id}] ${mOk ? '성공' : '실패'}: ${mr && mr.message ? mr.message : '(메시지 없음)'}`);
            if (mOk) {
                try { await syncMain(m.sale, m.baseDisc, m.options); lines.push('  └ Firestore 가격 동기화 완료'); }
                catch (e) { lines.push('  └ ⚠ Firestore 동기화 실패: ' + e.message); }
            }

            // 2) 세트 (있으면)
            if (s) {
                const sr = await postPrice(s.payload);
                const sOk = sr && sr.status === 'OK';
                lines.push(`[세트 ${setDoc.id}] ${sOk ? '성공' : '실패'}: ${sr && sr.message ? sr.message : '(메시지 없음)'}`);
                if (sOk) {
                    try { await syncSet(s.sale, s.disc); lines.push('  └ Firestore 가격 동기화 완료'); }
                    catch (e) { lines.push('  └ ⚠ Firestore 동기화 실패: ' + e.message); }
                }
            }

            const allOk = lines.every(l => !l.includes('실패'));
            setResult(lines.join('\n'), allOk ? 'ok' : 'err');
        } catch (e) {
            console.error(e);
            lines.push('요청 오류: ' + e.message + ' (서버 연결을 확인하세요)');
            setResult(lines.join('\n'), 'err');
        } finally {
            $('submitBtn').disabled = false;
        }
    }

    // ---- 이벤트 ----
    document.addEventListener('DOMContentLoaded', function () {
        $('loadBtn').addEventListener('click', load);
        $('sellerCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
        $('submitBtn').addEventListener('click', submit);
    });
})();
