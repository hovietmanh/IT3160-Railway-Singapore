
let adminMap;
let allLines       = [];
let allStations    = [];
let networkEdgeLayers = [];  // [{fromId, toId, lineId, poly, hit}]
let stationMarkers    = {};  // station_id -> {marker, color}
let closedLines    = new Set();
let closedStations = new Set();

// ── Popup trên map ────────────────────────────────────────────────────────────
let _currentPopup     = null;
let _currentPopupType = null;  // 'station' | 'line'
let _currentPopupId   = null;

// ── Scenario ID cache (tránh re-fetch khi mở lại) ────────────────────────────
let _scenarioIdByLineId    = {};  // line_id → scenario_id
let _scenarioIdByStationId = {};  // station_id → scenario_id

// ── Pathfinding state ─────────────────────────────────────────────────────────
let routeClickState    = 'waiting_start';
let routeStartStation  = null;
let routeEndStation    = null;
let routeLayers        = [];
let routeStartMarkers  = [];  // click + snap markers của điểm xuất phát
let routeEndMarkers    = [];  // click + snap markers của điểm đến

// ── Login ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login').onclick = handleLogin;
    ['username', 'password'].forEach(id =>
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') handleLogin();
        })
    );
});

async function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const btn = document.getElementById('btn-login');
    const err = document.getElementById('login-error');

    btn.disabled = true;
    btn.style.opacity = '.7';
    btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite"></span> Đang xác thực...';
    err.textContent = '';

    if (await Auth.login(username, password)) {
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('dashboard').style.display  = 'flex';
        await initAdminDashboard();
    } else {
        err.textContent = 'Sai username hoặc password!';
        btn.disabled = false;
        btn.style.opacity = '';
        btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;flex-shrink:0"><path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/></svg> Đăng nhập hệ thống';
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────

let _adminSvgNetwork = null;
let _adminSvgRoute   = null;

async function initAdminDashboard() {
    const SG_BOUNDS = L.latLngBounds(L.latLng(1.2050, 103.6200), L.latLng(1.4710, 104.0100));
    adminMap = L.map('admin-map', {
        maxBounds: SG_BOUNDS, maxBoundsViscosity: 0.8,
        minZoom: 12, maxZoom: 18,
        preferCanvas: true,
    }).setView([1.3521, 103.8198], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        keepBuffer: 10,
        updateWhenIdle: false,
        updateWhenZooming: false,
    }).addTo(adminMap);

    adminMap.createPane('routePane').style.zIndex  = 450;
    adminMap.createPane('stationPane').style.zIndex = 500;

    _adminSvgNetwork = L.svg({ padding: 0.5 }).addTo(adminMap);
    _adminSvgRoute   = L.svg({ padding: 0.5 }).addTo(adminMap);

    const [linesRes, networkRes, stationsRes] = await Promise.all([
        fetch(`${CONFIG.API_BASE}/api/lines`),
        fetch(`${CONFIG.API_BASE}/api/network`),
        fetch(`${CONFIG.API_BASE}/api/stations`),
    ]);
    allLines      = await linesRes.json();
    allStations   = await stationsRes.json();
    const network = await networkRes.json();

    drawAdminNetwork(network);
    drawAdminStations();
    renderLinesList();
    renderStationsList(allStations);
    await loadScenarios();
    setupRouteClick();

    document.getElementById('btn-logout').onclick = () => {
        Auth.logout();
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('login-error').textContent = '';
        const btn = document.getElementById('btn-login');
        btn.disabled = false;
        btn.style.opacity = '';
        btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;flex-shrink:0"><path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/></svg> Đăng nhập hệ thống';
        document.getElementById('dashboard').style.display  = 'none';
        document.getElementById('login-page').style.display = 'flex';
    };

    document.getElementById('btn-clear-lines').onclick = async () => {
        if (!closedLines.size) return;
        if (!confirm('Mở lại tất cả tuyến đang đóng?')) return;
        await fetch(`${CONFIG.API_BASE}/api/scenarios/lines`, { method: 'DELETE', headers: Auth.headers() });
        closedLines.clear();
        refreshNetworkStyle();
        await Promise.all([loadScenarios(), autoRefreshAdminRoute()]);
    };

    document.getElementById('btn-clear-stations').onclick = async () => {
        if (!closedStations.size) return;
        if (!confirm('Mở lại tất cả ga đang đóng?')) return;
        await fetch(`${CONFIG.API_BASE}/api/scenarios/stations`, { method: 'DELETE', headers: Auth.headers() });
        closedStations.clear();
        refreshStationStyle();
        await Promise.all([loadScenarios(), autoRefreshAdminRoute()]);
    };
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function switchTab(tab) {
    ['route', 'lines', 'stations'].forEach(t => {
        document.getElementById(`panel-${t}`).style.display = t === tab ? '' : 'none';
        document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    });
}

// ── Network (tuyến) ──────────────────────────────────────────────────────────

function drawAdminNetwork(networkData) {
    networkEdgeLayers.forEach(e => { adminMap.removeLayer(e.poly); adminMap.removeLayer(e.hit); });
    networkEdgeLayers = [];

    networkData.forEach(line => {
        (line.edges || []).forEach(edge => {
            if (!edge.coords || edge.coords.length < 2) return;
            const poly = L.polyline(edge.coords, {
                color: line.color, weight: 5, opacity: 0.8,
                smoothFactor: 2, renderer: _adminSvgNetwork,
                interactive: false,
            }).addTo(adminMap);
            const hit = L.polyline(edge.coords, {
                color: line.color, weight: 20, opacity: 0,
                smoothFactor: 2, pane: 'stationPane',
            }).addTo(adminMap);
            hit.bindTooltip(line.name, { sticky: true, direction: 'top', offset: [0, -4] });
            hit.on('click', function(e) {
                L.DomEvent.stopPropagation(e);
                _openAdminPopup(e.latlng, _buildLinePopupHtml(line.id, line.name, line.color), 'line', line.id);
            });
            networkEdgeLayers.push({ fromId: edge.from_id, toId: edge.to_id, lineId: line.id, poly, hit });
        });
    });
}

function renderLinesList() {
    document.getElementById('lines-list').innerHTML = allLines.map(line => `
        <div class="line-toggle-item" id="line-item-${line.id}">
            <div class="line-toggle-info">
                <span class="line-color-dot" style="background:${line.color}"></span>
                <span class="line-toggle-name">${line.short_name} – ${line.name}</span>
            </div>
            <button class="btn-toggle open" id="btn-line-${line.id}"
                    onclick="toggleLine(${line.id}, '${line.name}')">Mở</button>
        </div>
    `).join('');
}

async function toggleLine(lineId, lineName) {
    if (closedLines.has(lineId)) {
        const scId = _scenarioIdByLineId[lineId];
        if (scId != null) await fetch(`${CONFIG.API_BASE}/api/scenarios/${scId}`, { method: 'DELETE', headers: Auth.headers() });
        closedLines.delete(lineId);
    } else {
        await fetch(`${CONFIG.API_BASE}/api/scenarios/close_line`, {
            method: 'POST', headers: Auth.headers(),
            body: JSON.stringify({ line_id: lineId, line_name: lineName }),
        });
        closedLines.add(lineId);
    }
    refreshNetworkStyle();
    await Promise.all([loadScenarios(), autoRefreshAdminRoute()]);
}

function _refreshAdminEdgeVisibility() {
    networkEdgeLayers.forEach(e => {
        const lineHidden    = closedLines.has(e.lineId);
        const stationHidden = closedStations.has(e.fromId) || closedStations.has(e.toId);
        const color = allLines.find(l => l.id === e.lineId)?.color ?? '#888';
        e.poly.setStyle({ color, opacity: (lineHidden || stationHidden) ? 0 : 0.8 });
    });
}

function refreshNetworkStyle() {
    _refreshAdminEdgeVisibility();
    allLines.forEach(line => {
        const isClosed = closedLines.has(line.id);
        const btn = document.getElementById(`btn-line-${line.id}`);
        if (btn) { btn.textContent = isClosed ? 'Đóng' : 'Mở'; btn.className = `btn-toggle ${isClosed ? 'closed' : 'open'}`; }
    });
    if (_currentPopup && _currentPopupType === 'line') {
        const l = allLines.find(ln => ln.id === _currentPopupId);
        if (l) _currentPopup.setContent(_buildLinePopupHtml(l.id, l.name, l.color));
    }
}

// ── Stations (ga) ────────────────────────────────────────────────────────────

function drawAdminStations() {
    allStations.forEach(s => {
        const color = s.lines?.[0]?.color ?? '#888';
        const m = L.circleMarker([s.lat, s.lon], {
            radius: 5, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 1,
            pane: 'stationPane',
        }).addTo(adminMap);
        m.bindTooltip(s.name, { sticky: true });
        m.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            _openAdminPopup([s.lat, s.lon], _buildStationPopupHtml(s.id, s.name, s.lines), 'station', s.id);
        });
        stationMarkers[s.id] = { marker: m, color };
    });
}

function renderStationsList(stations) {
    document.getElementById('stations-list').innerHTML = stations.map(s => {
        const color = s.lines?.[0]?.color ?? '#888';
        return `
            <div class="station-toggle-item" id="station-item-${s.id}">
                <div class="station-toggle-info">
                    <span class="line-color-dot" style="background:${color}"></span>
                    <span class="station-toggle-name">${s.name}</span>
                    <span class="station-lines-badges">
                        ${(s.lines ?? []).map(l => `<span class="s-badge" style="background:${l.color}">${l.short_name}</span>`).join('')}
                    </span>
                </div>
                <button class="btn-toggle open" id="btn-station-${s.id}"
                        onclick="toggleStation(${s.id}, '${s.name.replace(/'/g, "\\'")}')">Mở</button>
            </div>
        `;
    }).join('');
}

function filterStations(query) {
    const q        = query.toLowerCase().trim();
    const filtered = q ? allStations.filter(s => s.name.toLowerCase().includes(q)) : allStations;
    renderStationsList(filtered);
    filtered.forEach(s => {
        const btn = document.getElementById(`btn-station-${s.id}`);
        if (btn && closedStations.has(s.id)) { btn.textContent = 'Đóng'; btn.className = 'btn-toggle closed'; }
    });
}

async function toggleStation(stationId, stationName) {
    if (closedStations.has(stationId)) {
        const scId = _scenarioIdByStationId[stationId];
        if (scId != null) await fetch(`${CONFIG.API_BASE}/api/scenarios/${scId}`, { method: 'DELETE', headers: Auth.headers() });
        closedStations.delete(stationId);
    } else {
        await fetch(`${CONFIG.API_BASE}/api/scenarios/close_station`, {
            method: 'POST', headers: Auth.headers(),
            body: JSON.stringify({ station_id: stationId, station_name: stationName }),
        });
        closedStations.add(stationId);
    }
    refreshStationStyle();
    await Promise.all([loadScenarios(), autoRefreshAdminRoute()]);
}

function refreshStationStyle() {
    _refreshAdminEdgeVisibility();  // ẩn/hiện đoạn tuyến kề với ga đóng
    Object.entries(stationMarkers).forEach(([idStr, obj]) => {
        const id       = parseInt(idStr);
        const isClosed = closedStations.has(id);
        obj.marker.setStyle({
            fillColor:   obj.color,
            color:       '#fff',
            weight:      1.5,
            radius:      5,
            opacity:     isClosed ? 0 : 1,
            fillOpacity: isClosed ? 0 : 1,
        });
        const btn = document.getElementById(`btn-station-${id}`);
        if (btn) { btn.textContent = isClosed ? 'Đóng' : 'Mở'; btn.className = `btn-toggle ${isClosed ? 'closed' : 'open'}`; }
    });
    if (_currentPopup && _currentPopupType === 'station') {
        const s = allStations.find(st => st.id === _currentPopupId);
        if (s) _currentPopup.setContent(_buildStationPopupHtml(s.id, s.name, s.lines));
    }
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

async function loadScenarios() {
    const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`, { headers: Auth.headers() });
    if (!res.ok) return;
    const scenarios = await res.json();

    closedLines.clear();
    closedStations.clear();
    _scenarioIdByLineId    = {};
    _scenarioIdByStationId = {};
    scenarios.forEach(s => {
        if (s.type === 'close_line') {
            closedLines.add(s.line_id);
            _scenarioIdByLineId[s.line_id] = s.id;
        }
        if (s.type === 'close_station') {
            closedStations.add(s.station_id);
            _scenarioIdByStationId[s.station_id] = s.id;
        }
    });
    refreshNetworkStyle();
    refreshStationStyle();

    const lineScenarios    = scenarios.filter(s => s.type === 'close_line');
    const stationScenarios = scenarios.filter(s => s.type === 'close_station');

    const listLines    = document.getElementById('scenario-list-lines');
    const listStations = document.getElementById('scenario-list-stations');

    listLines.innerHTML = lineScenarios.length
        ? lineScenarios.map(s => {
            const color = allLines.find(l => l.id === s.line_id)?.color ?? '#888';
            return `
                <li class="scenario-item">
                    <div class="scenario-info">
                        <span class="s-dot" style="background:${color}"></span>
                        <span class="s-name">${s.line_name}</span>
                    </div>
                    <button class="btn-remove" onclick="removeScenario(${s.id})">Mở lại</button>
                </li>`;
        }).join('')
        : '<li class="no-scenario">Không có tuyến nào bị đóng</li>';

    listStations.innerHTML = stationScenarios.length
        ? stationScenarios.map(s => {
            const color = allStations.find(st => st.id === s.station_id)?.lines?.[0]?.color ?? '#888';
            return `
                <li class="scenario-item">
                    <div class="scenario-info">
                        <span class="s-dot" style="background:${color}"></span>
                        <span class="s-name">${s.station_name}</span>
                    </div>
                    <button class="btn-remove" onclick="removeScenario(${s.id})">Mở lại</button>
                </li>`;
        }).join('')
        : '<li class="no-scenario">Không có ga nào bị đóng</li>';
}

async function removeScenario(id) {
    await fetch(`${CONFIG.API_BASE}/api/scenarios/${id}`, { method: 'DELETE', headers: Auth.headers() });
    await Promise.all([loadScenarios(), autoRefreshAdminRoute()]);
}

// ── Admin Pathfinding ─────────────────────────────────────────────────────────

function setupRouteClick() {
    adminMap.on('click', async (e) => {
        if (document.getElementById('panel-route').style.display === 'none') return;
        if (routeClickState === 'done') return;

        const { lat, lng: lon } = e.latlng;
        const isStart = routeClickState === 'waiting_start';
        const color   = isStart ? '#16a34a' : '#dc2626';

        const clickMark = L.circleMarker([lat, lon], {
            radius: 5, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.5,
        }).addTo(adminMap); 

        const station = await fetchAdminNearest(lat, lon);

        if (!station) {
            adminMap.removeLayer(clickMark);
            return;
        }

        const snapMark = _makeSnapMarker(station, isStart);
        setRoutePointCard(isStart ? 'start' : 'end', station);

        if (isStart) {
            routeStartMarkers.forEach(m => adminMap.removeLayer(m));
            routeStartMarkers = [clickMark, snapMark];
            routeStartStation = station;
            if (routeEndStation) {
                routeClickState = 'done';
                document.getElementById('btn-find-route').disabled = false;
                document.getElementById('route-instruction').textContent = 'Nhấn Tìm đường hoặc click lại để thay đổi';
            } else {
                routeClickState = 'waiting_end';
                document.getElementById('route-instruction').innerHTML = 'Click bản đồ để chọn <strong>điểm đến</strong>';
            }
        } else {
            routeEndMarkers.forEach(m => adminMap.removeLayer(m));
            routeEndMarkers = [clickMark, snapMark];
            routeEndStation = station;
            routeClickState = 'done';
            document.getElementById('route-instruction').textContent = 'Nhấn Tìm đường hoặc click lại để thay đổi';
            document.getElementById('btn-find-route').disabled = false;
        }
    });
}

function _makeSnapMarker(station, isStart) {
    const color  = isStart ? '#16a34a' : '#dc2626';
    const symbol = isStart ? '▶' : '◼';
    const type   = isStart ? 'start' : 'end';
    const marker = L.marker([station.lat, station.lon], {
        icon: L.divIcon({
            className: '',
            html: `<div style="display:flex;flex-direction:column;align-items:flex-start;pointer-events:none">
                <div style="position:relative;background:${color};color:#fff;
                            padding:5px 28px 5px 9px;border-radius:6px;
                            font-size:12px;font-weight:700;white-space:nowrap;
                            box-shadow:0 3px 10px rgba(0,0,0,.55);
                            border:2px solid rgba(255,255,255,.25)">
                    ${symbol} ${station.name}
                    <button class="marker-clear-btn"
                        style="pointer-events:auto;position:absolute;right:5px;top:50%;
                               transform:translateY(-50%);background:rgba(0,0,0,.3);
                               border:none;color:#fff;cursor:pointer;border-radius:50%;
                               width:16px;height:16px;font-size:11px;line-height:16px;
                               text-align:center;padding:0"
                        title="Xóa điểm này">✕</button>
                </div>
                <div style="width:3px;height:18px;background:${color};margin-left:10px"></div>
                <div style="width:10px;height:10px;border-radius:50%;background:${color};
                            margin-left:7px;margin-top:-1px;border:2px solid #fff;
                            box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>
            </div>`,
            iconAnchor: [11, 61],
        }),
    }).addTo(adminMap);

    const btn = marker.getElement().querySelector('.marker-clear-btn');
    if (btn) {
        L.DomEvent.on(btn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            clearRoutePoint(type);
        });
    }

    return marker;
}

async function fetchAdminNearest(lat, lon) {
    try {
        const res = await fetch(`${CONFIG.API_BASE}/api/nearest_station?lat=${lat}&lon=${lon}`);
        return res.ok ? await res.json() : null;
    } catch { return null; }
}

function setRoutePointCard(type, station) {
    const nameEl = document.getElementById(`route-${type}-name`);
    nameEl.textContent = station.name;
    nameEl.classList.remove('empty');
    document.getElementById(`route-${type}-lines`).innerHTML = (station.lines || [])
        .map(l => `<span class="s-badge" style="background:${l.color}">${l.short_name}</span>`)
        .join('');
}

function clearRoutePoint(type) {
    if (type === 'start') {
        routeStartStation = null;
        routeStartMarkers.forEach(m => adminMap.removeLayer(m));
        routeStartMarkers = [];
        routeClickState = 'waiting_start';
    } else {
        routeEndStation = null;
        routeEndMarkers.forEach(m => adminMap.removeLayer(m));
        routeEndMarkers = [];
        routeClickState = routeStartStation ? 'waiting_end' : 'waiting_start';
    }
    document.getElementById(`route-${type}-name`).textContent = 'Chưa chọn';
    document.getElementById(`route-${type}-name`).classList.add('empty');
    document.getElementById(`route-${type}-lines`).innerHTML  = '';
    document.getElementById('btn-find-route').disabled  = true;
    document.getElementById('route-result').style.display = 'none';
    clearRouteLayersOnly();
    const instr = type === 'start' || !routeStartStation
        ? 'Click bản đồ để chọn <strong>điểm xuất phát</strong>'
        : 'Click bản đồ để chọn <strong>điểm đến</strong>';
    document.getElementById('route-instruction').innerHTML = instr;
}

function clearAdminRoute() {
    routeStartStation = routeEndStation = null;
    routeClickState   = 'waiting_start';
    ['start', 'end'].forEach(t => {
        document.getElementById(`route-${t}-name`).textContent = 'Chưa chọn';
        document.getElementById(`route-${t}-name`).classList.add('empty');
        document.getElementById(`route-${t}-lines`).innerHTML  = '';
    });
    document.getElementById('btn-find-route').disabled  = true;
    document.getElementById('route-result').style.display = 'none';
    clearRouteLayersOnly();
    routeStartMarkers.forEach(m => adminMap.removeLayer(m));
    routeEndMarkers.forEach(m => adminMap.removeLayer(m));
    routeStartMarkers = [];
    routeEndMarkers   = [];
    document.getElementById('route-instruction').innerHTML = 'Click bản đồ để chọn <strong>điểm xuất phát</strong>';
}

function clearRouteLayersOnly() {
    routeLayers.forEach(l => adminMap.removeLayer(l));
    routeLayers = [];
}

// ── findAdminRoute ────────────────────────────────────────────────────────────

async function findAdminRoute() {
    if (!routeStartStation || !routeEndStation) return;
    if (routeStartStation.id === routeEndStation.id) {
        await showModal('Lưu ý', 'Điểm đi và đến là cùng một ga!', [{ label: 'OK', cls: 'primary' }]);
        return;
    }

    const btn = document.getElementById('btn-find-route');
    btn.textContent = 'Đang tìm...';
    btn.disabled    = true;

    try {
        const url = `${CONFIG.API_BASE}/api/route`
            + `?start_lat=${routeStartStation.lat}&start_lon=${routeStartStation.lon}`
            + `&goal_lat=${routeEndStation.lat}&goal_lon=${routeEndStation.lon}`;
        const res = await fetch(url);

        if (res.ok) {
            const data = await res.json();
            _resetSnapMarker(routeStartMarkers, routeStartStation, true);
            _resetSnapMarker(routeEndMarkers,   routeEndStation,   false);
            drawAdminRoute(data.segments);
            renderRouteResult(data, null);
            renderAdminBlockedBox(null);
            return;
        }

        clearRouteLayersOnly();
        document.getElementById('route-result').style.display = 'none';

        let errData = null;
        try { errData = await res.json(); } catch {}
        const blocked = errData?.detail?.blocked ?? null;
        renderAdminBlockedBox(blocked);

        await showModal('Không tìm được đường đi', buildBlockedBodyHtml(blocked),
            [{ label: 'OK', cls: 'primary' }]);

        const choice = await showModal(
            'Tìm đường thay thế',
            'Phải di chuyển ra ga xa hơn để có đường đi.<br>Bạn có đồng ý không?',
            [{ label: 'Đồng ý', cls: 'confirm' }, { label: 'Hủy', cls: 'secondary' }]
        );
        if (choice === 1) return;

        btn.textContent = 'Thử ga lân cận...';
        const alt = await tryAlternativeRoute(routeStartStation, routeEndStation);
        if (alt) {
            drawAdminRoute(alt.data.segments);
            renderRouteResult(alt.data, alt.note);
            // Xóa snap marker cũ, thay bằng marker ga thay thế
            const altIsStart = alt.altType === 'start';
            const markers = altIsStart ? routeStartMarkers : routeEndMarkers;
            if (markers.length > 1) adminMap.removeLayer(markers.splice(1, 1)[0]);
            const altMark = _makeSnapMarker(alt.altStation, altIsStart);
            markers.push(altMark);
        } else {
            await showModal('Không tìm được',
                'Không tìm được đường đi, kể cả khi thử các ga lân cận.',
                [{ label: 'OK', cls: 'primary' }]);
        }
    } catch {
        await showModal('Lỗi', 'Không thể kết nối server!', [{ label: 'OK', cls: 'primary' }]);
    } finally {
        btn.textContent = 'Tìm đường';
        btn.disabled    = false;
    }
}

function drawAdminRoute(segments) {
    clearRouteLayersOnly();
    segments.forEach(seg => {
        if (!seg.coords || seg.coords.length < 2) return;
        const border = L.polyline(seg.coords, {
            color: seg.line_color || '#888', weight: 18, opacity: 1,
            lineCap: 'round', lineJoin: 'round', pane: 'routePane',
            smoothFactor: 1, renderer: _adminSvgRoute,
        }).addTo(adminMap);
        const white = L.polyline(seg.coords, {
            color: '#ffffff', weight: 9, opacity: 1,
            lineCap: 'round', lineJoin: 'round', pane: 'routePane',
            smoothFactor: 1, renderer: _adminSvgRoute,
        }).addTo(adminMap);
        white.bindTooltip(seg.line_name || '', { sticky: true });
        routeLayers.push(border, white);
    });
    if (routeLayers.length > 0) {
        adminMap.fitBounds(L.featureGroup(routeLayers).getBounds(), { padding: [50, 50] });
    }
}

async function autoRefreshAdminRoute() {
    if (routeStartStation && routeEndStation) await findAdminRoute();
}

function renderRouteResult(data, altNote) {
    document.getElementById('route-stops').textContent = `${data.num_stations} ga`;
    document.getElementById('route-dist').textContent  = `${(data.distance / 1000).toFixed(2)} km`;

    const seen = new Set();
    document.getElementById('route-lines-used').innerHTML = data.segments
        .filter(s => s.line_id && !seen.has(s.line_id) && seen.add(s.line_id))
        .map(s => `<span class="s-badge" style="background:${s.line_color}">${s.line_short}</span>`)
        .join('');

    document.getElementById('route-path').textContent = data.path.map(p => p.name).join(' → ');

    const altEl = document.getElementById('route-alt');
    altEl.style.display = altNote ? 'block' : 'none';
    if (altNote) altEl.innerHTML = '⚠ ' + altNote;

    document.getElementById('route-result').style.display = '';
}

function renderAdminBlockedBox(blocked) {
    const box = document.getElementById('route-blocked-box');
    if (!blocked || (!blocked.lines.length && !blocked.stations.length)) {
        box.style.display = 'none'; box.innerHTML = ''; return;
    }
    let html = '<div class="blocked-title">Không tìm được đường – nguyên nhân:</div>';
    if (blocked.lines.length) {
        html += '<div class="blocked-section"><div class="blocked-label">Tuyến bị đóng trên lộ trình:</div><div class="blocked-tags">';
        blocked.lines.forEach(l => { html += `<span class="blocked-tag" style="background:${l.color}">${l.short_name} ${l.name}</span>`; });
        html += '</div></div>';
    }
    if (blocked.stations.length) {
        html += '<div class="blocked-section"><div class="blocked-label">Ga bị đóng trên lộ trình:</div><div class="blocked-tags">';
        blocked.stations.forEach(s => { html += `<span class="blocked-tag" style="background:#dc2626">⊗ ${s.name}</span>`; });
        html += '</div></div>';
    }
    box.innerHTML = html;
    box.style.display = 'block';
}

// ── Map Popup ─────────────────────────────────────────────────────────────────

function _openAdminPopup(latlng, html, type, id) {
    if (_currentPopup) _currentPopup.remove();
    _currentPopupType = type;
    _currentPopupId   = id;
    _currentPopup = L.popup({ className: 'admin-map-popup', maxWidth: 230, closeButton: true })
        .setLatLng(latlng)
        .setContent(html)
        .openOn(adminMap);
    _currentPopup.on('remove', () => {
        _currentPopup = null;
        _currentPopupType = null;
        _currentPopupId   = null;
    });
}

function _buildStationPopupHtml(id, name, lines) {
    const isClosed  = closedStations.has(id);
    const safeName  = name.replace(/'/g, "\\'");
    const linesHtml = (lines || [])
        .map(l => `<span class="s-badge" style="background:${l.color}">${l.short_name}</span>`)
        .join(' ');
    return `<div class="admin-popup-body">
        <div class="admin-popup-title">${name}</div>
        <div class="admin-popup-badges">${linesHtml}</div>
        <button class="btn-toggle ${isClosed ? 'closed' : 'open'} admin-popup-btn"
                onclick="toggleStationFromMap(${id}, '${safeName}')">
            ${isClosed ? 'Mở lại' : 'Đóng ga'}
        </button>
    </div>`;
}

function _buildLinePopupHtml(id, name, color) {
    const isClosed  = closedLines.has(id);
    const line      = allLines.find(l => l.id === id);
    const safeName  = name.replace(/'/g, "\\'");
    const shortBadge = line?.short_name
        ? `<span class="admin-popup-short">${line.short_name}</span>` : '';
    return `<div class="admin-popup-body">
        <div class="admin-popup-title">
            <span class="line-color-dot" style="background:${color}"></span>
            ${shortBadge}${name}
        </div>
        <button class="btn-toggle ${isClosed ? 'closed' : 'open'} admin-popup-btn"
                onclick="toggleLineFromMap(${id}, '${safeName}')">
            ${isClosed ? 'Mở lại' : 'Đóng tuyến'}
        </button>
    </div>`;
}

async function toggleStationFromMap(stationId, stationName) {
    await toggleStation(stationId, stationName);
    // refreshStationStyle (called inside toggleStation) tự cập nhật popup
}

async function toggleLineFromMap(lineId, lineName) {
    await toggleLine(lineId, lineName);
    // refreshNetworkStyle (called inside toggleLine) tự cập nhật popup
}

function _resetSnapMarker(markers, station, isStart) {
    if (!station) return;
    if (markers.length > 1) adminMap.removeLayer(markers.splice(1, 1)[0]);
    markers.push(_makeSnapMarker(station, isStart));
}
