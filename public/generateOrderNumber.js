

export function generateOrderNumber() {
    // 현재 날짜 가져오기
    const now = new Date();
    
    // 년도, 월, 일 추출 및 문자열로 변환
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // 월은 0부터 시작하므로 1 더해줌
    const day = now.getDate().toString().padStart(2, '0');
    
    // 8자리 랜덤 숫자 생성
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    
    // 주문번호 생성
    const orderNumber = `${year}${month}${day}${randomDigits}`;
    
    return orderNumber;
}
