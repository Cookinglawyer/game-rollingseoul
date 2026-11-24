#!/bin/bash
# 모든 지도를 원본(tools/osm_raw/*.json.gz)에서 다시 만든다: 지도 변환 → 지형 → 아파트 단지 이름
# 사용법: bash tools/rebuild_all.sh   (저장소 맨 위 폴더에서)
set -e
cd "$(dirname "$0")/.."
R=tools/osm_raw
for id in gwanghwamun hongdae myeongdong gangnam itaewon seongsu banpo dogok yeouido jamsil; do
  python3 -B tools/fetch_osm.py $id --raw $R/$id.json.gz
done
python3 -B tools/build_seoul.py $R/seoul_buildings_west.json.gz $R/seoul_buildings_east.json.gz $R/seoul_base.json.gz
for id in gwanghwamun hongdae myeongdong gangnam itaewon seongsu banpo dogok yeouido jamsil seoul; do
  python3 -B tools/fetch_terrain.py $id
done
python3 -B tools/apt_names.py
