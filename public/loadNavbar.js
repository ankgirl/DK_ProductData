

// ./JS/loadNavbar.js

// 왼쪽 메뉴 접기/펼치기 토글 스크립트를 한 번만 끼워넣는다(공용, 개별 페이지 수정 불필요).
function ensureNavbarToggle() {
    if (window.setupNavbarToggle || document.getElementById('navbarToggleScript')) return;
    var s = document.createElement('script');
    s.id = 'navbarToggleScript';
    s.src = './navbarToggle.js';
    document.head.appendChild(s);
}
ensureNavbarToggle();

async function fetchNavbar() {
    document.addEventListener("DOMContentLoaded", function () {
        fetch("./navbar.html")        
            .then(response => {
                return response.text();
            })
            .then(data => {
                document.getElementById("navbar").innerHTML = data;
            })
            .catch(error => {
                console.error("Error fetching navbar:", error); // 에러 로그 추가
            });
    });
}

fetchNavbar();