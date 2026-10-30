#!/usr/bin/env python3
"""OpenStreetMap 데이터를 받아 게임용 지도 JSON(data/<id>.json)으로 바꾼다.

사용법:
    python3 tools/fetch_osm.py gwanghwamun
    python3 tools/fetch_osm.py gwanghwamun --raw 받아둔파일.json   (Overpass 응답 파일로 변환만)

구역 범위는 tools/regions.json 에 있다.
  bbox  : 받아올 지도 범위 (주변 풍경 포함) [서, 남, 동, 북]
  play  : 공이 움직일 수 있는 범위
  start : 공 시작 위치 [경도, 위도]

출력 좌표는 start 기준 미터 단위 [동쪽, 북쪽].
지도 데이터 © OpenStreetMap contributors, ODbL 1.0
"""
import argparse
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERPASS = 'https://overpass-api.de/api/interpreter'

# 도로 종류별 기본 폭(m). lanes 태그가 있으면 차로 수 * 3.3m
ROAD_WIDTH = {
    'motorway': 20, 'trunk': 18, 'primary': 14, 'secondary': 10, 'tertiary': 8,
    'unclassified': 6, 'residential': 6, 'service': 4, 'living_street': 5,
    'pedestrian': 5, 'footway': 2.5, 'path': 2, 'cycleway': 2, 'steps': 2,
}
CAR_ROADS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service',
             'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
TRADITIONAL = {'palace', 'temple', 'shrine', 'gate', 'gatehouse', 'pavilion'}


def build_query(bbox):
    w, s, e, n = bbox
    b = f'({s},{w},{n},{e})'
    return f"""[out:json][timeout:120];
(
  way["building"]{b};
  relation["building"]{b};
  way["highway"]{b};
  way["area:highway"]{b};
  way["leisure"~"park|garden|pitch"]{b};
  way["landuse"~"grass|recreation_ground|village_green"]{b};
  way["natural"~"water|tree_row|wood|scrub"]{b};
  way["place"="square"]{b};
  way["man_made"="bridge"]{b};
  node["natural"="tree"]{b};
  node["tourism"="artwork"]{b};
  node["historic"~"memorial|monument"]{b};
  way["historic"~"memorial|monument"]{b};
);
out body;
>;
out skel qt;"""


def fetch(bbox):
    data = urllib.parse.urlencode({'data': build_query(bbox)}).encode()
    req = urllib.request.Request(OVERPASS, data=data, headers={'User-Agent': 'game-rollingseoul/0.1'})
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.load(res)


class Projector:
    """경위도 -> start 기준 미터 (등장방형 근사, 수 km 범위에서는 충분)"""

    def __init__(self, lon0, lat0):
        self.lon0, self.lat0 = lon0, lat0
        self.kx = 111320 * math.cos(math.radians(lat0))
        self.ky = 110540

    def __call__(self, lon, lat):
        return [round((lon - self.lon0) * self.kx, 2), round((lat - self.lat0) * self.ky, 2)]


def is_traditional(tags):
    return (tags.get('building') in TRADITIONAL or 'historic' in tags
            or tags.get('building:architecture') == 'joseon' or 'historic:period' in tags)


def is_underground(tags):
    for key in ('layer', 'level'):
        if tags.get(key, '0').strip().startswith('-'):
            return True
    return tags.get('location') == 'underground'


def is_elevated(tags):
    # 고가 역사(예: 성수역 3층 역사)는 아래 도로를 막지 않도록 뺀다
    if tags.get('building') not in ('train_station', 'transportation'):
        return False
    try:
        return float(tags.get('layer', '0')) >= 1
    except ValueError:
        return False


def parse_height(tags):
    for key in ('height', 'building:height'):
        if key in tags:
            try:
                return float(tags[key].replace('m', '').strip())
            except ValueError:
                pass
    if 'building:levels' in tags:
        try:
            return float(tags['building:levels']) * 3.3 + 1
        except ValueError:
            pass
    kind = tags.get('building', 'yes')
    if kind == 'gatehouse':
        return 15
    if is_traditional(tags):
        return 9
    return {'house': 7, 'garage': 3, 'kiosk': 3, 'roof': 4, 'shed': 3}.get(kind, 14)


def convert(raw, region):
    proj = Projector(*region['start'])
    nodes = {}
    ways = {}
    tree_nodes = []
    points = []  # 이름 있는 동상·기념물 (랜드마크 위치 맞추기용)
    for el in raw['elements']:
        if el['type'] == 'node':
            nodes[el['id']] = (el['lon'], el['lat'])
            if el.get('tags', {}).get('natural') == 'tree':
                tree_nodes.append((el['lon'], el['lat']))
            t = el.get('tags', {})
            if t.get('name') and (t.get('tourism') == 'artwork' or t.get('historic') in ('memorial', 'monument')):
                points.append({'n': t['name'], 'p': proj(el['lon'], el['lat'])})
        elif el['type'] == 'way':
            ways[el['id']] = el

    def coords(way):
        pts = [proj(*nodes[n]) for n in way.get('nodes', []) if n in nodes]
        return pts

    buildings, roads, areas, trees = [], [], [], []

    def add_building(pts, tags):
        if len(pts) > 3 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            return
        b = {'p': pts, 'h': round(parse_height(tags), 1)}
        if is_traditional(tags):
            b['k'] = 'traditional'
        elif tags.get('building') in ('apartments', 'residential'):
            b['k'] = 'apt'
        for key, short in (('building:colour', 'c'), ('roof:colour', 'rc')):
            if tags.get(key, '').startswith('#'):
                b[short] = tags[key]
        if tags.get('name'):
            b['n'] = tags['name']
        buildings.append(b)

    for way in ways.values():
        tags = way.get('tags')
        if not tags:
            continue
        pts = coords(way)
        if len(pts) < 2:
            continue
        closed = way['nodes'][0] == way['nodes'][-1]
        if 'building' in tags and tags.get('building') != 'no' and not is_underground(tags) and not is_elevated(tags):
            if closed:
                add_building(pts, tags)
        elif 'highway' in tags:
            hw = tags['highway']
            if tags.get('tunnel') == 'yes' or is_underground(tags):
                continue
            if closed and (tags.get('area') == 'yes' or hw == 'pedestrian'):
                areas.append({'k': 'plaza', 'p': pts[:-1]})
                continue
            base = hw.replace('_link', '')
            if base not in ROAD_WIDTH:
                continue
            w = ROAD_WIDTH[base]
            if 'lanes' in tags:
                try:
                    w = max(w * 0.5, float(tags['lanes'].split(';')[0]) * 3.3)
                except ValueError:
                    pass
            if tags.get('oneway') == 'yes' and 'lanes' not in tags:
                w *= 0.6
            road = {'p': pts, 'w': round(w, 1)}
            if hw not in CAR_ROADS:
                road['car'] = False
            roads.append(road)
        elif 'area:highway' in tags and closed:
            kind = 'plaza' if tags['area:highway'] in ('pedestrian', 'footway') else None
            if kind:
                areas.append({'k': kind, 'p': pts[:-1]})
        elif closed and (tags.get('leisure') in ('park', 'garden') or tags.get('landuse') in ('grass', 'recreation_ground', 'village_green') or tags.get('natural') in ('wood', 'scrub')):
            areas.append({'k': 'grass', 'p': pts[:-1]})
        elif closed and tags.get('place') == 'square':
            areas.append({'k': 'plaza', 'p': pts[:-1]})
        elif closed and tags.get('natural') == 'water':
            areas.append({'k': 'water', 'p': pts[:-1]})
        elif tags.get('natural') == 'tree_row':
            # 가로수 줄: 8m 간격으로 나무 찍기
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                seg = math.hypot(bx - ax, by - ay)
                for i in range(int(seg // 8) + 1):
                    t = i * 8 / seg if seg else 0
                    trees.append([round(ax + (bx - ax) * t, 2), round(ay + (by - ay) * t, 2)])

    # 멀티폴리곤·건물 관계(relation): 바깥 테두리만 사용
    for el in raw['elements']:
        if el['type'] != 'relation' or 'building' not in el.get('tags', {}) or is_underground(el['tags']) or is_elevated(el['tags']):
            continue
        members = [m for m in el.get('members', []) if m['type'] == 'way' and m['ref'] in ways]
        outers = [m for m in members if m.get('role') in ('outer', 'outline')]
        if outers:
            for m in outers:
                add_building(coords(ways[m['ref']]), el['tags'])
        elif members:
            # type=building 관계(예: 롯데월드타워)에 테두리가 없으면 가장 넓은 부분을 바닥으로 쓴다
            polys = [coords(ways[m['ref']]) for m in members]
            add_building(max(polys, key=lambda q: abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(q, q[1:] + q[:1])))), el['tags'])

    trees += [proj(lon, lat) for lon, lat in tree_nodes]

    w, s, e, n = region['play']
    x0, y0 = proj(w, s)
    x1, y1 = proj(e, n)
    return {
        'name': region['name'],
        'attribution': '© OpenStreetMap contributors (ODbL 1.0)',
        'origin': region['start'],
        # 게임 좌표 [x0, z0, x1, z1] (z = 남쪽 = -북)
        'play': [x0, -y1, x1, -y0],
        'start': [0, 0],
        'buildings': buildings,
        'roads': roads,
        'areas': areas,
        'trees': trees,
        'points': points,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('region')
    ap.add_argument('--raw', help='이미 받아둔 Overpass JSON 파일')
    args = ap.parse_args()

    regions = json.loads((ROOT / 'tools' / 'regions.json').read_text(encoding='utf-8'))
    if args.region not in regions:
        sys.exit(f'알 수 없는 구역: {args.region} (가능: {", ".join(regions)})')
    region = regions[args.region]

    if args.raw:
        raw = json.loads(Path(args.raw).read_text(encoding='utf-8'))
    else:
        print(f'Overpass에서 {region["name"]} 데이터 받는 중...')
        raw = fetch(region['bbox'])

    out = convert(raw, region)
    path = ROOT / 'data' / f'{args.region}.json'
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{path.relative_to(ROOT)}: 건물 {len(out["buildings"])}, 도로 {len(out["roads"])}, '
          f'구역 {len(out["areas"])}, 나무 {len(out["trees"])}')


if __name__ == '__main__':
    main()
