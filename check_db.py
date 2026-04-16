import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')


def count_lines_in_export(path='backend/scripts/MRT.json'):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    lines = {}
    for el in data.get('elements', []):
        if el.get('type') != 'relation':
            continue
        tags = el.get('tags', {})
        if tags.get('type') != 'route':
            continue
        if tags.get('route') not in ('subway', 'light_rail'):
            continue
        ref = tags.get('ref', '?')
        if ref not in lines:
            lines[ref] = {
                'ref':     ref,
                'name':    tags.get('name', ''),
                'route':   tags.get('route', ''),
                'colour':  tags.get('colour', ''),
                'network': tags.get('network', ''),
            }

    print(f"Số tuyến MRT/LRT trong export.json: {len(lines)}")
    for ref, info in sorted(lines.items()):
        kind = 'MRT' if info['route'] == 'subway' else 'LRT'
        print(f"  [{kind}] {ref:8s}  {info['colour']:10s}  {info['name']}")

    return lines


count_lines_in_export()
print()


def find_station_by_name(query, path='backend/scripts/MRT.json'):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    query_lower = query.lower()
    matches = []
    for el in data.get('elements', []):
        if el.get('type') != 'node':
            continue
        name = (el.get('tags') or {}).get('name', '')
        if query_lower in name.lower():
            matches.append({'id': el['id'], 'name': name, 'lat': el['lat'], 'lon': el['lon']})

    if matches:
        print(f"Tìm thấy {len(matches)} node khớp với '{query}':")
        for m in matches:
            print(f"  id={m['id']}  lat={m['lat']}  lon={m['lon']}  name={m['name']}")
    else:
        print(f"Không tìm thấy node nào có tên chứa '{query}'.")

    return matches


find_station_by_name('Phoenix')
find_station_by_name('Choa Chu Kang')
print()


def find_station_in_db(query, db_path='backend/data/pathfinding.db'):
    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    cur.execute("SELECT id, name, lat, lon FROM stations WHERE name LIKE ?", (f'%{query}%',))
    rows = cur.fetchall()

    cur2 = conn.cursor()
    if rows:
        print(f"Tìm thấy {len(rows)} ga trong DB khớp với '{query}':")
        for r in rows:
            cur2.execute("""
                SELECT DISTINCT l.short_name, l.color FROM connections c
                JOIN lines l ON c.line_id = l.id WHERE c.from_id = ?
            """, (r[0],))
            lines = [f"{row[0]}" for row in cur2.fetchall()]
            print(f"  id={r[0]}  name={r[1]}  lat={r[2]}  lon={r[3]}  lines={lines}")
    else:
        print(f"Không tìm thấy ga nào trong DB có tên chứa '{query}'.")

    conn.close()
    return rows


find_station_in_db('Choa Chu Kang')
print()


conn = sqlite3.connect('backend/data/pathfinding.db')
cur = conn.cursor()

cur.execute("SELECT id, name FROM stations")
all_stations = {row[0]: row[1] for row in cur.fetchall()}

cur.execute("SELECT DISTINCT from_id FROM connections")
connected_ids = set(row[0] for row in cur.fetchall())

isolated = {sid: name for sid, name in all_stations.items() if sid not in connected_ids}
print(f"Tổng số ga: {len(all_stations)}")
print(f"Ga có kết nối: {len(connected_ids)}")
print(f"Ga không có kết nối: {len(isolated)}")
if isolated:
    print("\nGa bị cô lập:")
    for sid, name in sorted(isolated.items(), key=lambda x: x[1]):
        print(f"  [{sid}] {name}")
else:
    print("Tất cả ga đều có kết nối!")

print()

# Kiểm tra cạnh có đỉnh không tồn tại trong stations
cur.execute("SELECT from_id, to_id FROM connections")
all_edges = cur.fetchall()

invalid_edges = []
for (u, v) in all_edges:
    if u not in all_stations or v not in all_stations:
        invalid_edges.append((u, v))

print(f"Tổng số cạnh: {len(all_edges)}")
print(f"Cạnh có đỉnh không tồn tại trong stations: {len(invalid_edges)}")
if invalid_edges:
    print("\nDanh sách cạnh không hợp lệ:")
    for (u, v) in invalid_edges[:10]:
        print(f"  ({u}, {v})")
else:
    print("Tất cả cạnh đều hợp lệ!")

conn.close()