#!/usr/bin/env python3
"""아파트 '101동'·'3'·'A동' 같은 건물 이름 앞에 단지 이름을 붙인다: '101동' → '반포자이 101동'.

사용법:
    python3 tools/apt_names.py 받은파일.json      (fetch_osm.build_query_apt_complexes 결과, out geom)
    python3 tools/apt_names.py                    (이미 저장한 tools/apt_complexes.json 으로 다시 적용)

단지 경계(이름 있는 주거 구역)를 tools/apt_complexes.json 으로 줄여 저장하고, data/*.json 지도마다
건물 중심이 들어 있는 가장 작은 단지의 이름을 붙인다. 단지를 못 찾으면 그대로 둔다.
fetch_osm.py / build_seoul.py 로 지도를 다시 만들면 이름이 원래대로 돌아가므로 그 뒤에 다시 실행한다.
"""
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_osm as F  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / 'tools' / 'apt_complexes.json'
# 동 번호만 있는 이름: 101, 101동, 1, A, A동, 103-1동, 가동 (한글 한 글자는 '동'이 붙은 것만. 'CU' 같은 상호는 제외)
DONG = re.compile(r'^\s*(?:([0-9]{1,4}(?:-[0-9]{1,2})?[A-Za-z]?|[A-Za-z])\s*동?|([가-힣])\s*동)\s*$')


def area(p):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(p, p[1:] + p[:1]))) / 2


def inside(x, y, poly):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def load_raw(path):
    """Overpass out geom 결과 → [{n, p: [[lon, lat], ...]}]"""
    out = []
    for e in json.loads(Path(path).read_text(encoding='utf-8'))['elements']:
        name = e.get('tags', {}).get('name')
        if not name:
            continue
        rings = []
        if e['type'] == 'way' and e.get('geometry'):
            rings = [e['geometry']]
        elif e['type'] == 'relation':
            rings = [m['geometry'] for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
        for g in rings:
            p = [[round(q['lon'], 6), round(q['lat'], 6)] for q in g]
            if len(p) >= 4 and p[0] == p[-1]:
                out.append({'n': name.strip(), 'p': p[:-1]})
    return out


def main():
    if len(sys.argv) > 1:
        complexes = load_raw(sys.argv[1])
        STORE.write_text(json.dumps(complexes, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'{STORE.relative_to(ROOT)}: 단지 {len(complexes)}개 저장')
    complexes = json.loads(STORE.read_text(encoding='utf-8'))
    for c in complexes:
        xs = [q[0] for q in c['p']]
        ys = [q[1] for q in c['p']]
        c['bb'] = (min(xs), min(ys), max(xs), max(ys))
        c['a'] = area(c['p'])
    # 0.01도 칸 색인
    grid = {}
    for c in complexes:
        for i in range(math.floor(c['bb'][0] * 100), math.floor(c['bb'][2] * 100) + 1):
            for j in range(math.floor(c['bb'][1] * 100), math.floor(c['bb'][3] * 100) + 1):
                grid.setdefault((i, j), []).append(c)

    for path in sorted((ROOT / 'data').glob('*.json')):
        if path == STORE:
            continue
        data = json.loads(path.read_text(encoding='utf-8'))
        if 'buildings' not in data or 'origin' not in data:
            continue
        proj = F.Projector(*data['origin'])
        named = total = 0
        for b in data['buildings']:
            raw = b.get('dn') or b.get('n') or ''
            m = DONG.match(raw)
            if not m:
                continue
            total += 1
            cx = sum(p[0] for p in b['p']) / len(b['p'])
            cy = sum(p[1] for p in b['p']) / len(b['p'])
            lon, lat = proj.lon0 + cx / proj.kx, proj.lat0 + cy / proj.ky
            hits = [c for c in grid.get((math.floor(lon * 100), math.floor(lat * 100)), [])
                    if c['bb'][0] <= lon <= c['bb'][2] and c['bb'][1] <= lat <= c['bb'][3] and inside(lon, lat, c['p'])]
            if not hits:
                continue
            c = min(hits, key=lambda c: c['a'])
            b['n'] = f"{c['n']} {m.group(1) or m.group(2)}동"
            b.pop('dn', None)
            b.pop('ne', None)  # '101동' 같은 이름의 영어 이름은 단지 이름과 맞지 않으므로 버린다 (말풍선은 한국어)
            named += 1
        if total:
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'{path.relative_to(ROOT)}: 동 번호 이름 {total}개 중 {named}개에 단지 이름')


if __name__ == '__main__':
    main()
