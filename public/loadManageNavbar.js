// loadManageNavbar.js — 관리자 페이지 전용 메뉴바 로더
// (기존 loadNavbar.js 를 건드리지 않기 위해 별도 파일로 둠. 동작 패턴은 동일)

// 왼쪽 메뉴 접기/펼치기 토글 스크립트를 한 번만 끼워넣는다(공용, loadNavbar.js 와 동일 동작).
function ensureNavbarToggle() {
    if (window.setupNavbarToggle || document.getElementById('navbarToggleScript')) return;
    var s = document.createElement('script');
    s.id = 'navbarToggleScript';
    s.src = './navbarToggle.js';
    document.head.appendChild(s);
}
ensureNavbarToggle();

function fetchManageNavbar() {
    document.addEventListener("DOMContentLoaded", function () {
        fetch("./manage_navbar.html")
            .then(response => response.text())
            .then(data => {
                const el = document.getElementById("navbar");
                if (el) el.innerHTML = data;
            })
            .catch(error => {
                console.error("Error fetching manage navbar:", error);
            });
    });
}

fetchManageNavbar();
