export function generateImageURLs(sellerCode, option, 입고차수) {
    const cleaned입고차수 = 입고차수.replace("차입고", "");
    const optionNumber = option.replace("옵션", "").padStart(3, '0');
    const 입고차수정보 = parseInt(cleaned입고차수, 10);
    let 이미지명 = '';

    if (입고차수정보 <= 23) {
        이미지명 = `${sellerCode}%20sku${optionNumber}.jpg`;
    } else {
        이미지명 = `${sellerCode}%20sku_${optionNumber}.jpg`;
    }

    const baseUrl = `https://dakkuharu.openhost.cafe24.com/1688/${cleaned입고차수}/${sellerCode}`;
    const 옵션이미지URL = `${baseUrl}/option/${이미지명}`;
    const 실제이미지URL = `${baseUrl}/real/${이미지명}`;

    return { 옵션이미지URL, 실제이미지URL };
}
