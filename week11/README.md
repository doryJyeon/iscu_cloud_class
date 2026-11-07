# 11주차 실습: 글로벌 요청 흐름도 작성

이번 실습에서는 코드를 작성하지 않습니다.

전 세계 사용자가 URL Shortener를 사용할 때 요청과 데이터가 어디를 거쳐 이동하는지 흐름도로 정리합니다.

## 실습 목표

### 글로벌 요청 흐름 그려보기

- 서울, 뉴욕, 파리 사용자의 요청 흐름 비교
- User → Edge → Function → Primary/Replica 흐름 표시
- URL 생성은 Primary에서 Write
- URL 조회는 가까운 Replica에서 Read하는 구조 확인

### 장애 상황까지 확장하기

- Primary 장애 상황 가정
- Replica를 새로운 Primary로 승격하는 Failover 흐름 확인
- Promotion 이후 새로운 Replica가 필요한 이유 생각해보기
- Replication Lag으로 인해 최신 데이터가 아직 Replica에 없을 수 있음을 확인

> 이번 실습의 핵심은 **요청이 처리되는 위치와 데이터가 저장된 위치를 구분하는 것**입니다. 사용자의 요청이 가까운 Edge로 들어오더라도, Function과 Database가 어디에 있는지에 따라 응답 시간과 데이터의 최신성이 달라집니다.

---

## 작성 방법

아래 흐름도의 `[ ]` 빈칸과 `답:` 칸을 채웁니다.

GitHub 화면에서는 직접 입력할 수 없으므로 템플릿을 복사하여 노트나 메모장에 작성합니다. 종이에 직접 그려도 됩니다.

### 이번 실습의 공통 가정

- Redirect 응답에는 10주차와 같이 `Cache-Control: no-store`가 설정되어 있습니다. 따라서 Edge에서 Cache HIT로 바로 응답하지 않고, 요청이 Function까지 전달됩니다.
- 이번 실습에서는 **URL 생성**과 **URL Mapping 조회**만 다룹니다. Redirect할 때 실행되는 클릭 기록(`recordClick()`)은 흐름에서 생략합니다.
- 실습에 나오는 Region은 설명을 위해 가정한 구조입니다. 본인 프로젝트의 실제 Function Region, Database Region과는 다를 수 있습니다.

---

## 1. 현재 구조: Database가 하나일 때

다음과 같은 서비스를 가정합니다.

- 사용자는 서울, 뉴욕, 파리에 있음
- Vercel Function은 Singapore에서 실행됨
- Primary Database도 Singapore에 있음
- 모든 URL 생성과 조회는 Primary Database를 사용함

다음 요소를 사용하여 요청 흐름을 그려보세요.

```text
User
Edge
Function
Primary DB
```

각 칸에는 **요소 이름과 그 요소가 있는 위치(지역)를 함께** 적습니다.

### 서울 사용자가 Short URL에 접속하는 경우

```text
Seoul User
    ↓
[                    ]
    ↓
[                    ]
    ↓
[                    ]
```

### 뉴욕 사용자가 같은 Short URL에 접속하는 경우

```text
New York User
    ↓
[                    ]
    ↓
[                    ]
    ↓
[                    ]
```

### 파리 사용자가 같은 Short URL에 접속하는 경우

```text
Paris User
    ↓
[                    ]
    ↓
[                    ]
    ↓
[                    ]
```

### 질문

세 흐름에서 사용자마다 위치가 달라지는 요소와, 모든 사용자에게 같은 위치인 요소는 각각 무엇인가요?

```text
답:
____________________________________
```

뉴욕과 파리 사용자의 응답이 서울 사용자보다 느릴 수 있는 이유는 무엇일까요? 어느 구간이 길어지는지 적어 보세요.

```text
답:
____________________________________
```

---

## 2. Replica를 추가한다면?

Read 요청을 사용자와 가까운 곳에서 처리하기 위해 다음과 같이 Replica를 추가했다고 가정합니다.

```text
                  Seoul Replica
                 ↗
Singapore Primary → New York Replica
                 ↘
                  Paris Replica
```

Replica를 추가하면서 **Function도 서울, 뉴욕, 파리와 가까운 Region에서 각각 실행된다**고 가정합니다.

1장과 마찬가지로 각 칸에는 요소 이름과 위치를 함께 적습니다.

### URL 생성: `POST /api/shorten`

URL 생성은 여전히 Primary에서 처리합니다.

서울 사용자가 Short URL 생성을 요청하는 흐름을 완성하세요.

```text
Seoul User
      ↓
[                    ]
      ↓
[                    ]
      ↓
Singapore Primary (WRITE)
```

### URL 조회: `GET /Ab12Cd`

Redirect를 위한 URL Mapping 조회는 가까운 Replica에서 처리할 수 있습니다.

뉴욕 사용자가 Short URL에 접속하는 흐름을 완성하세요.

```text
New York User
      ↓
[                    ]
      ↓
[                    ]
      ↓
[                    ]
      ↓
originalUrl 확인
      ↓
307 Redirect
```

파리 사용자의 조회 흐름도 같은 방식으로 완성하세요.

```text
Paris User
      ↓
[                    ]
      ↓
[                    ]
      ↓
[                    ]
      ↓
originalUrl 확인
      ↓
307 Redirect
```

### 질문

1장의 흐름과 비교했을 때, 뉴욕 사용자의 조회 흐름에서 짧아진 구간은 어디인가요?

```text
답:
____________________________________
```

만약 Function이 여전히 Singapore에서만 실행된다면, New York Replica를 추가한 효과는 어떻게 될까요? (힌트: Data Locality)

```text
답:
____________________________________
```

---

## 3. 새 URL을 만든 직후라면?

서울 사용자가 새로운 Short URL을 생성했습니다.

```text
Ab12Cd → https://example.com
```

데이터는 Singapore Primary에는 저장되었지만 아직 New York Replica에는 복제되지 않았다고 가정합니다.

```text
Singapore Primary

Ab12Cd 있음


       Replication 중


New York Replica

Ab12Cd 없음
```

이 순간 뉴욕 사용자가 다음 주소를 요청했습니다.

```text
GET /Ab12Cd
```

### 질문

New York Replica만 조회하면 어떤 결과가 나올 수 있을까요?

```text
답:
____________________________________
```

Primary에서 발생한 변경 내용이 Replica에 반영되기까지 생기는 이 시간 차이를 무엇이라고 할까요?

```text
답:
____________________________________
```

이 문제를 줄이기 위해 사용할 수 있는 방법을 한 가지 작성하세요.

```text
답:
____________________________________
```

위에서 작성한 방법에는 어떤 단점(Trade-off)이 있을까요?

```text
답:
____________________________________
```

---

## 4. Primary에 장애가 발생한다면?

다음과 같은 구조가 있다고 가정합니다.

```text
             Primary
             /     \
            /       \
      Replica A   Replica B
```

Primary가 Write를 담당하고, Replica A와 Replica B는 Primary의 데이터를 복제합니다.

이때 Primary에 장애가 발생했습니다.

Replica A를 새로운 Primary로 승격시키는 Failover 과정은 다음과 같습니다.

```text
Primary 장애
     ↓
Replica 선택
     ↓
Replica A
     ↓
Promotion
     ↓
New Primary
     ↓
Write 요청 경로를 New Primary로 전환
     ↓
서비스 계속
```

Promotion 이후에는 Replica B가 New Primary의 데이터를 복제합니다.

```text
      New Primary (기존 Replica A)
             |
         Replica B
```

### 질문

Promotion 전과 후에 Replica는 각각 몇 개인가요? 새로운 Replica를 만들지 않고 그대로 두면 어떤 위험이 있을까요?

```text
답:
____________________________________
____________________________________
```

### 글로벌 구조에 적용하기

이제 2장의 구조에서 Singapore Primary에 장애가 발생했다고 가정합니다.

```text
Singapore Primary   ← 장애 발생

Seoul Replica · New York Replica · Paris Replica   ← 정상
```

Failover가 끝나기 전까지 URL Shortener에서 계속 동작하는 기능과 멈추는 기능은 각각 무엇일까요? 2장에서 작성한 흐름도를 보고 답하세요.

```text
답:
계속 동작: __________________________
멈춤:      __________________________
```

이번에는 서울 사용자가 Singapore Primary에 장애가 발생하기 직전에 새 Short URL `Zx98Yw`를 만들고 생성 완료 응답을 받았다고 가정합니다.

장애가 발생한 순간 `Zx98Yw`는 **어느 Replica에도 아직 복제되지 않은 상태**였습니다.

```text
Singapore Primary   Zx98Yw 있음   ← 장애 발생

Seoul Replica       Zx98Yw 없음
New York Replica    Zx98Yw 없음
Paris Replica       Zx98Yw 없음
```

이후 New York Replica를 New Primary로 승격했습니다.

Failover 이후 뉴욕 사용자가 `GET /Zx98Yw`를 요청하면 어떤 결과가 나올까요?

3장에서는 Replica에 없을 때 Primary를 다시 조회(fallback)하면 찾을 수 있었습니다. 이번에도 fallback으로 찾을 수 있을까요? 그 이유는 무엇일까요?

```text
답:
____________________________________
____________________________________
```

이런 문제가 생기지 않으려면 URL을 생성하는 단계에서 무엇이 달랐어야 할까요? 그렇게 바꾸면 어떤 단점이 생길까요?

> 힌트: Primary에만 저장된 시점과 Replica에도 복제된 시점을 비교해 보세요.

```text
답:
____________________________________
____________________________________
```

---

## 5. 실습 정리

다음 문장을 완성하세요.

> 글로벌 서비스를 위해 데이터를 여러 지역에 복제하면  
> 사용자와 가까운 곳에서 데이터를 __________할 수 있지만,  
> 복제 과정에서 __________이 발생할 수 있음.

> Primary에 장애가 발생하면 Replica를 새로운 Primary로 __________하여  
> 서비스를 계속할 수 있음.  
> 다만 Primary 장애 직전에 저장되어 아직 복제되지 않은 데이터는 __________될 수 있음.

---

## 확인 체크리스트

- [ ] 서울, 뉴욕, 파리 사용자의 요청 흐름을 비교했는가?
- [ ] User → Edge → Function → Primary/Replica 흐름을 표시했는가?
- [ ] URL 생성은 Primary에서 Write하고, URL 조회는 가까운 Replica에서 Read하는 구조를 확인했는가?
- [ ] Replication Lag으로 인해 최신 데이터가 아직 Replica에 없을 수 있음을 확인했는가?
- [ ] Primary 장애 상황을 가정하고, Replica를 새로운 Primary로 승격하는 Failover 흐름을 확인했는가?
- [ ] Promotion 이후 새로운 Replica가 필요한 이유를 생각해 보았는가?
