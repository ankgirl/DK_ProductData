// imageFallback.js
// img 태그의 onerror에서 호출되어 jpg/png/webp/jpeg 순으로 확장자를 자동 시도.
// 67차입고 등 .png로 업로드된 상품도 화면 정상 표시되게 함.
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
