# 서울 건물 다 따먹기

서울 실제 지도 위에서 공을 굴려 작은 물건부터 건물까지 붙여 나가는 괴혼 스타일 게임.

## 실행

빌드 과정 없음. 정적 서버만 있으면 됩니다. (`index.html` 더블클릭은 브라우저 보안 정책 때문에 동작하지 않음)

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## 조작

| 키 | 동작 |
|---|---|
| W / ↑ | 앞으로 |
| S / ↓ | 뒤로 |
| A D / ← → | 방향 전환 |
| Esc / P | 일시정지 |
| 휴대폰 | 화면을 누른 채 드래그 (조이스틱) |

## 규칙

- 공 지름의 80%보다 작은 물건은 닿으면 붙는다. 붙일수록 공이 커진다.
- 너무 큰 물건은 튕겨 낸다. 커지면 "이제 ○○도 먹을 수 있다!" 알림이 뜬다.
- 제한 시간 안에 스테이지의 물건을 **전부** 먹으면 클리어. 다음 스테이지가 열린다.
- 오른쪽 아래 미니맵: 분홍 점 = 지금 먹을 수 있는 것, 회색 점 = 아직 큰 것.
- 15개 이하로 남으면 화면에 가장 가까운 물건 방향 화살표가 나온다.

## 구조

```
index.html            화면 구성 (타이틀, 스테이지 선택, 브리핑, 게임, 결과)
src/main.js           화면 전환, 저장(localStorage), 타이틀 배경 애니메이션
src/stages.js         스테이지 목록과 설정 (시간, 시작 크기, 지도 파일)
src/game/Game.js      게임 루프: 공 굴리기, 흡수, 카메라, HUD, 승패
src/game/props.js     먹잇감 30여 종의 모델과 크기
src/game/world.js     지도 JSON → 건물/도로/광장 3D와 충돌 정보
src/game/input.js     키보드 + 터치 조이스틱
src/game/audio.js     효과음 (Web Audio로 합성, 파일 없음)
vendor/               Three.js r170 (MIT)
tools/fetch_osm.py    OpenStreetMap → data/<구역>.json 변환
tools/regions.json    구역별 범위 (지도 범위, 놀이 범위, 시작점)
data/                 변환된 지도 데이터
```

## 지도 데이터 만들기

```bash
python3 tools/fetch_osm.py gwanghwamun
```

Overpass API(overpass-api.de)에서 `tools/regions.json`의 범위를 받아 `data/gwanghwamun.json`을 만든다.
지도 파일이 없으면 게임은 건물 없는 테스트용 빈 광장으로 실행된다.

서버에서 Overpass 접속이 안 될 때는 브라우저로 받은 파일을 변환만 할 수 있다.

1. [overpass-turbo.eu](https://overpass-turbo.eu)에 `tools/fetch_osm.py`의 `build_query()` 쿼리를 넣고 실행
2. 내보내기(Export) → raw OSM data 다운로드
3. `python3 tools/fetch_osm.py gwanghwamun --raw export.json`

현재 `data/gwanghwamun.json`은 2026-10-28 OSM 데이터(건물 428, 도로 326, 광장·녹지 103, 가로수 138)로 만들었다.
지하 시설(`layer`/`level` 음수, 예: 세종이야기)은 제외하고, 조선 건축 태그가 있는 건물(광화문, 동십자각 등)은 전통 건물 색으로 그린다.

- 건물: 외곽선 + 높이(`height` → `building:levels` × 3.3m → 기본값 14m)
- 도로: 중심선 + 폭(`lanes` × 3.3m 또는 도로 등급별 기본값)
- 광장/공원/물, 가로수(`natural=tree`, `tree_row`)

## 밸런스 메모

- 흡수 시 성장: `지름³ += 1.3 × 물건크기³` (`Game.js`의 `GROWTH`)
- 이동 속도: `1.5 + 3.0 × 지름` m/s
- 작은 물건일수록 시작점 가까이 몰려 있다 (`Game.js`의 `TIER_RANGE`)
- 물건은 반지름 4.5m 공이 시작점에서 갈 수 있는 곳에만 놓인다 (2m 격자 이동 가능 영역).
  벽 충돌 반지름도 4.5m가 상한이라, 공이 아무리 커져도 남은 물건에 닿을 수 있다.
  작을 때 좁은 골목에 들어갔다가 커져도 갇히지 않게 충돌 반지름을 그 자리 여유 폭에 맞춘다.
- 실제 광화문 지도 기준 길찾기 봇이 전부 먹는 데 약 450초 → 1스테이지 제한 8분. 실제 플레이 후 조정 필요.

## 다음 작업

- [x] 광화문 일대 실제 OSM 데이터 받아 `data/gwanghwamun.json` 커밋
- [ ] 실제 플레이 기준 밸런스 재조정 (제한 시간, 물건 개수)
- [ ] 높은 건물 때문에 카메라가 가려지는 문제
- [ ] 큰 물체에 세게 부딪히면 붙은 물건이 떨어지는 효과
- [ ] 2스테이지(홍대) 구역 설정

지도 데이터 출처 표기: © OpenStreetMap contributors (ODbL)
