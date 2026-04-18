# Tennis Club Match Recorder

테니스 클럽 간 친선 교류전 매치 편성/결과/통계를 관리하는 정적 웹앱입니다.

## 주요 기능

- 클럽 정보 입력
  - 클럽 이름 수정
  - 클럽별 선수 등록/수정/삭제
- 플레이어 등록
  - 필수: 이름, 성별
  - 옵션: 구력, 나이
- 코트 타임테이블
  - y축 시간, x축 코트 번호
  - `+ 코트 추가` 버튼으로 코트 확장
  - 슬롯 클릭으로 선수 배정 및 결과 입력/수정/삭제
  - 성별 기반 자동 분류/색상 표시
    - 남복: 파랑
    - 여복: 빨강
    - 혼복: 주황
    - 잡복: 무지개
- 통계 자동 계산
  - 클럽별 승/패/무, 게임 득실, 득실차
  - 선수별 경기수/승/패/승률
  - 최다승 플레이어
- 저장 기능
  - 로컬 자동 저장(localStorage)
  - JSON 내보내기/불러오기
- Supabase 실시간 동기화(같은 Match ID 공유 시 다중 사용자 동시 반영)

## Supabase 실시간 동기화 설정

앱 상단 `동기화 설정` 영역에 `Project URL / Anon Key / Match ID`를 입력하면 같은 경기 기준으로 데이터가 동기화됩니다.

정적 웹앱 특성상 브라우저에 키가 노출되므로 **반드시 Anon Key만 사용**하세요(Service Role Key 사용 금지).

### 1) SQL Editor에서 테이블/권한 생성

```sql
create table if not exists public.shared_match_states (
  room_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

alter table public.shared_match_states enable row level security;

grant usage on schema public to anon;
grant select, insert, update on table public.shared_match_states to anon;

drop policy if exists "shared_match_states_select_anon" on public.shared_match_states;
create policy "shared_match_states_select_anon"
on public.shared_match_states
for select
to anon
using (true);

drop policy if exists "shared_match_states_insert_anon" on public.shared_match_states;
create policy "shared_match_states_insert_anon"
on public.shared_match_states
for insert
to anon
with check (true);

drop policy if exists "shared_match_states_update_anon" on public.shared_match_states;
create policy "shared_match_states_update_anon"
on public.shared_match_states
for update
to anon
using (true)
with check (true);
```

### 2) Realtime 활성화

Supabase Dashboard → `Database` → `Replication`에서 `shared_match_states` 테이블을 Realtime 대상에 추가하세요.

또는 SQL로 추가할 수 있습니다.

```sql
alter publication supabase_realtime add table public.shared_match_states;
```

### 3) 앱에서 연결

1. 앱 상단 동기화 패널에 `Project URL`, `Anon Key`, `Match ID` 입력
2. 선택: `저장 비밀번호` 입력
3. `동기화 연결` 클릭
4. 같은 `Match ID`를 입력한 사용자끼리 같은 데이터를 공유

`저장 비밀번호`를 설정하면 변경사항은 자동으로 클라우드에 쓰지 않고, `저장` 버튼 클릭 시 비밀번호를 다시 입력해야만 동기화됩니다.

`저장 비밀번호`를 비워두면 클라우드는 읽기 전용으로 동작하며, 변경사항은 로컬에만 저장됩니다.

`초기화` 버튼은 로컬에만 적용되며 클라우드에는 반영되지 않습니다.

### 4) 권장 보안(더 안전한 방법)

현재의 `저장 비밀번호`는 클라이언트(브라우저) 레벨 보호라 강한 보안 모델은 아닙니다.

실서비스 수준으로 보호하려면 Supabase Auth + RLS를 권장합니다.

- 읽기: `anon` 허용
- 쓰기(insert/update): `authenticated` + 관리자 계정만 허용

예시 정책 방향:

- `select`는 `anon` 허용
- `insert/update`는 `auth.uid()`가 허용 목록(관리자 테이블)에 있을 때만 허용

이렇게 하면 비밀번호를 모르는 일반 접속자는 UI를 조작해도 DB 쓰기가 차단됩니다.

## 로컬 실행

정적 파일이라 별도 빌드가 필요 없습니다.

1. 이 저장소를 클론합니다.
2. `index.html`을 브라우저에서 엽니다.

또는 간단한 로컬 서버를 사용해도 됩니다.

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속.

## GitHub Pages 배포

`.github/workflows/deploy.yml`이 포함되어 있어 `main` 브랜치 push 시 자동 배포됩니다.

1. GitHub 저장소 생성 후 코드 push
2. 저장소 설정(Settings) → Pages
3. Source를 `GitHub Actions`로 선택
4. `main` 브랜치에 push
5. Actions 완료 후 Pages URL에서 확인

## 파일 구성

- `index.html`: 화면 구조
- `styles.css`: 스타일/반응형/색상 규칙
- `app.js`: 상태 관리, 입력 처리, 통계 계산, 저장 로직
- `.github/workflows/deploy.yml`: GitHub Pages 자동 배포
