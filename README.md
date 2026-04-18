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
