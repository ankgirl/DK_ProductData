# 카테고리 정리 기능 기획서

작성일: 2026-05-01
대상: 다꾸하루 상품/재고 관리 웹앱 (DK_ProductData)
목적: 스토어에 카테고리별 상품을 직접 옮길 때, **셀러코드 묶음을 한 번에 복사**할 수 있게 하는 사전 준비 시스템.

---

## 1. 핵심 요구

- 운영자가 카테고리를 클릭 → 해당 카테고리 상품을 **셀러코드 + 대표이미지 1장**으로 확인 → **셀러코드 콤마 결합 복사** 버튼으로 클립보드에 한 번에 복사 → 스토어 관리자에 붙여넣기.
- 시스템 카테고리 = **제품 종류(`kind`)** 와 **다이어리·다꾸용품·기타문구·소품**만 다룸. 신상품 / 재입고 / 세트할인 / 스타일 / 시즌 분할 등은 스토어에서 운영자가 직접 관리. (DB 정보 부족)
- 한 상품은 여러 카테고리에 속할 수 있음.
- 자동화 위에 운영자가 카테고리 추가/수정/삭제, 상품-카테고리 부여를 손으로 조정 가능.

---

## 2. DB 변경 사항

### 2-1. 신규 컬렉션 `Categories`
단일 문서 `Categories/master`에 카테고리 트리 정의.

```js
{
  version: 1,
  updatedAt: <timestamp>,
  rootOrder: ["kind", "diary", "supplies", "etc"],
  nodes: {
    "kind": { name: "제품종류별", kind: "group", order: 0 },
    "kind_3d_scene":  { parent: "kind", name: "3D 방꾸미기 씬스티커", kind: "group", order: 0 },
    "kind_3d_scene_book":     { parent: "kind_3d_scene", name: "스티커북",      kind: "leaf", order: 0 },
    "kind_3d_scene_set":      { parent: "kind_3d_scene", name: "세트상품",      kind: "leaf", order: 1 },
    "kind_3d_scene_single":   { parent: "kind_3d_scene", name: "개별상품",      kind: "leaf", order: 2 },
    "kind_3d_scene_supplies": { parent: "kind_3d_scene", name: "방꾸미기 용품",  kind: "leaf", order: 3 },

    "kind_3d_dome":  { parent: "kind", name: "3D 올록볼록 입체", kind: "group", order: 1 },
    "kind_3d_dome_single": { parent: "kind_3d_dome", name: "개별상품", kind: "leaf", order: 0 },
    "kind_3d_dome_set":    { parent: "kind_3d_dome", name: "세트상품", kind: "leaf", order: 1 },

    "kind_pixel":        { parent: "kind", name: "픽셀스티커, 픽셀컬러링", kind: "leaf", order: 2 },
    "kind_sticker_book": { parent: "kind", name: "스티커북",       kind: "leaf", order: 3 },
    "kind_bg":           { parent: "kind", name: "배경지, 소재지", kind: "leaf", order: 4 },
    "kind_memo":         { parent: "kind", name: "메모지",         kind: "leaf", order: 5 },
    "kind_note":         { parent: "kind", name: "수첩, 노트",     kind: "leaf", order: 6 },
    "kind_set":          { parent: "kind", name: "세트상품",       kind: "leaf", order: 7 },
    "kind_masking":      { parent: "kind", name: "마스킹테이프",   kind: "leaf", order: 8 },
    "kind_sticker":      { parent: "kind", name: "스티커",         kind: "leaf", order: 9 },

    "diary":          { name: "다이어리", kind: "group", order: 1 },
    "diary_m5":       { parent: "diary", name: "M5·5공다이어리", kind: "group", order: 0 },
    "diary_m5_cover": { parent: "diary_m5", name: "다이어리 커버", kind: "leaf", order: 0 },
    "diary_m5_paper": { parent: "diary_m5", name: "다이어리 속지", kind: "leaf", order: 1 },
    "diary_a6":       { parent: "diary", name: "A6 다이어리",      kind: "leaf", order: 1 },

    "supplies": { name: "다꾸용품", kind: "leaf", order: 2 },

    "etc":           { name: "기타문구, 소품", kind: "group", order: 3 },
    "etc_keyring":   { parent: "etc", name: "키링·고리",      kind: "leaf", order: 0 },
    "etc_stamp":     { parent: "etc", name: "스탬프",         kind: "leaf", order: 1 },
    "etc_bookclip":  { parent: "etc", name: "북클립",         kind: "leaf", order: 2 },
    "etc_cutting":   { parent: "etc", name: "커팅보드",       kind: "leaf", order: 3 },
    "etc_phonecase": { parent: "etc", name: "아이폰케이스",   kind: "leaf", order: 4 },
    "etc_acrylic":   { parent: "etc", name: "아크릴판",       kind: "leaf", order: 5 },
    "etc_misc":      { parent: "etc", name: "기타",           kind: "leaf", order: 6 }
  }
}
```

#### 노드 종류 (`kind` 필드)
- `group`: 부모 카테고리. **상품 직접 부여 불가**. 자식 합집합으로만 조회.
- `leaf`: 끝 카테고리. 상품 부여 가능.

### 2-2. `Products/{sellerCode}.CategoryIds` 필드 추가
- 타입: `string[]`
- 값: leaf 노드 ID 배열 (group/timeRoot 등 비-leaf ID는 들어가지 않음)
- 매핑 실패 → 빈 배열 또는 필드 없음
- **기존 필드는 절대 손대지 않음** (`분류(스티커,레이스,등)`, `소분류명`, `검색태그`, `대분류명`, `중분류명`, `OptionDatas`, 수량 필드 모두 그대로)

---

## 3. 자동 매핑 알고리즘

마이그레이션 + csv_upload 신규 분기에서 공용으로 사용. `분류(스티커,레이스,등)` 와 `상품명` 둘 다 참고.

### 3-1. 별칭 사전 (분류 → leaf ID)
```js
const ALIAS_TO_NODE = {
  "마스킹테이프":      "kind_masking",
  "마스킹테이프세트":  "kind_masking",   // 합치기로 결정
  "스티커":            "kind_sticker",
  "스티커북":          "kind_sticker_book",
  "소재지":            "kind_bg",
  "메모지":            "kind_memo",
  "스탬프":            "etc_stamp",
  "스탬프패드":        "etc_stamp",
  "북클립":            "etc_bookclip",
  "커팅보드":          "etc_cutting",
  "집게":              "supplies",
  "형광펜":            "supplies",
  "핀셋":              "supplies",
  "아이폰케이스":      "etc_phonecase",
  "아크릴판":          "etc_acrylic",
  "KEY RING":          "etc_keyring",
  "기타문구":          "etc_misc",
  "픽셀스티커":        "kind_pixel",
  "픽셀스티커북":      "kind_pixel",
  "픽셀컬러링":        "kind_pixel",
  "방꾸미기스티커":     "kind_3d_scene_single",   // 상품명으로 정밀 분류
  "방꾸미기스티커북":   "kind_3d_scene_book",
  "다이어리":          "__DIARY_AMBIGUOUS__",     // 상품명으로 결정
  "다이어리속지":      "__DIARY_AMBIGUOUS__",
};
```

### 3-2. 상품명 키워드 우선 매핑
```
1) 상품명에 "올록볼록"/"입체"/"돔"/"복돔" → kind_3d_dome_*
   - "세트" 포함: kind_3d_dome_set
   - 그 외: kind_3d_dome_single

2) 상품명에 "방꾸미기 씬"/"씬스티커" → kind_3d_scene_*
   - "스티커북": kind_3d_scene_book
   - "세트": kind_3d_scene_set
   - "용품": kind_3d_scene_supplies
   - 그 외: kind_3d_scene_single

3) 분류 = "다이어리" 계열 → 상품명으로 분기
   - /M5|5공|5홀|루즈리프/ → diary_m5_paper (또는 커버 키워드 시 diary_m5_cover)
   - /A6/ → diary_a6
   - 매칭 실패 → null (미부여)

4) 위 매칭 없음 → ALIAS_TO_NODE[stripPrefix(분류)] 적용
   - stripPrefix: "01. 마스킹테이프" → "마스킹테이프", "1. 스티커" → "스티커" 등 번호·점·공백 제거
```

### 3-3. 노이즈 처리 (콤마 나열 등)
`분류` 값이 콤마로 여러 키워드 나열된 경우 (~30건):
- 분류 문자열 안에서 트리 노드 이름 키워드를 찾음 (`마스킹테이프|스티커북|메모지|...`)
- 첫 매칭 leaf로 부여, 실패 시 미부여 (CategoryIds = [])

### 3-4. 미부여 처리
매핑 실패한 상품은 `CategoryIds` 빈 배열로 저장 → `category_audit.html`에서 운영자가 손으로 부여.

---

## 4. 마이그레이션

### 실행 방식
- `manage_categories.html` 안에 [마이그레이션 실행] 버튼.
- 또는 일회성 Node 스크립트.
- **멱등성 보장**: 다시 돌려도 이미 `CategoryIds`가 있으면 건너뜀 (운영자 수정 보호).
  - 옵션: "강제 재매핑" 체크박스 — 모든 상품의 CategoryIds 재계산 (운영자 수정 덮어씀, 사용 주의).

### 진행률 / 결과 표시
- 처리 완료 / 매핑 성공 N건 / 매핑 실패 N건 (미부여)
- 매핑 실패 셀러코드 목록 출력 → audit 페이지로 이동 가능.

### 한글 인코딩 ⚠️
- Node REST 호출 시 **`res.setEncoding('utf8')` 필수** (CLAUDE.md 알려진 함정).
- 브라우저 fetch는 자동 UTF-8.

---

## 5. 페이지 구성 (신규 4개)

### 5-1. `manage_categories.html` — 카테고리 트리 관리
- 좌: 트리 뷰 (group/leaf 시각 구분)
- 우: 노드 상세 편집 (이름·부모·순서·종류)
- 액션: 노드 추가, 이름 변경, 순서 변경 (드래그 또는 ↑↓ 버튼), 삭제, 부모 변경
- 상단:
  - [마이그레이션 실행] 버튼 + [강제 재매핑] 옵션
  - 노드별 부여 상품 수 표시
- ⚠️ leaf 삭제 시: 해당 leaf가 부여된 상품 수 확인 다이얼로그 → 확인 시 모든 상품의 CategoryIds에서 제거 + 노드 삭제.
- 노드 이름 변경은 ID 기반이라 부여 영향 없음.

### 5-2. `view_by_category.html` — 카테고리별 보기 + 셀러코드 복사 (핵심 기능)
- 좌: 카테고리 트리 (클릭 가능)
  - leaf 클릭: 그 leaf만
  - group 클릭: 자식 leaf 합집합 (중복 셀러코드 dedup)
  - "(미부여)" 가상 노드: CategoryIds 빈 상품
- 우: 그리드 카드
  - **셀러코드** (클릭 시 `search_by_seller_code.html?sellerCode=...` 새 탭)
  - **대표이미지** (`Cafe24URL` 또는 `대표이미지` 또는 `ImageURL` 필드 fallback)
- 상단 액션 바:
  - **[셀러코드 콤마 복사]** 버튼 → 클립보드에 `cat_0102,cat_0103,room_0301,...`
  - 표시 개수 / 200개 초과 빨간 경고
  - 카테고리 이름 + 부모 경로 (예: "제품종류별 > 마스킹테이프")
- 카드 우상단: ⋮ 메뉴 → "카테고리 변경" → 체크박스 팝오버로 빠른 부여/해제.

### 5-3. `category_audit.html` — 미부여 / 매핑 실패 상품 손질
- 미부여 상품 그리드 (셀러코드, 대표이미지, 상품명, 현재 `분류` 값)
- 행마다: 카테고리 드롭다운(다중) + [부여] 버튼
- 일괄 선택 + [선택한 상품에 일괄 부여]
- "매핑 실패 사유" 컬럼 (분류 비어있음 / 노이즈 / 다이어리 모호 등)

### 5-4. `displayProductData.js` 확장 — 상품 상세 카테고리 표시·편집
- 상품 상세 화면 상단/하단에 카테고리 칩 표시: `[마스킹테이프 ✕] [다꾸용품 ✕] [+ 추가]`
- ✕ 클릭: 해당 leaf 제거
- [+] 클릭: 트리 팝오버에서 leaf 선택 → 추가
- 변경 즉시 Firestore 업데이트.

### 5-5. 네비바 (`navbar.html`)
```html
<a href="view_by_category.html">카테고리별 보기</a>
<a href="manage_categories.html">카테고리 관리</a>
<a href="category_audit.html">카테고리 미부여 검수</a>
```

---

## 6. 기존 코드 영향 (정밀 분석 결과)

### 6-1. `csv_upload.js` ⚠️ 수정 필요
- 현재 신규 분기 (45행 `set(product)`): `CategoryIds` 없는 채로 입력됨.
- **수정**: 신규 분기에서 자동 매핑 호출 후 `product.CategoryIds`에 세팅.
- 기존 상품 분기 (38행 `update(updatedData)`): **`CategoryIds`는 건드리지 않음** — 운영자가 카테고리 페이지에서 손댄 결과를 csv 재업로드가 덮어쓰지 않도록.
  - `{ ...existingData, ...product }` 에서 `product`에 `CategoryIds` 키가 없으면 자연스럽게 보존됨 (현재 동작 그대로).

### 6-2. `restore_from_backup.html` ⚠️ 수정 필요 (CategoryIds + OptionDatas.Counts 보존)
- 현재 92행 `set(data)`: 백업 데이터로 통째 덮어쓰기 → 운영 DB의 `CategoryIds` 사라지고 옵션별 `Counts`가 옛 값으로 회귀.
- **수정**: set 직전 운영 DB의 현재값에서 두 가지를 읽어 `data`에 보존.
  ```js
  const cur = (await db.collection('Products').doc(sellerCode).get()).data();
  if (cur) {
    // 1) CategoryIds 보존 (카테고리 작업 결과 보호)
    if (cur.CategoryIds !== undefined) data.CategoryIds = cur.CategoryIds;
    // 2) OptionDatas의 Counts 보존 (실시간 재고 보호 — CLAUDE.md "수량 통째 복구 금지" 규칙)
    if (cur.OptionDatas && data.OptionDatas) {
      for (const optName of Object.keys(data.OptionDatas)) {
        if (cur.OptionDatas[optName]?.Counts !== undefined) {
          data.OptionDatas[optName].Counts = cur.OptionDatas[optName].Counts;
        }
      }
    }
    // 3) (위 2가 다루지 못하는 경우) 운영 DB에만 있는 새 옵션이 백업 데이터엔 없으면 그 옵션 통째 보존
    if (cur.OptionDatas) {
      for (const optName of Object.keys(cur.OptionDatas)) {
        if (!data.OptionDatas?.[optName]) {
          data.OptionDatas = data.OptionDatas || {};
          data.OptionDatas[optName] = cur.OptionDatas[optName];
        }
      }
    }
    // 4) 최상위 Count (단일값 필드 — 일부 문서가 보유) 도 보존
    if (cur.Count !== undefined) data.Count = cur.Count;
  }
  await db.collection('Products').doc(sellerCode).set(data);
  ```
- 결과: 이미지·옵션명·옵션이미지URL·바코드 등은 백업으로 복구되되, **카테고리 부여 및 모든 수량 필드는 운영 DB 현재값 유지**.
- 운영자에게 미리보기에 "수량/카테고리는 현재값 유지됨" 안내 메시지 표시.

### 6-3. `aGlobalMain.js` (productMap 캐시) ⚠️ 주의
- `getProductBySellerCode`는 캐시 사용 → 카테고리 부여 직후 stale.
- **대응**: 신규 카테고리 페이지(view/manage/audit)는 캐시 우회하고 `db.collection('Products').doc().get()` 직접 호출. 또는 부여 후 productMap 무효화/리로드.

### 6-4. `displayProductData.js` 확장 (5-4)
- 카테고리 칩 표시·편집 추가. 기존 동작은 보존.

### 6-5. 영향 없음 (수정 불필요)
- `search_by_seller_code_changeinfo.js`, `search_by_barcode_changeinfo.js`: 셀러코드 변경 시 데이터 안의 `CategoryIds`도 자연스럽게 따라감.
- `search_by_small_category.js`, `search_from_database.js`: `소분류명` 기반 동작.
- `order_processing*.js`, `order_randombox*.js`, `xlsx_upload_smart_store_for_update_option_count.js`: CategoryIds 미참조.
- `firestore.rules`: 현재 룰이 모든 컬렉션에 RW 허용이라 `Categories` 자동 적용.
- `updateMask.fieldPaths`: `CategoryIds`는 영문이라 백틱 불필요.

---

## 7. 보안 / 안전 장치

- **카테고리 부여/해제는 `CategoryIds` 필드만 쓴다**. 다른 필드(특히 `Counts`, `OptionDatas`) 절대 안 건드림 — Firestore `update` 시 명시적으로 `{ CategoryIds: ... }` 만 지정.
- **leaf 삭제 시 영향 상품 수 확인 다이얼로그** — 실수 방지.
- **마이그레이션 멱등성** — 이미 `CategoryIds`가 있으면 건너뜀. "강제 재매핑"은 별도 옵션.
- **백업 우선** — 마이그 전에 운영 DB 백업 (`dakkuharu-data-clone`) 최신화 필수.

---

## 8. 작업 순서

### 사전
0. 운영 DB 백업 (Firebase 콘솔 export 또는 백업 DB 동기화)

### 개발
1. `Categories/master` 시드 문서 작성·업로드 (수동 1회 또는 `manage_categories.html` 첫 진입 시 자동)
2. 자동 매핑 모듈 (`category_mapper.js`) — 별칭 사전 + 상품명 키워드 알고리즘
3. `manage_categories.html` 트리 편집 + 마이그레이션 버튼
4. 마이그레이션 실행 → 운영자 검증
5. `view_by_category.html` (핵심 기능)
6. `category_audit.html` 미부여 검수
7. `csv_upload.js` 신규 분기 hook 추가
8. `restore_from_backup.html` `CategoryIds` 보존 추가
9. `displayProductData.js` 카테고리 칩 추가
10. 네비바 갱신

---

## 9. 미결정 사항

(없음 — 모두 결정 완료, 개발 진행 가능)

---

## 10. 결정·가정 로그

| 항목 | 결정 |
|---|---|
| 카테고리 표기 | 코드 없이 이름만 |
| 신상품·재입고·세트할인·스타일 | 시스템에서 다루지 않음 (스토어에서 운영자 직접) |
| 다중 카테고리 | 가능 (한 상품 → 여러 leaf) |
| 시즌 분할 / 200캡 | 시스템 처리 안 함 |
| `세트상품` 두 곳 등장 | 별개 leaf (`kind_3d_scene_set` vs `kind_set` 등) |
| 마이그레이션 후 `분류` 값 변경 시 재매핑 | **csv_upload 신규 분기에서 1회만 매핑**. 이후 `분류` 바뀌어도 `CategoryIds`는 건드리지 않음 |
| 미부여 상품 처리 | 별도 페이지 `category_audit.html` |
| 상품 상세에 카테고리 표시·편집 | 추가 (`displayProductData.js` 확장) |
| 스토어 동기화 | 안 함 (이 앱은 내부 관리 + 셀러코드 복사 도구 전용) |
| `restore_from_backup.html` 보강 범위 | **CategoryIds + OptionDatas.Counts 모두 보존** (수량 회귀 위험 차단) |
| 백업 DB | `dakkuharu-data-clone2` (2026-05-01 카테고리 마이그 직전 생성) |
