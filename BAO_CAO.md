# BÁO CÁO PHÂN TÍCH CHI TIẾT — BACKEND & FRONTEND
## Dự án: Singapore MRT Navigator
### Môn: IT3160 — Nhập môn Trí tuệ Nhân tạo

> **Hướng dẫn:** Các mục đánh dấu `[TODO: ...]` là phần bạn cần tự điền thêm (nhận xét, ảnh chụp màn hình, phân tích chủ quan). Phần còn lại đã được điền sẵn từ code thực tế.

---

## Mục lục

- [1. Công nghệ sử dụng](#1-công-nghệ-sử-dụng)
- [2. Cấu trúc thư mục dự án](#2-cấu-trúc-thư-mục-dự-án)
- [3. Phân tích chi tiết Backend](#3-phân-tích-chi-tiết-backend)
  - [3.1 Kiến trúc tổng thể](#31-kiến-trúc-tổng-thể)
  - [3.2 Cơ sở dữ liệu](#32-cơ-sở-dữ-liệu)
  - [3.3 Xác thực và phân quyền](#33-xác-thực-và-phân-quyền)
  - [3.4 Thuật toán tìm đường ngắn nhất](#34-thuật-toán-tìm-đường-ngắn-nhất)
  - [3.5 Quản lý kịch bản](#35-quản-lý-kịch-bản)
  - [3.6 API Endpoints](#36-api-endpoints)
- [4. Phân tích chi tiết Frontend](#4-phân-tích-chi-tiết-frontend)
  - [4.1 Kiến trúc tổng thể Frontend](#41-kiến-trúc-tổng-thể-frontend)
  - [4.2 Module dùng chung](#42-module-dùng-chung)
  - [4.3 Giao diện người dùng](#43-giao-diện-người-dùng)
  - [4.4 Giao diện Admin](#44-giao-diện-admin)
  - [4.5 Luồng tương tác đầy đủ](#45-luồng-tương-tác-đầy-đủ)

---

# 1. Công nghệ sử dụng

## 1.1 Backend — Thư viện bên ngoài (requirements.txt)

| Công nghệ | Phiên bản | Vai trò |
|-----------|----------|---------|
| **FastAPI** | ≥ 0.115.0 | Web framework chính: định nghĩa REST routes, dependency injection, tự sinh Swagger UI tại `/docs` |
| **Uvicorn** | ≥ 0.30.6 | ASGI server chạy ứng dụng FastAPI |
| **python-jose** | 3.3.0 | Tạo và giải mã JWT với thuật toán HS256 |
| **passlib** | 1.7.4 | Wrapper hash mật khẩu (`CryptContext`), giao diện thống nhất cho bcrypt |
| **bcrypt** | 4.0.1 | Thuật toán băm mật khẩu thực tế, có built-in salt, chống brute-force |
| **pydantic** | ≥ 2.10.0 | Validate request/response body, định nghĩa schema với `BaseModel` |
| **pydantic-settings** | ≥ 2.5.0 | Đọc biến môi trường từ `.env` với `BaseSettings`, tự validate kiểu |
| **python-multipart** | ≥ 0.0.12 | Bắt buộc để FastAPI xử lý OAuth2 và form-data |

## 1.2 Backend — Python Standard Library

| Công nghệ | Phiên bản | Vai trò |
|-----------|----------|---------|
| `sqlite3` | (built-in) | Kết nối và truy vấn SQLite bằng raw SQL |
| `math` | (built-in) | Tính toán Haversine (`sin`, `cos`, `atan2`, `sqrt`) |
| `heapq` | (built-in) | Priority queue (min-heap) cho thuật toán A* |
| `json` | (built-in) | Đọc file OSM JSON, serialize/deserialize geometry |
| `pathlib` | (built-in) | Thao tác đường dẫn file đa nền tảng |
| `contextlib` | (built-in) | `@contextmanager` cho context manager kết nối DB |
| `typing` | (built-in) | Type hints `Dict`, `List`, `Optional` |
| `datetime` | (built-in) | Tính thời hạn JWT (`timedelta`, `datetime.utcnow()`) |
| `collections` | (built-in) | `defaultdict` nhóm ga theo tuyến khi xử lý OSM |
| `urllib.request` | (built-in) | Gọi Overpass API lấy geometry LRT |
| `xml.etree.ElementTree` | (built-in) | Parse XML trả về từ OSM API |

## 1.3 Frontend

| Công nghệ | Phiên bản | Vai trò |
|-----------|----------|---------|
| **HTML5** | — | Cấu trúc giao diện người dùng và admin |
| **CSS3** | — | Styling, CSS custom properties, `@keyframes` cho animation |
| **JavaScript (ES2020)** | — | Toàn bộ logic frontend: tìm đường, bản đồ, xác thực, polling kịch bản |
| **Leaflet.js** | 1.9.4 | Bản đồ tương tác: tile layer, polyline tuyến, marker ga, popup |
| **Fetch API** | (built-in) | Gọi REST API backend bất đồng bộ (async/await) |
| **OpenStreetMap Tiles** | — | Tile server bản đồ nền miễn phí, không cần API key |

## 1.4 Dữ liệu & Công cụ phát triển

| Công nghệ | Phiên bản | Vai trò |
|-----------|----------|---------|
| **OpenStreetMap (OSM)** | — | Nguồn dữ liệu địa lý mở: tọa độ ga, hình dạng đường ray Singapore |
| **Overpass Turbo** | — | Truy vấn OSM, xuất 9 tuyến MRT/LRT ra `MRT.json` + `LRT.json` |
| **Git** | — | Quản lý phiên bản mã nguồn |

## 1.5 Lý do lựa chọn công nghệ

| Tiêu chí | Lựa chọn | Thay thế đã cân nhắc |
|---------|---------|---------------------|
| Backend framework | FastAPI | Flask (không async, không tự sinh docs), Django (quá nặng) |
| Database | SQLite | PostgreSQL (cần server riêng, overkill cho 181 ga) |
| Pathfinding | Tự implement A* (`heapq`) | NetworkX (thư viện ngoài, không cần thiết với đồ thị nhỏ) |
| Bản đồ | Leaflet.js | Google Maps API (tính phí), Mapbox (tính phí) |
| Frontend | Vanilla JS | React/Vue (cần build tool, quá phức tạp cho project này) |
| Auth | JWT stateless | Session-based (cần lưu state server, phức tạp hơn) |
| Đọc `.env` | `pydantic-settings` | `python-dotenv` (không dùng — pydantic-settings đã tích hợp sẵn) |

---

# 2. Cấu trúc thư mục dự án

```
IT3160-Project-GoogleMap/                  ← Thư mục gốc dự án
│
├── .env                                   ← Biến môi trường (SECRET_KEY, DB_PATH, ...)
├── .gitignore                             ← Bỏ qua venv/, __pycache__/, .env, *.db
├── requirements.txt                       ← Danh sách thư viện Python cần cài
├── README.md                              ← Hướng dẫn cài đặt và chạy dự án
├── BAO_CAO.md                             ← File báo cáo phân tích chi tiết (file này)
├── check_db.py                            ← Script tiện ích: xem nhanh nội dung DB
│
├── backend/                               ← Toàn bộ server-side (Python / FastAPI)
│   │
│   ├── app/                               ← Package chính của ứng dụng FastAPI
│   │   ├── main.py                        ← Entry point: tạo FastAPI app, CORS, startup
│   │   ├── config.py                      ← Đọc .env qua pydantic-settings
│   │   ├── database.py                    ← Context manager kết nối SQLite
│   │   │
│   │   ├── api/                           ← Lớp REST: định nghĩa routes
│   │   │   ├── auth.py                    ← POST /auth/login
│   │   │   ├── path.py                    ← GET /api/route, /api/stations, /api/network ...
│   │   │   └── scenarios.py               ← POST/DELETE /api/scenarios/...
│   │   │
│   │   ├── services/                      ← Business logic (tách khỏi HTTP layer)
│   │   │   ├── auth.py                    ← bcrypt verify + tạo/giải mã JWT
│   │   │   ├── pathfinding.py             ← Singleton: đồ thị RAM, A*, Haversine, snap
│   │   │   └── scenario.py                ← Singleton: active_scenarios, replay_all
│   │   │
│   │   ├── schemas/                       ← Pydantic models: validate request/response
│   │   │   ├── auth.py                    ← LoginRequest, TokenResponse
│   │   │   └── scenario.py                ← CloseLineRequest, CloseStationRequest
│   │   │
│   │   ├── dependencies/
│   │   │   └── access_control.py          ← Dependency require_admin (kiểm tra JWT)
│   │   │
│   │   └── models/                        ← (Reserved — chưa dùng ORM)
│   │
│   ├── data/
│   │   └── pathfinding.db                 ← SQLite database (tạo bởi init_db.py)
│   │
│   └── scripts/                           ← Công cụ xây dựng & kiểm tra dữ liệu
│       ├── MRT.json                       ← Dữ liệu OSM thô: 6 tuyến MRT
│       ├── LRT.json                       ← Dữ liệu OSM thô: 3 tuyến LRT
│       ├── mrt_lines_mapping.json         ← Mapping ref → tên tuyến, màu sắc
│       ├── rawprocessing.py               ← ETL: OSM JSON → stations/connections/geometry
│       ├── init_db.py                     ← Tạo schema + tạo tài khoản admin mặc định
│       ├── patch_lrt.py                   ← Patch thủ công geometry LRT nếu cần
│       └── check.py                       ← Script kiểm tra chất lượng dữ liệu sau ETL
│
├── frontend/                              ← Toàn bộ client-side (HTML/CSS/JS thuần)
│   │
│   ├── index.html                         ← Trang người dùng: tìm đường MRT
│   ├── admin.html                         ← Trang quản trị: đăng nhập + dashboard
│   │
│   ├── css/
│   │   ├── style.css                      ← Styles trang người dùng (sidebar, cards, map)
│   │   └── admin.css                      ← Styles trang admin (login transit-theme, dashboard)
│   │
│   ├── js/
│   │   ├── config.js                      ← CONFIG.API_BASE — URL backend dùng chung
│   │   ├── utils.js                       ← showModal, buildBlockedBodyHtml, tryAlternativeRoute
│   │   ├── auth.js                        ← Auth object: JWT storage, login/logout/headers
│   │   ├── map.js                         ← Leaflet: init map, vẽ mạng lưới/ga/route/markers
│   │   ├── pathfinding.js                 ← User page: click state machine, polling, findRoute
│   │   └── admin.js                       ← Admin page: login, tabs, toggleLine/Station, adminMap
│   │
│   └── map/
│       └── map.png                        ← Ảnh sơ đồ mạng lưới MRT tham khảo
│
└── venv/                                  ← Python virtual environment (không commit)
```

---

# 3. Phân tích chi tiết Backend

## 3.1 Kiến trúc tổng thể

### 3.1.1 Tổng quan framework và công nghệ

Backend được xây dựng bằng **Python 3.10+** với framework **FastAPI**, chạy trên server **Uvicorn** (ASGI). Lựa chọn này mang lại:

| Yếu tố | Giải thích |
|--------|-----------|
| **FastAPI** | Framework hiện đại, tự động sinh Swagger UI tại `/docs`, hỗ trợ async và type hints |
| **Uvicorn** | ASGI server hiệu suất cao, phù hợp với ứng dụng I/O bound |
| **SQLite** | Cơ sở dữ liệu nhúng, không cần cài đặt server riêng, phù hợp với quy mô dự án |
| **python-jose** | Tạo và xác thực JSON Web Token (JWT) |
| **passlib + bcrypt** | Hàm băm mật khẩu an toàn, chống brute-force |
| **pydantic-settings** | Đọc cấu hình từ file `.env`, tự động validate kiểu dữ liệu |

### 3.1.2 Cấu trúc module

```
backend/
├── app/
│   ├── main.py               ← Entry point: khởi tạo FastAPI, đăng ký router
│   ├── config.py             ← Đọc .env (SECRET_KEY, DB_PATH, ALLOWED_ORIGINS...)
│   ├── database.py           ← Context manager kết nối SQLite
│   │
│   ├── api/                  ← Lớp REST: định nghĩa route, validate request/response
│   │   ├── auth.py           ← POST /auth/login
│   │   ├── path.py           ← GET /api/route, /api/stations, /api/network...
│   │   └── scenarios.py      ← POST/DELETE /api/scenarios/...
│   │
│   ├── services/             ← Lớp business logic
│   │   ├── pathfinding.py    ← PathfindingService: đồ thị, A*, Haversine
│   │   ├── scenario.py       ← ScenarioService: quản lý kịch bản
│   │   └── auth.py           ← JWT tạo/xác thực, bcrypt verify
│   │
│   ├── schemas/              ← Pydantic models: validate dữ liệu vào/ra
│   │   ├── auth.py           ← LoginRequest, TokenResponse
│   │   └── scenario.py       ← CloseLineRequest, CloseStationRequest
│   │
│   └── dependencies/
│       └── access_control.py ← Dependency require_admin: kiểm tra JWT
│
└── scripts/
    ├── init_db.py            ← Tạo bảng + tạo admin mặc định
    ├── rawprocessing.py      ← Đọc OSM data → xử lý → lưu vào DB
    ├── MRT.json              ← Dữ liệu OSM thô (MRT 6 tuyến)
    └── LRT.json              ← Dữ liệu OSM thô (LRT 3 tuyến)
```

### 3.1.3 Sơ đồ kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FastAPI Application                          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     CORS Middleware                           │   │
│  │         (cho phép frontend localhost:8080 truy cập)          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│          ┌───────────────────┼───────────────────┐                  │
│          ▼                   ▼                   ▼                  │
│   ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐        │
│   │  auth.py    │   │   path.py    │   │  scenarios.py    │        │
│   │ /auth/login │   │ /api/route   │   │ /api/scenarios/  │        │
│   └──────┬──────┘   └──────┬───────┘   └────────┬─────────┘        │
│          │                 │                    │                   │
│          ▼                 ▼                    ▼                   │
│   ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐        │
│   │  auth       │   │ Pathfinding  │   │   Scenario       │        │
│   │  Service    │   │  Service     │◄──│   Service        │        │
│   │ (JWT+bcrypt)│   │ (A* + graph) │   │ (active_scenar.) │        │
│   └─────────────┘   └──────┬───────┘   └──────────────────┘        │
│                             │                                       │
│                             ▼                                       │
│                    ┌──────────────────┐                             │
│                    │   SQLite DB      │                             │
│                    │  pathfinding.db  │                             │
│                    └──────────────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.1.4 Startup và khởi tạo Singleton

Khi server khởi động (`@app.on_event("startup")`), hệ thống thực hiện:

1. **Load đồ thị** vào RAM: `PathfindingService` đọc toàn bộ bảng `stations`, `connections`, `lines` từ SQLite vào các dict Python — giúp tìm đường không cần truy vấn DB trong thời gian thực.
2. **Khởi tạo ScenarioService**: singleton quản lý trạng thái các kịch bản đang áp dụng.
3. Hai service đều là **Singleton** (biến module-level `_service`), đảm bảo trạng thái nhất quán giữa các request.

---

## 3.2 Cơ sở dữ liệu

### 3.2.1 Lược đồ cơ sở dữ liệu (Database Schema)

```
┌──────────────┐     ┌─────────────────────────────┐     ┌────────────────┐
│    lines     │     │         connections          │     │   stations     │
│──────────────│     │─────────────────────────────│     │────────────────│
│ id  (PK)     │◄────│ line_id   (FK → lines.id)   │────►│ id  (PK)       │
│ name         │     │ from_id   (FK → stations.id) │     │ name           │
│ short_name   │     │ to_id     (FK → stations.id) │     │ lat            │
│ color        │     │ weight    (Haversine, mét)   │     │ lon            │
└──────────────┘     │ id  (PK)                    │     └────────────────┘
                     └─────────────────────────────┘
                                  │
              ┌───────────────────┼────────────────────┐
              ▼                   ▼                    ▼
   ┌──────────────────┐  ┌─────────────────┐  ┌─────────────┐
   │  rail_geometry   │  │   line_stops    │  │    admin    │
   │──────────────────│  │─────────────────│  │─────────────│
   │ id  (PK)         │  │ line_id   (FK)  │  │ id  (PK)    │
   │ from_id   (FK)   │  │ direction_id    │  │ username    │
   │ to_id     (FK)   │  │ seq             │  │ hashed_pwd  │
   │ line_id   (FK)   │  │ station_id (FK) │  │ role        │
   │ geometry  (JSON) │  └─────────────────┘  └─────────────┘
   └──────────────────┘
```

### 3.2.2 Mô tả chi tiết các bảng

#### Bảng `lines` — Tuyến đường
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | INTEGER PK | Định danh tuyến (1=NSL, 2=EWL, ..., 9=BPLRT) |
| `name` | TEXT | Tên đầy đủ ("MRT North-South Line") |
| `short_name` | TEXT | Tên viết tắt ("NSL") |
| `color` | TEXT | Mã màu hex thực tế ("#dc241f") |

#### Bảng `stations` — Ga
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | INTEGER PK | Node ID lấy trực tiếp từ OSM |
| `name` | TEXT | Tên ga đã được chuẩn hóa |
| `lat` / `lon` | REAL | Tọa độ địa lý |

#### Bảng `connections` — Kết nối (cạnh đồ thị)
Mỗi cặp ga liền kề tạo ra **2 cạnh có hướng** (A→B và B→A):

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `from_id` / `to_id` | INTEGER FK | Ga đầu và ga cuối |
| `weight` | REAL | Khoảng cách Haversine tính bằng mét |
| `line_id` | INTEGER FK | Thuộc tuyến nào |

#### Bảng `rail_geometry` — Hình học đường ray
Lưu tọa độ trung gian của đoạn ray giữa 2 ga để vẽ đường cong thực tế:

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `from_id` / `to_id` | INTEGER FK | Cặp ga |
| `geometry` | TEXT | JSON array: `[[lat, lon], [lat, lon], ...]` |

#### Bảng `line_stops` — Thứ tự ga trên tuyến
Ghi lại thứ tự các ga theo từng hướng đi, phục vụ vẽ mạng lưới liên tục trên bản đồ.

#### Bảng `admin` — Tài khoản quản trị
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `username` | TEXT UNIQUE | Tên đăng nhập |
| `hashed_password` | TEXT | Mật khẩu đã băm bằng bcrypt |
| `role` | TEXT | Vai trò ("admin") |

### 3.2.3 Thu thập dữ liệu từ OpenStreetMap

Dữ liệu bản đồ được thu thập từ **OpenStreetMap (OSM)** thông qua công cụ **Overpass Turbo**:

**Truy vấn Overpass cho MRT:**
```
[out:json][timeout:60];
(relation["route"~"subway|light_rail|monorail"]["network"="Singapore Rail"];);
>>;
out body;
```

Dữ liệu xuất ra có cấu trúc JSON gồm 3 loại phần tử:
- **node**: Điểm địa lý (ga, điểm trên đường ray) với `lat`, `lon`, `tags`
- **way**: Đoạn đường ray, chứa danh sách `node` IDs theo thứ tự
- **relation**: Tuyến đường, liên kết các `way` và `node` (ga) theo thứ tự

> **Lưu ý kỹ thuật:** Phải dùng `out body;` thay vì `out geom;` để node giữ nguyên `name` tag. Với `out geom;`, tên ga bị mất, không thể nhận diện ga.

**9 tuyến được hỗ trợ:**
| Code | Tên đầy đủ | Màu | Loại |
|------|-----------|-----|------|
| NSL | MRT North-South Line | `#dc241f` | MRT |
| EWL | MRT East-West Line | `#009530` | MRT |
| CCL | MRT Circle Line | `#FF9A00` | MRT |
| DTL | MRT Downtown Line | `#0354a6` | MRT |
| NEL | MRT North East Line | `#9016b2` | MRT |
| TEL | MRT Thomson-East Coast Line | `#9D5B25` | MRT |
| SKLRT | LRT Sengkang Line | `#4A6741` | LRT |
| PGLRT | LRT Punggol Line | `#007A85` | LRT |
| BPLRT | LRT Bukit Panjang Line | `#C0306A` | LRT |

### 3.2.4 Xử lý dữ liệu thô (`rawprocessing.py`)

Script này đọc `MRT.json` + `LRT.json` và tạo toàn bộ dữ liệu trong database.

#### Quy trình tổng thể

```
MRT.json ──┐
           ├──► Xây dựng node_map + way_map
LRT.json ──┘
                    │
                    ▼
        Nhóm các OSM relation theo tuyến (ref tag)
                    │
                    ▼
        Với mỗi tuyến:
          ├── 1. Dedup tên ga → canonical_stations
          ├── 2. Dedup hướng đi → unique_dirs
          └── 3. Với mỗi hướng:
                ├── Map tên → canonical station ID
                ├── Chain ways → chuỗi node liên tục
                ├── Trích xuất segment geometry
                └── Tạo connection (s1, s2, weight, line_id)
                    │
                    ▼
        INSERT vào DB: lines, stations, connections,
                       rail_geometry, line_stops
```

#### Chi tiết các bước xử lý

**Bước 1 — Chuẩn hóa tên ga (`normalize_name`)**

OSM ghi tên ga với các suffix không nhất quán:

| Tên gốc trong OSM | Tên sau chuẩn hóa |
|-------------------|------------------|
| `Tampines (EW2)` | `Tampines` |
| `Sengkang - West Loop ↻` | `Sengkang` |
| `Choa Chu Kang - Line A` | `Choa Chu Kang` |

```python
def normalize_name(name: str) -> str:
    name = name.split("(")[0].strip()   # bỏ "(EW2)"
    name = name.split(" - ")[0].strip() # bỏ "- West Loop"
    return name
```

**Bước 2 — Dedup station (canonical_stations)**

Mỗi hướng đi trong OSM dùng node ID khác nhau cho cùng một ga vật lý. Giải pháp: dùng **tên ga làm key** (sau chuẩn hóa), chỉ giữ node đầu tiên thấy. Điều này tự động xử lý ga trung chuyển MRT↔LRT (ví dụ: cả DTL và BPLRT đều có "Bukit Panjang" → cùng một node).

**Bước 3 — Dedup hướng đi**

Hai hướng đi A→B và B→A của cùng tuyến cho ra cùng tập kết nối. Dedup bằng cách:
- Lấy tuple tên ga theo thứ tự, đảo ngược nếu cần về dạng chuẩn (tên đầu ≤ tên cuối)
- Nếu canonical_names đã thấy → bỏ qua

**Bước 4 — Ghép nối các way thành chain (`chain_ways`)**

Một tuyến OSM có nhiều `way` riêng lẻ. Hàm `chain_ways` nối chúng thành một chuỗi node liên tục bằng cách khớp đầu/cuối của từng đoạn:

```
way_1: [A, B, C]
way_2: [C, D, E]   → chain: [A, B, C, D, E, F]
way_3: [E, F]
```

**Bước 5 — Trích xuất geometry (sequential windowed search)**

Với mỗi cặp ga liền kề (s1, s2), trích xuất sub-chain giữa chúng:

```python
# Tracking vị trí tuần tự trong chain (giải quyết vấn đề vòng lặp BPLRT)
chain_pos = 0
for s1, s2 in consecutive_stops:
    i1 = closest_chain_node_fwd(chain, chain_pos, s1.lat, s1.lon, window=200)
    i2 = closest_chain_node_fwd(chain, i1, s2.lat, s2.lon, window=200)
    chain_pos = i2
    geometry = chain[i1 : i2+1]   # sub-chain giữa hai ga
```

> **Kỹ thuật quan trọng:** Dùng **forward windowed search** (tìm trong cửa sổ 200 node về phía trước) thay vì global search. Điều này xử lý tuyến BPLRT — một tuyến vòng lặp (CCK → feeder → loop → feeder → CCK) nơi ga "Bukit Panjang" xuất hiện 2 lần trong chain. Global search có thể khớp bản sao sai, tạo geometry chạy quanh toàn bộ vòng lặp.

> **Phát hiện hướng chain:** Trước khi xử lý, dùng global search để xác định hướng chain (thuận hay nghịch so với thứ tự ga), sau đó dùng forward hoặc backward tracking phù hợp.

### 3.2.5 Kết nối và truy vấn cơ sở dữ liệu

File `database.py` cung cấp context manager:

```python
@contextmanager
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # cho phép truy cập cột bằng tên
    try:
        yield conn
    finally:
        conn.close()
```

Tất cả truy vấn đều dùng **parameterized query** (`?` placeholder) để tránh SQL injection.

**Ví dụ truy vấn tiêu biểu:**
```sql
-- Lấy danh sách ga cùng các tuyến đi qua
SELECT DISTINCT l.id, l.name, l.short_name, l.color
FROM connections c
JOIN lines l ON c.line_id = l.id
WHERE c.from_id = ?
```

---

## 3.3 Xác thực và phân quyền

### 3.3.1 Tổng quan cơ chế bảo mật

Hệ thống sử dụng **JWT (JSON Web Token)** để xác thực stateless — server không cần lưu session, mọi thông tin đã được mã hóa trong token.

**Luồng đăng nhập:**

```
Client                    Server
  │                          │
  │── POST /auth/login ──────►│
  │   {username, password}   │
  │                          │── Tra cứu user trong DB
  │                          │── bcrypt.verify(password, hashed_pwd)
  │                          │── Tạo JWT token (payload: username, role, exp)
  │◄── {access_token} ───────│
  │                          │
  │── GET /api/scenarios ────►│ (Không cần auth)
  │                          │
  │── POST /api/scenarios/   │
  │   close_line             │
  │   Authorization: Bearer  │
  │   <token>          ──────►│── Giải mã JWT
  │                          │── Kiểm tra role == "admin"
  │◄── 200 OK ────────────────│
```

### 3.3.2 Mã hóa mật khẩu (bcrypt)

Mật khẩu **không bao giờ lưu dạng plain text**. Khi tạo tài khoản:

```python
hashed_password = bcrypt.hash("admin123")
# → "$2b$12$..." (60 ký tự, không thể đảo ngược)
```

Khi đăng nhập:
```python
bcrypt.verify(plain_password, hashed_password)  # → True / False
```

Bcrypt có built-in **salt** và **cost factor** — ngay cả hai người dùng cùng mật khẩu cũng có hash khác nhau.

### 3.3.3 JWT Token

Token được tạo với payload:
```python
{
    "sub": "admin",      # username
    "role": "admin",     # phân quyền
    "exp": 1234567890    # thời hạn (60 phút)
}
```

Ký bằng `HS256` và `SECRET_KEY` lưu trong `.env`. Token hết hạn tự động sau 60 phút (cấu hình trong `ACCESS_TOKEN_EXPIRE_MINUTES`).

### 3.3.4 Bảo vệ endpoint (Dependency Injection)

```python
# dependencies/access_control.py
def require_admin(token: str = Depends(oauth2_scheme)) -> dict:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403)
    return payload

# Sử dụng trong route:
@router.post("/api/scenarios/close_line")
def close_line(req: CloseLineRequest,
               _=Depends(require_admin)):  # ← bảo vệ endpoint
    ...
```

Nếu token thiếu, sai, hoặc hết hạn → trả về `401 Unauthorized`. Nếu không có quyền admin → `403 Forbidden`.

---

## 3.4 Thuật toán tìm đường ngắn nhất

### 3.4.1 Biểu diễn đồ thị

Mạng lưới MRT được biểu diễn là **đồ thị có hướng có trọng số (Directed Weighted Graph)**:

| Thành phần | Ý nghĩa | Số lượng |
|-----------|---------|---------|
| **Đỉnh (Node)** | Mỗi ga MRT/LRT | 181 ga |
| **Cạnh (Edge)** | Kết nối giữa 2 ga liền kề trên cùng tuyến | 418 cạnh (bidirectional) |
| **Trọng số** | Khoảng cách Haversine (mét) | — |

Mỗi cặp ga liền kề tạo **2 cạnh** (A→B và B→A) vì trong một số trường hợp geometry hai chiều có thể khác nhau.

### 3.4.2 Cấu trúc dữ liệu trong RAM

`PathfindingService` load toàn bộ đồ thị vào RAM khi khởi động:

```python
nodes:            Dict[int, (lat, lon)]     # tọa độ ga
adj_list:         Dict[int, List[(nb, cid)]]  # danh sách kề
edges:            Dict[int, {from, to, weight, line_id}]
original_weights: Dict[int, float]          # trọng số gốc (bất biến)
current_weights:  Dict[int, float]          # trọng số hiện tại (thay đổi theo kịch bản)
```

Phân tách `original_weights` và `current_weights` cho phép đóng/mở tuyến/ga tức thời mà không cần đọc lại DB.

### 3.4.3 Hàm khoảng cách Haversine

Tính khoảng cách thực tế giữa 2 điểm địa lý trên mặt cầu Trái Đất:

```
a = sin²(Δlat/2) + cos(lat₁) × cos(lat₂) × sin²(Δlon/2)
d = R × 2 × atan2(√a, √(1−a))
```

Trong đó R = 6,371,000 mét (bán kính Trái Đất). Kết quả tính bằng **mét**, dùng làm:
- **Trọng số cạnh** (distance thực tế giữa 2 ga)
- **Hàm heuristic** của A* (ước lượng khoảng cách còn lại đến đích)

> **Admissible heuristic:** Haversine là khoảng cách đường chim bay — luôn ≤ khoảng cách thực tế theo đường ray. Do đó heuristic không bao giờ overestimate → A* đảm bảo tìm được đường **tối ưu**.

### 3.4.4 Thuật toán A*

#### Pseudo-code

```
A*(start, goal):
    open_set  = MinHeap{(f=0, start)}
    g_score   = {start: 0}
    came_from = {}
    closed    = {}

    while open_set không rỗng:
        current = pop node có f nhỏ nhất

        if current ∈ closed: bỏ qua
        closed.add(current)

        if current == goal:
            return trace_path(came_from, goal)

        for (neighbor, conn_id) in adj_list[current]:
            w = current_weights[conn_id]
            if w == ∞: bỏ qua   ← cạnh bị chặn (kịch bản)

            tentative_g = g_score[current] + w
            if tentative_g < g_score.get(neighbor, ∞):
                came_from[neighbor] = current
                g_score[neighbor]   = tentative_g
                f = tentative_g + haversine(neighbor, goal)
                open_set.push((f, neighbor))

    return None  ← không có đường
```

#### Phân tích độ phức tạp

| | Giá trị |
|--|---------|
| **Thời gian** | O((V + E) log V) với V = 181, E = 418 → rất nhanh |
| **Không gian** | O(V) cho g_score, came_from, closed |
| **Thực tế** | < 1ms cho mọi truy vấn |

#### So sánh với Dijkstra

| Tiêu chí | Dijkstra | A* (dự án này) |
|---------|----------|----------------|
| Heuristic | Không | Haversine (admissible) |
| Đảm bảo tối ưu | Có | Có |
| Số node mở rộng | Nhiều hơn | Ít hơn (hướng về đích) |
| Phù hợp bản đồ địa lý | Không | **Có** ✓ |

### 3.4.5 Snap điểm click về ga gần nhất

Khi người dùng click lên bản đồ, tọa độ click được snap về ga MRT gần nhất:

```python
def find_nearest_station(lat, lon) -> int:
    return min(nodes.keys(),
               key=lambda nid: haversine(lat, lon, *nodes[nid]))
```

Duyệt toàn bộ 181 ga, tính Haversine từng cái, trả về ID ga có khoảng cách nhỏ nhất. O(V) nhưng V = 181 → thực tế tức thì.

### 3.4.6 Phân tích nguyên nhân khi thất bại

Khi A* với `current_weights` không tìm được đường, hệ thống phân tích nguyên nhân:

```
1. Chạy a_star_original() — A* trên original_weights (không có kịch bản)
   → Tìm đường đi "tự nhiên" không bị ảnh hưởng kịch bản

2. Với mỗi ga trên đường gốc:
   → Kiểm tra có trong closed_station_ids không
   → Nếu có: đó là ga bị đóng gây chặn

3. Với mỗi cạnh trên đường gốc:
   → Kiểm tra tuyến có trong closed_line_ids không
   → Nếu có: đó là tuyến bị đóng gây chặn

4. Trả về {lines: [...], stations: [...]} → frontend hiển thị
```

### 3.4.7 Tìm ga thay thế

Khi không tìm được đường và người dùng đồng ý thử ga lân cận:

```
1. Fetch 4 ga gần nhất cho điểm xuất phát (loại trừ ga gốc)
2. Fetch 4 ga gần nhất cho điểm đến (loại trừ ga gốc)

3. Thử tuần tự 8 kết hợp:
   alt_start_1 → orig_end
   alt_start_2 → orig_end
   alt_start_3 → orig_end
   alt_start_4 → orig_end
   orig_start  → alt_end_1
   orig_start  → alt_end_2
   orig_start  → alt_end_3
   orig_start  → alt_end_4

4. Trả về đường đi đầu tiên tìm được + thông báo cho người dùng
```

---

## 3.5 Quản lý kịch bản

### 3.5.1 Cấu trúc dữ liệu kịch bản

`ScenarioService` lưu danh sách kịch bản đang hoạt động trong RAM (không lưu vào DB — reset khi restart server):

```python
active_scenarios: List[Dict] = [
    # Kịch bản đóng tuyến
    {
        "id":        1,               # auto-increment
        "type":      "close_line",
        "line_id":   2,
        "line_name": "MRT East-West Line"
    },
    # Kịch bản đóng ga
    {
        "id":        2,
        "type":      "close_station",
        "station_id":   55,
        "station_name": "Bishan"
    }
]
```

### 3.5.2 Cơ chế đóng/mở tuyến và ga

**Đóng tuyến:**
```python
def close_line(line_id):
    for cid, edge in edges.items():
        if edge["line_id"] == line_id:
            current_weights[cid] = float("inf")  # A* bỏ qua cạnh này
```

**Đóng ga:**
```python
def close_station(station_id):
    for cid, edge in edges.items():
        if edge["from"] == station_id or edge["to"] == station_id:
            current_weights[cid] = float("inf")  # không thể đi vào/ra ga
```

**Mở lại:** Khôi phục `current_weights[cid] = original_weights[cid]` cho các cạnh tương ứng.

### 3.5.3 Cơ chế `_replay_all` — Đảm bảo tính nhất quán

Khi **xóa một kịch bản** (không phải xóa tất cả), không thể đơn giản "bỏ ảnh hưởng" của kịch bản đó vì các kịch bản có thể chồng chéo. Giải pháp: **replay toàn bộ từ đầu**:

```
_replay_all():
  1. reset_weights_in_ram()         ← đặt lại toàn bộ weights về gốc
  2. for s in active_scenarios:
       if s.type == "close_line"    → close_line(s.line_id)
       if s.type == "close_station" → close_station(s.station_id)
```

**Ví dụ:** Có 3 kịch bản [K1, K2, K3]. Xóa K2 → `_replay_all` áp dụng K1, K3 theo thứ tự → trạng thái đúng như ban đầu chỉ không có K2.

### 3.5.4 Luồng xử lý kịch bản đầy đủ

```
Admin click "Đóng tuyến NSL"
    │
    ├── POST /api/scenarios/close_line {line_id: 1}
    │       │
    │       ├── require_admin dependency → xác thực JWT
    │       │
    │       ├── ScenarioService.close_line(1, "NSL")
    │       │     ├── Kiểm tra đã tồn tại? → không
    │       │     ├── PathfindingService.close_line(1)
    │       │     │     └── Đặt weight=∞ cho ~46 cạnh NSL
    │       │     └── Append kịch bản vào active_scenarios
    │       │
    │       └── Trả về {id: 1, type: "close_line", ...}
    │
    ├── Frontend: refreshNetworkStyle()
    │     └── Vẽ lại NSL màu xám + nét đứt trên bản đồ
    │
    └── Frontend: autoRefreshAdminRoute()
          └── Gọi lại findAdminRoute() với kịch bản mới
                └── A* tự động tìm đường vòng qua NSL
```

---

## 3.6 API Endpoints

### 3.6.1 Authentication API

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| POST | `/auth/login` | Không | Đăng nhập, nhận JWT |

**Request:**
```json
POST /auth/login
{ "username": "admin", "password": "admin123" }
```

**Response 200:**
```json
{ "access_token": "eyJhbGci...", "token_type": "bearer" }
```

**Response 401:**
```json
{ "detail": "Sai username hoặc password" }
```

---

### 3.6.2 Pathfinding API

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/lines` | Không | Danh sách 9 tuyến |
| GET | `/api/stations` | Không | Danh sách 181 ga + trạng thái đóng/mở |
| GET | `/api/nearest_station` | Không | Ga gần nhất theo tọa độ |
| GET | `/api/nearby_stations` | Không | N ga gần nhất |
| GET | `/api/network` | Không | Toàn bộ mạng lưới để vẽ bản đồ |
| GET | `/api/route` | Không | Tìm đường A→B |
| POST | `/api/reload` | Không | Reload graph từ DB |

**`GET /api/route` — Tìm đường:**
```
?start_lat=1.3440&start_lon=103.7210&goal_lat=1.3545&goal_lon=103.7693
```

**Response 200 — Tìm được đường:**
```json
{
  "start_station": {"id": 7684326274, "name": "Lakeside", "lat": 1.344, "lon": 103.720},
  "end_station":   {"id": 1840076972, "name": "Hume",     "lat": 1.354, "lon": 103.769},
  "path": [
    {"id": 7684326274, "name": "Lakeside", ...},
    {"id": 7684326276, "name": "Chinese Garden", ...},
    ...
    {"id": 1840076972, "name": "Hume", ...}
  ],
  "segments": [
    {
      "from_id": 7684326274, "to_id": 7684326276,
      "line_id": 2, "line_name": "MRT East-West Line",
      "line_short": "EWL", "line_color": "#009530",
      "coords": [[1.344, 103.720], [1.345, 103.725], ...]
    },
    ...
  ],
  "distance": 14823,
  "num_stations": 14
}
```

**Response 404 — Không tìm được đường:**
```json
{
  "detail": {
    "message": "Không tìm được đường đi",
    "blocked": {
      "lines": [
        {"id": 2, "name": "MRT East-West Line", "short_name": "EWL", "color": "#009530"}
      ],
      "stations": [
        {"id": 4939486674, "name": "Choa Chu Kang"}
      ]
    }
  }
}
```

**`GET /api/network` — Dữ liệu bản đồ:**

Trả về mảng JSON cho 9 tuyến, mỗi tuyến gồm:
- `segments`: mảng polyline liên tục theo từng hướng đi (dùng để vẽ toàn bộ tuyến)
- `edges`: từng đoạn riêng lẻ giữa 2 ga kề nhau (dùng để xác định màu tuyến khi đóng/mở)

---

### 3.6.3 Scenario API

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/scenarios` | Không | Danh sách kịch bản đang áp dụng |
| POST | `/api/scenarios/close_line` | **Admin JWT** | Đóng tuyến |
| POST | `/api/scenarios/close_station` | **Admin JWT** | Đóng ga |
| DELETE | `/api/scenarios/{id}` | **Admin JWT** | Xóa 1 kịch bản |
| DELETE | `/api/scenarios` | **Admin JWT** | Xóa tất cả |

**POST `/api/scenarios/close_line`:**
```json
{ "line_id": 2, "line_name": "MRT East-West Line" }
```

**POST `/api/scenarios/close_station`:**
```json
{ "station_id": 4939486674, "station_name": "Choa Chu Kang" }
```

**Response tất cả scenario endpoints:**
```json
[
  {"id": 1, "type": "close_line",    "line_id": 2,    "line_name": "MRT East-West Line"},
  {"id": 2, "type": "close_station", "station_id": 55, "station_name": "Bishan"}
]
```

**Lưu ý về tính nhất quán:** `GET /api/scenarios` không yêu cầu auth vì frontend người dùng cũng cần poll endpoint này (mỗi 3 giây) để tự động refresh route khi admin thay đổi kịch bản.

---

## Tổng kết Backend

| Module | File chính | Vai trò |
|--------|-----------|---------|
| **Data pipeline** | `rawprocessing.py` | Thu thập + xử lý dữ liệu OSM → DB |
| **Database** | `database.py`, `init_db.py` | Schema SQLite, kết nối, khởi tạo |
| **Authentication** | `services/auth.py`, `api/auth.py`, `dependencies/` | JWT + bcrypt, bảo vệ endpoint |
| **Pathfinding** | `services/pathfinding.py` | Đồ thị RAM, A*, Haversine, snap, blocking analysis |
| **Scenario** | `services/scenario.py`, `api/scenarios.py` | Quản lý kịch bản đóng/mở, replay |
| **API Layer** | `api/path.py`, `api/auth.py`, `api/scenarios.py` | REST endpoints, build response |
| **Entry point** | `main.py`, `config.py` | FastAPI app, CORS, startup, settings |

---

# 4. Phân tích chi tiết Frontend

## 4.1 Kiến trúc tổng thể Frontend

### 4.1.1 Stack công nghệ

Frontend được xây dựng hoàn toàn bằng **Vanilla JavaScript** — không dùng framework như React hay Vue — kết hợp với thư viện bản đồ **Leaflet.js**:

| Thành phần | Công nghệ | Lý do chọn |
|-----------|----------|-----------|
| **HTML** | HTML5 (2 trang) | `index.html` (người dùng) + `admin.html` (quản trị) |
| **CSS** | CSS3 thuần + custom properties | Animations, responsive, không cần build tool |
| **JavaScript** | Vanilla ES2020 (async/await) | Nhẹ, không cần bundler, dễ deploy |
| **Bản đồ** | Leaflet.js 1.9.4 | Thư viện bản đồ mã nguồn mở phổ biến nhất |
| **Tile server** | OpenStreetMap | Miễn phí, không cần API key |

### 4.1.2 Cấu trúc thư mục

```
frontend/
├── index.html           ← Trang người dùng (tìm đường)
├── admin.html           ← Trang quản trị (đăng nhập + dashboard)
│
├── css/
│   ├── style.css        ← Styles cho trang người dùng
│   └── admin.css        ← Styles cho trang admin (gồm login + dashboard)
│
└── js/
    ├── config.js        ← Cấu hình chung (API_BASE URL)
    ├── utils.js         ← Shared utilities: Modal, blocked box, alt route
    ├── auth.js          ← Auth object: JWT storage, login/logout/headers
    ├── map.js           ← Leaflet map, vẽ mạng lưới, markers, route (user)
    ├── pathfinding.js   ← Logic tìm đường + UI cho trang người dùng
    └── admin.js         ← Toàn bộ logic cho trang admin
```

### 4.1.3 Sơ đồ phụ thuộc module

```
index.html                    admin.html
    │                              │
    ├── config.js ◄────────────────┤
    ├── utils.js  ◄────────────────┤
    ├── auth.js   (không dùng)     ├── auth.js
    ├── map.js                     └── admin.js
    └── pathfinding.js
         │                              │
         ▼                              ▼
    map.js (drawNetwork,          admin.js (tự quản lý
    drawStations,                 Leaflet map nội bộ,
    drawRoute, markers)           không dùng map.js)
```

> **Thiết kế quan trọng:** `admin.js` không import `map.js` — nó tự khởi tạo và quản lý Leaflet map riêng (`adminMap`) để tách biệt hoàn toàn trạng thái bản đồ user và bản đồ admin. Hai trang chạy độc lập, không chia sẻ biến global.

---

## 4.2 Module dùng chung

### 4.2.1 `config.js` — Cấu hình API

```javascript
const CONFIG = {
    API_BASE: 'http://127.0.0.1:8000',
};
```

Tất cả `fetch()` đều dùng `${CONFIG.API_BASE}/...`. Thay đổi URL backend chỉ cần sửa 1 chỗ.

### 4.2.2 `auth.js` — Quản lý JWT phía client

Đối tượng `Auth` là **singleton** lưu token trong RAM (biến JavaScript):

```javascript
const Auth = {
    token: null,

    async login(username, password) {
        const res = await fetch(`${CONFIG.API_BASE}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) return false;
        this.token = (await res.json()).access_token;
        return true;
    },

    logout() { this.token = null; },

    headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }
};
```

**Đặc điểm thiết kế:**
- Token **không lưu vào localStorage** — mất khi refresh trang (bảo mật tốt hơn, phù hợp với admin tool)
- `Auth.headers()` trả về object header sẵn sàng dùng trong mọi `fetch()` protected
- `Auth.logout()` xóa token khỏi RAM, không cần gọi server

### 4.2.3 `utils.js` — Tiện ích dùng chung

#### Modal (`showModal`)

Hàm dùng chung cho cả hai trang, trả về `Promise<number>` (index của button được bấm):

```javascript
async function showModal(title, bodyHtml, buttons) {
    return new Promise(resolve => {
        // Render title, body, buttons vào #mrt-modal
        // Mỗi button resolve Promise với index của nó
        document.getElementById('mrt-modal-overlay').style.display = 'flex';
    });
}
```

Ví dụ sử dụng trong luồng tìm đường thay thế:
```javascript
const choice = await showModal(
    'Tìm đường thay thế',
    'Bạn có muốn thử ga lân cận?',
    [{ label: 'Đồng ý', cls: 'confirm' }, { label: 'Hủy', cls: 'secondary' }]
);
if (choice === 1) return;  // user bấm "Hủy"
```

#### Tìm đường thay thế (`tryAlternativeRoute`)

Khi A* không tìm được đường với kịch bản hiện tại, hàm này thử 8 cặp ga lân cận:

```
tryAlternativeRoute(origStart, origEnd):
  1. Fetch 4 ga gần origStart + 4 ga gần origEnd (song song, Promise.all)
  2. Thử lần lượt:
     - alt_start_1..4 → origEnd
     - origStart → alt_end_1..4
  3. Trả về kết quả đầu tiên tìm được (data + note + altType + altStation)
  4. Nếu tất cả thất bại → trả về null
```

---

## 4.3 Giao diện người dùng

### 4.3.1 Cấu trúc giao diện

`index.html` chia thành 2 vùng bố cục:

```
┌─────────────────────────────────────────────────────┐
│  #sidebar (320px cố định)  │  #map (phần còn lại)   │
│  ─────────────────────     │                         │
│  h1: Singapore MRT Nav.    │  Leaflet map            │
│  #instruction-box          │  (toàn màn hình phải)   │
│  #start-card               │                         │
│  #end-card                 │                         │
│  .btn-row (Tìm / Xóa)      │                         │
│  #blocked-box              │                         │
│  #result-box               │                         │
│  #legend-box               │                         │
└────────────────────────────┴─────────────────────────┘
```

### 4.3.2 `map.js` — Module bản đồ Leaflet

#### Khởi tạo bản đồ

```javascript
map = L.map('map', {
    maxBounds: SG_BOUNDS,       // giới hạn Singapore
    maxBoundsViscosity: 0.8,    // kéo ra khỏi bounds thì bật lại
    minZoom: 12, maxZoom: 18,
    preferCanvas: true,         // dùng Canvas cho markers (nhanh hơn SVG)
}).setView([1.3521, 103.8198], 12);
```

**Chiến lược renderer kép:**

| Layer | Renderer | Lý do |
|-------|---------|-------|
| Network polylines (tuyến) | `L.svg({ padding: 0.5 })` | SVG panning dùng CSS matrix transform → GPU-accelerated, pan gần như tức thì |
| Route polylines (đường đi) | `L.svg({ padding: 0.5 })` | Cùng lý do, tách riêng để xóa/vẽ lại độc lập |
| Station markers | Canvas (`preferCanvas: true`) | Canvas nhanh hơn cho 181 circles nhỏ |

`padding: 0.5` có nghĩa là pre-render thêm 50% ngoài viewport — khi pan ngắn không cần redraw.

#### Vẽ mạng lưới (`drawNetwork`)

Mỗi đoạn ray giữa 2 ga được vẽ bằng **2 polyline chồng nhau**:
- `poly`: polyline hiển thị (màu tuyến, weight=4, interactive=false)
- `hit`: polyline invisible (weight=20, opacity=0) với tooltip tên tuyến — vùng bắt sự kiện rộng hơn dễ hover

```javascript
networkEdgeLayers.push({ fromId, toId, lineId, poly, hit });
```

Lưu lại mảng `networkEdgeLayers` để khi kịch bản thay đổi có thể cập nhật visibility mà không vẽ lại toàn bộ:

```javascript
function _refreshEdgeVisibility() {
    networkEdgeLayers.forEach(e => {
        const hidden = _closedLineIds.has(e.lineId)
                    || _closedStationIds.has(e.fromId)
                    || _closedStationIds.has(e.toId);
        e.poly.setStyle({ opacity: hidden ? 0 : 0.75 });
    });
}
```

#### Marker điểm chọn (`setStationMarker`)

Marker ga được chọn dùng `L.divIcon` với HTML tùy chỉnh — gồm 3 phần:

```
┌──────────────────────┐  ← Label (tên ga + nút ✕)
│  ▶  Tampines    [✕]  │
└──────────────────────┘
        │                 ← Đường kẻ dọc (3px)
        ●                 ← Điểm ghim (10px circle)
```

Nút ✕ trên marker gọi `clearPoint(type)` thông qua `L.DomEvent.stopPropagation` để không kích hoạt map click event.

#### Vẽ đường đi (`drawRoute`)

Mỗi segment cũng dùng **2 polyline**:
- `border`: polyline màu tuyến, weight=18 — tạo viền
- `white`: polyline trắng, weight=9 — lõi trắng giữa

Hiệu ứng này tạo ra đường có viền màu tuyến + lõi trắng, dễ phân biệt từng tuyến khi chuyển tuyến.

### 4.3.3 `pathfinding.js` — Logic tìm đường người dùng

#### State machine click

```
clickState = 'waiting_start'
      │
      │ (user click map)
      ▼
clickState = 'waiting_end'
      │
      │ (user click map lần 2)
      ▼
clickState = 'done'
      │
      │ (user bấm Tìm đường / Xóa)
      ▼
   quay về 'waiting_start'
```

Biến `clickState` điều phối toàn bộ luồng: click đầu → snap start, click hai → snap end, click trong trạng thái `done` bị bỏ qua.

#### Polling kịch bản

```javascript
function startScenarioPolling() {
    setInterval(async () => {
        const scenarios = await fetch(`${CONFIG.API_BASE}/api/scenarios`).then(r => r.json());
        const fp = JSON.stringify(scenarios.map(s => s.id + s.type));  // fingerprint

        if (_scenarioFingerprint === null) {
            _scenarioFingerprint = fp;
            _applyScenarioVisibility(scenarios);  // lần đầu load
        } else if (fp !== _scenarioFingerprint) {
            _scenarioFingerprint = fp;
            _applyScenarioVisibility(scenarios);  // cập nhật visibility
            if (startStation && endStation) await findRoute();  // re-route
        }
    }, 3000);
}
```

**Cơ chế fingerprint:** So sánh chuỗi `id+type` của tất cả scenarios thay vì deep-equal object — nhẹ và đủ để phát hiện thay đổi.

#### Luồng tìm đường đầy đủ

```
findRoute():
  1. Gọi GET /api/route?start_lat=...&goal_lat=...
  │
  ├── 200 OK:
  │     drawRoute(data.segments)
  │     renderResult(data, null)
  │
  └── 4xx/5xx:
        drawRoute([])             ← xóa đường cũ
        renderBlockedBox(blocked) ← hiện lý do
        showModal("Không tìm được đường")
        showModal("Thử ga thay thế?")
        │
        ├── Đồng ý:
        │     tryAlternativeRoute(start, end)
        │     ├── Tìm được → drawRoute + renderResult + di chuyển marker
        │     └── Không tìm được → showModal "Không có đường"
        │
        └── Hủy: kết thúc
```

---

## 4.4 Giao diện Admin

### 4.4.1 Trang đăng nhập

`admin.html` có 2 trang ẩn/hiện bằng `display: none/flex`:
- `#login-page` — hiển thị ban đầu
- `#dashboard` — hiển thị sau khi đăng nhập thành công

Giao diện đăng nhập có chủ đề tàu điện với:
- 5 animated background tracks chạy ngang màn hình (CSS `@keyframes train-streak`)
- SVG train illustration với rail, sleepers, wheels, headlight
- 9 ô màu tuyến MRT ở đầu card (NSL, EWL, CCL, DTL, NEL, TEL, SKLRT, PGLRT, BPLRT)
- Loading spinner khi đang xác thực

**Luồng đăng nhập (`handleLogin`):**

```
handleLogin():
  1. Lấy username + password từ input
  2. Disable button + hiện spinner "Đang xác thực..."
  3. Auth.login(username, password) → POST /auth/login
  │
  ├── true: ẩn #login-page, hiện #dashboard → initAdminDashboard()
  └── false: hiện lỗi "Sai username hoặc password!", enable button lại
```

### 4.4.2 Dashboard Admin

Sau khi đăng nhập, `initAdminDashboard()` thực hiện:

1. Khởi tạo Leaflet map (`adminMap`) với 2 SVG renderer riêng
2. Song song fetch: `GET /api/lines` + `GET /api/network` + `GET /api/stations`
3. Vẽ bản đồ: `drawAdminNetwork()` + `drawAdminStations()`
4. Render sidebar: `renderLinesList()` + `renderStationsList()`
5. Load kịch bản hiện tại: `loadScenarios()`
6. Gắn event click: `setupRouteClick()`

**Layout dashboard:**

```
┌──────────────────────────────────────────────────────────┐
│  #admin-sidebar (340px)         │  #admin-map            │
│  ─────────────────────          │                         │
│  [MRT Admin]    [Logout]        │  Leaflet map            │
│  ─────────────────────          │  (click để chọn điểm   │
│  [Tìm đường][Tuyến][Ga]  ← tabs │   + click tuyến/ga     │
│                                 │   để mở popup)         │
│  Panel nội dung tab hiện tại    │                         │
│  ─────────────────────          │                         │
│  "Đang áp dụng"                 │                         │
│    Tuyến đang đóng  [Mở lại TT] │                         │
│    Ga đang đóng     [Mở lại TT] │                         │
└─────────────────────────────────┴─────────────────────────┘
```

### 4.4.3 Quản lý tuyến và ga

#### Tab Tuyến (`panel-lines`)

Render danh sách 9 tuyến, mỗi tuyến có nút toggle Mở/Đóng:

```javascript
async function toggleLine(lineId, lineName) {
    if (closedLines.has(lineId)) {
        // Tìm scenario ID → DELETE /api/scenarios/{id}
    } else {
        // POST /api/scenarios/close_line {line_id, line_name}
    }
    refreshNetworkStyle();   // cập nhật màu polyline + text nút
    await loadScenarios();   // sync lại danh sách "đang áp dụng"
    await autoRefreshAdminRoute();  // re-route nếu đang có đường
}
```

#### Tab Ga (`panel-stations`)

Tương tự tuyến nhưng có thêm **thanh tìm kiếm** (`filterStations`):

```javascript
function filterStations(query) {
    const filtered = allStations.filter(s => s.name.toLowerCase().includes(q));
    renderStationsList(filtered);
    // Giữ nguyên trạng thái closed cho các ga đã filter
}
```

#### Map Popup

Cả tuyến lẫn ga đều có **popup khi click trên bản đồ** (`_openAdminPopup`):

```
Click vào tuyến trên bản đồ:
  → _buildLinePopupHtml(id, name, color)
  → Hiện popup: tên tuyến + nút "Đóng tuyến" / "Mở lại"
  → Click nút → toggleLineFromMap() → toggleLine()

Click vào ga trên bản đồ:
  → _buildStationPopupHtml(id, name, lines)
  → Hiện popup: tên ga + badges tuyến + nút "Đóng ga" / "Mở lại"
  → Click nút → toggleStationFromMap() → toggleStation()
```

Khi `refreshNetworkStyle()` / `refreshStationStyle()` được gọi, nếu popup đang mở thì **tự động cập nhật nội dung popup** (chuyển nút từ "Đóng" sang "Mở lại"):

```javascript
if (_currentPopup && _currentPopupType === 'line') {
    const l = allLines.find(ln => ln.id === _currentPopupId);
    if (l) _currentPopup.setContent(_buildLinePopupHtml(l.id, l.name, l.color));
}
```

### 4.4.4 Tìm đường trong Admin

Tab "Tìm đường" trong admin cho phép admin kiểm tra xem kịch bản hiện tại ảnh hưởng đến một tuyến đường cụ thể như thế nào.

State machine giống hệt user page (`routeClickState`) nhưng hoạt động độc lập:

```javascript
function setupRouteClick() {
    adminMap.on('click', async (e) => {
        // Chỉ xử lý khi tab "Tìm đường" đang hiển thị
        if (document.getElementById('panel-route').style.display === 'none') return;
        ...
    });
}
```

**Auto-refresh sau khi thay đổi kịch bản:**

```javascript
async function autoRefreshAdminRoute() {
    if (routeStartStation && routeEndStation) await findAdminRoute();
}
```

Được gọi sau mọi `toggleLine()` và `toggleStation()` — admin có thể thấy ngay tuyến đường thay đổi khi đóng/mở tuyến hay ga.

---

## 4.5 Luồng tương tác đầy đủ

### 4.5.1 Luồng người dùng tìm đường

```
Trang load
    │
    ├── initMap()
    ├── loadNetwork() → GET /api/network → drawNetwork() + renderLegend()
    ├── loadStations() → GET /api/stations → drawStations()
    ├── setupMapClick()
    ├── setupButtons()
    └── startScenarioPolling()  ← chạy ngầm mỗi 3s

User click map (điểm A)
    │
    ├── setClickedMarker(lat, lon, 'start')  ← marker chấm tròn nháp
    ├── GET /api/nearest_station?lat=...      ← snap về ga gần nhất
    ├── setStationMarker(station, 'start')    ← marker cờ hiệu
    └── renderPointCard('start', station)    ← cập nhật sidebar

User click map (điểm B) → tương tự, enable nút Tìm đường

User bấm "Tìm đường"
    │
    ├── GET /api/route?start_lat=...&goal_lat=...
    │
    ├── [200] drawRoute(segments) + renderResult(data)
    │
    └── [404] showModal + hỏi ga thay thế + tryAlternativeRoute
```

### 4.5.2 Luồng đồng bộ kịch bản (User ↔ Admin)

```
Admin đóng tuyến EWL
    │
    └── POST /api/scenarios/close_line → server cập nhật weights

[3 giây sau]

User polling:
    GET /api/scenarios → [{type:"close_line", line_id:2}]
    fingerprint thay đổi
    │
    ├── updateNetworkVisibility({2}) → ẩn polyline EWL trên bản đồ user
    ├── updateStationVisibility({})  → không đổi
    └── findRoute() → gọi lại A* → trả về đường vòng qua EWL hoặc 404
```

### 4.5.3 Luồng Admin: đăng nhập → đóng tuyến → kiểm tra

```
Admin truy cập admin.html
    │
    └── Nhập staff ID + password → handleLogin()
                │
                ├── Auth.login() → POST /auth/login → nhận JWT
                └── initAdminDashboard()
                      │
                      ├── Fetch 3 endpoints song song
                      ├── Vẽ bản đồ + sidebar
                      └── loadScenarios()

Admin chọn tab "Tuyến" → click "Đóng" NSL
    │
    ├── POST /api/scenarios/close_line {line_id:1}
    ├── closedLines.add(1)
    ├── refreshNetworkStyle() → ẩn polyline NSL
    ├── loadScenarios() → cập nhật "Đang áp dụng"
    └── autoRefreshAdminRoute() → nếu đang tìm đường → re-route ngay

Admin chuyển tab "Tìm đường" → click 2 điểm → "Tìm đường"
    │
    └── findAdminRoute() → A* với NSL đã đóng
          → hiện kết quả hoặc blocked analysis
```

---

## Tổng kết Frontend

| Module | File | Vai trò |
|--------|------|---------|
| **Config** | `config.js` | API base URL dùng chung |
| **Auth client** | `auth.js` | JWT storage, login/logout, attach Bearer header |
| **Shared utils** | `utils.js` | Modal, blocked box, alternative route search |
| **Map engine** | `map.js` | Leaflet init, SVG/Canvas renderer, vẽ tuyến/ga/route, markers |
| **User pathfinding** | `pathfinding.js` | Click state machine, scenario polling, find route flow, render kết quả |
| **Admin dashboard** | `admin.js` | Login, tab management, toggle line/station, map popup, admin route |
| **User UI** | `index.html` + `style.css` | Layout sidebar+map, point cards, result box, legend |
| **Admin UI** | `admin.html` + `admin.css` | Login page transit theme, dashboard layout, scenario lists |
