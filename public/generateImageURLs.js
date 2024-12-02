

// export function generateImageURLs(sellerCode, option, 입고차수) {
//     const cleaned입고차수 = 입고차수.replace("차입고", "");
//     const optionNumber = option.replace("옵션", "").padStart(3, '0');
//     const 입고차수정보 = parseInt(cleaned입고차수, 10);
//     let 이미지명 = '';

//     if (입고차수정보 <= 23) {
//         이미지명 = `${sellerCode}%20sku${optionNumber}.jpg`;
//     } else {
//         이미지명 = `${sellerCode}%20sku_${optionNumber}.jpg`;
//     }

//     const baseUrl = `https://dakkuharu.openhost.cafe24.com/1688/${cleaned입고차수}/${sellerCode}`;
//     const 옵션이미지URL = `${baseUrl}/option/${이미지명}`;
//     const 실제이미지URL = `${baseUrl}/real/${이미지명}`;

//     return { 옵션이미지URL, 실제이미지URL };
// }


export function generateImageURLs(sellerCode, option, 입고차수, groupOptions) {
    if (!입고차수) {
        console.error("입고차수가 정의되지 않았습니다.");
        return { 옵션이미지URL: '', 실제이미지URL: '' };
    }

    const cleaned입고차수 = 입고차수.replace("차입고", "");
    let optionNumber = option.replace("옵션", "");
    const 입고차수정보 = parseInt(cleaned입고차수, 10);
    let 이미지명 = '';
    
    const optionNames = groupOptions ? groupOptions.split(",").map(opt => opt.trim()) : [];
    console.warn(optionNames);

    // optionNumber가 숫자인지 확인
    if (!isNaN(optionNumber)) {
        optionNumber = optionNumber.padStart(3, '0');
        if (입고차수정보 <= 23) {
            이미지명 = `${sellerCode}%20sku${optionNumber}.jpg`;
        } else {
            이미지명 = `${sellerCode}%20sku_${optionNumber}.jpg`;
        }
    } else {
        // optionNumber가 숫자가 아닐 경우, groupOptions에서 해당 옵션의 인덱스를 찾기
        const index = optionNames.indexOf(option);
        if (index === -1) {
            console.error(`옵션 '${option}'이 groupOptions에서 발견되지 않았습니다.`);
            return { 옵션이미지URL: '', 실제이미지URL: '' };
        }

        const optionIndex = (index + 1).toString().padStart(3, '0'); // 인덱스는 1부터 시작
        이미지명 = `${sellerCode}%20sku_${optionIndex}_[_${optionNumber}_].jpg`;
    }
    console.log(이미지명);

    const baseUrl = `https://dakkuharu.openhost.cafe24.com/1688/${cleaned입고차수}/${sellerCode}`;
    const 옵션이미지URL = `${baseUrl}/option/${이미지명}`;
    const 실제이미지URL = `${baseUrl}/real/${이미지명}`;

    return { 옵션이미지URL, 실제이미지URL };
}
