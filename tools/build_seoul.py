#!/usr/bin/env python3
"""11스테이지(서울 전체) 지도 만들기: 나눠 받은 Overpass 파일을 합쳐 data/seoul.json 을 만든다.

사용법:
    python3 tools/build_seoul.py A1.json A2.json B.json

  A1·A2: fetch_osm.build_query_seoul_buildings (큰 건물·이름 있는 건물·탑, 서쪽·동쪽)
  B    : fetch_osm.build_query_seoul_base (서울 경계선, 큰 도로, 다리, 물, 공원·숲)

사각형으로 받은 데이터에서 서울 경계선 밖은 버리고, 건물은 500m 칸마다 큰 것부터 골라
MAX_BUILDINGS 개만 남긴다 (지역이 고르게 남도록). 이름난 곳(LANDMARKS)은 꼭 넣는다.
한강 다리는 낮고 긴 '다리' 건물로 넣어 마지막에 먹을 수 있게 한다.
"""
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_osm as F  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
START = (126.97795, 37.56630)  # 서울광장
MAX_BUILDINGS = 9000
CELL = 500  # 건물 고르는 칸 크기(m)
LANDMARKS = {'63빌딩', '롯데월드타워', '코엑스', '국회의사당', '동대문디자인플라자', '남산서울타워', '고척스카이돔'}
HEIGHT_FIX = {'남산서울타워': 237}  # 높이 태그가 없는 이름난 곳
BRIDGE_H = 12
# 한강 다리만 (고가도로는 공이 못 지나가는 몇 km짜리 벽이 되므로 뺀다)
RIVER_BRIDGE = re.compile(r'(대교|철교|잠수교|광진교)$')
# 아파트 '가동'·'101동' 같은 이름은 말풍선에 띄우지 않는다
DONG_NAME = re.compile(r'^[0-9A-Za-z가-힣\- ]{1,4}동$|^[0-9A-Za-z\- ]+$')


def load(paths):
    nodes, ways, rels = {}, {}, {}
    for p in paths:
        for e in json.loads(Path(p).read_text(encoding='utf-8'))['elements']:
            box = {'node': nodes, 'way': ways, 'relation': rels}[e['type']]
            if e['id'] not in box or 'tags' in e:  # 같은 요소가 태그 없이(skel) 또 오면 덮어쓰지 않는다
                box[e['id']] = e
    return nodes, ways, rels


def join_rings(seqs):
    """way 노드 목록들을 끝점끼리 이어 닫힌 고리들로 만든다."""
    seqs = [list(s) for s in seqs if len(s) >= 2]
    rings = []
    while seqs:
        cur = seqs.pop()
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(seqs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[-2::-1]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[:0:-1] + cur
                else:
                    continue
                seqs.pop(i)
                changed = True
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur[:-1])
    return rings


def area(pts):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))) / 2


def simplify(pts, tol):
    """Douglas-Peucker (닫힌 고리는 반으로 나눠서)"""
    def dp(p):
        if len(p) < 3:
            return p
        (ax, ay), (bx, by) = p[0], p[-1]
        L = math.hypot(bx - ax, by - ay) or 1e-9
        best, bi = -1, 0
        for i in range(1, len(p) - 1):
            d = abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / L
            if d > best:
                best, bi = d, i
        if best <= tol:
            return [p[0], p[-1]]
        return dp(p[:bi + 1])[:-1] + dp(p[bi:])
    if len(pts) < 8:
        return pts
    h = len(pts) // 2
    out = dp(pts[:h + 1])[:-1] + dp(pts[h:] + [pts[0]])[:-1]
    return out if len(out) >= 3 else pts


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


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    nodes, ways, rels = load(sys.argv[1:])
    proj = F.Projector(*START)

    def pts_of(node_ids):
        return [proj(nodes[n]['lon'], nodes[n]['lat']) for n in node_ids if n in nodes]

    def outer_rings(rel):
        return join_rings([ways[m['ref']]['nodes'] for m in rel.get('members', [])
                           if m['type'] == 'way' and m.get('role') in ('outer', '') and m['ref'] in ways])

    # 서울 경계선 (가장 큰 고리, 30m 단위로 단순화)
    seoul = next(r for r in rels.values() if r.get('tags', {}).get('boundary') == 'administrative'
                 and r['tags'].get('name') == '서울특별시')
    border = max((pts_of(r) for r in outer_rings(seoul)), key=area)
    border = simplify(border, 30)
    bx0, by0 = min(p[0] for p in border), min(p[1] for p in border)
    bx1, by1 = max(p[0] for p in border), max(p[1] for p in border)

    def in_seoul(x, y):
        return bx0 <= x <= bx1 and by0 <= y <= by1 and inside(x, y, border)

    # ---------- 건물 ----------
    cands = []

    def add(pts, tags, kind=None):
        if len(pts) > 3 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            return
        name = tags.get('name', '')
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        if not in_seoul(cx, cy):
            return
        h = HEIGHT_FIX.get(name) or (BRIDGE_H if kind == 'bridge' else F.parse_height(tags))
        a = area(pts)
        if kind != 'bridge' and a < 150 and h < 45:
            return
        ext = max(max(p[0] for p in pts) - min(p[0] for p in pts), max(p[1] for p in pts) - min(p[1] for p in pts))
        he = h if h <= 150 else 150 + (h - 150) * 0.4
        b = {'p': [[round(x, 1), round(y, 1)] for x, y in simplify(pts, 0.8)], 'h': round(h, 1)}
        if kind:
            b['k'] = kind
        elif F.is_traditional(tags):
            b['k'] = 'traditional'
        elif tags.get('building') in ('apartments', 'residential'):
            b['k'] = 'apt'
        if name and not DONG_NAME.match(name):
            b['n'] = name
        cands.append({'b': b, 'pick': max(he, ext) * 0.65, 'x': cx, 'y': cy, 'must': name in LANDMARKS})

    for w in ways.values():
        t = w.get('tags', {})
        if 'building' in t and t['building'] != 'no' and not F.is_underground(t) and not F.is_elevated(t) \
                and w['nodes'][0] == w['nodes'][-1]:
            add(pts_of(w['nodes']), t)
    for r in rels.values():
        t = r.get('tags', {})
        if 'building' not in t or F.is_underground(t):
            continue
        rings = [pts_of(q) for q in outer_rings(r)]
        if not rings:
            # type=building 관계(예: 롯데월드타워·남산서울타워)는 가장 넓은 부분을 바닥으로
            parts = [pts_of(ways[m['ref']]['nodes']) for m in r.get('members', []) if m['type'] == 'way' and m['ref'] in ways]
            rings = [max(parts, key=area)] if parts else []
        for ring in rings:
            add(ring, t)
    # 다리: 한강 다리 외곽선
    for w in ways.values():
        t = w.get('tags', {})
        if t.get('man_made') == 'bridge' and w['nodes'][0] == w['nodes'][-1] and RIVER_BRIDGE.search(t.get('name', '')) \
                and '고가' not in t['name']:
            pts = pts_of(w['nodes'])
            if len(pts) >= 4 and area(pts) > 1500:
                add(pts, t, 'bridge')

    # 같은 건물이 way와 relation으로 두 번 들어온 경우(중심이 2m 안, 이름 같음) 하나만
    seen = set()
    uniq = []
    for c in cands:
        key = (round(c['x'] / 2), round(c['y'] / 2), c['b'].get('n'))
        if key not in seen:
            seen.add(key)
            uniq.append(c)
    cands = uniq

    # 500m 칸마다 큰 순서로 순위를 매기고, 순위가 높은 것부터 MAX_BUILDINGS 개
    cells = {}
    for c in cands:
        cells.setdefault((math.floor(c['x'] / CELL), math.floor(c['y'] / CELL)), []).append(c)
    for lst in cells.values():
        lst.sort(key=lambda c: -c['pick'])
        for i, c in enumerate(lst):
            c['rank'] = i
    cands.sort(key=lambda c: (not c['must'], c['b'].get('k') != 'bridge', c['rank'], -c['pick']))
    chosen = cands[:MAX_BUILDINGS]
    buildings = [c['b'] for c in chosen]

    # ---------- 도로 ----------
    roads = []
    for w in ways.values():
        t = w.get('tags', {})
        hw = t.get('highway', '').replace('_link', '')
        if hw not in ('motorway', 'trunk', 'primary') or t.get('tunnel') == 'yes' or F.is_underground(t):
            continue
        pts = pts_of(w['nodes'])
        if len(pts) < 2:
            continue
        mx, my = pts[len(pts) // 2]
        if not in_seoul(mx, my):
            continue
        wd = F.ROAD_WIDTH[hw]
        if 'lanes' in t:
            try:
                wd = max(wd * 0.5, float(t['lanes'].split(';')[0]) * 3.3)
            except ValueError:
                pass
        if t.get('oneway') == 'yes' and 'lanes' not in t:
            wd *= 0.6
        roads.append({'p': [[round(x, 1), round(y, 1)] for x, y in simplify(pts, 1.5)], 'w': round(wd, 1), 'car': False})

    # ---------- 물·공원·숲 ----------
    areas = []

    def add_area(kind, ring, min_area):
        if len(ring) < 3 or area(ring) < min_area:
            return
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        if not in_seoul(cx, cy) and kind != 'water':
            return
        areas.append({'k': kind, 'p': [[round(x, 1), round(y, 1)] for x, y in simplify(ring, 4)]})

    def kind_of(t):
        if t.get('natural') == 'water':
            return 'water', 5000
        if t.get('leisure') == 'park':
            return 'grass', 20000
        if t.get('natural') == 'wood':
            return 'grass', 50000
        return None, 0

    for w in ways.values():
        k, mn = kind_of(w.get('tags', {}))
        if k and w['nodes'][0] == w['nodes'][-1]:
            add_area(k, pts_of(w['nodes'])[:-1], mn)
    for r in rels.values():
        k, mn = kind_of(r.get('tags', {}))
        if k:
            for ring in outer_rings(r):
                add_area(k, pts_of(ring), mn)
    areas.sort(key=lambda a: a['k'] == 'water')  # 물을 나중에 그려 위에 오게

    m = 300
    out = {
        'name': '서울 전체',
        'attribution': '© OpenStreetMap contributors (ODbL 1.0)',
        'origin': list(START),
        'play': [round(bx0 - m), round(-by1 - m), round(bx1 + m), round(-by0 + m)],
        'start': [0, 0],
        'giant': True,
        'border': [[round(x), round(y)] for x, y in border],
        'buildings': buildings,
        'roads': roads,
        'areas': areas,
        'trees': [],
        'points': [],
    }
    path = ROOT / 'data' / 'seoul.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    kinds = {}
    for b in buildings:
        kinds[b.get('k', '-')] = kinds.get(b.get('k', '-'), 0) + 1
    print(f'{path.relative_to(ROOT)}: 후보 {len(cands)} → 건물 {len(buildings)} {kinds}, 도로 {len(roads)}, '
          f'물·공원 {len(areas)}, 경계 {len(border)}점, 크기 {path.stat().st_size / 1e6:.1f}MB, '
          f'범위 {(bx1 - bx0) / 1000:.1f} × {(by1 - by0) / 1000:.1f}km')
    print('반드시 넣은 곳:', [c['b'].get('n') for c in chosen if c['must']])


if __name__ == '__main__':
    main()
