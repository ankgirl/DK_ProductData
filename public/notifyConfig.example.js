// notifyConfig.example.js  → 이 파일을 복사해 notifyConfig.js 로 저장하고 값을 채우세요.
// notifyConfig.js 는 .gitignore 에 등록되어 절대 커밋되지 않습니다.
//
// [EmailJS 셋업 — 5분 작업]
//   1) https://www.emailjs.com 가입 (Gmail 로그인 가능)
//   2) Email Services → Add New → Gmail 선택 → dakkuharu@gmail.com 연동
//        → Service ID 복사 (예: service_abc1234)
//   3) Email Templates → Create New
//        Subject:  [DK_ProductData] 바코드 중복 셀러코드 감지 — {{barcode}}
//        Body:
//          바코드:        {{barcode}}
//          매치 셀러코드: {{match_count}}건
//          {{seller_codes}}
//
//          발생 페이지:   {{page_url}}
//          발생 시각:     {{timestamp}}
//        → "To Email" 항목에는  {{to_email}}  바인딩
//        → Template ID 복사 (예: template_xyz9999)
//   4) Account → API Keys → Public Key 복사
//   5) 아래 3개 값을 채워 notifyConfig.js 로 저장
//   6) (권장) EmailJS 대시보드 → Account → Security → Allowed Origins 에
//        운영 도메인 등록 (https://dakkuharu.openhost.cafe24.com 등)
//
// [동작 규칙]
//   - 바코드 검색 결과 셀러코드가 2개 이상이면 자동 발송
//   - 같은 바코드는 24시간 내 1회만 발송 (localStorage)
//   - 작업자 화면에는 토스트/모달 안 뜸 (조용히)
//   - 값이 비어있으면 알림 전체 비활성화

export const NOTIFY_CONFIG = {
  EMAILJS_SERVICE_ID:  '',
  EMAILJS_TEMPLATE_ID: '',
  EMAILJS_PUBLIC_KEY:  '',
  RECIPIENT_EMAIL:     'dakkuharu@gmail.com',

  // 급여 정산서(PDF 첨부) 발송용 템플릿 ID. 템플릿 변수: to_email/to_name/subject/message, 첨부 content(base64)/filename.
  EMAILJS_PAYSLIP_TEMPLATE_ID: '',
};
