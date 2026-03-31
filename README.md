Singapore MRT Pathfinding
Ứng dụng tìm đường đi tối ưu trên mạng lưới tàu điện ngầm MRT Singapore, sử dụng thuật toán A*.

Mục lục

Giới thiệu
Tính năng
Công nghệ sử dụng
Cấu trúc project
Cài đặt và chạy
Hướng dẫn sử dụng
Không gian bài toán


Giới thiệu
Project xây dựng ứng dụng tìm đường đi ngắn nhất giữa 2 ga trên mạng lưới MRT Singapore. Người dùng nhập tên ga xuất phát và ga đích, hệ thống sẽ tìm lộ trình tối ưu dựa trên khoảng cách địa lý thực tế (Haversine). Quản trị viên có thể tạo các tình huống giao thông như đóng ga, bảo trì đường ray, tắc nghẽn để mô phỏng thực tế.

Tính năng
Người dùng

Xem toàn bộ mạng lưới MRT trên bản đồ Singapore
Tìm đường đi ngắn nhất giữa 2 ga bằng search box autocomplete
Xem lộ trình chi tiết: danh sách ga, khoảng cách, số ga dừng
Bản đồ OSM tile zoom được như Google Maps

Quản trị viên

Đăng nhập bảo mật bằng JWT
Đóng ga: chặn hoàn toàn 1 ga, A* tự động tìm đường vòng
Bảo trì đường ray: chặn đoạn ray giữa 2 ga liền kề
Tắc nghẽn: tăng chi phí di chuyển qua 1 ga
Xóa từng kịch bản hoặc xóa tất cả
Hiển thị danh sách kịch bản đang hoạt động


Công nghệ sử dụng
Backend:

Python 3.x
FastAPI + Uvicorn
SQLite3
python-jose (JWT)
passlib + bcrypt

Frontend:

HTML / CSS / JavaScript
Leaflet.js (bản đồ)
OpenStreetMap tile

Dữ liệu:

OpenStreetMap qua Overpass Turbo


Cấu trúc project
IT3160-Railway-Singapore/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py          # Endpoint đăng nhập
│   │   │   ├── path.py          # Endpoint tìm đường, lấy ga
│   │   │   └── scenarios.py     # Endpoint quản lý kịch bản
│   │   ├── services/
│   │   │   ├── pathfinding.py   # Thuật toán A*, quản lý đồ thị
│   │   │   ├── scenario.py      # Quản lý kịch bản giao thông
│   │   │   └── auth.py          # JWT, xác thực
│   │   ├── dependencies/
│   │   │   └── access_control.py
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── data/
│   │   └── pathfinding.db       # SQLite database
│   └── scripts/
│       ├── init_db.py           # Tạo bảng, tạo admin
│       ├── rawprocessing.py     # Xử lý dữ liệu OSM
│       ├── stations.json        # Dữ liệu ga từ OSM
│       └── railways.json        # Dữ liệu đường ray từ OSM
├── frontend/
│   ├── index.html               # Giao diện người dùng
│   ├── admin.html               # Giao diện quản trị
│   ├── css/
│   │   ├── style.css
│   │   └── admin.css
│   └── js/
│       ├── config.js
│       ├── map.js
│       ├── pathfinding.js
│       ├── auth.js
│       └── admin.js
├── requirements.txt
└── .env

Cài đặt và chạy
Yêu cầu

Python 3.10+
Git

Bước 1 — Clone project
bashgit clone https://github.com/hovietmanh/IT3160-Railway-Singapore.git
cd IT3160-Railway-Singapore
Bước 2 — Tạo môi trường ảo
bashpython -m venv venv

# Windows
venv\Scripts\Activate.ps1

# Mac/Linux
source venv/bin/activate
Bước 3 — Cài thư viện
bashpip install -r requirements.txt
Bước 4 — Cấu hình .env
Tạo file .env ở thư mục gốc:
envSECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
DB_PATH=backend/data/pathfinding.db
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
Bước 5 — Tạo database và nhập dữ liệu
bashpython backend/scripts/init_db.py
python backend/scripts/rawprocessing.py
Bước 6 — Chạy backend
bashpython -m uvicorn backend.app.main:app --reload --port 8000
Bước 7 — Chạy frontend
Mở terminal mới:
bashpython -m http.server 8080 --directory frontend
Truy cập
TrangURLGiao diện người dùnghttp://localhost:8080Giao diện adminhttp://localhost:8080/admin.htmlAPI docs (Swagger)http://127.0.0.1:8000/docs

Hướng dẫn sử dụng
Người dùng

Mở http://localhost:8080
Gõ tên ga xuất phát vào ô Điểm xuất phát → chọn ga từ gợi ý
Gõ tên ga đích vào ô Điểm đến → chọn ga từ gợi ý
Nhấn Tìm đường → lộ trình hiện trên bản đồ

Quản trị viên

Mở http://localhost:8080/admin.html
Đăng nhập: admin / admin123
Chọn loại kịch bản:

Đóng ga: click vào ga cần đóng
Bảo trì ray: click 2 ga liền kề → nhấn Áp dụng
Tắc nghẽn: click ga → điền hệ số → nhấn Áp dụng


Xem danh sách kịch bản ở phần dưới sidebar
Nhấn ✕ để xóa từng kịch bản hoặc Xóa tất cả để reset


Không gian bài toán
Biểu diễn đồ thị

Node: Ga MRT (163 ga)
Cạnh: Kết nối trực tiếp giữa 2 ga liền kề trên cùng đường ray
Trọng số: Khoảng cách Haversine giữa 2 ga (mét)

Thuật toán A*

Hàm chi phí g(n): Tổng khoảng cách từ ga xuất phát đến ga hiện tại
Hàm heuristic h(n): Khoảng cách Haversine từ ga hiện tại đến ga đích
Tối ưu: Tổng khoảng cách địa lý ngắn nhất

Cơ chế kịch bản
LoạiCơ chếTác độngĐóng gaweight = ∞ cho tất cả cạnh vào/ra gaA* bỏ qua ga đóBảo trì rayweight = ∞ cho cạnh giữa 2 ga chỉ địnhA* đi đường vòngTắc nghẽnweight × penalty cho cạnh vào/ra gaA* ưu tiên tránh ga đó

Tài khoản mặc định
UsernamePasswordRoleadminadmin123admin