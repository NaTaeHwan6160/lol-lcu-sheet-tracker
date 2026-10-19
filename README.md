# LoL Match Tracker

**League of Legends 전적 자동 기록 · Google Sheets 공유 · Windows 트레이 앱**

LoL Match Tracker는 로컬 League of Legends 클라이언트의 **LCU WebSocket 이벤트**를 통해 게임 종료를 감지하고, 전적을 **Google Sheets**에 자동 기록하는 개인용 도구입니다. 별도 데이터베이스나 외부 애플리케이션 서버를 설치·운영할 필요가 없습니다.

> **개발 상태:** v2.2.0 — Electron 실행 및 중복 실행 방지는 개발 환경에서 확인했으나, 실제 게임 종료 이벤트부터 Google Sheets 기록까지의 통합 동작은 추가 검증이 필요합니다.

## 주요 기능

- **전적 자동 수집:** 게임 종료 이벤트 감지, LCU 연결 해제 후 재연결 시도
- **플레이어 자동 발견:** 게임 참가자 중 미등록 Riot ID를 후보로 표시하고, **사용자 승인 후** 기록 대상에 등록
- **시트 자동 생성:** 새 플레이어 등록 시 관리 시트와 개인별 로우데이터 시트 생성
- **경기별 데이터 저장:** `경기기록` 및 개인 시트에 경기·플레이어당 한 행 기록
- **중복 기록 검사:** `gameId|riotId`를 기준으로 기존 기록 확인
- **기록 옵션:** 조기 항복 제외, 탈주 게임 포함 여부 설정
- **로컬 웹 UI:** 플레이어·기록 옵션·Google Sheets 연결정보 관리
- **Windows 트레이:** 브라우저를 닫아도 실행 유지, 트레이에서 설정 열기·종료
- **중복 실행 방지:** 두 번째 Electron 실행 시 기존 설정 화면 열기

## 기술 스택

Node.js · JavaScript · Electron · LCU WebSocket (`league-connect`) · Google Sheets API · HTML/CSS

## 사용 방법

### A. 개발 환경에서 실행

**요구 사항:** Windows, Node.js 18 이상, League of Legends 클라이언트, Google 계정 및 Google Cloud 서비스 계정

```powershell
npm install
npm run desktop
```

실행 후 기본 브라우저에서 `http://127.0.0.1:3784`를 엽니다. 웹 UI에서 플레이어와 Google Sheets 연결을 설정합니다.

트레이 없이 콘솔 서버만 실행하려면 `npm start`를 사용합니다.

### B. Google Sheets 최초 연결

1. 저장소의 `LoL_Tracker_Optimized_Template.xlsx`를 Google Drive에 업로드하고 **Google Sheets 형식으로 변환**합니다.
2. Google Cloud에서 **Google Sheets API**를 활성화하고 **서비스 계정**을 생성합니다.
3. 서비스 계정의 JSON 키를 새로 발급합니다.
4. Google Sheets 문서를 서비스 계정의 `client_email` 주소에 **편집자**로 공유합니다.
5. 프로그램의 로컬 웹 UI에서 **서비스 계정 JSON 파일을 선택**해 인증정보를 입력합니다. 스프레드시트 ID는 문서 URL에서 확인하여 별도로 입력합니다.
6. 설정 저장 → **연결 테스트** → **시트 초기화** 순서로 진행합니다.
7. 기록할 플레이어를 등록하거나, 경기 종료 후 발견된 미등록 플레이어를 승인합니다.

> JSON 파일 선택은 인증정보를 **입력 폼에 채우는 기능**이며, Google 계정으로 원클릭 로그인하는 OAuth 기능은 아닙니다. Google Sheets 공유 권한 설정은 여전히 필요합니다.

`.env.example` 및 `config.example.json`은 예시 설정입니다. 기존 `.env` 방식도 사용할 수 있으며, 웹 UI에 저장한 Google 연결정보가 우선합니다.

### C. Windows 설치 파일 빌드

```powershell
npm run build:win
```

`dist/`에 NSIS 설치 프로그램 및 테스트용 `win-unpacked/` 폴더가 생성됩니다. 다른 PC에 배포할 때는 **설치 프로그램**을 전달하세요. 실제 생성되는 파일명은 빌드 설정에 따라 달라질 수 있습니다.

> 설치 파일은 Windows에서 별도 테스트가 필요합니다. 코드 서명되지 않은 실행 파일은 SmartScreen 경고가 나타날 수 있습니다.

## 데이터 구조

| 시트 | 용도 |
|---|---|
| `플레이어` | Riot ID, 표시 이름, 개인 시트 이름, 등록일 |
| `경기기록` | 모든 등록 플레이어의 경기별 공통 기록 |
| 플레이어 이름별 시트 | 해당 플레이어의 상세 기록 및 `rawJson` |
| `통계 대시보드` | 등록 인원, 전체 승률, 플레이어별 기본 통계 |

기존 `도움반 증바람.xlsx`의 과거 전적 및 28개 시트는 자동 이전되지 않습니다. **새 템플릿은 기존 수식과 호환되지 않으므로 원본을 덮어쓰지 마세요.**

## 프로젝트 구조

```text
lol-lcu-sheet-tracker/
├── electron-main.js          # Electron 시작, 트레이, 중복 실행 방지
├── index.js                  # 콘솔 실행 진입점
├── src/
│   ├── app.js                # LCU 이벤트, 로컬 UI API, 플레이어 자동 발견
│   ├── sheets.js             # Google Sheets API, 시트 생성·기록
│   └── settings.js           # Google 인증정보 설정 저장
├── public/index.html         # 로컬 웹 UI
├── assets/                   # 앱 아이콘, 트레이 아이콘, 파비콘
├── config.example.json       # 플레이어 설정 예시
├── .env.example              # 환경변수 예시
├── LoL_Tracker_Optimized_Template.xlsx
├── package.json
└── README.md
```

## 설계 의도

친구들과 게임 통계를 공유하기 위해 **DB 서버 대신 Google Sheets를 저장·공유 매체로 선택**했습니다. 로컬 PC에서 이벤트를 수집하고 Google Sheets에 직접 기록하므로 별도 서버 운영 부담이 없습니다. 플레이어 수가 늘어나도 UI를 통해 등록하고 시트를 자동 생성하도록 구성했습니다.

## 알려진 제약 및 보안 주의사항

- LoL 클라이언트가 실행 중이어야 새 게임 종료 이벤트를 수신합니다. 놓친 과거 전적을 자동으로 복구하는 기능은 없습니다.
- **LCU는 Riot Games가 공식 지원하는 공개 API가 아닙니다.** 클라이언트 업데이트에 따라 동작이 달라질 수 있습니다.
- `경기기록`과 개인 시트에 각각 쓰기 때문에 **완전한 트랜잭션이 아닙니다.** 재시도 시 중복을 줄이도록 설계했지만, 여러 PC가 같은 문서에 동시에 기록하는 상황에서는 경쟁 상태가 발생할 수 있습니다.
- 개인 시트의 `rawJson`에는 다른 참가자의 데이터가 포함될 수 있습니다. 공유 권한을 신중히 관리하세요.
- 기본 대시보드 수식의 계산 범위는 `경기기록` 2~2000행입니다. 장기 운영 시 확장해야 합니다.
- 플레이어 표시명을 변경해도 기존 개인 시트명은 유지됩니다. 기록 대상에서 제외해도 과거 데이터는 삭제되지 않습니다.
- Google 서비스 계정 키는 현재 Windows 사용자 폴더의 `%APPDATA%\LoL-LCU-Sheet-Tracker\google-settings.json`에 **암호화되지 않은 상태**로 저장됩니다. 신뢰할 수 있는 PC에서만 사용하고, 이 파일과 키를 Git에 추가하지 마세요.
- 이전에 외부에 노출된 서비스 계정 키는 **폐기 후 재발급**해야 합니다.
- 실제 게임 종료부터 Google Sheets 기록까지의 **통합 테스트는 추가로 필요**합니다.

## Riot Games 고지

This project is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

배포 전에 Riot Developer Policies 및 LCU 관련 정책을 확인하세요.
