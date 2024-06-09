// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAd55jS6ZBQS5HnwtxnCoxoqKKlBRZrZ-k",
  authDomain: "dakku-haru.firebaseapp.com",
  projectId: "dakku-haru",
  storageBucket: "dakku-haru.appspot.com",
  messagingSenderId: "771102516376",
  appId: "1:771102516376:web:a24ba64a459b6d3e81dced",
  measurementId: "G-T6X2CTEZVM"
};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);
firebase.analytics();
// Firestore 데이터베이스 초기화 및 전역 변수로 설정
window.db = firebase.firestore();
console.log("Firebase Firestore initialized:", window.db);


