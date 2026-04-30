# DK_ProductData 프로젝트 컨텍스트

다꾸하루 상품/재고 관리 웹앱. Firebase Firestore + 정적 HTML/JS.

## DB 구조 (Firestore)

- 프로젝트 ID: `dakku-haru`
- 운영 DB: `(default)`
- 백업 DB: `dakkuharu-data-clone` (같은 프로젝트 내 named database)
- 컬렉션: `Products`
- 문서 ID = 셀러코드 (`SellerCode` 필드와 동일 값)
- 세트 상품은 **별도 문서**로 존재: `SET_{sellerCode}` (예: `cat_0102`와 짝 `SET_cat_0102`)

## 셀러코드 / 소분류명 규칙

- 셀러코드 형식: `{prefix}_{식별자}` (예: `cat_0102`, `64_0301`, `room_0102`)
- 소분류명 = 셀러코드 `_` 앞부분 기반:
  - prefix가 숫자면 `{prefix}차입고` (예: `64차입고`)
  - 숫자가 아니면 prefix 그대로 (예: `cat`, `방꾸미기`)
- 이미지 서버 경로: `https://dakkuharu.openhost.cafe24.com/1688/{cleaned입고차수}/{sellerCode}/{option|real}/...`
  - `cleaned입고차수`는 `소분류명.replace("차입고", "")`

## OptionDatas 구조

`Products/{sellerCode}.OptionDatas` 는 map. key = 옵션명 (`GroupOptions`를 콤마로 split한 값).

각 옵션 entry 필드:
- `Counts` (integer) — 수량 (자주 변경됨, 절대 자동 복구 대상에서 제외)
- `Price` (integer)
- `바코드` (string)
- `옵션이미지URL`, `실제이미지URL` (string)
- `보여주기용옵션명` (string) — 화면 정렬에 `localeCompare` 사용. 누락되면 검색 화면 깨짐 → fallback으로 옵션 키 사용 중

## 이미지 URL 고정 정책 (중요)

`csv_upload.js` 최초 업로드 시점에 `옵션이미지URL`을 OptionDatas에 저장. 이후 셀러코드/소분류명이 바뀌어도 원래 이미지 위치 유지.

`search_by_seller_code_changeinfo.js` / `search_by_barcode_changeinfo.js`의 `lockImageURLs()`가 변경 직전에 누락된 이미지 URL을 채워 넣음.

## 셀러코드 변경 동작 (search_by_seller_code/barcode_changeinfo.js)

1. `lockImageURLs(currentProduct)` — 이미지 URL 고정
2. 새 키로 `set` 후 옛 키 `delete`
3. **`SET_{currentSellerCode}` 존재 시 자동으로 같이 변경** → `SET_{newSellerCode}`
4. 변경 후 새 셀러코드로 화면 자동 재검색
5. 체크박스(`changeSellerCodeWithCategory`, 기본 체크) 체크 시 소분류명도 함께 변경

## 주요 파일

| 파일 | 역할 |
|---|---|
| `public/aGlobalMain.js` | productMap/orderMap 캐시, getProductBy* 헬퍼 |
| `public/displayProductData.js` | 상품 정보 화면 렌더링 + Counts/바코드 적용 submit 핸들러 |
| `public/search_by_seller_code.js` | 셀러코드로 검색 |
| `public/search_by_barcode.js` | 바코드로 검색 (내부적으로 셀러코드 검색 호출) |
| `public/search_by_*_changeinfo.js` | 셀러코드/입고차수 변경 폼 |
| `public/csv_upload.js` | 구글시트 CSV 업로드 (이미지 URL 고정 저장 시점) |
| `public/order_processing*.js` | 주문 처리 로직 |
| `public/generateImageURLs.js` | 이미지 URL 생성 함수 |
| `public/restore_from_backup.html` | 백업 DB에서 상품 부분 복구 도구 |

## 알려진 함정

- **Node 스크립트로 Firestore REST 호출 시 `res.setEncoding('utf8')` 필수** — 안 하면 chunk 경계에서 한글 깨짐 (실제 사고 사례 있음).
- **FormData는 input을 disabled 하기 *전*에 수집해야 함** — disabled input은 FormData에서 제외됨 (수량 저장 안 되던 사고 원인).
- **`getProductBySellerCode`(aGlobalMain.js)는 메모리 캐시 사용** — 변경 직후 stale 가능성. 셀러코드 변경 직후엔 Firestore 직접 fetch 권장.
- **Firestore `updateMask.fieldPaths`에 한글 필드명 쓸 때 백틱으로 감싸야 함** (`` `소분류명` ``).
- **호스팅 자동 배포 + 브라우저 캐시 지연** — 푸쉬 후 바로 반영 안 될 수 있음. 강력 새로고침(Ctrl+Shift+R) 권장.

## 최근 대규모 작업 (2026-04)

- 다수 셀러코드를 `cat_xxxx` 형식으로 일괄 마이그레이션 (예: `64_0301 → cat_0312`).
- 마이그레이션 도중 한글 깨짐 / SET_ 문서 누락 / 보여주기용옵션명 누락 등 발생, 백업 DB로부터 복구 완료.
- 이후 셀러코드 변경 UI에서 SET_ 자동 처리, 화면 재검색, 입력 비활성화 등 안정화 커밋 다수 (`7756e74`, `9051916`, `9d0e667`, `93ea5a9`).

## 권한/규칙

- 수량(`Counts`, `OptionCounts`, `Count`) 필드는 자주 변경되는 라이브 데이터. 백업 복구나 일괄 변경 시 **절대 덮어쓰지 말 것**.
- `OptionDatas` 전체를 백업으로 통째 복구하면 수량이 옛 값으로 돌아가니 금지.
