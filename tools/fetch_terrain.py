#!/usr/bin/env python3
"""스테이지 지도(data/<id>.json)에 실제 지형 높이를 넣는다.

사용법:
    python3 tools/fetch_terrain.py itaewon [--exag 1.8] [--cell 5] [--zoom 14] [--flatten 40]
    python3 tools/fetch_terrain.py seoul --exag 1 --cell 60 --zoom 12   (서울 전체: 범위가 넓어 성기게)

AWS Terrain Tiles(Terrarium, 공개·무료, z14 ≈ 7.6m 간격)에서 놀이 구역보다 300m 넓은 범위의
높이를 받아, 게임 좌표 격자(cell m 간격)로 다시 뽑는다. 가장 낮은 곳을 0으로 두고 exag 배로 과장한다.
fetch_osm.py 로 지도를 다시 만들면 지형이 지워지므로 그 뒤에 다시 실행한다.

출력: data/<id>.json 의 "terrain" = {x0, z0, cell, w, h, exag, data}
  data: 격자 높이(cm, 부호 없는 16비트, 리틀 엔디언)를 base64로. (i, j) 칸은 x0 + i*cell, z0 + j*cell.
고도 데이터: Mapzen Terrain Tiles (SRTM, GMTED 등 공개 데이터 기반) — https://github.com/tilezen/joerd
"""
import argparse
import base64
import io
import json
import math
import struct
import sys
import urllib.request
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_osm as F  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'


class Dem:
    def __init__(self, zoom):
        self.z = zoom
        self.tiles = {}

    def tile(self, x, y):
        if (x, y) not in self.tiles:
            with urllib.request.urlopen(TILE_URL.format(z=self.z, x=x, y=y), timeout=30) as res:
                im = Image.open(io.BytesIO(res.read())).convert('RGB')
            px = im.load()
            t = [[(lambda r, g, b: r * 256 + g + b / 256 - 32768)(*px[i, j]) for i in range(256)] for j in range(256)]
            # 타일에 가끔 빈 값(예: -1724m)이 섞여 있다. 서울은 해발 -30m 아래가 없으므로 주변 값으로 메운다.
            for j in range(256):
                for i in range(256):
                    if t[j][i] < -30:
                        near = [t[jj][ii] for jj in range(max(0, j - 3), min(256, j + 4))
                                for ii in range(max(0, i - 3), min(256, i + 4)) if t[jj][ii] >= -30]
                        t[j][i] = sorted(near)[len(near) // 2] if near else 0
            self.tiles[(x, y)] = t
        return self.tiles[(x, y)]

    def pixel(self, gx, gy):
        t = self.tile(gx // 256, gy // 256)
        return t[gy % 256][gx % 256]

    def height(self, lon, lat):
        n = 2 ** self.z * 256
        fx = (lon + 180) / 360 * n - 0.5
        lr = math.radians(lat)
        fy = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n - 0.5
        ix, iy = math.floor(fx), math.floor(fy)
        tx, ty = fx - ix, fy - iy
        a, b = self.pixel(ix, iy), self.pixel(ix + 1, iy)
        c, d = self.pixel(ix, iy + 1), self.pixel(ix + 1, iy + 1)
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('region')
    ap.add_argument('--exag', type=float, default=1.8, help='높이 과장 배수')
    ap.add_argument('--cell', type=float, help='격자 간격(m). 없으면 5m부터, 꼭짓점이 20만 개를 넘지 않게 넓힌다')
    ap.add_argument('--zoom', type=int, default=14, help='고도 타일 확대 단계 (14 ≈ 7.6m, 12 ≈ 30m)')
    ap.add_argument('--flatten', type=float, default=70, help='이보다 좁은 봉우리(건물)를 깎는 반경(m)')
    args = ap.parse_args()

    path = ROOT / 'data' / f'{args.region}.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    proj = F.Projector(*data['origin'])

    # 놀이 구역보다 300m 넓게 (멀리 보이는 곳까지)
    px0, pz0, px1, pz1 = data['play']
    m = 300
    cell = args.cell or max(5, math.ceil(math.sqrt((px1 - px0 + 2 * m) * (pz1 - pz0 + 2 * m) / 200000)))
    x0, z0 = math.floor(px0 - m), math.floor(pz0 - m)
    gw = int((px1 + m - x0) / cell) + 2
    gh = int((pz1 + m - z0) / cell) + 2

    dem = Dem(args.zoom)
    grid = []
    for j in range(gh):
        z = z0 + j * cell
        lat = proj.lat0 + (-z) / proj.ky
        row = []
        for i in range(gw):
            x = x0 + i * cell
            row.append(dem.height(proj.lon0 + x / proj.kx, lat))
        grid.append(row)

    # 고도 데이터에 섞인 높은 건물(예: 이태원 제일기획 자리가 주변보다 40m 솟음)을 깎는다:
    # 반경 FLATTEN m 안의 최솟값을 고른 뒤 다시 최댓값을 고르면(열림 연산) 그보다 좁은 봉우리만 사라진다.
    k = max(1, round(args.flatten / cell))

    def sweep(g, pick):
        rows = [[pick(r[max(0, i - k):i + k + 1]) for i in range(gw)] for r in g]
        return [[pick([rows[jj][i] for jj in range(max(0, j - k), min(gh, j + k + 1))]) for i in range(gw)] for j in range(gh)]
    grid = sweep(sweep(grid, min), max)

    # 잔물결을 줄이려고 3×3 평균 두 번
    for _ in range(2):
        grid = [[sum(grid[min(gh - 1, max(0, j + dj))][min(gw - 1, max(0, i + di))]
                     for dj in (-1, 0, 1) for di in (-1, 0, 1)) / 9 for i in range(gw)] for j in range(gh)]
    low = min(min(r) for r in grid)
    flat = [max(0, round((v - low) * args.exag * 100)) for r in grid for v in r]
    flat = [min(65535, v) for v in flat]
    data['terrain'] = {
        'x0': x0, 'z0': z0, 'cell': cell, 'w': gw, 'h': gh, 'exag': args.exag,
        'base': round(low, 1),  # 실제 해발(m) = 높이 / exag + base
        'data': base64.b64encode(struct.pack(f'<{len(flat)}H', *flat)).decode(),
    }
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    top = max(flat) / 100
    print(f'{path.relative_to(ROOT)}: 지형 {gw}×{gh} ({cell}m), 해발 {low:.0f}~{low + top / args.exag:.0f}m, '
          f'게임 높이 0~{top:.0f}m (×{args.exag}), 타일 {len(dem.tiles)}장, 파일 {path.stat().st_size / 1e6:.2f}MB')


if __name__ == '__main__':
    main()
