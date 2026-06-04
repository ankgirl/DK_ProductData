// loadManageNavbar.js — 관리자 페이지 전용 메뉴바 로더
// (기존 loadNavbar.js 를 건드리지 않기 위해 별도 파일로 둠. 동작 패턴은 동일)

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
