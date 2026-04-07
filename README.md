# Singapore MRT Navigator

Ứng dụng tìm đường đi tối ưu trên mạng lưới tàu điện ngầm MRT Singapore, sử dụng thuật toán **A\*** với dữ liệu thực tế từ OpenStreetMap. Hỗ trợ mô phỏng kịch bản đóng tuyến / đóng ga bởi quản trị viên.

---

## Mục lục

1. [Giới thiệu](#giới-thiệu)
2. [Tính năng](#tính-năng)
3. [Công nghệ sử dụng](#công-nghệ-sử-dụng)
4. [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
5. [Cấu trúc project](#cấu-trúc-project)
6. [Cài đặt và chạy](#cài-đặt-và-chạy)
7. [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
8. [API Endpoints](#api-endpoints)
9. [Mô tả các file quan trọng](#mô-tả-các-file-quan-trọng)
10. [Không gian bài toán & Thuật toán](#không-gian-bài-toán--thuật-toán)
11. [Tài khoản mặc định](#tài-khoản-mặc-định)

---

## Giới thiệu

Project xây dựng ứng dụng web tìm đường đi ngắn nhất trên mạng lưới **6 tuyến MRT Singapore** gồm 143 ga. Người dùng click lên bản đồ để chọn điểm xuất phát và điểm đến, hệ thống tự động snap về ga gần nhất và tính toán lộ trình tối ưu bằng thuật toán A\*.

Quản trị viên có thể đóng tuyến hoặc đóng ga để mô phỏng các tình huống bảo trì / sự cố. Khi đó hệ thống sẽ thông báo nguyên nhân không tìm được đường và đề xuất ga thay thế lân cận.

---

## Tính năng

### Người dùng
| Tính năng | Mô tả |
|-----------|-------|
| Xem mạng lưới MRT | Hiển thị 6 tuyến với màu sắc thực tế trên bản đồ OpenStreetMap |
| Click để chọn ga | Click lên bản đồ → tự động snap về ga MRT gần nhất |
| Tìm đường A\* | Tính lộ trình ngắn nhất, hiển thị danh sách ga + khoảng cách + tuyến sử dụng |
| Vẽ route | Đường đi được vẽ nổi bật trên bản đồ với màu theo từng tuyến |
| Auto-refresh | Route tự động tính lại khi admin thay đổi kịch bản (polling mỗi 3 giây) |
| Thông báo chặn | Khi không có đường: hiển thị tuyến/ga bị đóng gây ra lỗi |
| Ga thay thế | Khi bị chặn: đề xuất dời sang ga lân cận để tìm được đường (có xác nhận) |

### Quản trị viên
| Tính năng | Mô tả |
|-----------|-------|
| Đăng nhập JWT | Xác thực bảo mật bằng JSON Web Token |
| Đóng / Mở tuyến | Toàn bộ cạnh thuộc tuyến → weight = ∞; A\* tự động đi đường vòng |
| Đóng / Mở ga | Tất cả cạnh nối với ga → weight = ∞; không thể đi qua ga đó |
| Tìm đường trên admin | Tìm đường theo kịch bản đang áp dụng, ngay trên trang admin |
| Xem scenario | Danh sách kịch bản đang hoạt động, mở lại từng cái hoặc tất cả |
| Hiệu ứng bản đồ | Tuyến đóng: xám + gạch nét đứt; Ga đóng: chấm đỏ to hơn |

---

## Công nghệ sử dụng

**Backend**
- Python 3.10+
- FastAPI + Uvicorn (REST API server)
- SQLite3 (cơ sở dữ liệu nhúng)
- python-jose (JSON Web Token)
- passlib + bcrypt (hash mật khẩu)
- pydantic-settings (cấu hình từ .env)

**Frontend**
- HTML5 / CSS3 / Vanilla JavaScript
- Leaflet.js 1.9.4 (bản đồ tương tác)
- OpenStreetMap tile layer

**Dữ liệu**
- OpenStreetMap (xuất qua Overpass Turbo → `export.json`)
- 6 tuyến MRT, 143 ga, 330 kết nối, 165 đoạn geometry

---

## Kiến trúc hệ thống

```
┌─────────────────────┐        HTTP/REST         ┌──────────────────────────┐
│     Frontend        │ ◄──────────────────────► │       Backend            │
│  (HTML/CSS/JS)      │      localhost:8000       │    (FastAPI + SQLite)    │
│  localhost:8080     │                           │                          │
│                     │                           │  ┌────────────────────┐  │
│  ┌───────────────┐  │   GET /api/network        │  │  PathfindingService│  │
│  │  map.js       │  │ ──────────────────────►   │  │  (A* Algorithm)    │  │
│  │  (Leaflet)    │  │   GET /api/route          │  │  nodes, adj_list   │  │
│  └───────────────┘  │ ──────────────────────►   │  │  edges, weights    │  │
│  ┌───────────────┐  │                           │  └────────────────────┘  │
│  │pathfinding.js │  │   POST /scenarios/...     │  ┌────────────────────┐  │
│  │(User page)    │  │ ──────────────────────►   │  │  ScenarioService   │  │
│  └───────────────┘  │                           │  │  active_scenarios  │  │
│  ┌───────────────┐  │   POST /auth/login        │  │  close/open line   │  │
│  │  admin.js     │  │ ──────────────────────►   │  │  close/open station│  │
│  │(Admin page)   │  │                           │  └────────────────────┘  │
│  └───────────────┘  │                           │  ┌────────────────────┐  │
└─────────────────────┘                           │  │   SQLite Database  │  │
                                                  │  │  lines, stations   │  │
                                                  │  │  connections       │  │
                                                  │  │  rail_geometry     │  │
                                                  │  │  line_stops, admin │  │
                                                  │  └────────────────────┘  │
                                                  └──────────────────────────┘
```

---

## Cấu trúc project

```
IT3160-Project-GoogleMap/
│
├── .env                          # Biến môi trường (SECRET_KEY, DB_PATH, ...)
├── requirements.txt              # Thư viện Python cần cài
│
├── backend/
│   ├── app/
│   │   ├── main.py               # Entry point FastAPI, đăng ký router, startup
│   │   ├── config.py             # Cấu hình từ .env (Settings class)
│   │   ├── database.py           # Context manager kết nối SQLite
│   │   │
│   │   ├── api/
│   │   │   ├── auth.py           # POST /auth/login → trả JWT token
│   │   │   ├── path.py           # GET /api/route, /api/stations, /api/network, ...
│   │   │   └── scenarios.py      # POST/DELETE /api/scenarios/...
│   │   │
│   │   ├── services/
│   │   │   ├── pathfinding.py    # Class PathfindingService: A*, Haversine, close/open
│   │   │   ├── scenario.py       # Class ScenarioService: quản lý kịch bản
│   │   │   └── auth.py           # JWT tạo/xác thực, bcrypt verify
│   │   │
│   │   ├── schemas/
│   │   │   ├── auth.py           # Pydantic: LoginRequest, TokenResponse
│   │   │   └── scenario.py       # Pydantic: CloseLineRequest, CloseStationRequest
│   │   │
│   │   └── dependencies/
│   │       └── access_control.py # Dependency require_admin (kiểm tra JWT + role)
│   │
│   ├── data/
│   │   └── pathfinding.db        # SQLite database (tạo bởi init_db.py)
│   │
│   └── scripts/
│       ├── init_db.py            # Tạo bảng + tạo user admin mặc định
│       ├── rawprocessing.py      # Đọc export.json → insert vào DB
│       ├── export.json           # Dữ liệu OSM thô (nodes, ways, relations)
│       ├── mrt_lines_mapping.json# Mapping relation ID → tên tuyến
│       └── check.py              # Script debug kiểm tra DB
│
└── frontend/
    ├── index.html                # Giao diện người dùng
    ├── admin.html                # Giao diện quản trị viên
    │
    ├── css/
    │   ├── style.css             # Style cho trang người dùng
    │   └── admin.css             # Style cho trang admin
    │
    └── js/
        ├── config.js             # API_BASE URL (thay đổi nếu đổi port)
        ├── auth.js               # Quản lý JWT token ở frontend (Auth object)
        ├── map.js                # Leaflet map, vẽ network, vẽ route
        ├── pathfinding.js        # Logic tìm đường trang người dùng
        └── admin.js              # Logic trang admin (login, tabs, scenarios)
```

---

## Cài đặt và chạy

### Yêu cầu
- Python 3.10+
- Git

### Bước 1 — Clone project
```bash
git clone <repo-url>
cd IT3160-Project-GoogleMap
```

### Bước 2 — Tạo môi trường ảo
```bash
python -m venv venv

# Windows
venv\Scripts\Activate.ps1

# Mac/Linux
source venv/bin/activate
```

### Bước 3 — Cài thư viện
```bash
pip install -r requirements.txt
```

### Bước 4 — Cấu hình `.env`
Tạo file `.env` ở thư mục gốc:
```env
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
DB_PATH=backend/data/pathfinding.db
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

### Bước 5 — Khởi tạo database và nhập dữ liệu
```bash
python backend/scripts/init_db.py
python backend/scripts/rawprocessing.py
```

> Bước này tạo file `backend/data/pathfinding.db` với đầy đủ dữ liệu 6 tuyến MRT.

### Bước 6 — Chạy backend
```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```

### Bước 7 — Chạy frontend (terminal mới)
```bash
python -m http.server 8080 --directory frontend
```

### Truy cập

| Trang | URL |
|-------|-----|
| Giao diện người dùng | http://localhost:8080 |
| Giao diện admin | http://localhost:8080/admin.html |
| API docs (Swagger) | http://127.0.0.1:8000/docs |

### Reset database (nếu cần)
```bash
del backend\data\pathfinding.db        # Windows
python backend/scripts/init_db.py
python backend/scripts/rawprocessing.py
```

---

## Hướng dẫn sử dụng

### Trang người dùng (`index.html`)

1. Mở http://localhost:8080
2. **Click lên bản đồ** để chọn điểm xuất phát — hệ thống tự snap về ga MRT gần nhất, hiển thị tên ga và tuyến
3. **Click lần 2** để chọn điểm đến
4. Nhấn **"Tìm đường"** — lộ trình xuất hiện trên bản đồ cùng thông tin: số ga, khoảng cách, tuyến sử dụng
5. Nhấn **"Xóa tất cả"** để bắt đầu lại
6. Nhấn **✕** trên card điểm xuất phát / điểm đến để xóa riêng từng điểm

**Khi admin đóng tuyến/ga:**
- Nếu bạn đã chọn đủ 2 điểm, route tự động cập nhật sau ≤ 3 giây
- Nếu không tìm được đường: hiển thị popup thông báo tuyến/ga bị đóng → hỏi có muốn thử ga lân cận không

### Trang admin (`admin.html`)

1. Mở http://localhost:8080/admin.html
2. Đăng nhập: **admin / admin123**
3. Giao diện có **3 tab**:

**Tab "Tìm đường"**
- Click bản đồ để chọn điểm xuất phát → điểm đến
- Nhấn **"Tìm đường"** để tìm lộ trình với kịch bản hiện tại
- Route tự động cập nhật khi bạn đóng/mở tuyến hoặc ga

**Tab "Tuyến"**
- Danh sách 6 tuyến MRT
- Nhấn **"Mở"** để đóng tuyến (nút chuyển thành "Đóng", tuyến trên bản đồ chuyển xám + gạch nét đứt)
- Nhấn **"Đóng"** để mở lại tuyến

**Tab "Ga"**
- Tìm kiếm ga bằng ô tìm kiếm
- Nhấn **"Mở"** để đóng ga (marker chuyển đỏ, to hơn)
- Nhấn **"Đóng"** để mở lại ga

**Panel "Đang áp dụng"** (cuối sidebar)
- Danh sách tất cả kịch bản đang hoạt động
- Nhấn **"Mở lại"** để xóa từng kịch bản
- Nhấn **"Mở lại tất cả"** để reset toàn bộ

---

## API Endpoints

### Authentication

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| POST | `/auth/login` | Đăng nhập, nhận JWT token | Không |

**Request body:**
```json
{ "username": "admin", "password": "admin123" }
```
**Response:**
```json
{ "access_token": "eyJ...", "token_type": "bearer" }
```

---

### Pathfinding

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| GET | `/api/lines` | Danh sách 6 tuyến MRT | Không |
| GET | `/api/stations` | Danh sách 143 ga + trạng thái đóng/mở | Không |
| GET | `/api/nearest_station` | Ga gần nhất theo tọa độ | Không |
| GET | `/api/nearby_stations` | N ga gần nhất theo tọa độ | Không |
| GET | `/api/network` | Mạng lưới MRT đầy đủ để vẽ bản đồ | Không |
| GET | `/api/route` | Tìm đường từ tọa độ A → tọa độ B | Không |
| POST | `/api/reload` | Reload graph từ DB (sau khi chạy lại rawprocessing) | Không |

**`GET /api/route`** — Query params:
```
?start_lat=1.3521&start_lon=103.8198&goal_lat=1.3299&goal_lon=103.8474
```
**Response thành công (200):**
```json
{
  "start_station": { "id": 1, "name": "Buona Vista", "lat": 1.307, "lon": 103.789 },
  "end_station":   { "id": 42, "name": "Bishan", ... },
  "path": [ {"id": 1, "name": "Buona Vista", ...}, ... ],
  "segments": [
    {
      "from_id": 1, "to_id": 5, "line_id": 2,
      "line_name": "MRT East-West Line", "line_short": "EWL",
      "line_color": "#009530",
      "coords": [[1.307, 103.789], [1.310, 103.795], ...]
    }
  ],
  "distance": 15420,
  "num_stations": 8
}
```
**Response thất bại (404):**
```json
{
  "detail": {
    "message": "Không tìm được đường đi",
    "blocked": {
      "lines": [{ "id": 2, "name": "MRT East-West Line", "short_name": "EWL", "color": "#009530" }],
      "stations": [{ "id": 55, "name": "Bishan" }]
    }
  }
}
```

**`GET /api/nearby_stations`** — Query params:
```
?lat=1.3521&lon=103.8198&limit=5
```

---

### Scenarios

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| GET | `/api/scenarios` | Danh sách kịch bản đang hoạt động | Không |
| POST | `/api/scenarios/close_line` | Đóng một tuyến | Admin JWT |
| POST | `/api/scenarios/close_station` | Đóng một ga | Admin JWT |
| DELETE | `/api/scenarios/{id}` | Xóa một kịch bản | Admin JWT |
| DELETE | `/api/scenarios` | Xóa tất cả kịch bản | Admin JWT |

**POST `/api/scenarios/close_line`:**
```json
{ "line_id": 2, "line_name": "MRT East-West Line" }
```
**POST `/api/scenarios/close_station`:**
```json
{ "station_id": 55, "station_name": "Bishan" }
```

---

## Mô tả các file quan trọng

### `backend/scripts/rawprocessing.py`

Xử lý dữ liệu OSM thô từ `export.json` và nhập vào database.

**Quy trình:**
1. Load `export.json` (OSM nodes, ways, relations)
2. Xây dựng `node_map` (id → lat/lon) và `way_map` (id → [node ids])
3. Với mỗi tuyến MRT: đọc relations → tìm các ga (nodes có tag `railway=stop`)
4. `normalize_name()` — chuẩn hóa tên ga (bỏ suffix `(EW2)`, `(NS1)`,...)
5. `chain_ways()` — nối các way thành chuỗi nodes liên tục theo thứ tự
6. `closest_chain_node()` — tìm vị trí của ga trên chuỗi chain
7. Trích xuất geometry (tọa độ points) giữa 2 ga liền kề
8. Insert vào DB: `lines`, `stations`, `connections`, `rail_geometry`, `line_stops`

**6 tuyến được hỗ trợ:**
| Code | Tên đầy đủ | Màu |
|------|-----------|-----|
| NSL | MRT North-South Line | `#dc241f` (đỏ) |
| EWL | MRT East-West Line | `#009530` (xanh lá) |
| CCL | MRT Circle Line | `#FF9A00` (cam) |
| DTL | MRT Downtown Line | `#0354a6` (xanh dương) |
| NEL | MRT North East Line | `#9016b2` (tím) |
| TEL | MRT Thomson-East Coast Line | `#9D5B25` (nâu) |

---

### `backend/app/services/pathfinding.py`

**Class `PathfindingService`** — Singleton, load từ DB khi khởi động.

| Thuộc tính | Kiểu | Mô tả |
|-----------|------|-------|
| `nodes` | `Dict[int, (lat, lon)]` | Tọa độ tất cả ga |
| `adj_list` | `Dict[int, List[(neighbor, conn_id)]]` | Danh sách kề |
| `edges` | `Dict[int, {from, to, weight, line_id}]` | Thông tin cạnh |
| `original_weights` | `Dict[int, float]` | Trọng số gốc (bất biến) |
| `current_weights` | `Dict[int, float]` | Trọng số hiện tại (thay đổi khi có kịch bản) |
| `lines` | `Dict[int, dict]` | Thông tin tuyến |

| Phương thức | Mô tả |
|------------|-------|
| `haversine(lat1, lon1, lat2, lon2)` | Tính khoảng cách địa lý thực (mét) theo công thức Haversine |
| `find_nearest_station(lat, lon)` | Duyệt tất cả node, trả về ID ga có khoảng cách Haversine nhỏ nhất |
| `a_star(start_id, goal_id)` | A\* với `current_weights`, trả về list ID ga trên đường đi |
| `a_star_original(start_id, goal_id)` | A\* với `original_weights` (không có kịch bản), dùng để phân tích chặn |
| `find_path(start_lat, start_lon, goal_lat, goal_lon)` | Entry point: snap về ga gần nhất → A\* → build segments |
| `find_blocking_info(...)` | Chạy `a_star_original` → kiểm tra tuyến/ga nào bị đóng nằm trên đường gốc |
| `close_line(line_id)` | Set `current_weights[cid] = inf` cho tất cả cạnh thuộc tuyến |
| `open_line(line_id)` | Khôi phục `current_weights[cid]` về `original_weights[cid]` |
| `close_station(station_id)` | Set inf cho tất cả cạnh có `from` hoặc `to` = station_id |
| `open_station(station_id)` | Khôi phục trọng số cho tất cả cạnh của ga |

**Thuật toán A\*:**
```
1. Khởi tạo open_set = [(f=0, start_id)], g_score = {start: 0}
2. Lấy node current có f nhỏ nhất từ open_set
3. Nếu current == goal → truy vết came_from → trả đường đi
4. Với mỗi neighbor (cạnh không bị chặn, weight ≠ inf):
   - tentative_g = g_score[current] + weight
   - Nếu tentative_g < g_score[neighbor]:
     - Cập nhật came_from, g_score
     - f = tentative_g + haversine(neighbor, goal)
     - Push vào open_set
5. Trả về None nếu không có đường
```

---

### `backend/app/services/scenario.py`

**Class `ScenarioService`** — Quản lý danh sách kịch bản đang hoạt động.

Mỗi kịch bản là một dict:
```python
# close_line
{ "id": 1, "type": "close_line", "line_id": 2, "line_name": "MRT East-West Line" }

# close_station
{ "id": 2, "type": "close_station", "station_id": 55, "station_name": "Bishan" }
```

| Phương thức | Mô tả |
|------------|-------|
| `close_line(line_id, line_name)` | Gọi `PathfindingService.close_line()` + thêm vào `active_scenarios` |
| `close_station(station_id, station_name)` | Gọi `PathfindingService.close_station()` + thêm vào `active_scenarios` |
| `remove_scenario(scenario_id)` | Xóa kịch bản khỏi list → gọi `_replay_all()` để tính lại |
| `clear_all()` | Gọi `reset_weights_in_ram()` → xóa toàn bộ `active_scenarios` |
| `_replay_all()` | Reset weights → áp dụng lại toàn bộ kịch bản còn lại theo thứ tự |
| `closed_station_ids()` | Trả về set các station_id đang bị đóng |

---

### `frontend/js/map.js`

Quản lý Leaflet map, vẽ mạng lưới và đường đi.

| Hàm | Mô tả |
|-----|-------|
| `initMap()` | Tạo Leaflet map, giới hạn bounds về Singapore (`maxBounds`), tạo `routePane` (z-index 450) |
| `_addSingaporeMask()` | Vẽ polygon tối che vùng ngoài Singapore bằng `maskPane` |
| `drawNetwork(networkData)` | Vẽ polylines theo từng tuyến với màu thực tế |
| `drawStations(stations)` | Vẽ circle markers tất cả ga (5px, màu theo tuyến) |
| `setClickedMarker(lat, lon, type)` | Marker bán trong tại điểm user click (xanh/đỏ) |
| `setStationMarker(station, type)` | Marker label nổi tại ga được snap |
| `drawRoute(segments)` | Vẽ route: border (weight 18, màu tuyến) + white line (weight 9) trên `routePane` |
| `clearRoute()` | Xóa tất cả marker click + route layers |

---

### `frontend/js/pathfinding.js`

Logic trang người dùng.

| Hàm | Mô tả |
|-----|-------|
| `startScenarioPolling()` | Poll `GET /api/scenarios` mỗi 3s; nếu fingerprint thay đổi → gọi `findRoute()` lại |
| `loadNetwork()` | Fetch `/api/network` → `drawNetwork()` |
| `loadStations()` | Fetch `/api/stations` → `drawStations()` + render legend |
| `setupMapClick()` | Xử lý click bản đồ: gọi `/api/nearest_station` → lưu start/end station |
| `setupButtons()` | Gắn event cho btn-find, btn-clear, btn-clear-start, btn-clear-end |
| `findRoute()` | Gọi `/api/route` → nếu ok: vẽ route; nếu lỗi: hiện modal 2 bước |
| `showModal(title, bodyHtml, buttons)` | Helper: hiện modal overlay, trả Promise resolve(buttonIndex) |
| `buildBlockedBodyHtml(blocked)` | Tạo HTML danh sách tuyến/ga bị đóng cho modal |
| `tryAlternativeStations(origStart, origEnd)` | Fetch 4 ga lân cận cho mỗi điểm, thử từng combo, trả đường đi đầu tiên tìm được |
| `renderResult(data, altNote)` | Hiển thị kết quả: số ga, khoảng cách, tuyến dùng, danh sách ga |
| `renderBlockedBox(blocked)` | Hiển thị ô đỏ trong sidebar liệt kê tuyến/ga bị đóng |

**Luồng khi không tìm được đường:**
```
findRoute() → 404
  → drawRoute([])          // xóa route cũ
  → renderBlockedBox()     // hiển thị sidebar blocked info
  → Modal 1: "Không tìm được đường" + danh sách bị chặn → [OK]
  → Modal 2: "Phải di chuyển ra ga xa hơn. Đồng ý không?" → [Đồng ý] / [Hủy]
     Hủy  → dừng
     Đồng ý → tryAlternativeStations()
               → Tìm được: drawRoute() + renderResult() với note
               → Không được: Modal "Không tìm được kể cả ga lân cận"
```

---

### `frontend/js/admin.js`

Logic trang admin.

| Hàm | Mô tả |
|-----|-------|
| `handleLogin()` | Gọi `Auth.login()` → show dashboard → `initAdminDashboard()` |
| `initAdminDashboard()` | Tạo adminMap, fetch lines/network/stations, vẽ bản đồ, load scenarios |
| `switchTab(tab)` | Ẩn/hiện 3 panels (route, lines, stations) |
| `drawAdminNetwork()` | Vẽ polylines mạng lưới, bind tooltip tên tuyến |
| `drawAdminStations()` | Vẽ circle markers ga trên `stationPane` (z-index 500, luôn trên route) |
| `toggleLine(lineId, lineName)` | Đóng/mở tuyến: gọi API → `refreshNetworkStyle()` → `autoRefreshAdminRoute()` |
| `refreshNetworkStyle()` | Cập nhật màu + opacity + dashArray cho từng polyline tuyến |
| `toggleStation(stationId, stationName)` | Đóng/mở ga: gọi API → `refreshStationStyle()` → `autoRefreshAdminRoute()` |
| `refreshStationStyle()` | Cập nhật màu + kích thước marker cho từng ga |
| `loadScenarios()` | Fetch `/api/scenarios` → rebuild closedLines/closedStations → render scenario list |
| `filterStations(query)` | Lọc danh sách ga theo tên |
| `setupRouteClick()` | Click map → snap → lưu routeStartStation / routeEndStation |
| `findAdminRoute()` | Tương tự `findRoute()` nhưng trên adminMap, có modal 2 bước |
| `tryAdminAlternativeStations()` | Thử ga lân cận thay thế trên admin |
| `drawAdminRoute(segments)` | Vẽ route trên adminMap (cùng style: border 18 + white 9) |
| `autoRefreshAdminRoute()` | Gọi `findAdminRoute()` tự động sau mỗi toggle |
| `removeScenario(id)` | DELETE `/api/scenarios/{id}` → reload scenarios |
| `showModal()` / `buildBlockedBodyHtml()` | Giống bên user page |

---

## Không gian bài toán & Thuật toán

### Biểu diễn đồ thị

| Thành phần | Biểu diễn | Số lượng |
|-----------|-----------|---------|
| Node | Ga MRT | 143 ga |
| Cạnh có hướng | Kết nối liền kề giữa 2 ga trên cùng tuyến | 330 kết nối |
| Trọng số | Khoảng cách Haversine (mét) | — |

Đồ thị có **hướng** (A→B và B→A là 2 cạnh riêng) vì lịch sử OSM có thể có geometry khác nhau theo 2 chiều.

### Thuật toán A\*

**Hàm heuristic:** Khoảng cách Haversine giữa node hiện tại và đích (admissible — không bao giờ ước lượng cao hơn thực tế).

**Cơ chế kịch bản:**
| Kịch bản | Cơ chế | Tác động |
|---------|--------|---------|
| Đóng tuyến | `current_weights[cid] = ∞` cho tất cả cạnh thuộc tuyến | A\* bỏ qua toàn bộ tuyến đó |
| Đóng ga | `current_weights[cid] = ∞` cho tất cả cạnh có đầu tại ga | A\* không thể đi qua ga đó |

Khi xóa kịch bản: `_replay_all()` reset toàn bộ weights về gốc rồi áp lại từng kịch bản còn lại — đảm bảo tính nhất quán khi có nhiều kịch bản chồng nhau.

### Phân tích nguyên nhân không tìm được đường

Khi A\* thất bại:
1. Chạy `a_star_original()` — A\* trên trọng số gốc (không kịch bản)
2. Duyệt từng node trên đường gốc → kiểm tra có trong `closed_station_ids()` không
3. Duyệt từng cạnh trên đường gốc → kiểm tra tuyến có trong `closed_line_ids` không
4. Trả về danh sách tuyến/ga bị đóng làm nguyên nhân

### Tìm ga thay thế

Khi không có đường và người dùng đồng ý:
1. Fetch 4 ga gần nhất cho điểm xuất phát (loại ga gốc)
2. Fetch 4 ga gần nhất cho điểm đến (loại ga gốc)
3. Thử tuần tự: `alt_start_1 → orig_end`, `alt_start_2 → orig_end`, ..., `orig_start → alt_end_1`, ...
4. Trả về đường đầu tiên tìm được kèm note gợi ý cho người dùng

### Database Schema

```sql
CREATE TABLE lines (
    id INTEGER PRIMARY KEY,
    name TEXT, short_name TEXT, color TEXT
);

CREATE TABLE stations (
    id INTEGER PRIMARY KEY,
    name TEXT, lat REAL, lon REAL
);

CREATE TABLE connections (
    id INTEGER PRIMARY KEY,
    from_id INTEGER, to_id INTEGER,
    weight REAL,          -- khoảng cách Haversine (mét)
    line_id INTEGER,
    FOREIGN KEY (from_id) REFERENCES stations(id),
    FOREIGN KEY (to_id)   REFERENCES stations(id)
);

CREATE TABLE rail_geometry (
    id INTEGER PRIMARY KEY,
    from_id INTEGER, to_id INTEGER, line_id INTEGER,
    geometry TEXT    -- JSON array [[lat, lon], ...]
);

CREATE TABLE line_stops (
    line_id INTEGER, direction_id INTEGER,
    seq INTEGER, station_id INTEGER,
    PRIMARY KEY (line_id, direction_id, seq)
);

CREATE TABLE admin (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    hashed_password TEXT,
    role TEXT DEFAULT 'admin'
);
```

---

## Tài khoản mặc định

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |

---

## Quick Start (Windows)

```powershell
cd "C:\HUST\AI Project\IT3160-Project-GoogleMap"
venv\Scripts\Activate.ps1
del backend\data\pathfinding.db
python backend/scripts/init_db.py
python backend/scripts/rawprocessing.py
python -m uvicorn backend.app.main:app --reload --port 8000
# Terminal mới:
python -m http.server 8080 --directory "C:\HUST\AI Project\IT3160-Project-GoogleMap\frontend"
```

Truy cập:
- http://localhost:8080
- http://localhost:8080/admin.html
