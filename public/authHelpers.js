function checkUserAuthentication(resultDiv) {
    return new Promise((resolve, reject) => {
        const user = firebase.auth().currentUser;
        if (user) {
            console.log("Authenticated user UID:", user.uid);
            resolve(user);
        } else {
            console.error("No user authenticated");
            resultDiv.innerHTML = `
                <p>로그인이 필요합니다.</p>
                <button id="loginButton">로그인 페이지로 이동</button>
            `;

            // 로그인 버튼 클릭 이벤트 추가
            const loginButton = document.getElementById("loginButton");
            loginButton.addEventListener("click", function() {
                window.location.href = "/login.html";
            });

            reject(new Error("User not authenticated"));
        }
    });
}
