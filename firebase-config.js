/*
  Firebase 설정 (가족 공유 동기화용)

  1. https://console.firebase.google.com 에서 프로젝트 생성
  2. 빌드 → Realtime Database → 데이터베이스 만들기
  3. 프로젝트 설정(톱니바퀴) → 일반 → "웹 앱 추가" → firebaseConfig 값을 아래에 붙여넣기
  4. Realtime Database → 규칙 탭에 README의 보안 규칙을 붙여넣고 게시

  이 값들은 프로젝트 식별자라 공개되어도 되며, 실제 접근 통제는 보안 규칙이 담당합니다.
  설정이 비어 있으면(null) 앱은 기기 저장만 하고 공유 기능은 꺼집니다.
*/
window.FIREBASE_CONFIG = null;

/* 예시:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "xxxx.firebaseapp.com",
  databaseURL: "https://xxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xxxx",
  storageBucket: "xxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
*/
