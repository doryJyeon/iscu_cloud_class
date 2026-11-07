# URL Shortener 과제: 공개 자동 점검 스크립트

1-7주차 URL Shortener 서비스의 필수 기능을 HTTP 요청으로 점검합니다. **총 20점, 테스트 ID는 T01-T11**입니다.

## 실행 전

- Python 3.10 이상 권장
- Vercel Production URL: `https://...vercel.app`
- 필요한 패키지 설치:

```bash
python -m pip install requests
```

## 학생용 실행

`iscu_url_shortener_check.py` 파일이 있는 폴더에서 실행합니다.

```bash
python iscu_url_shortener_check.py --url https://your-project.vercel.app
```

출력된 11개 항목의 상태를 확인하고, 실패한 항목을 수정한 뒤 재배포하여 다시 실행하세요.

- **PASS**: 해당 검사 통과
- **FAIL**: 기대 상태 코드 또는 응답 형식과 다름
- **BLOCKED**: 선행 기능이 실패해 검사 불가
- **REVIEW**: HTTP 429, 일시적 네트워크/서버 오류 등으로 **점수 미확정**. 요청 간격을 늘리거나 재검사 필요

Rate Limit이 발생하면 요청 간격을 조절할 수 있습니다.

```bash
python iscu_url_shortener_check.py --url https://your-project.vercel.app --interval 8
```

### 로컬 개발 서버 임시 점검

Next.js 개발 서버(`npm run dev`)를 켠 상태에서 다음처럼 사용합니다.

```bash
python iscu_url_shortener_check.py --url http://localhost:3000 --allow-local
```

기본값에서는 인터넷의 HTTPS Vercel 배포 주소만 허용하며, `--allow-local`은 **단일 URL 검사**에서 `localhost:3000` 또는 `127.0.0.1:3000`에 한하여 동작합니다. 로컬 점검이 통과해도 실제 제출은 **Vercel Production 배포**여야 합니다.

> T10(자기 서비스 URL 차단)은 실행 중인 로컬 주소를 자기 서비스 주소로 간주합니다. 코드가 로컬 호스트를 별도로 고려하지 않는다면 배포 환경과 결과가 다를 수 있습니다.

## 테스트 및 배점 (총 20점)

| ID | 평가 기능 | 배점 |
|---|---|---:|
| T01 | GET `/` → HTTP 200 | 1 |
| T02 | POST `/api/shorten` → 201, shortCode(6자리)/shortUrl/originalUrl 확인 | 3 |
| T03 | originalUrl 누락·빈 문자열 → 400, `MISSING_URL` | 1 |
| T04 | 잘못된 URL·`javascript:` URL → 400, `INVALID_URL` | 1 |
| T05 | 같은 originalUrl을 두 번 요청했을 때 동일 shortCode | 3 |
| T06 | GET `/{shortCode}` → 307, Location과 originalUrl 일치 | 2 |
| T07 | 없는 shortCode → 404 | 1 |
| T08 | Redirect 응답에 `Cache-Control: no-store` | 1 |
| T09 | 인증 없는 `/admin` 및 `/api/stats` → 401, `/admin` Basic 인증 헤더 확인 | 2 |
| T10 | 자기 서비스 도메인의 URL 단축 거부 → 400 | 3 |
| T11 | 다른 Vercel 서비스 도메인 URL 단축 가능 → 201 | 2 |
| **합계** | | **20** |


## 테스트 범위 및 주의사항

- 각 테스트는 해당 항목의 조건을 모두 만족하면 배점 전부를 부여하며, 항목 내 부분점수는 없습니다. `FAIL` 또는 `BLOCKED`는 해당 항목을 0점으로 처리합니다.
- 선행 테스트가 통과되지 않으면 후속 기능을 확인할 수 없습니다. T02 미통과 시 T05·T06·T08, T06 미통과 시 T08이 영향을 받습니다.
- 일시적 장애 등으로 `REVIEW`가 표시된 경우에는 점수를 확정하지 않고 재검사합니다.
- 자동 점검은 **배포한 URL에 HTTP 요청을 보내는 블랙박스 테스트**입니다. 학생의 소스 코드나 DB를 직접 확인하지 않습니다.
- T01은 메인 페이지의 HTTP 200만 확인하며, 브라우저 UI 동작·디자인은 검사하지 않습니다.
- T05의 중복 요청에는 HTTP 200 또는 201을 허용하지만, **반드시 같은 shortCode**가 반환되어야 합니다.
- T10은 제출한 서비스 주소와 동일한 호스트의 URL을 차단하는지 확인합니다. 경로 유무와 HTTP/HTTPS 여부에 관계없이 HTTP 400을 반환해야 합니다. 예를 들어 제출 주소가 `https://my-app.vercel.app`이면 해당 주소 자체, `https://my-app.vercel.app/abc123`, `http://my-app.vercel.app/xyz`를 모두 차단해야 합니다.
- 서로 다른 URL이 동일한 shortCode로 변환되는 **해시 충돌 문제의 처리 및 복구는 이번 과제의 구현·테스트 범위에 포함되지 않습니다.**
- 관리자 인증 성공이나 클릭 수 증가는 이번 자동 점검 대상에서 제외합니다.
- 자동 점검 프로그램은 실행할 때마다 고유한 테스트 URL을 생성하며, T05에서는 중복 처리를 확인하기 위해 동일한 URL을 반복 요청합니다. DB에 `iscu_check` 쿼리 파라미터가 포함된 테스트 데이터 또는 `other-...vercel.app` URL이 저장될 수 있습니다.
- T11에서 사용하는 다른 서비스의 URL은 실제 접속 가능한 웹사이트가 아닐 수 있습니다. 이번 테스트에서는 URL 형식이 올바르면 단축할 수 있어야 하며, 원본 사이트의 실제 접속 가능 여부는 검사하지 않습니다.
- 관리자 비밀번호, API Key, DB 접속 문자열은 스크립트에 입력하지 않습니다.
- 채점은 Vercel `.vercel.app` 주소만 지원합니다. 커스텀 도메인은 별도 검토해야 합니다.
- `REVIEW`가 하나라도 표시되면 점수가 확정된 상태가 아닙니다.


## 제출 마감 및 공정성

- 제출 마감 직후 자동 채점을 시작합니다.
- 제출 마감 전까지 GitHub에 최종 코드를 push하고, Vercel Production 배포를 완료해야 합니다.
- **채점 중 코드 수정이나 재배포로 인해 발생하는 테스트 실패는 학생 본인의 책임이며, 해당 테스트 결과를 그대로 반영합니다.**
- 따라서 제출 마감 이후에는 **교수자의 채점 완료 공지가 있을 때까지** GitHub 코드를 수정하거나 Vercel Production을 재배포하지 마시기 바랍니다.
