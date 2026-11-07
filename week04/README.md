# 4주차 실습: Neon Postgres에 URL 매핑 저장하기

이번 주차에서는 3주차에 만든 `/api/shorten`이 생성한 `shortCode`와 `originalUrl`을 Neon Postgres에 저장합니다.

## 실습 목표

- Neon Postgres 데이터베이스 생성
- Neon의 Pooled Connection URL 확인
- Vercel에 `DATABASE_URL` 환경변수 등록
- `urls` 테이블 생성
- Next.js에서 Neon DB 연결
- `/api/shorten`에서 URL 매핑 저장
- 저장 결과 확인

---

## 1. Neon Postgres 데이터베이스 생성

Neon에서 새 프로젝트를 생성합니다.

프로젝트 생성 후 데이터베이스의 Region도 확인합니다.

> Vercel Function과 Neon DB의 Region이 너무 멀리 떨어져 있으면 DB 요청의 네트워크 지연이 커질 수 있습니다.

---

## 2. Pooled Connection URL 확인

Neon 프로젝트에서 **Connect**를 선택하고 Pooled Connection을 사용합니다.

Connection String은 다음과 비슷한 형태입니다.

```text
postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require
```

이 값에는 데이터베이스 접속 정보가 포함되어 있으므로 GitHub에 직접 올리지 않습니다.

---

## 3. Vercel에 `DATABASE_URL` 등록

Vercel에서 URL Shortener 프로젝트를 열고 다음 메뉴로 이동합니다.

```text
Project
→ Settings
→ Environment Variables
```

다음 환경변수를 추가합니다.

```text
Name: DATABASE_URL
Value: Neon에서 복사한 Pooled Connection URL
```

코드에서는 실제 Connection URL 대신 다음과 같이 사용합니다.

```js
process.env.DATABASE_URL
```

환경변수를 추가한 뒤에는 새 Deployment에 반영되도록 다시 배포합니다.

---

## 4. `urls` 테이블 생성

Neon의 SQL Editor에서 다음 SQL을 실행합니다.

```sql
CREATE TABLE urls (
    short_code VARCHAR(6) PRIMARY KEY,
    original_url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

테이블이 생성되었는지 확인합니다.

```sql
SELECT * FROM urls;
```

아직 URL을 저장하지 않았다면 결과가 비어 있는 것이 정상입니다.

---

## 5. Neon 드라이버 설치

프로젝트 터미널에서 다음 명령을 실행합니다.

```bash
npm install @neondatabase/serverless
```

---

## 6. `lib/db.js` 작성

프로젝트 루트에 `lib` 폴더를 만들고 `db.js` 파일을 추가합니다.

```js
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export async function saveUrl(shortCode, originalUrl) {
  await sql`
    INSERT INTO urls (short_code, original_url)
    VALUES (${shortCode}, ${originalUrl})
  `;
}
```

`saveUrl()` 함수는 `shortCode`와 `originalUrl`을 `urls` 테이블에 저장합니다.

---

## 7. `/api/shorten`에서 DB 저장

`app/api/shorten/route.js`에 `saveUrl()`을 연결합니다.

상단에 다음 import를 추가합니다.

```js
import { saveUrl } from "../../../lib/db";
```

`shortCode`를 생성한 다음 DB에 저장합니다.

```js
const shortCode = createShortCode(originalUrl);

await saveUrl(shortCode, originalUrl);
```

전체 흐름은 다음과 같습니다.

```text
사용자 URL 입력
      ↓
POST /api/shorten
      ↓
shortCode 생성
      ↓
saveUrl(shortCode, originalUrl)
      ↓
Neon Postgres 저장
      ↓
shortUrl 응답
```

---

## 8. 저장 결과 확인

애플리케이션에서 URL을 하나 단축합니다.

예:

```text
https://www.google.com
```

그다음 Neon SQL Editor에서 다음 SQL을 실행합니다.

```sql
SELECT *
FROM urls
ORDER BY created_at DESC;
```

예상 결과:

```text
short_code | original_url           | created_at
-----------+------------------------+-------------------------
aB3xK9     | https://www.google.com | ...
```

새로고침하거나 다시 배포해도 데이터가 Neon에 남아 있다면 정상입니다.

---

## 이번 주 핵심

3주차:

```text
요청
 ↓
shortCode 생성
 ↓
응답
```

4주차:

```text
요청
 ↓
shortCode 생성
 ↓
DB 저장
 ↓
응답
```

서버리스 함수 내부의 메모리에 데이터를 보관하는 것이 아니라, 외부의 관리형 데이터베이스에 상태를 저장한다는 점이 핵심입니다.

---

## 확인 체크리스트

- [ ] Neon 프로젝트를 생성했는가?
- [ ] Pooled Connection URL을 확인했는가?
- [ ] Vercel에 `DATABASE_URL`을 등록했는가?
- [ ] `urls` 테이블을 생성했는가?
- [ ] `@neondatabase/serverless`를 설치했는가?
- [ ] `lib/db.js`에 `saveUrl()`을 구현했는가?
- [ ] `/api/shorten`에서 `saveUrl()`을 호출했는가?
- [ ] 실제 URL을 단축한 뒤 Neon에서 저장 결과를 확인했는가?
