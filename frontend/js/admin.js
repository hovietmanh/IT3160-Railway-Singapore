let adminMap, allStations = [];
let currentMode = 'block';
let maintFrom = null, maintTo = null;
let penaltyStation = null;

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
        initAdminMap();
    } else {
        document.getElementById('login-error').textContent = 'Sai username hoặc password!';
    }
}

async function initAdminMap() {
    adminMap = L.map('admin-map').setView([1.3521, 103.8198], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(adminMap);

    const res = await fetch(`${CONFIG.API_BASE}/api/stations`);
    allStations = await res.json();
    drawAdminStations();
    loadScenarios();
    setupModeButtons();
    setupActions();
}

function drawAdminStations() {
    allStations.forEach(s => {
        const m = L.circleMarker([s.lat, s.lon], {
            radius: 7, fillColor: '#22c55e',
            color: '#fff', weight: 1.5, fillOpacity: 1
        }).addTo(adminMap).bindTooltip(s.name, { permanent: false });
        m.on('click', () => handleStationClick(s, m));
        s._marker = m;
    });
}

function handleStationClick(s, marker) {
    if (currentMode === 'block') {
        blockStation(s, marker);
    } else if (currentMode === 'maintenance') {
        if (!maintFrom) {
            maintFrom = s;
            document.getElementById('maint-from').textContent = s.name;
            marker.setStyle({ fillColor: '#f59e0b' });
        } else if (!maintTo && s.id !== maintFrom.id) {
            maintTo = s;
            document.getElementById('maint-to').textContent = s.name;
            marker.setStyle({ fillColor: '#f59e0b' });
        }
    } else if (currentMode === 'penalty') {
        if (penaltyStation) {
            const prev = allStations.find(st => st.id === penaltyStation.id);
            if (prev && prev._marker) prev._marker.setStyle({ fillColor: '#22c55e' });
        }
        penaltyStation = s;
        document.getElementById('penalty-station').textContent = s.name;
        marker.setStyle({ fillColor: '#3b82f6' });
    }
}

async function blockStation(s, marker) {
    const res = await fetch(`${CONFIG.API_BASE}/api/scenarios/block`, {
        method: 'POST',
        headers: Auth.headers(),
        body: JSON.stringify({ station_id: s.id, station_name: s.name })
    });
    if (res.ok) {
        marker.setStyle({ fillColor: '#dc2626' });
        loadScenarios();
    } else {
        alert('Lỗi khi đóng ga!');
    }
}

function setupModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;

            document.getElementById('block-panel').style.display      = currentMode === 'block'       ? 'flex' : 'none';
            document.getElementById('maintenance-panel').style.display = currentMode === 'maintenance' ? 'flex' : 'none';
            document.getElementById('penalty-panel').style.display     = currentMode === 'penalty'     ? 'flex' : 'none';

            maintFrom = maintTo = penaltyStation = null;
            document.getElementById('maint-from').textContent     = 'Chưa chọn';
            document.getElementById('maint-to').textContent       = 'Chưa chọn';
            document.getElementById('penalty-station').textContent = 'Chưa chọn';
            allStations.forEach(s => {
                if (s._marker) s._marker.setStyle({ fillColor: '#22c55e' });
            });
        };
    });
}

function setupActions() {
    document.getElementById('btn-maint-apply').onclick = async () => {
        if (!maintFrom || !maintTo) { alert('Vui lòng chọn 2 ga!'); return; }
        const res = await fetch(`${CONFIG.API_BASE}/api/scenarios/maintenance`, {
            method: 'POST',
            headers: Auth.headers(),
            body: JSON.stringify({
                from_id: maintFrom.id, from_name: maintFrom.name,
                to_id:   maintTo.id,   to_name:   maintTo.name
            })
        });
        if (res.ok) {
            maintFrom = maintTo = null;
            document.getElementById('maint-from').textContent = 'Chưa chọn';
            document.getElementById('maint-to').textContent   = 'Chưa chọn';
            allStations.forEach(s => { if (s._marker) s._marker.setStyle({ fillColor: '#22c55e' }); });
            loadScenarios();
        } else {
            const err = await res.json();
            alert('Lỗi: ' + (err.detail || 'Không thể áp dụng bảo trì'));
            maintFrom = maintTo = null;
            document.getElementById('maint-from').textContent = 'Chưa chọn';
            document.getElementById('maint-to').textContent   = 'Chưa chọn';
            allStations.forEach(s => { if (s._marker) s._marker.setStyle({ fillColor: '#22c55e' }); });
        }
    };

    document.getElementById('btn-penalty-apply').onclick = async () => {
        if (!penaltyStation) { alert('Vui lòng chọn ga!'); return; }
        const penalty = parseFloat(document.getElementById('penalty-value').value);
        if (penalty < 1.1) { alert('Hệ số penalty phải >= 1.1!'); return; }
        const res = await fetch(`${CONFIG.API_BASE}/api/scenarios/penalty`, {
            method: 'POST',
            headers: Auth.headers(),
            body: JSON.stringify({
                station_id:   penaltyStation.id,
                station_name: penaltyStation.name,
                penalty
            })
        });
        if (res.ok) {
            penaltyStation = null;
            document.getElementById('penalty-station').textContent = 'Chưa chọn';
            allStations.forEach(s => { if (s._marker) s._marker.setStyle({ fillColor: '#22c55e' }); });
            loadScenarios();
        } else {
            alert('Lỗi khi áp dụng penalty!');
        }
    };

    document.getElementById('btn-clear-all').onclick = async () => {
        if (!confirm('Xóa tất cả kịch bản?')) return;
        await fetch(`${CONFIG.API_BASE}/api/scenarios`, {
            method: 'DELETE', headers: Auth.headers()
        });
        allStations.forEach(s => { if (s._marker) s._marker.setStyle({ fillColor: '#22c55e' }); });
        loadScenarios();
    };

    document.getElementById('btn-logout').onclick = () => {
        Auth.logout();
        document.getElementById('dashboard').style.display  = 'none';
        document.getElementById('login-page').style.display = 'flex';
    };
}

async function loadScenarios() {
    const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`, {
        headers: Auth.headers()
    });
    if (!res.ok) return;
    const scenarios = await res.json();
    const list = document.getElementById('scenario-list');
    list.innerHTML = '';
    scenarios.forEach(s => {
        const li = document.createElement('li');
        li.className = 'scenario-item';
        let label = '';
        if (s.type === 'block')       label = `Đóng ga: ${s.station_name}`;
        if (s.type === 'maintenance') label = `Bảo trì: ${s.from_name} ↔ ${s.to_name}`;
        if (s.type === 'penalty')     label = `Tắc nghẽn: ${s.station_name} (x${s.penalty})`;
        li.innerHTML = `
            <div>
                <span class="s-type ${s.type}">${s.type}</span>
                <span class="s-name"> ${label}</span>
            </div>
            <button class="btn-remove" onclick="removeScenario(${s.id})">✕</button>
        `;
        list.appendChild(li);
    });
}

async function removeScenario(id) {
    if (!confirm('Xóa kịch bản này?')) return;
    await fetch(`${CONFIG.API_BASE}/api/scenarios/${id}`, {
        method: 'DELETE', headers: Auth.headers()
    });
    allStations.forEach(s => { if (s._marker) s._marker.setStyle({ fillColor: '#22c55e' }); });
    loadScenarios();
}