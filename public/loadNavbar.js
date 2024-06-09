

// ./JS/loadNavbar.js

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