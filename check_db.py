import sqlite3

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