# 10주차 실습: Redis 공유 캐시로 반복 조회 줄이기

지금까지 URL Shortener는 단축 URL이 요청될 때마다 Neon Postgres에서 `originalUrl`을 조회했습니다. 인기 있는 `shortCode` 하나에 요청이 몰리면 **같은 값을 매번 다시 조회**하게 됩니다.

이번 주에는 5주차에서 다룬 Cache-Aside 구조를 실제 **Redis 공유 캐시**에 적용합니다.

## 실습 목표

- Redis를 URL Shortener의 외부 공유 캐시로 연결
- `shortCode → originalUrl` 값을 Redis에 저장
- Cache Hit이면 Postgres SELECT를 생략
- Cache Miss이면 Postgres 조회 후 Redis에 저장
- Redis에 저장할 때 TTL 설정
- 캐시 적용 후에도 `recordClick()`의 UPDATE는 계속 발생함을 확인

> 이번 실습의 핵심은 **캐시가 줄여 주는 작업과 줄여 주지 못하는 작업을 구분하는 것**입니다. Redis는 `originalUrl`을 찾기 위한 반복 SELECT를 줄여 주지만, 클릭 수를 기록하는 UPDATE는 그대로 남습니다.

---

## 실습 TODO

**README에 제시된 완성 코드를 해당 위치에 그대로 옮겨 적으면서** Cache-Aside 흐름을 확인합니다.

```text
TODO 1. Cache Hit 처리 코드 옮기기          (lib/cache.js)
TODO 2. TTL을 포함한 Redis 저장 코드 옮기기  (lib/cache.js)
TODO 3. 본인의 Redirect 코드에서 캐시 함수 사용하기 (app/[shortCode]/route.js)
```

Redis 연결, 오류 처리 등의 골격은 제공됩니다.

---

# 1. 9주차 프로젝트에서 시작하기

9주차 실습까지 진행한 본인의 프로젝트를 준비합니다.

현재 Redirect 흐름은 다음과 같습니다.

```text
GET /{shortCode}
      ↓
findUrlByShortCode()   ← 매 요청 Postgres SELECT
      ↓
recordClick()          ← 매 요청 Postgres UPDATE
      ↓
307 Redirect
```

인기 URL에 10,000번의 요청이 오면 SELECT와 UPDATE가 각각 10,000번 실행될 수 있습니다.

이번 주에는 이 중 **SELECT 쪽에 캐시를 적용**합니다.

```text
GET /{shortCode}
      ↓
Redis 조회
   ↙        ↘
 Hit         Miss
  ↓           ↓
값 사용     Postgres SELECT
              ↓
           Redis에 저장 (TTL)
      ↓
recordClick()          ← 캐시와 관계없이 계속 실행
      ↓
307 Redirect
```

---

# 2. Redis 데이터베이스 만들기

이번 실습에서는 Vercel Marketplace에서 제공하는 **Upstash for Redis**를 사용합니다.

> Vercel이 직접 운영하는 Redis는 없으며, Redis는 Marketplace의 외부 제공자를 통해 연결합니다. 아래 순서대로 Vercel 대시보드에서 생성하면 **Upstash 사이트에 따로 가입하지 않고도** Redis를 생성하고 관리할 수 있습니다.

## 2-1. Upstash for Redis 선택

Vercel 프로젝트에서 다음 순서로 이동합니다.

```text
프로젝트 → Storage → Create Database
      ↓
Browse Storage 창
      ↓
Marketplace Database Providers → Upstash 펼치기
      ↓
Upstash for Redis 선택
```

**Browse Storage** 창의 **Marketplace Database Providers** 목록에서 **Upstash**(Serverless DB (Redis, Vector, Queue, Search)) 항목을 펼치면 하위 제품이 나타납니다. 그중 **Upstash for Redis**를 선택합니다.

> 목록에는 **Redis**(Official Redis for Vercel)라는 별도 항목도 있습니다. 이 항목은 TCP 방식으로 연결하는 다른 제공자이므로 이번 실습의 코드(`@upstash/redis`)와 맞지 않습니다. 반드시 **Upstash → Upstash for Redis**를 선택합니다. Upstash Vector, QStash/Workflow, Search도 선택하지 않습니다.

**Install Integration** 창이 열리고 다음 세 단계로 진행됩니다.

```text
Configuration and Plan  →  Confirmation  →  Database Provisioning
```

## 2-2. Configuration and Plan

| 항목 | 설정 | 설명 |
|---|---|---|
| **Primary Region** (필수) | Function·Neon과 같거나 가장 가까운 지역 | 데이터가 기록되는 기본 지역 |
| **Read Regions** (선택) | 비워 둠 | 읽기 전용 복제 지역. 지역을 추가할수록 비용이 늘어남 |
| **Eviction** | 끈 상태 그대로 | 최대 용량에 도달했을 때 오래된 Key를 자동 삭제할지 여부 |

> **Primary Region은 9주차에서 확인한 Function Region, Neon Database Region과 가깝게 선택합니다.** 9주차에서 Function과 Database 사이의 거리가 응답 시간에 영향을 준다는 것을 확인했습니다. Redis도 마찬가지입니다. Redis가 멀리 있으면 Cache Hit이어도 Redis까지 왕복하는 시간이 길어져 캐시 효과가 줄어듭니다.

이번 실습의 Key는 TTL 60초 뒤 자동으로 만료되고 데이터 양도 매우 작으므로 Eviction은 필요하지 않습니다.

**Installation Plans**에서는 반드시 **Free**를 선택합니다.

```text
Free
For trying out things. Limited to 1 database per account.
```

> `Pay As You Go`, `Fixed ...` 플랜은 사용량 또는 월 단위로 **요금이 청구**됩니다. 실습에는 Free 플랜으로 충분합니다. Free 플랜은 계정당 데이터베이스 1개로 제한되므로, 이미 만든 Free Redis가 있다면 새로 만들지 말고 기존 것을 연결합니다.

**Continue**를 누릅니다.

## 2-3. Confirmation과 Database Provisioning

- **Confirmation**: 선택한 Region과 **Free** 플랜이 맞는지 확인하고, 데이터베이스 이름을 입력한 뒤 생성합니다.
- **Database Provisioning**: 생성이 완료될 때까지 기다립니다.

## 2-4. 프로젝트에 연결

생성이 끝나면 Redis를 URL Shortener 프로젝트에 연결(Connect Project)합니다. 환경(Environments)은 기본으로 선택된 상태(Preview, Production) 그대로 둡니다.

> Development가 선택되어 있지 않아도 괜찮습니다. Development 환경변수는 `vercel env pull` 등으로 로컬에 내려받을 때 사용하는 값인데, 이번 실습에서는 3장에서 로컬 `.env.local`에 값을 직접 복사합니다.

연결이 완료되면 Vercel 프로젝트에 환경변수가 자동으로 추가됩니다. 일반적으로 다음과 같은 변수들이 생성되며, 이번 실습에서 사용하는 것은 **2개**뿐입니다.

| 환경변수 | 용도 | 이번 실습 |
|---|---|---|
| `KV_REST_API_URL` | REST API 주소 | **사용** |
| `KV_REST_API_TOKEN` | 읽기·쓰기가 가능한 토큰 | **사용** |
| `KV_REST_API_READ_ONLY_TOKEN` | 읽기만 가능한 토큰 | 사용 안 함 |
| `KV_URL` | Redis 프로토콜(TCP) 연결 문자열 | 사용 안 함 |
| `REDIS_URL` | `KV_URL`과 같은 연결 문자열 | 사용 안 함 |

`@upstash/redis`는 HTTP(REST)로 요청하므로 URL과 TOKEN만 있으면 됩니다. Cache Miss일 때 Redis에 값을 저장(`SET`)해야 하므로 읽기 전용 토큰이 아니라 `KV_REST_API_TOKEN`을 사용합니다.

`KV_REST_API_READ_ONLY_TOKEN`은 REST API에서 읽기만 허용하는 토큰이고, `KV_URL`과 `REDIS_URL`은 TCP 방식의 Redis 연결 문자열입니다. 이번 실습에서는 이 세 변수를 사용하지 않습니다.

> 화면의 메뉴 이름이나 환경변수 이름은 Vercel·Upstash UI 변경에 따라 다를 수 있습니다. Upstash 콘솔에서 직접 복사하는 경우 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 이름이 표시되며, 제공 코드는 두 이름을 모두 지원합니다.

---

# 3. 로컬 환경변수 설정

Vercel의 Storage 화면에서 생성한 Redis를 선택하면 **Quickstart**의 `.env.local` 탭에서 연결 정보를 확인할 수 있습니다. 값은 `*`로 가려져 있으며, **Show secret**이나 **Copy Snippet** 버튼으로 실제 값을 확인합니다.

5개 중 **`KV_REST_API_URL`과 `KV_REST_API_TOKEN` 2줄만** 복사합니다.

값을 복사하여 로컬 프로젝트의 `.env.local`에 **추가**합니다.

```env
DATABASE_URL=기존_값_유지
ADMIN_PASSWORD=기존_값_유지

KV_REST_API_URL=복사한_URL
KV_REST_API_TOKEN=복사한_TOKEN
```

> 기존 `DATABASE_URL`, `ADMIN_PASSWORD`를 지우지 않도록 주의합니다.
>
> `KV_REST_API_TOKEN`은 Redis의 데이터를 읽고 쓸 수 있는 Secret입니다. 7주차의 관리자 비밀번호와 마찬가지로 `NEXT_PUBLIC_` 접두사를 붙이지 않고, GitHub에 commit하지 않습니다.

---

# 4. 패키지 설치와 파일 복사

Redis 클라이언트 패키지를 설치합니다.

```bash
npm install @upstash/redis
```

`@upstash/redis`는 HTTP(REST)로 Redis에 요청을 보내는 클라이언트입니다. 요청마다 새로 실행될 수 있는 서버리스 Function에서도 연결을 오래 유지할 필요 없이 사용할 수 있습니다.

다음 파일을 기존 프로젝트에 복사합니다.

```text
lib/cache.js
```

프로젝트 구조는 대략 다음과 같습니다.

```text
프로젝트/
├─ app/
│  ├─ [shortCode]/
│  │  └─ route.js             ← 본인 파일을 직접 수정 (TODO 3)
│  ├─ admin/
│  └─ api/
│
├─ lib/
│  ├─ db.js                   ← findUrlByShortCode() 사용
│  ├─ stats.js                ← recordClick() 사용
│  ├─ auth.js
│  ├─ authorization.js
│  └─ cache.js                ← 제공 파일 (TODO 1, 2)
│
├─ proxy.js
└─ .env.local                 ← Redis 환경변수 추가
```

---

# 5. 제공된 `lib/cache.js` 읽어 보기

`lib/cache.js`에는 다음 내용이 준비되어 있습니다.

### Redis 클라이언트

```js
const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN,
});
```

### TTL과 캐시 Key

```js
const CACHE_TTL_SECONDS = 60;

function cacheKey(shortCode) {
  return `url:${shortCode}`;
}
```

Redis에는 다음과 같은 형태로 저장됩니다.

```text
Key            Value                       TTL
──────────────────────────────────────────────────
url:aB3xK9     https://www.google.com      60초
```

`url:` 접두사는 Redis 안에 다른 종류의 데이터가 함께 저장되더라도 Key가 서로 겹치지 않도록 구분하는 역할을 합니다.

### `getOriginalUrl(shortCode)`

이 함수가 이번 주의 Cache-Aside 로직입니다. 처리 순서는 다음과 같습니다.

```text
1. Redis에서 url:{shortCode} 조회
2. 값이 있으면 → Cache Hit → 바로 반환          ← TODO 1
3. 값이 없으면 → Cache Miss → Postgres 조회
4. URL이 존재하면 → Redis에 TTL과 함께 저장       ← TODO 2
5. 결과 반환
```

함수는 다음 형태의 객체를 반환합니다.

```js
{
  originalUrl: "https://www.google.com", // 없으면 null
  cacheStatus: "HIT",                    // 또는 "MISS"
}
```

### Redis 오류 처리

```js
try {
  cachedUrl = await redis.get(key);
} catch (error) {
  console.error("Failed to read cache", {
    shortCode,
    message: error.message,
  });
}
```

Redis 조회가 실패하면 오류 원인(`error.message`)을 로그에 남기고 Cache Miss처럼 Postgres를 조회합니다.

> 이때 `cacheStatus`는 `"MISS"`로 반환됩니다. 즉, 응답의 `MISS`만으로는 **실제 Cache Miss**(Redis에 값이 없음)와 **Redis 장애**(Redis 조회 자체가 실패)를 구분할 수 없습니다. 두 경우를 구분하려면 `Failed to read cache` 오류 로그를 함께 확인해야 합니다.

6주차에서 "통계 기록이 실패해도 Redirect는 계속한다"는 정책을 사용했던 것과 같은 이유입니다. **캐시는 성능을 위한 보조 수단이며, 원본 데이터는 Postgres에 있습니다.** 캐시 장애 때문에 핵심 기능인 Redirect가 실패해서는 안 됩니다.

---

# 6. TODO 1: Cache Hit 처리 코드 옮기기

`lib/cache.js`에서 다음 TODO를 찾습니다.

```js
// TODO 1. README의 Cache Hit 처리 코드를 아래에 옮겨 적으세요.
```

그 아래에 다음 코드를 그대로 추가합니다.

```js
if (cachedUrl) {
  return { originalUrl: cachedUrl, cacheStatus: "HIT" };
}
```

Redis에 값이 있으면 **Postgres를 조회하지 않고 바로 반환**합니다. 이 `return`이 실행되면 아래쪽의 `findUrlByShortCode()`는 실행되지 않습니다.

```text
redis.get("url:aB3xK9")
      ↓
"https://www.google.com"
      ↓
return { HIT }
      ✕  findUrlByShortCode()   ← 실행되지 않음
```

---

# 7. TODO 2: TTL을 포함한 Redis 저장 코드 옮기기

같은 파일에서 다음 TODO를 찾습니다.

```js
// TODO 2. README의 Redis 저장 코드를 아래 한 줄에 옮겨 적으세요.
```

다음 한 줄로 채웁니다.

```js
await redis.set(key, originalUrl, { ex: CACHE_TTL_SECONDS });
```

| 부분 | 의미 |
|---|---|
| `key` | `url:{shortCode}` |
| `originalUrl` | Postgres에서 조회한 원본 URL |
| `{ ex: CACHE_TTL_SECONDS }` | 60초 뒤 자동으로 삭제(만료) |

### 왜 TTL을 설정하는가?

TTL이 없으면 한 번 저장된 값이 Redis에 계속 남습니다.

```text
TTL 없음
→ 사용하지 않는 URL도 Redis 메모리에 계속 남음
→ 원본 데이터가 바뀌어도 캐시에는 이전 값이 남아 있을 수 있음

TTL 있음
→ 일정 시간이 지나면 자동 삭제
→ 다음 요청에서 Cache Miss → Postgres에서 최신 값을 다시 가져옴
```

이번 실습에서는 만료되는 모습을 직접 관찰하기 위해 **60초**로 짧게 설정합니다.

### 존재하지 않는 shortCode는 저장하지 않습니다

```js
if (originalUrl) {
  // Redis에 저장
}
```

조회 결과가 `null`이면 Redis에 저장하지 않습니다. 따라서 존재하지 않는 `shortCode` 요청은 매번 Postgres를 조회하고 `404`를 반환합니다.

---

# 8. TODO 3: 본인의 Redirect 코드에서 캐시 함수 사용하기

본인이 작성해 왔던 해당 파일을 엽니다.

```text
app/[shortCode]/route.js
```

## 8-1. import 변경

```js
import { findUrlByShortCode } from "../../lib/db";
```

위 import를 다음으로 바꿉니다.

```js
import { getOriginalUrl } from "../../lib/cache";
```

`recordClick` import는 그대로 둡니다.

## 8-2. 조회 코드 변경

기존 조회 코드가 다음과 같다면

```js
const originalUrl = await findUrlByShortCode(shortCode);
```

다음과 같이 바꿉니다.

```js
const { originalUrl, cacheStatus } = await getOriginalUrl(shortCode);
```

> 9주차의 `performance.now()` 측정 코드는 그대로 두고, 측정 구간 안의 조회 함수만 바꿉니다.

## 8-3. 응답 헤더와 로그에 `cacheStatus` 추가

Redirect 응답의 headers에 다음 한 줄을 추가합니다.

```js
"X-Cache": cacheStatus,
```

9주차에서 만든 측정 로그에도 `cacheStatus`를 추가합니다.

```js
console.log({
  shortCode,
  cacheStatus,
  lookupMs: (t1 - t0).toFixed(1),
  updateMs: (t2 - t1).toFixed(1),
  totalMs: (t2 - t0).toFixed(1),
});
```

## 8-4. 완성 후 형태 (참고)

본인 코드와 세부 내용은 달라도 됩니다. **흐름**만 비교합니다.

```js
import { getOriginalUrl } from "../../lib/cache";
import { recordClick } from "../../lib/stats";

export async function GET(request, { params }) {
  const { shortCode } = await params;

  const t0 = performance.now();
  const { originalUrl, cacheStatus } = await getOriginalUrl(shortCode);
  const t1 = performance.now();

  if (!originalUrl) {
    console.warn("Short URL not found", { shortCode });
    return new Response("Not Found", { status: 404 });
  }

  try {
    await recordClick(shortCode);
  } catch (error) {
    console.error("Failed to record click", { shortCode });
  }
  const t2 = performance.now();

  console.log({
    shortCode,
    cacheStatus,
    lookupMs: (t1 - t0).toFixed(1),
    updateMs: (t2 - t1).toFixed(1),
    totalMs: (t2 - t0).toFixed(1),
  });

  return new Response(null, {
    status: 307,
    headers: {
      Location: originalUrl,
      "Cache-Control": "no-store",
      "X-Cache": cacheStatus,
    },
  });
}
```

### `Cache-Control: no-store`는 그대로 둡니다

이번 주에 적용하는 캐시는 **애플리케이션 캐시**입니다.

| 캐시 위치 | 저장하는 것 | Cache Hit 시 생략되는 작업 |
|---|---|---|
| 브라우저·CDN 캐시 | HTTP 응답 전체 | Route Handler 실행 자체 |
| 애플리케이션 공유 캐시 (Redis) | `shortCode → originalUrl` | Postgres SELECT |

`Cache-Control: no-store`를 유지하면 브라우저와 CDN이 Redirect 응답을 저장하여 재사용하지 않도록 지시할 수 있습니다. 따라서 정상적인 요청 흐름에서는 **매번 Route Handler가 실행되어 `recordClick()`을 시도**합니다.

다만 데이터베이스 UPDATE가 실패하면 오류 로그만 남기고 Redirect를 계속하므로(6주차 정책) 클릭 수가 누락될 수 있습니다. 모든 클릭이 반드시 기록된다는 의미는 아닙니다.

```text
Redis 캐시
→ originalUrl SELECT는 생략할 수 있음
→ recordClick()의 UPDATE는 생략하지 않음

UPDATE의 성공
→ 캐시와 별개로 보장되지 않음
```

### `X-Cache` 헤더의 의미

`X-Cache`는 이번 실습에서 **직접 추가한 응답 헤더**입니다.

```text
X-Cache: HIT
→ 직접 구현한 Redis 캐시에서 originalUrl을 찾았다는 뜻
→ Vercel CDN(Edge Cache)의 캐시 HIT를 의미하지 않음
```

Vercel이 자체적으로 붙이는 `X-Vercel-Cache` 같은 헤더와 혼동하지 않도록 주의합니다.

---

# 9. 로컬에서 Cache Miss / Hit 확인하기

개발 서버를 실행합니다.

```bash
npm run dev
```

Chrome 개발자 도구의 **Network** 탭을 열고 `Preserve log`를 체크합니다.

DB에 존재하는 short URL에 접속합니다.

```text
http://localhost:3000/{실제 shortCode}
```

첫 번째 요청(`307`)을 선택하고 Response Headers를 확인합니다.

### 첫 번째 요청

```text
X-Cache: MISS
```

Redis에 값이 없으므로 Postgres에서 조회한 뒤 Redis에 저장합니다.

> 이미 Redis에 저장된 URL이라면 첫 번째 요청에서도 `HIT`가 나타날 수 있습니다. 새로운 short URL을 만들거나, 마지막 캐시 저장 후 60초 이상 지난 다음 테스트합니다.

### 60초 이내 두 번째 요청

같은 short URL에 다시 접속합니다.

```text
X-Cache: HIT
```

Redis에 저장된 값을 사용했으므로 Postgres SELECT가 생략되었습니다.

### 터미널 로그 비교

`npm run dev`를 실행한 터미널에서 측정 로그를 비교합니다.

```text
{ shortCode: 'aB3xK9', cacheStatus: 'MISS', lookupMs: '..', updateMs: '..', totalMs: '..' }
{ shortCode: 'aB3xK9', cacheStatus: 'HIT',  lookupMs: '..', updateMs: '..', totalMs: '..' }
```

확인할 점:

```text
lookupMs
→ MISS일 때: Redis 조회 + Postgres SELECT + Redis 저장
→ HIT일 때: Redis 조회만

updateMs
→ MISS와 HIT 모두 비슷하게 발생 (recordClick의 UPDATE)
```

> 로컬 환경에서는 내 PC와 Redis·Neon 사이의 네트워크 거리가 크게 작용하므로 숫자 자체보다 **HIT와 MISS에서 lookupMs와 updateMs가 각각 어떻게 달라지는지**에 주목합니다.

---

# 10. 전체 흐름 정리

### 이번 주에 추가된 읽기 흐름 (Cache-Aside)

```text
GET /{shortCode}
      ↓
Route Handler
      ↓
Redis GET url:{shortCode}
   ↙                  ↘
 Hit                   Miss
  ↓                     ↓
originalUrl          Postgres SELECT
                        ↓
                     Redis SET (TTL 60초)
                        ↓
                     originalUrl
```

### 그대로 남아 있는 쓰기 흐름

```text
recordClick(shortCode)
      ↓
UPDATE urls
SET click_count = click_count + 1,
    last_clicked_at = NOW()
WHERE short_code = ...
```

| 구분 | 반복 조회 (Read Hot Key) | 동일 Row 쓰기 hotspot |
|---|---|---|
| 발생 작업 | SELECT | UPDATE |
| 집중 대상 | 같은 Key의 같은 값 | 같은 DB Row |
| Redis 캐시 효과 | 큼 | 직접적인 효과 없음 |
| 이번 실습 | Cache-Aside로 해결 | 계속 발생함을 확인 |

---

# 확인 체크리스트

- [ ] 9주차 프로젝트에서 시작했는가?
- [ ] Vercel Marketplace에서 Upstash for Redis를 생성하고 프로젝트에 연결했는가?
- [ ] `.env.local`에 Redis 환경변수를 추가하고 기존 값은 유지했는가?
- [ ] Redis TOKEN이 GitHub에 commit되지 않았는가?
- [ ] `npm install @upstash/redis`를 실행했는가?
- [ ] README의 TODO 1 코드를 `lib/cache.js`의 해당 위치에 옮겼는가?
- [ ] README의 TODO 2 코드를 `lib/cache.js`의 해당 위치에 옮겼는가?
- [ ] 본인의 `app/[shortCode]/route.js`에서 `getOriginalUrl()`을 사용하도록 바꿨는가?
- [ ] 첫 요청에서 `X-Cache: MISS`, 이어지는 요청에서 `X-Cache: HIT`를 확인했는가?
- [ ] HIT와 MISS에서 `lookupMs`와 `updateMs`가 어떻게 다른지 비교했는가?
