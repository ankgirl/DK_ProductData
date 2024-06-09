document.addEventListener("DOMContentLoaded", function() {
    const googleLoginButton = document.getElementById("googleLogin");
    const messageDiv = document.getElementById("message");

    googleLoginButton.addEventListener("click", function() {
        const provider = new firebase.auth.GoogleAuthProvider();

        firebase.auth().signInWithPopup(provider)
            .then((result) => {
                // 로그인 성공
                const user = result.user;
                messageDiv.innerHTML = `
                    <p>${user.displayName}님, 환영합니다!</p>
                    <button id="navigateButton">바코드 검색 페이지로 이동</button>
                `;
                // 이동 버튼 클릭 시 search_by_barcode.html로 이동
                const navigateButton = document.getElementById("navigateButton");
                navigateButton.addEventListener("click", function() {
                    window.location.href = "/search_by_barcode.html";
                });
            })
            .catch((error) => {
                // 에러 처리
                console.error("Error during Google login:", error);
                messageDiv.innerHTML = `<p>로그인 중 오류가 발생했습니다: ${error.message}</p>`;
            });
    });
});
