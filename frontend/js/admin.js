/* ===== ADMIN MODULE =====
 * Quản lý kịch bản Đóng tuyến.
 * Mỗi tuyến hiển thị như một toggle button.
 */

let adminMap;
let allLines       = [];
let networkLayers  = {};  // line_id -> [polyline, ...]
let closedLines    = new Set();  // line_id

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login').onclick = handleLogin;
    document.getElementById('password').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleLogin();
    });
});

async function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const ok = await Auth.login(username, password);
    if (ok) {
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('dashboard').style.display  = 'flex';
        await initAdminDashboard();
    } else {
        document.getElementById('login-error').textContent = 'Sai username hoặc password!';
    }
}

async function initAdminDashboard() {
    // Khởi tạo map
    adminMap = L.map('admin-map').setView([1.3521, 103.8198], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(adminMap);

    // Nạp dữ liệu song song
    const [linesRes, networkRes] = await Promise.all([
        fetch(`${CONFIG.API_BASE}/api/lines`),
        fetch(`${CONFIG.API_BASE}/api/network`)
    ]);
    allLines = await linesRes.json();
    const networkData = await networkRes.json();

    drawAdminNetwork(networkData);
    renderLinesList();
    await loadScenarios();

    document.getElementById('btn-logout').onclick = () => {
        Auth.logout();
        document.getElementById('dashboard').style.display  = 'none';
        document.getElementById('login-page').style.display = 'flex';
    };

    document.getElementById('btn-clear-all').onclick = async () => {
        if (!confirm('Mở lại tất cả các tuyến?')) return;
        await fetch(`${CONFIG.API_BASE}/api/scenarios`, {
            method: 'DELETE', headers: Auth.headers()
        });
        closedLines.clear();
        refreshNetworkStyle();
        await loadScenarios();
    };
}

function drawAdminNetwork(networkData) {
    networkData.forEach(line => {
        networkLayers[line.id] = [];
        line.segments.forEach(coords => {
            if (coords.length < 2) return;
            const poly = L.polyline(coords, {
                color:   line.color,
                weight:  5,
                opacity: 0.8
            }).addTo(adminMap);
            poly.bindTooltip(line.name, { sticky: true });
            networkLayers[line.id].push(poly);
        });
    });
}

function renderLinesList() {
    const container = document.getElementById('lines-list');
    container.innerHTML = '';
    allLines.forEach(line => {
        const item = document.createElement('div');
        item.className  = 'line-toggle-item';
        item.id         = `line-item-${line.id}`;
        item.innerHTML  = `
            <div class="line-toggle-info">
                <span class="line-color-dot" style="background:${line.color}"></span>
                <span class="line-toggle-name">${line.short_name} – ${line.name}</span>
            </div>
            <button class="btn-toggle open" id="btn-line-${line.id}"
                    onclick="toggleLine(${line.id}, '${line.name}')">
                Mở
            </button>
        `;
        container.appendChild(item);
    });
}

async function toggleLine(lineId, lineName) {
    if (closedLines.has(lineId)) {
        // Tìm và xóa kịch bản đóng tuyến này
        const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`, {
            headers: Auth.headers()
        });
        const scenarios = await res.json();
        const sc = scenarios.find(s => s.line_id === lineId);
        if (sc) {
            await fetch(`${CONFIG.API_BASE}/api/scenarios/${sc.id}`, {
                method: 'DELETE', headers: Auth.headers()
            });
        }
        closedLines.delete(lineId);
    } else {
        await fetch(`${CONFIG.API_BASE}/api/scenarios/close_line`, {
            method: 'POST',
            headers: Auth.headers(),
            body: JSON.stringify({ line_id: lineId, line_name: lineName })
        });
        closedLines.add(lineId);
    }
    refreshNetworkStyle();
    await loadScenarios();
}

function refreshNetworkStyle() {
    Object.entries(networkLayers).forEach(([lineIdStr, polys]) => {
        const lineId = parseInt(lineIdStr);
        const isClosed = closedLines.has(lineId);
        const lineInfo = allLines.find(l => l.id === lineId);
        polys.forEach(poly => {
            poly.setStyle({
                color:   isClosed ? '#6b7280' : (lineInfo ? lineInfo.color : '#888'),
                opacity: isClosed ? 0.35 : 0.8,
                dashArray: isClosed ? '8 6' : null
            });
        });
        // Cập nhật nút toggle
        const btn = document.getElementById(`btn-line-${lineId}`);
        if (btn) {
            if (isClosed) {
                btn.textContent = 'Đóng';
                btn.className   = 'btn-toggle closed';
            } else {
                btn.textContent = 'Mở';
                btn.className   = 'btn-toggle open';
            }
        }
    });
}

async function loadScenarios() {
    const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`, {
        headers: Auth.headers()
    });
    if (!res.ok) return;
    const scenarios = await res.json();

    // Đồng bộ closedLines với server state
    closedLines.clear();
    scenarios.forEach(s => {
        if (s.type === 'close_line') closedLines.add(s.line_id);
    });
    refreshNetworkStyle();

    const list = document.getElementById('scenario-list');
    list.innerHTML = '';
    if (scenarios.length === 0) {
        list.innerHTML = '<li class="no-scenario">Không có tuyến nào bị đóng</li>';
        return;
    }
    scenarios.forEach(s => {
        const li = document.createElement('li');
        li.className = 'scenario-item';
        const lineInfo = allLines.find(l => l.id === s.line_id);
        const color = lineInfo ? lineInfo.color : '#888';
        li.innerHTML = `
            <div class="scenario-info">
                <span class="s-dot" style="background:${color}"></span>
                <span class="s-name">${s.line_name}</span>
            </div>
            <button class="btn-remove" onclick="removeScenario(${s.id})">Mở lại</button>
        `;
        list.appendChild(li);
    });
}

async function removeScenario(id) {
    await fetch(`${CONFIG.API_BASE}/api/scenarios/${id}`, {
        method: 'DELETE', headers: Auth.headers()
    });
    await loadScenarios();
}
