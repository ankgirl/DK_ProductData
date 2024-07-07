document.addEventListener('DOMContentLoaded', function() {
    // 현재 날짜를 확인하여 드롭다운 기본값 설정
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // getMonth()는 0부터 시작하므로 1을 더함

    document.getElementById('yearDropdown').value = currentYear;
    document.getElementById('monthDropdown').value = currentMonth;
});

document.getElementById('generateReportButton').addEventListener('click', async function() {
    const year = document.getElementById('yearDropdown').value;
    const month = document.getElementById('monthDropdown').value;
    const reportTitle = document.getElementById('reportTitle');
    const salesReportDiv = document.getElementById('salesReport');

    reportTitle.textContent = `${year}년 ${month}월 매출 보고서`;

    // Calculate the start and end dates for the selected month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    try {
        const db = firebase.firestore();
        const q = db.collection('CompletedOrders').where('주문처리날짜', '>=', startDate).where('주문처리날짜', '<=', endDate);
        const querySnapshot = await q.get();

        let totalBasicShippingFee = 0;
        let totalPaymentAmount = 0;
        let totalCostAmount = 0;
        let totalServiceProductAmount = 0;
        let totalServiceCostAmount = 0;
        let totalOrderAmount = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            totalBasicShippingFee += Math.floor(parseFloat(data.기본배송비) || 0);
            totalPaymentAmount += Math.floor(parseFloat(data.총결제금액) || 0);
            totalCostAmount += Math.floor(parseFloat(data.총원가금액) || 0);
            totalServiceProductAmount += Math.floor(parseFloat(data.서비스제품금액) || 0);
            totalServiceCostAmount += Math.floor(parseFloat(data.서비스총원가금액) || 0);
            totalOrderAmount += Math.floor(parseFloat(data.총주문금액) || 0);
        });

        const totalExpenses = totalCostAmount + totalServiceCostAmount + totalBasicShippingFee;

        salesReportDiv.innerHTML = `
            <p><strong>기본배송비 합계:</strong> ${totalBasicShippingFee.toLocaleString()}원</p>
            <p><strong>총결제금액 합계:</strong> ${totalPaymentAmount.toLocaleString()}원</p>
            <p><strong>총원가금액 합계:</strong> ${totalCostAmount.toLocaleString()}원</p>
            <p><strong>서비스제품금액 합계:</strong> ${totalServiceProductAmount.toLocaleString()}원</p>
            <p><strong>서비스총원가금액 합계:</strong> ${totalServiceCostAmount.toLocaleString()}원</p>
            <p><strong>총주문금액 합계:</strong> ${totalOrderAmount.toLocaleString()}원</p>
            <p><strong>총 비용:</strong> ${totalExpenses.toLocaleString()}원</p>
        `;
    } catch (error) {
        console.error("Error generating sales report: ", error);
        salesReportDiv.innerHTML = `<p>매출 보고서를 생성하는 중 오류가 발생했습니다: ${error.message}</p>`;
    }
});
