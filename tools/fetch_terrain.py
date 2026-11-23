#!/usr/bin/env python3
"""스테이지 지도(data/<id>.json)에 실제 지형 높이를 넣는다.

사용법:
    python3 tools/fetch_terrain.py itaewon [--exag 1.8] [--cell 5]

AWS Terrain Tiles(Terrarium, 공개·무료, z14 ≈ 7.6m 간격)에서 tools/regions.json 의 bbox 범위
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
Z = 14
TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'


class Dem:
    def __init__(self):
        self.tiles = {}

    def tile(self, x, y):
        if (x, y) not in self.tiles:
            with urllib.request.urlopen(TILE_URL.format(z=Z, x=x, y=y), timeout=30) as res:
                im = Image.open(io.BytesIO(res.read())).convert('RGB')
            px = im.load()
            self.tiles[(x, y)] = [[(lambda r, g, b: r * 256 + g + b / 256 - 32768)(*px[i, j]) for i in range(256)]
                                  for j in range(256)]
        return self.tiles[(x, y)]

    def pixel(self, gx, gy):
        t = self.tile(gx // 256, gy // 256)
        return t[gy % 256][gx % 256]

    def height(self, lon, lat):
        n = 2 ** Z * 256
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
    ap.add_argument('--cell', type=float, default=5, help='격자 간격(m)')
    args = ap.parse_args()

    region = json.loads((ROOT / 'tools' / 'regions.json').read_text(encoding='utf-8'))[args.region]
    path = ROOT / 'data' / f'{args.region}.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    proj = F.Projector(*data['origin'])

    w, s, e, n = region['bbox']
    xw, ys = proj(w, s)
    xe, yn = proj(e, n)
    cell = args.cell
    x0, z0 = math.floor(xw), math.floor(-yn)
    gw = int((xe - x0) / cell) + 2
    gh = int((-ys - z0) / cell) + 2

    dem = Dem()
    grid = []
    for j in range(gh):
        z = z0 + j * cell
        lat = proj.lat0 + (-z) / proj.ky
        row = []
        for i in range(gw):
            x = x0 + i * cell
            row.append(dem.height(proj.lon0 + x / proj.kx, lat))
        grid.append(row)

    # 건물·나무가 섞인 잔물결을 줄이려고 3×3 평균 두 번
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
