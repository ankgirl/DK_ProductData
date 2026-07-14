// imageUrlUtils.js — 옵션 이미지 URL 유틸 (plain script, window.ImageUrlUtils 로 노출)
// 목적: 저장된 옵션이미지URL이 없는 옛 상품도 화면에 이미지가 뜨도록, displayProductData.js 와
//       동일한 규칙으로 URL을 즉석 생성한다. (신상입고/재입고 페이지가 공유)
(function (root) {
    'use strict';

    // displayProductData.js / generateImageURLs.js 와 동일한 규칙(정본).
    function generateImageURLs(sellerCode, option, 입고차수, groupOptions, imageExtension = 'jpg') {
        if (!입고차수 || !sellerCode) return { 보여주기용옵션명: '', 옵션이미지URL: '', 실제이미지URL: '' };

        const cleaned입고차수 = String(입고차수).replace('차입고', '');
        let optionNumber = String(option).replace('옵션', '');
        const 입고차수정보 = parseInt(cleaned입고차수, 10);
        let 이미지명 = '';
        let 보여주기용옵션명 = '';
        const optionNames = groupOptions ? String(groupOptions).split(',').map(o => o.trim()) : [];

        if (!isNaN(optionNumber)) {
            optionNumber = optionNumber.padStart(3, '0');
            이미지명 = 입고차수정보 <= 23
                ? `${sellerCode}%20sku${optionNumber}.${imageExtension}`
                : `${sellerCode}%20sku_${optionNumber}.${imageExtension}`;
            보여주기용옵션명 = `${option}`;
        } else {
            const index = optionNames.indexOf(option);
            if (index === -1) return { 보여주기용옵션명: '', 옵션이미지URL: '', 실제이미지URL: '' };
            const optionIndex = (index + 1).toString().padStart(3, '0');
            이미지명 = `${sellerCode}%20sku_${optionIndex}_[_${optionNumber}_].${imageExtension}`;
            보여주기용옵션명 = `${optionIndex}_[_${optionNumber}_]`;
        }

        const baseUrl = `https://dakkuharu.openhost.cafe24.com/1688/${cleaned입고차수}/${sellerCode}`;
        return {
            보여주기용옵션명,
            옵션이미지URL: `${baseUrl}/option/${이미지명}`,
            실제이미지URL: `${baseUrl}/real/${이미지명}`,
        };
    }

    // 저장값 우선, 없으면 생성. { 옵션이미지URL, 실제이미지URL, 보여주기용옵션명 }
    // (onerror=tryAlternativeExtension 가 확장자 fallback 처리하므로 여기선 jpg 기준 생성)
    function optionImage(data, optionKey) {
        const ov = (data && data.OptionDatas || {})[optionKey] || {};
        if (ov.옵션이미지URL || ov.실제이미지URL) {
            return {
                옵션이미지URL: ov.옵션이미지URL || '',
                실제이미지URL: ov.실제이미지URL || '',
                보여주기용옵션명: ov.보여주기용옵션명 || optionKey,
            };
        }
        const sellerCode = (data && (data.SellerCode || data.id)) || '';
        const g = generateImageURLs(sellerCode, optionKey, data && data.소분류명, data && data.GroupOptions);
        return {
            옵션이미지URL: g.옵션이미지URL || '',
            실제이미지URL: g.실제이미지URL || '',
            보여주기용옵션명: ov.보여주기용옵션명 || g.보여주기용옵션명 || optionKey,
        };
    }

    root.ImageUrlUtils = { generateImageURLs, optionImage };
})(window);
