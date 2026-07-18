
// 상품 대표이미지 URL: Cafe24URL 우선, 없으면 첫 옵션 이미지 (Cafe24URL 비어있는 옛 상품 대비).
// 여러 화면(판매중지 배치 목록 등)에서 공용으로 쓰도록 전역 등록.
window.getMainImage = function (data) {
    if (!data) return '';
    if (data.Cafe24URL) return data.Cafe24URL;
    const od = data.OptionDatas || {};
    const first = od['옵션1'] || od[Object.keys(od)[0]] || {};
    return first.옵션이미지URL || first.실제이미지URL || '';
};

window.tryAlternativeExtension = function(img) {
    const exts = ['png', 'jpg', 'webp', 'jpeg'];
    const idx = parseInt(img.dataset.extTry || '0');
    if (idx < exts.length) {
        img.dataset.extTry = idx + 1;
        img.src = img.src.replace(/\.[^.]+$/, '.' + exts[idx]);
    } else {
        img.onerror = null;
    }
};

// 검색 화면(셀러코드/바코드)의 판매상태 줄에 붙는 "판매중지" 버튼 핸들러.
// 누르면 경고 후 disableProduct(공용 로직: 전옵션 재고0 + SmartStore 판매중지)를 실행.
window.handleInlineDisable = async function (sellerCode, btn) {
    if (!sellerCode) { alert("셀러코드를 찾을 수 없습니다."); return; }
    const ok = confirm(
        `⚠️ 경고\n\n[${sellerCode}] 상품의 모든 옵션 재고를 0으로 만들고\n스마트스토어에서 판매중지 처리합니다.\n(SET_ 상품이 있으면 함께 처리됩니다)\n\n되돌릴 수 없습니다. 계속하시겠습니까?`
    );
    if (!ok) return;
    if (!window.disableProduct) { alert("disableProduct.js 가 로드되지 않았습니다."); return; }
    const label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "처리 중..."; }
    try {
        await window.disableProduct.disableAllOptions(sellerCode); // 내부에서 성공/실패 alert 처리
    } catch (e) {
        console.error("판매중지 처리 실패:", e);
        alert("판매중지 처리 실패: " + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = label; }
    }
};

// ShopURL "변경" 버튼: 팝업으로 새 URL을 입력받아 Products/{sellerCode}.ShopURL 저장 후 화면 갱신.
window.changeShopURL = async function (sellerCode, btn) {
    if (!sellerCode) { alert("셀러코드를 찾을 수 없습니다."); return; }
    const link = document.getElementById("shopUrlLink");
    const current = link ? (link.textContent || "").trim() : "";
    const input = prompt(`[${sellerCode}] 새 ShopURL을 입력하세요:`, current);
    if (input === null) return; // 취소
    const url = input.trim();
    if (btn) { btn.disabled = true; btn.textContent = "저장 중..."; }
    try {
        await window.db.collection("Products").doc(sellerCode).update({ ShopURL: url });
        if (link) { link.textContent = url; link.href = url || "#"; }
        alert("ShopURL 저장 완료.");
    } catch (e) {
        console.error("ShopURL 저장 실패:", e);
        alert("ShopURL 저장 실패: " + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "변경"; }
    }
};

// ===== 재고 수량 입력 검증 (공용) =====
// 바코드(보통 8~13자리 큰 수)를 수량칸에 잘못 입력하는 인간적 실수를 막기 위한 상한.
// "한 재고를 1만개 이상 보유하는 일은 사실상 없음" → 그 이상은 바코드 오입력으로 간주해 차단.
const MAX_REASONABLE_COUNT = 10000;

/**
 * 수량 입력값(새로운 Counts / 새로운 SET_Counts / 새 옵션 Counts 공용) 검증.
 * 빈 칸은 '변경 없음'으로 통과시키되 value=null 로 알린다.
 * @returns {{ok: boolean, value: (number|null), reason: string}}
 */
function validateCountInput(raw) {
    const s = String(raw ?? '').trim();
    if (s === '') return { ok: true, value: null, reason: '' };           // 빈 칸 = 변경 안 함
    if (!/^-?\d+$/.test(s)) return { ok: false, value: NaN, reason: '숫자가 아닌 값' };
    const n = parseInt(s, 10);
    if (n < 0) return { ok: false, value: n, reason: '음수는 입력할 수 없습니다' };
    if (n > MAX_REASONABLE_COUNT)
        return { ok: false, value: n, reason: `${MAX_REASONABLE_COUNT.toLocaleString()}개 초과 — 바코드를 수량칸에 입력했을 가능성이 높습니다` };
    return { ok: true, value: n, reason: '' };
}

/**
 * 폼의 모든 수량칸(_newCount / _newSET_Counts)을 저장 전에 검증.
 * 비정상 값이 있으면 사람이 읽을 경고(어느 옵션/칸/값/사유)를 반환, 정상이면 null.
 * 검증 실패 시 호출부는 저장을 즉시 중단 → 기존 재고 값은 그대로 유지(0/다른 값으로 덮어쓰지 않음).
 */
function findInvalidCountInput(formData) {
    const COUNT_SUFFIXES = ['_newCount', '_newSET_Counts'];
    for (const [key, raw] of formData.entries()) {
        const suffix = COUNT_SUFFIXES.find(s => key.endsWith(s));
        if (!suffix) continue;
        const v = validateCountInput(raw);
        if (!v.ok) {
            const optionName = key.slice(0, -suffix.length);
            const colLabel = suffix === '_newSET_Counts' ? '새로운 SET_Counts' : '새로운 Counts';
            return `⚠️ 수량 입력 오류 — 저장을 취소했습니다 (기존 재고는 그대로 유지됨)\n\n`
                 + `옵션: ${optionName}\n칸: ${colLabel}\n입력값: ${raw}\n사유: ${v.reason}\n\n`
                 + `바코드는 '새로운 바코드' 칸에 입력하세요. 수량을 다시 확인 후 저장해주세요.`;
        }
    }
    return null;
}

function generateProductDetailsHTML(data, setData) {
    // setData가 null이거나 undefined일 경우를 안전하게 처리
    const safeSetData = setData && setData.OptionDatas ? setData : { OptionDatas: {} };

    return `
        <p>
        <strong>SellerCode:</strong>
        ${data.SellerCode ? `${data.SellerCode}, SET_${data.SellerCode}` : ''}
        <button type="button" onclick="copySellerCode('${data.SellerCode}')">복사하기</button>
        </p>
        <p><strong>입고차수:</strong> ${data.소분류명 || ''}</p>        
        <p><strong>대표이미지:</strong> <img src="${data.Cafe24URL || ''}" alt="대표이미지" width="100"></p>
        <p><strong>스토어링크:</strong> <a href="${data.스토어링크 || '#'}" target="_blank">${data.스토어링크 || ''}</a></p>
        <p><strong>SmartStoreURL:</strong> <a href="${data.SmartStoreURL || '#'}" target="_blank">${data.SmartStoreURL || ''}</a></p>
        ${(setData && setData.SmartStoreURL) ? `<p><strong>SET SmartStoreURL:</strong> <a href="${setData.SmartStoreURL}" target="_blank">${setData.SmartStoreURL}</a></p>` : ''}
        <p><strong>ShopURL:</strong>
            <a id="shopUrlLink" href="${data.ShopURL || '#'}" target="_blank" style="word-break: break-all; overflow-wrap: break-word;">${data.ShopURL || ''}</a>
            <button type="button" onclick="changeShopURL('${data.SellerCode}', this)" style="margin-left:10px; padding:4px 12px; border:1px solid #3a2b4d; background:#3a2b4d; color:#fff; border-radius:4px; cursor:pointer; vertical-align:middle;">변경</button>
        </p>
        <p><strong>SellingPrice:</strong> ${data.DiscountedPrice || ''}</p>
        <p><strong>Option Datas:</strong></p>
        <form id="updateForm" novalidate>
            <div style="margin-bottom: 15px; font-size: 1.1em; border: 1px solid #ccc; padding: 10px; display: inline-block; border-radius: 5px;">
                <strong>판매 상태:</strong>
                <label style="margin-left: 15px; color: #888;">
                    <input type="radio" name="statusType" value="" checked> 변경 안 함
                </label>
                <label style="margin-left: 15px;">
                    <input type="radio" name="statusType" value="SALE"> 판매중
                </label>
                <label style="margin-left: 15px;">
                    <input type="radio" name="statusType" value="SUSPENSION"> 판매중지
                </label>
                ${window.ENABLE_INLINE_DISABLE ? `
                <button type="button" id="inlineDisableBtn"
                    onclick="handleInlineDisable('${data.SellerCode}', this)"
                    style="margin-left: 25px; background:#c0392b; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;"
                    title="모든 옵션 재고를 0으로 만들고 판매중지 처리합니다">판매중지 (전옵션 재고0 + 판매중지)</button>` : ''}
            </div>
            <style>
                #updateForm table {
                    border-collapse: collapse;
                    width: 100%;
                    min-width: 1200px;
                    table-layout: fixed;
                }
                #updateForm th, #updateForm td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: center;
                    vertical-align: middle;
                    word-break: break-all;
                }
                #updateForm th {
                    background-color: #f2f2f2;
                    font-weight: bold;
                }
                #updateForm .image-container {
                    width: 100px;
                    height: 150px;
                }
                #updateForm .image-container img {
                    max-width: 150px;
                    max-height: 150px;
                    display: block;
                    margin: 0 auto;
                }
                #updateForm input[type="number"], 
                #updateForm input[type="text"] {
                    width: 90%;
                    box-sizing: border-box;
                    text-align: center;
                }
                #updateForm button.clear-barcode {
                    width: 100%;
                    padding: 4px 0;
                }
                /* 수량칸에 바코드/음수/상한초과 등 비정상 값이 들어오면 즉시 빨갛게 경고 */
                #updateForm input.count-input.count-invalid {
                    background-color: #ffd5d5;
                    border: 2px solid #c0392b;
                }
            </style>
            <!-- 주석
            <button type="button" id="increaseSetCount" style="width: 200px; height: 40px; font-size: 1.1em;">세트수량 증가</button>
            <button type="button" id="decreaseSetCount" style="width: 200px; height: 40px; font-size: 1.1em;">세트수량 감소</button>

            <div style="margin-top: 20px; border-top: 1px solid #ccc; pt: 20px;">
                <div style="margin-bottom: 15px;">
                    <input type="number" id="quantityInput" placeholder="숫자 입력" style="width: 120px; height: 35px; font-size: 1em;">
                    <button type="button" id="addQuantity" style="width: 75px; height: 40px;">수량 추가</button>
                </div>

                <div style="margin-bottom: 20px; font-size: 1.1em;">
                    <label style="margin-right: 15px;">
                        <input type="checkbox" name="status" value="display"> 전시중
                    </label>
                    <label>
                        <input type="checkbox" name="status" value="sale"> 판매중
                    </label>
                </div>

                <button type="submit" style="width: 405px; height: 50px; background-color: #007BFF; color: white; border: none; border-radius: 5px; font-size: 1.2em; cursor: pointer;">
                    적용하기
                </button>
            </div>
            -->
            <table>
                <colgroup>
                    <col style="width: 150px;">
                    <col style="width: 150px;">
                    <col style="width: 150px;">
                    <col style="width: 80px;">
                    <col style="width: 80px;">
                    <col style="width: 90px;">
                    <col style="width: 110px;">
                    <col style="width: 90px;">
                    <col style="width: 90px;">
                    <col style="width: 120px;">
                    <col style="width: 120px;">
                    <col style="width: 80px;">
                </colgroup>
                <thead>
                    <tr>
                        <th>옵션이미지</th>
                        <th>옵션명</th>                        
                        <th>실제이미지</th>
                        <th>Price</th>
                        <th>Counts</th>
                        <th>새로운 Counts</th>
                        <th>SET_Counts</th>
                        <th>새로운 SET_Counts</th>
                        <th>Total Counts</th>
                        <th>바코드</th>
                        <th>새로운 바코드</th>
                        <th>바코드 지우기</th>
                    </tr>
                </thead>
                <tbody>
                ${
                    data.OptionDatas
                    ? Object.entries(data.OptionDatas)
                        .sort(([aKey, aValues], [bKey, bValues]) => {
                            const a = aValues.보여주기용옵션명 || aKey || '';
                            const b = bValues.보여주기용옵션명 || bKey || '';
                            return a.localeCompare(b);
                        })
                        .map(([optionName, optionValues], index, array) => {
                            // setData가 null이거나 OptionDatas가 없을 때 안전하게 처리
                            const setOption = safeSetData.OptionDatas["옵션1"];
                            const setCounts = setOption && typeof setOption.Counts === "number" ? setOption.Counts : 0;
                            const totalCounts = (typeof optionValues.Counts === "number" ? optionValues.Counts : 0) + setCounts;

                            return `
                                <tr>
                                    <td class="image-container"><img src="${optionValues.옵션이미지URL}" alt="옵션이미지" onerror="tryAlternativeExtension(this)"></td>
                                    <td>${optionValues.보여주기용옵션명}</td>
                                    <td class="image-container"><img src="${optionValues.실제이미지URL}" alt="실제이미지" onerror="tryAlternativeExtension(this)"></td>
                                    <td>${optionValues.Price || ''}</td>
                                    <td id="${optionName}_Counts">${optionValues.Counts || ''}</td>
                                    <td><input type="number" name="${optionName}_newCount" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_newCount" class="input-field count-input" min="0" max="${MAX_REASONABLE_COUNT}" step="1" inputmode="numeric"></td>
                                    <td id="${optionName}_SET_Counts">${setCounts}</td>
                                    <td><input type="number" name="${optionName}_newSET_Counts" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_newSET_Counts" class="input-field count-input" min="0" max="${MAX_REASONABLE_COUNT}" step="1" inputmode="numeric"></td>
                                    <td id="${optionName}_TotalCounts">${totalCounts || ''}</td>
                                    <td id="${optionName}_바코드">${optionValues.바코드 || ''}</td>
                                    <td><input type="text" name="${optionName}_newBarcode" data-next="${array[index + 1] ? array[index + 1][0] : array[0][0]}_newBarcode" class="input-field"></td>
                                    <td><button type="button" class="clear-barcode" data-option="${optionName}">지우기</button></td>
                                </tr>
                            `;
                        }).join('')
                    : ''
                }
                </tbody>
            </table>
            <div style="height: 20px;"></div>
            <button type="submit" style="width: 200px; height: 40px; font-size: 1.1em;">적용</button>
            <div style="height: 40px;"></div>
        </form>
        <h3>새 옵션 추가</h3>
        <form id="addOptionForm">
            <label>옵션 이름: <input type="text" id="newOptionName" required></label>
            <label>Price: <input type="number" id="newOptionPrice"></label>
            <label>Counts: <input type="number" id="newOptionCounts" min="0" max="${MAX_REASONABLE_COUNT}" step="1" inputmode="numeric"></label>
            <label>바코드: <input type="text" id="newOptionBarcode"></label>
            <button id="buttonAddOption">옵션 추가</button>
        </form>
    `;
}


function copySellerCode(sellerCode) {
  if (!sellerCode) return alert("SellerCode가 없습니다.");
  
  const text = `${sellerCode},SET_${sellerCode}`;
  navigator.clipboard.writeText(text).then(() => {
    //alert("클립보드에 복사되었습니다: " + text);
    playDingDong();
  });
}
function playDingDong() {
    const context = new (window.AudioContext || window.webkitAudioContext)();

    // 첫 번째 소리 (띵)
    const oscillator1 = context.createOscillator();
    const gainNode1 = context.createGain();
    oscillator1.type = 'sine';
    oscillator1.frequency.setValueAtTime(659.25, context.currentTime); // E5 음
    oscillator1.connect(gainNode1);
    gainNode1.connect(context.destination);
    oscillator1.start(context.currentTime);
    gainNode1.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 2);
    oscillator1.stop(context.currentTime + 0.3);

    // 두 번째 소리 (동)
    const oscillator2 = context.createOscillator();
    const gainNode2 = context.createGain();
    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(523.25, context.currentTime + 0.3); // C5 음
    oscillator2.connect(gainNode2);
    gainNode2.connect(context.destination);
    oscillator2.start(context.currentTime + 0.3);
    gainNode2.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 2);
    oscillator2.stop(context.currentTime + 0.6);
}// Beep 소리를 생성하는 함수



function displayProductData(data, setData,  container = document.getElementById("result")) {
    if ((!data || !data.OptionDatas) && (!setData || !setData.OptionDatas)) {
        console.error("data와 setData 둘 다 유효하지 않습니다:", { data, setData });
        return;
    }

    var index = 0;
    // Add option images URLs to data
    for (let optionName in data.OptionDatas) {
        index++;
        const option = optionName.replace("선택: ", "");
        if (option) {
            // 저장된 URL이 있으면 그대로 사용 (sellerCode/소분류명 변경 후에도 원래 이미지 위치 유지)
            // 저장된 URL이 없으면 현재 값으로 생성 (기존 상품 하위 호환)
            if (!data.OptionDatas[optionName].옵션이미지URL) {
                const { 보여주기용옵션명, 옵션이미지URL, 실제이미지URL } = generateImageURLs(data.SellerCode, option, data.소분류명, data.GroupOptions);
                data.OptionDatas[optionName].보여주기용옵션명 = 보여주기용옵션명;
                data.OptionDatas[optionName].옵션이미지URL = 옵션이미지URL;
                data.OptionDatas[optionName].실제이미지URL = 실제이미지URL;
            }
        }
    }    
    container.innerHTML = generateProductDetailsHTML(data, setData);


    // 공통 로직을 함수로 분리하여 리팩토링
    // 상세 로그 추가하여 문제 원인 파악
    function updateOptionCounts({ data, setData, isIncrease }) {
        console.log("[updateOptionCounts] 함수 호출됨", { data, setData, isIncrease });

        if (!data || !data.OptionDatas) {
            console.error("[updateOptionCounts] data 또는 data.OptionDatas가 없음", data);
            return;
        }
        if (!setData || !setData.OptionDatas) {
            console.warn("[updateOptionCounts] setData 또는 setData.OptionDatas가 없음", setData);
        }

        const updatedOptionDatas = {};
        const updatedSetOptionDatas = {};

        // data의 모든 옵션의 Counts를 증감
        for (let optionName in data.OptionDatas) {
            if (!updatedOptionDatas[optionName]) {
                updatedOptionDatas[optionName] = { ...data.OptionDatas[optionName] };
            }
            if (typeof updatedOptionDatas[optionName].Counts === 'number') {
                const before = updatedOptionDatas[optionName].Counts;
                updatedOptionDatas[optionName].Counts = Math.max(
                    0,
                    updatedOptionDatas[optionName].Counts + (isIncrease ? -1 : 1)
                );
                console.log(`[updateOptionCounts] data 옵션 "${optionName}" Counts 변경: ${before} -> ${updatedOptionDatas[optionName].Counts}`);
            } else {
                console.warn(`[updateOptionCounts] data 옵션 "${optionName}"의 Counts가 숫자가 아님:`, updatedOptionDatas[optionName].Counts);
            }
        }

        // setData의 '옵션1' Counts를 증감
        if (setData && setData.OptionDatas && setData.OptionDatas['옵션1']) {
            if (!updatedSetOptionDatas['옵션1']) {
                updatedSetOptionDatas['옵션1'] = { ...setData.OptionDatas['옵션1'] };
            }
            if (typeof updatedSetOptionDatas['옵션1'].Counts === 'number') {
                const beforeSet = updatedSetOptionDatas['옵션1'].Counts;
                updatedSetOptionDatas['옵션1'].Counts = Math.max(
                    0,
                    updatedSetOptionDatas['옵션1'].Counts + (isIncrease ? 1 : -1)
                );
                console.log(`[updateOptionCounts] setData '옵션1' Counts 변경: ${beforeSet} -> ${updatedSetOptionDatas['옵션1'].Counts}`);
            } else {
                console.warn(`[updateOptionCounts] setData '옵션1'의 Counts가 숫자가 아님:`, updatedSetOptionDatas['옵션1'].Counts);
            }
        } else {
            console.warn("[updateOptionCounts] setData에 '옵션1'이 없거나 OptionDatas가 없음", setData);
        }

        // data와 setData의 OptionDatas를 각각 갱신
        for (let optionName in updatedOptionDatas) {
            if (data.OptionDatas[optionName]) {
                const prev = data.OptionDatas[optionName].Counts;
                data.OptionDatas[optionName].Counts = updatedOptionDatas[optionName].Counts;
                console.log(`[updateOptionCounts] data.OptionDatas[${optionName}].Counts 최종 적용: ${prev} -> ${data.OptionDatas[optionName].Counts}`);
                
                // 화면의 표에 결과 값 반영
                const countsElement = document.getElementById(`${optionName}_Counts`);
                if (countsElement) {
                    countsElement.textContent = data.OptionDatas[optionName].Counts;
                }
                
                // TotalCounts도 업데이트 (SET Counts와 합산)
                const setCountsElement = document.getElementById(`${optionName}_SET_Counts`);
                const totalCountsElement = document.getElementById(`${optionName}_TotalCounts`);
                if (totalCountsElement && setCountsElement) {
                    const setCounts = parseInt(setCountsElement.textContent) || 0;
                    const totalCounts = data.OptionDatas[optionName].Counts + setCounts;
                    totalCountsElement.textContent = totalCounts;
                }
            } else {
                console.error(`[updateOptionCounts] data.OptionDatas에 "${optionName}"이(가) 없음`);
            }
        }
        
        for (let optionName in updatedSetOptionDatas) {
            if (setData.OptionDatas && setData.OptionDatas[optionName]) {
                const prevSet = setData.OptionDatas[optionName].Counts;
                setData.OptionDatas[optionName].Counts = updatedSetOptionDatas[optionName].Counts;
                console.log(`[updateOptionCounts] setData.OptionDatas[${optionName}].Counts 최종 적용: ${prevSet} -> ${setData.OptionDatas[optionName].Counts}`);
                
                // 모든 옵션의 SET_Counts 요소를 업데이트 (모든 행에서 같은 SET 값 사용)
                const allOptionNames = Object.keys(data.OptionDatas);
                for (let dataOptionName of allOptionNames) {
                    const setCountsElement = document.getElementById(`${dataOptionName}_SET_Counts`);
                    if (setCountsElement) {
                        setCountsElement.textContent = setData.OptionDatas[optionName].Counts;
                    }
                    
                    // TotalCounts도 업데이트 (일반 Counts와 합산)
                    const countsElement = document.getElementById(`${dataOptionName}_Counts`);
                    const totalCountsElement = document.getElementById(`${dataOptionName}_TotalCounts`);
                    if (totalCountsElement && countsElement) {
                        const counts = parseInt(countsElement.textContent) || 0;
                        const totalCounts = counts + setData.OptionDatas[optionName].Counts;
                        totalCountsElement.textContent = totalCounts;
                    }
                }
            } else {
                console.error(`[updateOptionCounts] setData.OptionDatas에 "${optionName}"이(가) 없음`);
            }
        }
        
        console.log("[updateOptionCounts] 최종 data:", data);
        console.log("[updateOptionCounts] 최종 setData:", setData);
    }

    // 버튼 클릭 시 submit(새로고침) 방지: type="button"으로 변경 필요
    // 만약 HTML에서 type="button"이 아니라면, 아래에서 강제로 preventDefault 처리
    const increaseBtn = document.querySelector('#updateForm button[type="increaseSetCount"]');
    const decreaseBtn = document.querySelector('#updateForm button[type="decreaseSetCount"]');

    if (increaseBtn) {
        increaseBtn.type = "button";
        increaseBtn.addEventListener('click', function (event) {
            event.preventDefault();
            console.log("[increaseSetCount] 버튼 클릭 이벤트 호출됨");
            updateOptionCounts({ data, setData, isIncrease: true });
        });
    }

    if (decreaseBtn) {
        decreaseBtn.type = "button";
        decreaseBtn.addEventListener('click', function (event) {
            event.preventDefault();
            console.log("[decreaseSetCount] 버튼 클릭 이벤트 호출됨");
            updateOptionCounts({ data, setData, isIncrease: false });
        });
    }


    document.getElementById('updateForm').addEventListener('submit', async function (event) {
        event.preventDefault();

        const formEl = event.target;
        // FormData는 disabled 전에 수집해야 함 (disabled input은 FormData에서 제외됨)
        const formData = new FormData(formEl);

        // FormData 수집 후 폼 입력/버튼 비활성화
        const formInputs = formEl.querySelectorAll('input, button');
        formInputs.forEach(el => el.disabled = true);

        try {

        // 0. 수량칸 검증 — 바코드 오입력/음수/숫자아님이면 저장 자체를 중단.
        //    저장 전에 막으므로 DB·화면의 기존 재고 값은 전혀 바뀌지 않는다(0/다른 값으로 덮어쓰지 않음).
        const invalidMsg = findInvalidCountInput(formData);
        if (invalidMsg) {
            alert(invalidMsg);
            return; // finally에서 폼 재활성화, DB 미변경 → 기존 재고 유지
        }

        const updatedOptionDatas = {};
        const updatedSetOptionDatas = {};
        let barcodeCheckNeeded = false;
        let hasChanges = false;

        // 최신 데이터 가져오기
        const latestData = (await db.collection('Products').doc(data.SellerCode).get()).data().OptionDatas;
        let latestSetData = {};
        if (setData && setData.sellerCode) {
            const setDoc = await db.collection('Products').doc(setData.sellerCode).get();
            if (setDoc.exists && setDoc.data() && setDoc.data().OptionDatas) {
                latestSetData = setDoc.data().OptionDatas;
            } else {
                latestSetData = {};
            }
        }

        // 1. 입력 필드의 값들 처리 (기존 로직)
        let newSetCountChanged = false;
        let newCountChanged = false;
        let newSetCount = 0;

        for (let [key, value] of formData.entries()) {
            if (key === 'statusType') continue;
            const suffixes = ['_newCount', '_newSET_Counts', '_newBarcode'];
            const suffix = suffixes.find(s => key.endsWith(s));
            if (!suffix) continue;
            const optionName = key.slice(0, -suffix.length);
            const field = suffix === '_newSET_Counts' ? 'newSET' : suffix.slice(1);

            if (newSetCountChanged) {
                document.getElementById(`${optionName}_SET_Counts`).textContent = newSetCount;
            }

            if (value.trim() !== '') { // 입력된 값이 있을 때만 업데이트
                hasChanges = true;
                
                if (!updatedOptionDatas[optionName]) {
                    updatedOptionDatas[optionName] = { ...latestData[optionName] };
                }

                if (!updatedSetOptionDatas[optionName]) {
                    updatedSetOptionDatas[optionName] = { ...latestSetData[optionName] };
                }
                
                if (field === 'newCount') {
                    console.log("newCount");
                    newCountChanged = true;                    
                    updatedOptionDatas[optionName]['Counts'] = parseInt(value, 10);                    
                    document.getElementById(`${optionName}_Counts`).textContent = value;                    
                }

                if (field === 'newSET') {
                    console.log("newSET");
                    updatedSetOptionDatas[optionName]['Counts'] = parseInt(value, 10);
                    document.getElementById(`${optionName}_SET_Counts`).textContent = value;
                    console.log(updatedSetOptionDatas);
                    console.log(updatedSetOptionDatas[optionName]);
                    newSetCountChanged = true;
                    newSetCount = value;
                }
                
                else if (field === 'newBarcode') {
                    value = refineInputValue(value)
                    updatedOptionDatas[optionName]['바코드'] = value;
                    
                    const barcodeElement = document.getElementById(`${optionName}_바코드`);
                    if (barcodeElement) {
                        barcodeElement.textContent = value;
                    }
                    if (value.trim() !== '') {
                        barcodeCheckNeeded = true;
                    }
                }
            }
        }

        // 2. 화면에 표시된 현재 값들 처리 (세트 수량 증가/감소로 변경된 값들)
        const allOptionNames = Object.keys(data.OptionDatas);
        for (let optionName of allOptionNames) {
            // 현재 화면에 표시된 Counts 값 가져오기
            const currentCountsElement = document.getElementById(`${optionName}_Counts`);
            const currentSetCountsElement = document.getElementById(`${optionName}_SET_Counts`);
            
            if (currentCountsElement && currentSetCountsElement) {
                const currentCounts = parseInt(currentCountsElement.textContent) || 0;
                const currentSetCounts = parseInt(currentSetCountsElement.textContent) || 0;
                
                // 기존 데이터와 비교하여 변경사항이 있는지 확인
                const originalCounts = latestData[optionName]?.Counts || 0;
                const originalSetCounts = latestSetData['옵션1']?.Counts || 0;
                
                if (currentCounts !== originalCounts) {
                    hasChanges = true;
                    if (!updatedOptionDatas[optionName]) {
                        updatedOptionDatas[optionName] = { ...latestData[optionName] };
                    }
                    updatedOptionDatas[optionName]['Counts'] = currentCounts;
                    console.log(`[submit] ${optionName} Counts 업데이트: ${originalCounts} -> ${currentCounts}`);
                }
                
                if (currentSetCounts !== originalSetCounts) {
                    hasChanges = true;
                    if (!updatedSetOptionDatas['옵션1']) {
                        updatedSetOptionDatas['옵션1'] = { ...latestSetData['옵션1'] };
                    }
                    updatedSetOptionDatas['옵션1']['Counts'] = currentSetCounts;
                    console.log(`[submit] SET Counts 업데이트: ${originalSetCounts} -> ${currentSetCounts}`);
                }
            }
        }

        if (newCountChanged || newSetCountChanged) {
            // optionName별로 newCount, newSET 값을 모아서 합산
            const optionTotals = {};

            for (let [key, value] of formData.entries()) {
                const suffixes2 = ['_newCount', '_newSET_Counts', '_newBarcode'];
                const suffix2 = suffixes2.find(s => key.endsWith(s));
                if (!suffix2) continue;
                const optionName = key.slice(0, -suffix2.length);
                const field = suffix2 === '_newSET_Counts' ? 'newSET' : suffix2.slice(1);
                if (!optionTotals[optionName]) {
                    optionTotals[optionName] = { newCount: 0, newSetCount: 0 };
                }
                if (field === 'newCount') {
                    const countValue = document.getElementById(`${optionName}_Counts`)?.textContent || "0";
                    optionTotals[optionName].newCount = parseInt(countValue, 10) || 0;
                }
                if (field === 'newSET') {
                    const setCountValue = document.getElementById(`${optionName}_SET_Counts`)?.textContent || "0";
                    optionTotals[optionName].newSetCount = parseInt(setCountValue, 10) || 0;
                }
            }

            // 합산 결과를 각 optionName별로 TotalCounts에 반영
            for (const optionName in optionTotals) {
                const totalCounts = optionTotals[optionName].newCount + optionTotals[optionName].newSetCount;
                const totalCountsElement = document.getElementById(`${optionName}_TotalCounts`);
                if (totalCountsElement) {
                    totalCountsElement.textContent = totalCounts;
                }
            }
        }

        console.warn(data.SellerCode);
        console.warn(updatedOptionDatas);
        console.warn(updatedSetOptionDatas);

        // 함수 호출
        ensureNonNegativeCounts(updatedOptionDatas, updatedSetOptionDatas); // <--- 리팩토링된 함수 호출


        // 판매 상태 값 읽기 (formData는 disabled 전에 수집되었으므로 안전)
        const statusType = formData.get('statusType') || '';

        // 판매상태만 변경하고 수량 변경이 없는 경우, 현재 재고 데이터를 채워서 전송
        if (statusType && Object.keys(updatedOptionDatas).length === 0) {
            for (const optionName in latestData) {
                updatedOptionDatas[optionName] = { ...latestData[optionName] };
            }
            if (latestSetData['옵션1']) {
                updatedSetOptionDatas['옵션1'] = { ...latestSetData['옵션1'] };
            }
        }

        // 1. 재고 업데이트를 먼저 수행 (변경사항이 있는 경우)
        await sendInventoryUpdate(data.SellerCode, updatedOptionDatas, updatedSetOptionDatas, statusType);

        // 2. 바코드 중복 확인이 필요한 경우 처리
        if (barcodeCheckNeeded) {
            const barcodeCheck = await checkBarcodeDuplicate(updatedOptionDatas);

            if (barcodeCheck.duplicate) {
                // 중복 바코드가 발견된 경우 사용자에게 확인 요청
                const userConfirmation = confirm(
                    `중복된 바코드가 발견되었습니다: ${barcodeCheck.sellerCode}. 그래도 저장하시겠습니까?`
                );

                if (!userConfirmation) {
                    // 사용자가 저장을 취소한 경우, 함수 종료
                    console.log("[submit] 바코드 중복으로 인해 사용자가 저장을 취소했습니다.");
                    return;
                }
            }
        }

        // 3. 상품 수량 및 바코드 업데이트 (모든 조건 통과 또는 확인 불필요 시)
        // (주: userConfirmation이 false일 경우 이미 return 되었으므로, 이 시점에 도달하면 항상 업데이트를 수행)
        await updateProductCountsAndBarcode(data.SellerCode, updatedOptionDatas, updatedSetOptionDatas);

        console.log("[submit] 상품 데이터 및 재고 업데이트 완료.");


        // 폼의 입력 칸 초기화
        document.querySelectorAll('#updateForm input').forEach(input => {
            input.value = '';
        });

        } finally {
            // 적용 완료 후 폼 입력/버튼 활성화
            formInputs.forEach(el => el.disabled = false);
        }
    });

    document.querySelectorAll('#updateForm input').forEach(input => {
        input.addEventListener('input', function () {
            const suffixes3 = ['_newCount', '_newSET_Counts', '_newBarcode', '_increaseCount', '_decreaseCount'];
            const suffix3 = suffixes3.find(s => this.name.endsWith(s));
            if (!suffix3) return;
            const optionName = this.name.slice(0, -suffix3.length);
            const field = suffix3 === '_newSET_Counts' ? 'newSET' : suffix3.slice(1);
            // 수량칸 실시간 검증: 바코드(상한초과)/음수/비정상 값이면 즉시 빨갛게 표시해 인지시킴
            if (field === 'newCount' || field === 'newSET') {
                const v = validateCountInput(this.value);
                this.classList.toggle('count-invalid', !v.ok);
                this.title = v.ok ? '' : `입력 오류: ${v.reason}`;
            }
            if (['increaseCount', 'decreaseCount'].includes(field)) {
                const newCountInput = document.querySelector(`input[name="${optionName}_newCount"]`);
                if (newCountInput) {
                    newCountInput.value = '';
                }
            }
        });
        
        input.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                const nextInputName = this.dataset.next;
                const nextInput = document.querySelector(`input[name="${nextInputName}"]`);
                if (nextInput) {
                    nextInput.focus();
                }
            }
        });
    });

    document.querySelectorAll('.clear-barcode').forEach(button => {
        button.addEventListener('click', async function() {
            const optionName = this.dataset.option;
            await clearBarcode(data.SellerCode, optionName);
            document.getElementById(`${optionName}_바코드`).textContent = '';
        });
    });

    document.getElementById('buttonAddOption').addEventListener('click', function (event) {
        saveNewOption(event); // 이벤트 객체 전달
    });

    document.querySelectorAll('#addOptionForm input').forEach(input => {
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // 기본 폼 제출 방지
                const formElements = Array.from(document.querySelectorAll('#addOptionForm input'));
                const currentIndex = formElements.indexOf(event.target);
                
                // 다음 입력 필드로 포커스 이동
                if (currentIndex < formElements.length - 1) {
                    formElements[currentIndex + 1].focus();
                }
            }
        });
    });

    async function saveNewOption(event) {
        event.preventDefault();
        const newOptionName = document.getElementById('newOptionName').value;
        const newOptionPrice = parseInt(document.getElementById('newOptionPrice').value, 10) || 0;
        const newOptionBarcode = document.getElementById('newOptionBarcode').value || "";

        // 새 옵션 Counts도 공용 검증 — 바코드/음수/상한초과면 추가 중단
        const rawNewCount = document.getElementById('newOptionCounts').value;
        const countCheck = validateCountInput(rawNewCount);
        if (!countCheck.ok) {
            alert(`⚠️ 새 옵션 수량 입력 오류 — 옵션을 추가하지 않았습니다\n\n입력값: ${rawNewCount}\n사유: ${countCheck.reason}\n\n바코드는 'Counts'가 아니라 '바코드' 칸에 입력하세요.`);
            return;
        }
        const newOptionCounts = countCheck.value || 0;

        if (data.OptionDatas[newOptionName]) {
            alert('이미 존재하는 옵션 이름입니다.');
            return;
        }
    
        const newOptionData = {
            Counts: newOptionCounts,
            Price: newOptionPrice,
            바코드: newOptionBarcode,
        };
    
        // 기존 데이터를 필터링하여 Counts, Price, 바코드만 유지
        const updatedOptionDatas = {};
        for (const [optionName, optionValue] of Object.entries(data.OptionDatas)) {
            updatedOptionDatas[optionName] = {
                Counts: optionValue.Counts,
                Price: optionValue.Price,
                바코드: optionValue.바코드,
            };
        }
    
        // 새로운 옵션 추가
        updatedOptionDatas[newOptionName] = newOptionData;
    
        try {
            // 비동기 데이터베이스 업데이트
            await db.collection('Products').doc(data.SellerCode).update({ OptionDatas: updatedOptionDatas });
    
            // 데이터 업데이트 후 UI 갱신 - displayProductData 호출 제거
            // 대신 필요한 부분만 업데이트하거나 성공 메시지만 표시
            const messageDiv = document.getElementById('message');
            if (messageDiv) {
                messageDiv.innerHTML = '<p>새로운 옵션이 성공적으로 추가되었습니다.</p>';
            }
            
            // 폼 초기화
            document.getElementById('newOptionName').value = '';
            document.getElementById('newOptionPrice').value = '';
            document.getElementById('newOptionCounts').value = '';
            document.getElementById('newOptionBarcode').value = '';
            
        } catch (error) {
            console.error('옵션 저장 중 오류 발생:', error);
            alert('옵션 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
    
}

async function clearBarcode(sellerCode, optionName) {
    try {
        const productDoc = await db.collection('Products').doc(sellerCode).get();
        const existingOptionDatas = productDoc.data().OptionDatas;
        existingOptionDatas[optionName]['바코드'] = '';

        await db.collection('Products').doc(sellerCode).update({ OptionDatas: existingOptionDatas });
    } catch (error) {
        console.error("Error clearing barcode:", error);
    }
}

async function checkBarcodeDuplicate(optionDatas) {
    let duplicate = false;
    let sellerCode = '';
    try {
        const allDocsSnapshot = await db.collection('Products').get();
        allDocsSnapshot.forEach(doc => {
            const data = doc.data();
            for (let option in optionDatas) {
                const newBarcode = optionDatas[option].바코드;

                // OptionDatas가 존재하는지 확인 후 처리
                if (
                    data.Barcode === newBarcode ||
                    (data.OptionDatas && Object.values(data.OptionDatas).some(opt => opt.바코드 === newBarcode))
                ) {
                    duplicate = true;
                    sellerCode = data.SellerCode;
                    break;
                }
            }
        });
    } catch (error) {
        console.error('Error checking barcode duplicates: ', error);
    }
    return { duplicate, sellerCode };
}


function refineInputValue(input) {
    // 특수문자 ( ) * 제거    
    let refined = input.replace(/[()*]/g, "");
    
    // 한글 자모를 영어 키보드 대응 문자로 변환하는 매핑 테이블
    const koreanToEnglishMap = {
        'ㄱ': 'R', 'ㄲ': 'RR', 'ㄴ': 'S', 'ㄷ': 'E', 'ㄸ': 'EE', 'ㄹ': 'F', 'ㅁ': 'A', 'ㅂ': 'Q', 'ㅃ': 'QQ', 'ㅅ': 'T', 'ㅆ': 'TT', 'ㅇ': 'D', 'ㅈ': 'W', 'ㅉ': 'WW', 'ㅊ': 'C', 'ㅋ': 'Z', 'ㅌ': 'X', 'ㅍ': 'V', 'ㅎ': 'G',
        'ㅏ': 'K', 'ㅐ': 'O', 'ㅑ': 'I', 'ㅒ': 'OI', 'ㅓ': 'J', 'ㅔ': 'P', 'ㅕ': 'U', 'ㅖ': 'PU', 'ㅗ': 'H', 'ㅘ': 'HK', 'ㅙ': 'HO', 'ㅚ': 'HL', 'ㅛ': 'Y', 'ㅜ': 'N', 'ㅝ': 'NJ', 'ㅞ': 'NP', 'ㅟ': 'NL', 'ㅠ': 'B', 'ㅡ': 'M', 'ㅢ': 'ML', 'ㅣ': 'L',
        '가': 'RK', '나': 'SK', '다': 'EK', '라': 'FK', '마': 'AK', '바': 'QK', '사': 'TK', '아': 'DK', '자': 'WK', '차': 'CK', '카': 'ZK', '타': 'XK', '파': 'VK', '하': 'GK',
        '이': 'DL', '어': 'J', '리': 'DJFL'
    };
    
    // 한글 변환
    refined = refined.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, (match) => koreanToEnglishMap[match] || '');
    
    return refined;
}



async function updateProductCountsAndBarcode(sellerCode, updatedOptionDatas, updatedSetOptionDatas) {
    const messageDiv = document.getElementById('message');
    try {
        const productDoc = await db.collection('Products').doc(sellerCode).get();
        const existingOptionDatas = productDoc.data().OptionDatas;

        for (let optionName in updatedOptionDatas) {
            existingOptionDatas[optionName] = { ...existingOptionDatas[optionName], ...updatedOptionDatas[optionName] };
        }
        await db.collection('Products').doc(sellerCode).update({ OptionDatas: existingOptionDatas });
        messageDiv.innerHTML = '<p>옵션 Counts와 바코드가 성공적으로 업데이트되었습니다.</p>';

        const setSellerCode = "SET_" + sellerCode;
        const setProductDoc = await db.collection('Products').doc(setSellerCode).get();
        // setProductDoc가 존재하는지 체크
        if (!setProductDoc.exists) {
            messageDiv.innerHTML = '<p>SET 상품 정보가 존재하지 않습니다. 관리자에게 문의하세요.</p>';
            return;
        }
        else {            
            const setExistingOptionDatas = setProductDoc.data().OptionDatas;            
            // updatedSetOptionDatas의 첫번째 옵션의 Counts 값만 "옵션1"에 업데이트
            const firstOptionKey = Object.keys(updatedSetOptionDatas)[0];



            if (firstOptionKey && updatedSetOptionDatas[firstOptionKey] && updatedSetOptionDatas[firstOptionKey].Counts !== undefined) {
                setExistingOptionDatas["옵션1"] = {
                    ...setExistingOptionDatas["옵션1"],
                    Counts: updatedSetOptionDatas[firstOptionKey].Counts
                };
            }
            console.log(setExistingOptionDatas);
            console.log(updatedSetOptionDatas);

            await db.collection('Products').doc(setSellerCode).update({ OptionDatas: setExistingOptionDatas });
            messageDiv.innerHTML = '<p>SET 옵션 Counts가 성공적으로 업데이트되었습니다.</p>';
        }


    } catch (error) {
        console.error("Error updating document:", error);
        messageDiv.innerHTML = '<p>옵션 Counts와 바코드 업데이트 중 오류가 발생했습니다.</p>';
    }
}


function generateImageURLs(sellerCode, option, 입고차수, groupOptions, imageExtension = 'jpg') {
    if (!입고차수) {
        console.error("입고차수가 정의되지 않았습니다.");
        return { 옵션이미지URL: '', 실제이미지URL: '' };
    }

    const cleaned입고차수 = 입고차수.replace("차입고", "");
    let optionNumber = option.replace("옵션", "");
    const 입고차수정보 = parseInt(cleaned입고차수, 10);
    let 이미지명 = '';
    let 보여주기용옵션명 = '';

    //console.warn(optionNumber);
    const optionNames = groupOptions ? groupOptions.split(",").map(opt => opt.trim()) : [];
    console.warn(optionNames);

    // optionNumber가 숫자인지 확인
    if (!isNaN(optionNumber)) {
        optionNumber = optionNumber.padStart(3, '0');
        if (입고차수정보 <= 23) {
            이미지명 = `${sellerCode}%20sku${optionNumber}.${imageExtension}`;
        } else {
            이미지명 = `${sellerCode}%20sku_${optionNumber}.${imageExtension}`;
        }
        보여주기용옵션명 = `${option}`;
    } else {
        // optionNumber가 숫자가 아닐 경우, groupOptions에서 해당 옵션의 인덱스를 찾기
        const index = optionNames.indexOf(option);
        if (index === -1) {
            console.error(`옵션 '${option}'이 groupOptions에서 발견되지 않았습니다.`);
            return { 옵션이미지URL: '', 실제이미지URL: '' };
        }

        const optionIndex = (index + 1).toString().padStart(3, '0'); // 인덱스는 1부터 시작
        이미지명 = `${sellerCode}%20sku_${optionIndex}_[_${optionNumber}_].${imageExtension}`;
        보여주기용옵션명 = `${optionIndex}_[_${optionNumber}_]`;
    }
    console.log(이미지명);

    const baseUrl = `https://dakkuharu.openhost.cafe24.com/1688/${cleaned입고차수}/${sellerCode}`;
    
    const 옵션이미지URL = `${baseUrl}/option/${이미지명}`;
    const 실제이미지URL = `${baseUrl}/real/${이미지명}`;
    
    console.log(`보여주기용옵션명: ${보여주기용옵션명}`);
    console.log(`옵션이미지URL: ${옵션이미지URL}`);
    console.log(`실제이미지URL: ${실제이미지URL}`);

    return { 보여주기용옵션명, 옵션이미지URL, 실제이미지URL };
}

/**
 * updatedOptionDatas 및 updatedSetOptionDatas 내의 'Counts' 값이 음수인 경우 0으로 변경합니다.
 * 두 객체는 참조로 전달되므로 함수 내에서 직접 변경(Side Effect)됩니다.
 *
 * @param {Object<string, {Counts: number, Price: number, 바코드: string} | Object>} optionData - 일반 옵션 데이터 객체 (예: updatedOptionDatas)
 * @param {Object<string, {Counts: number} | Object>} setOptionData - 세트 옵션 데이터 객체 (예: updatedSetOptionDatas)
 */
const ensureNonNegativeCounts = (optionData, setOptionData) => {

    // 1. 일반 옵션 데이터 (updatedOptionDatas) 처리
    for (const optionName in optionData) {
        if (optionData.hasOwnProperty(optionName)) {
            const option = optionData[optionName];

            // 'Counts' 속성이 존재하고, 값이 0 미만인 경우 0으로 변경
            if (option && typeof option.Counts === 'number' && option.Counts < 0) {
                option.Counts = 0;
                const currentCountsElement = document.getElementById(`${optionName}_Counts`);                
                if (currentCountsElement) {
                    currentCountsElement.textContent = 0;
                }
            }
        }
    }

    // 2. 세트 옵션 데이터 (updatedSetOptionDatas) 처리
    for (const setName in setOptionData) {
        if (setOptionData.hasOwnProperty(setName)) {
            const setOption = setOptionData[setName];

            // 'Counts' 속성이 존재하고, 값이 0 미만인 경우 0으로 변경
            if (setOption && typeof setOption.Counts === 'number' && setOption.Counts < 0) {
                setOption.Counts = 0;
                const currentSetCountsElement = document.getElementById(`${setName}_SET_Counts`);
                if (currentSetCountsElement) {
                    currentSetCountsElement.textContent = 0;
                }                
            }
        }
    }

    console.log("[ensureNonNegativeCounts] 모든 옵션의 재고(Counts) 값이 0 미만이면 0으로 조정되었습니다.");
};