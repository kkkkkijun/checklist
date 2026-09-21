/*
  Firebase 설정 (가족 공유 동기화용)

  이 값들은 프로젝트 식별자라 공개되어도 되며, 실제 접근 통제는 Realtime Database 보안 규칙이 담당합니다.
  (규칙: 20자 이상 무작위 방 ID를 아는 사람만 그 방을 읽고 쓸 수 있음)

  설정이 비어 있으면(null) 앱은 기기 저장만 하고 공유 기능은 꺼집니다.
*/
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBuSmJ00ym7OclSVOU9ie2dEIAkUEXhGKE",
  authDomain: "checklist-e66fd.firebaseapp.com",
  databaseURL: "https://checklist-e66fd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "checklist-e66fd",
  storageBucket: "checklist-e66fd.firebasestorage.app",
  messagingSenderId: "295580841905",
  appId: "1:295580841905:web:5a8b89ee5cbf7427562f90"
};
