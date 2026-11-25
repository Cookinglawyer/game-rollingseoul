// 언어 선택 (한국어 / English). 고른 언어는 localStorage에 저장해 다음에도 유지한다.
// 화면 문구는 STRINGS, 스테이지는 stages.js의 en, 소품은 props.js의 en, 건물 이름은 지도의 ne(OSM name:en).
const LANG_KEY = 'seoul-ddamukgi-lang';
export const LANGS = ['ko', 'en'];

function loadLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    // 저장이 막힌 환경
  }
  // 처음 열 때는 브라우저 언어를 따른다 (한국어가 아니면 English)
  return /^ko\b/i.test(navigator.language || 'ko') ? 'ko' : 'en';
}

let lang = loadLang();
const listeners = new Set();

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // 이번 실행 동안만 유지
  }
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) {
  listeners.add(fn);
}

const STRINGS = {
  ko: {
    'doc.title': '서울 건물 다 따먹기',
    'title.kicker': '굴리고 · 붙이고 · 커지고',
    'title.t1': '서울',
    'title.t2': '건물 다',
    'title.t3': '따먹기',
    'title.hint': 'Enter 또는 Space 키로도 시작할 수 있어요',
    'title.credit': 'v0.2 prototype · 지도 데이터 © OpenStreetMap contributors',
    'lang.label': '언어',
    'music.aria': '음악 켜기/끄기',
    'music.on': '음악 켜기 (M)',
    'music.off': '음악 끄기 (M)',
    'stages.back': '← 처음으로',
    'stages.title': '스테이지 선택',
    'stages.progress': '클리어 {n} / {total}',
    'stages.preparing': '준비 중',
    'stage.no': 'STAGE {no}',
    'stage.final': 'FINAL STAGE',
    'brief.start': '시작 크기',
    'brief.goal': '목표 크기',
    'brief.time': '제한 시간',
    'brief.targets': '먹잇감: {list}',
    'brief.back': '← 스테이지 목록',
    'brief.play': '굴리기 시작!',
    'brief.controls': '조작: <b>W/↑</b> 앞으로 · <b>S/↓</b> 뒤로 · <b>A D/← →</b> 방향 전환 · <b>Esc</b> 일시정지 · <b>M</b> 음악 켜기/끄기<br />휴대폰: 화면을 누른 채 드래그',
    'brief.noMap': '이 스테이지는 아직 지도를 준비 중이에요!',
    'hud.size': '공 크기',
    'hud.goal': '목표',
    'hud.pause': '일시정지',
    'hud.placeholder': '지도 데이터 준비 중 · 지금은 건물이 없는 테스트용 빈 광장입니다',
    'hud.buildings': '먹은 건물 {n} / {total}',
    'map.attribution': '지도 데이터 © OpenStreetMap contributors',
    'pause.title': '일시정지',
    'pause.resume': '계속하기',
    'pause.retry': '처음부터 다시',
    'pause.quit': '스테이지 목록',
    'result.size': '최종 크기',
    'result.eaten': '먹은 건물',
    'result.time': '걸린 시간',
    'result.retry': '다시 하기',
    'result.next': '스테이지 목록',
    'result.win': '목표 달성!',
    'result.lose': '시간 초과',
    'result.best': '최고 기록! ',
    'result.unlocked': "다음 스테이지 '{name}'이(가) 열렸어요.",
    'result.short': '목표 {goal}까지 {left} 모자랐어요. 다시 도전!',
    'game.weather': '오늘 서울 날씨: {name}',
    'game.building': '건물',
    'game.buildings': '건물',
    'game.unlock': '이제 {list}도 먹을 수 있다!',
    'game.go': '굴려라!',
    'game.tooBig': '{name}: 아직 너무 커요 ({size} 필요)',
    'weather.clear': '맑음',
    'weather.partly': '구름 조금',
    'weather.overcast': '흐림',
    'weather.sunset': '노을',
  },
  en: {
    'doc.title': 'Seoul: Eat Every Building',
    'title.kicker': 'Roll · Stick · Grow',
    'title.t1': 'SEOUL',
    'title.t2': 'EAT EVERY',
    'title.t3': 'BUILDING',
    'title.hint': 'You can also press Enter or Space to start',
    'title.credit': 'v0.2 prototype · Map data © OpenStreetMap contributors',
    'lang.label': 'Language',
    'music.aria': 'Music on/off',
    'music.on': 'Music on (M)',
    'music.off': 'Music off (M)',
    'stages.back': '← Title',
    'stages.title': 'Select Stage',
    'stages.progress': 'Cleared {n} / {total}',
    'stages.preparing': 'Coming soon',
    'stage.no': 'STAGE {no}',
    'stage.final': 'FINAL STAGE',
    'brief.start': 'Start size',
    'brief.goal': 'Goal size',
    'brief.time': 'Time limit',
    'brief.targets': 'On the menu: {list}',
    'brief.back': '← Stages',
    'brief.play': 'Start rolling!',
    'brief.controls': 'Controls: <b>W/↑</b> forward · <b>S/↓</b> back · <b>A D/← →</b> turn · <b>Esc</b> pause · <b>M</b> music on/off<br />Phone: touch and drag',
    'brief.noMap': "This stage's map isn't ready yet!",
    'hud.size': 'Ball size',
    'hud.goal': 'Goal',
    'hud.pause': 'Pause',
    'hud.placeholder': 'Map data not ready · this is an empty test plaza with no buildings',
    'hud.buildings': 'Buildings {n} / {total}',
    'map.attribution': 'Map data © OpenStreetMap contributors',
    'pause.title': 'Paused',
    'pause.resume': 'Resume',
    'pause.retry': 'Restart',
    'pause.quit': 'Stage list',
    'result.size': 'Final size',
    'result.eaten': 'Buildings eaten',
    'result.time': 'Time',
    'result.retry': 'Try again',
    'result.next': 'Stage list',
    'result.win': 'Goal reached!',
    'result.lose': "Time's up",
    'result.best': 'New record! ',
    'result.unlocked': 'Next stage "{name}" is now open.',
    'result.short': '{left} short of the {goal} goal. Try again!',
    'game.weather': "Today's weather in Seoul: {name}",
    'game.building': 'Building',
    'game.buildings': 'buildings',
    'game.unlock': 'Now you can eat {list}!',
    'game.go': 'ROLL!',
    'game.tooBig': '{name}: still too big ({size} needed)',
    'weather.clear': 'Clear',
    'weather.partly': 'Partly cloudy',
    'weather.overcast': 'Overcast',
    'weather.sunset': 'Sunset',
  },
};

// t('result.short', { goal: '250m', left: '3m' })
export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.ko[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// 스테이지 문구: stages.js의 en에 있으면 영어, 없으면 한국어
export function stageText(stage, field) {
  return (lang === 'en' && stage.en && stage.en[field]) || stage[field];
}

// 소품 이름 (props.js의 en)
export function propName(type) {
  return (lang === 'en' && type.en) || type.name;
}

// 건물 이름 말풍선·알림: 영어를 고르면 OSM name:en이 있을 때만 영어, 없으면 한국어
export function buildingName(b) {
  return (lang === 'en' && b.nameEn) || b.name;
}

// 목록 잇기: 한국어 "A, B" / 영어 "A, B and C"
export function joinList(items) {
  if (lang !== 'en' || items.length < 2) return items.join(', ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// index.html의 data-i18n(글자), data-i18n-html(태그 포함), data-i18n-aria(aria-label) 요소에 적용
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  document.title = t('doc.title');
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}
