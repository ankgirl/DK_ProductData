document.getElementById("printRecieptButton").addEventListener("click", function() {
    printReceiptTable();
});

function printReceiptTable() {
    const receiptContainer = document.querySelector('.randomItemDetailReciptContainer');

    if (!receiptContainer) {
        console.error('Receipt container not found!');
        alert('출력할 영수증 정보가 없습니다.');
        return;
    }

    // 각 값들을 현재 페이지에서 가져옴
    const luckyRandomBoxPrice = document.querySelector('.luckyRandomBoxPrice').textContent;
    const randomBoxStyle = document.querySelector('.randomBoxStyle').textContent;
    const productQuantity = document.querySelector('.productQuantity').textContent;
    const totalProductPrice = document.querySelector('.totalProductPrice').textContent;

    const receiptRows = receiptContainer.querySelectorAll('tbody tr');
    const totalRows = receiptRows.length;
    const splitIndex = Math.ceil(totalRows / 2);

    const firstTableRows = Array.from(receiptRows).slice(0, splitIndex).map(row => row.outerHTML).join('');
    const secondTableRows = Array.from(receiptRows).slice(splitIndex).map(row => row.outerHTML).join('');

    const receiptContent = `
        <div class="printable-container">
            <div class="table-container">
                <h3>영수증</h3>
                <table class="randomItemDetailTable">
                    <thead>
                        <tr>
                            <th>제품명</th>
                            <th>옵션이미지</th>
                            <th>판매가</th>
                             <!-- <th>제품상세페이지</th> -->
                        </tr>
                    </thead>
                    <tbody>
                        ${firstTableRows}
                    </tbody>
                </table>
            </div>
            ${secondTableRows ? `
            <div class="table-container">
                <table class="randomItemDetailTable">
                    <thead>
                        <tr>
                            <th>제품명</th>
                            <th>옵션이미지</th>
                            <th>판매가</th>
                             <!-- <th>제품상세페이지</th> -->
                        </tr>
                    </thead>
                    <tbody>
                        ${secondTableRows}
                    </tbody>
                </table>
                <div class="product-summary">
                    <p><strong>제품명: </strong>${randomBoxStyle}</p>
                    <p><strong>총 제품수량: </strong>${productQuantity}</p>
                    <p><strong>총제품가격: </strong>${totalProductPrice}</p>
                    
                    <p><strong>구매가격: </strong>${luckyRandomBoxPrice}</p>                    
                </div>
            </div>` : ''}
        </div>
    `;

    const printWindow = document.createElement('iframe');
    printWindow.style.position = 'absolute';
    printWindow.style.width = '0';
    printWindow.style.height = '0';
    printWindow.style.border = 'none';
    document.body.appendChild(printWindow);

    const printDocument = printWindow.contentDocument || printWindow.contentWindow.document;
    printDocument.open();
    printDocument.write(`
        <html>
        <head>
            <title>Print Receipt</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                }
                .printable-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }
                .table-container {
                    width: 100%;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 10px;
                }
                th, td {
                    border: 1px solid black;
                    padding: 4px;
                    text-align: left;
                }
                th {
                    font-size: 12px;
                }
                td {
                    font-size: 10px;
                }
                img {
                    max-width: 60px;
                    max-height: 60px;
                }
                h3 {
                    text-align: center;
                    font-size: 20px;
                    margin-bottom: 10px;
                }
                .product-summary {
                    margin-top: 10px;
                    text-align: right;
                }
            </style>
        </head>
        <body>
            ${receiptContent}
        </body>
        </html>
    `);
    printDocument.close();

    printWindow.contentWindow.focus();
    printWindow.contentWindow.print();

    setTimeout(() => {
        document.body.removeChild(printWindow);
    }, 1000);
}
