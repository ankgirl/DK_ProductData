document.getElementById("printButton").addEventListener("click", function() {
    printReceiptTable();
});

function printReceiptTable() {
    // 프린트할 컨텐츠를 선택
    const receiptContainer = document.querySelector('.randomItemDetailReciptContainer');
    
    // 해당 컨테이너가 존재하는지 확인
    if (!receiptContainer) {
        console.error('Receipt container not found!');
        alert('출력할 영수증 정보가 없습니다.');
        return;
    }

    const receiptContent = receiptContainer.outerHTML;

    // iframe 생성
    const printWindow = document.createElement('iframe');
    printWindow.style.position = 'absolute';
    printWindow.style.width = '0';
    printWindow.style.height = '0';
    printWindow.style.border = 'none';
    document.body.appendChild(printWindow); // iframe을 문서에 추가

    const printDocument = printWindow.contentDocument || printWindow.contentWindow.document;
    printDocument.open();
    printDocument.write(`
        <html>
        <head>
            <title>Print Receipt</title>
            <style>
                /* 프린트할 때 필요한 스타일 */
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                th, td {
                    border: 1px solid black;
                    padding: 10px;
                    text-align: left;
                }
                p {
                    font-size: 14px;
                    margin: 10px 0;
                }
                img {
                    max-width: 150px;
                }
                h3 {
                    text-align: center; /* 가운데 정렬 */
                    font-size: 24px; /* 사이즈 키우기 */
                }
                /* 오른쪽 정렬 */
                p {
                    text-align: right;
                }
            </style>
        </head>
        <body>
            ${receiptContent} <!-- 영수증 테이블과 아래 정보 -->
        </body>
        </html>
    `);
    printDocument.close();

    printWindow.contentWindow.focus();
    printWindow.contentWindow.print(); // 프린트 대화상자를 엶

    setTimeout(() => {
        document.body.removeChild(printWindow); // 프린트 완료 후 iframe 제거
    }, 1000);
}
