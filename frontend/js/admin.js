/* ===== ADMIN MODULE =====
 * Quản lý 2 loại kịch bản: Đóng tuyến & Đóng ga.
 */

let adminMap;
let allLines       = [];
let allStations    = [];
let networkLayers  = {};   // line_id    -> [polyline, ...]
let stationMarkers = {};   // station_id -> {marker, color}
let closedLines    = new Set();
let closedStations = new Set();

// ── Pathfinding state ─────────────────────────────────────────────────────────
let routeClickState  = 'waiting_start';  // 'waiting_start' | 'waiting_end' | 'done'
let routeStartStation = null;
let routeEndStation   = null;
let routeLayers       = [];   // polylines của đường đi
let routeClickMarkers = [];   // markers điểm click + snap

// ── Login ────────────────────────────────────────────────────────────────────

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

// ── Init ─────────────────────────────────────────────────────────────────────

async function initAdminDashboard() {
    const SG_BOUNDS = L.latLngBounds(
        L.latLng(1.2050, 103.6200),
        L.latLng(1.4710, 104.0100)
    );
    adminMap = L.map('admin-map', {
        maxBounds: SG_BOUNDS, maxBoundsViscosity: 1.0,
        minZoom: 13, maxZoom: 18,
    }).setView([1.3521, 103.8198], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', bounds: SG_BOUNDS,
    }).addTo(adminMap);

    // Pane riêng cho route – nằm trên network (overlayPane = 400)
    adminMap.createPane('routePane').style.zIndex = 450;
    // Pane riêng cho station markers – luôn nổi trên route
    adminMap.createPane('stationPane').style.zIndex = 500;

    const [linesRes, networkRes, stationsRes] = await Promise.all([
        fetch(`${CONFIG.API_BASE}/api/lines`),
        fetch(`${CONFIG.API_BASE}/api/network`),
        fetch(`${CONFIG.API_BASE}/api/stations`),
    ]);
    allLines    = await linesRes.json();
    allStations = await stationsRes.json();
    const networkData = await networkRes.json();

    drawAdminNetwork(networkData);
    drawAdminStations();
    renderLinesList();
    renderStationsList(allStations);
    await loadScenarios();
    setupRouteClick();

    document.getElementById('btn-logout').onclick = () => {
        Auth.logout();
        document.getElementById('dashboard').style.display  = 'none';
        document.getElementById('login-page').style.display = 'flex';
    };

    document.getElementById('btn-clear-all').onclick = async () => {
        if (!confirm('Mở lại tất cả tuyến và ga?')) return;
        await fetch(`${CONFIG.API_BASE}/api/scenarios`, {
            method: 'DELETE', headers: Auth.headers(),
        });
        closedLines.clear();
        closedStations.clear();
        refreshNetworkStyle();
        refreshStationStyle();
        await loadScenarios();
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
    networkData.forEach(line => {
        networkLayers[line.id] = [];
        line.segments.forEach(coords => {
            if (coords.length < 2) return;
            const poly = L.polyline(coords, {
                color: line.color, weight: 5, opacity: 0.8,
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
        item.className = 'line-toggle-item';
        item.id        = `line-item-${line.id}`;
        item.innerHTML = `
            <div class="line-toggle-info">
                <span class="line-color-dot" style="background:${line.color}"></span>
                <span class="line-toggle-name">${line.short_name} – ${line.name}</span>
            </div>
            <button class="btn-toggle open" id="btn-line-${line.id}"
                    onclick="toggleLine(${line.id}, '${line.name}')">Mở</button>
        `;
        container.appendChild(item);
    });
}

async function toggleLine(lineId, lineName) {
    if (closedLines.has(lineId)) {
        const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`, { headers: Auth.headers() });
        const scenarios = await res.json();
        const sc = scenarios.find(s => s.type === 'close_line' && s.line_id === lineId);
        if (sc) await fetch(`${CONFIG.API_BASE}/api/scenarios/${sc.id}`, {
            method: 'DELETE', headers: Auth.headers(),
        });
        closedLines.delete(lineId);
    } else {
        await fetch(`${CONFIG.API_BASE}/api/scenarios/close_line`, {
            method: 'POST', headers: Auth.headers(),
            body: JSON.stringify({ line_id: lineId, line_name: lineName }),
        });
        closedLines.add(lineId);
    }
    refreshNetworkStyle();
    await loadScenarios();
    await autoRefreshAdminRoute();
}

function refreshNetworkStyle() {
    Object.entries(networkLayers).forEach(([lineIdStr, polys]) => {
        const lineId   = parseInt(lineIdStr);
        const isClosed = closedLines.has(lineId);
        const lineInfo = allLines.find(l => l.id === lineId);
        polys.forEach(poly => poly.setStyle({
            color:     isClosed ? '#6b7280' : (lineInfo?.color ?? '#888'),
            opacity:   isClosed ? 0.3 : 0.8,
            dashArray: isClosed ? '8 6' : null,
        }));
        const btn = document.getElementById(`btn-line-${lineId}`);
        if (btn) {
            btn.textContent = isClosed ? 'Đóng' : 'Mở';
            btn.className   = `btn-toggle ${isClosed ? 'closed' : 'open'}`;
        }
    });
}

// ── Stations (ga) ────────────────────────────────────────────────────────────

function drawAdminStations() {
    allStations.forEach(s => {
        const color = s.lines?.[0]?.color ?? '#888';
        const m = L.circleMarker([s.lat, s.lon], {
            radius: 5, fillColor: color,
            color: '#fff', weight: 1.5, fillOpacity: 1,
            pane: 'stationPane',
        }).addTo(adminMap);
        m.bindTooltip(s.name, { sticky: true });
        stationMarkers[s.id] = { marker: m, color };
    });
}

function renderStationsList(stations) {
    const container = document.getElementById('stations-list');
    container.innerHTML = '';
    stations.forEach(s => {
        const color = s.lines?.[0]?.color ?? '#888';
        const item  = document.createElement('div');
        item.className = 'station-toggle-item';
        item.id        = `station-item-${s.id}`;
        item.innerHTML = `
            <div class="station-toggle-info">
                <span class="line-color-dot" style="background:${color}"></span>
                <span class="station-toggle-name">${s.name}</span>
                <span class="station-lines-badges">
                    ${(s.lines ?? []).map(l =>
                        `<span class="s-badge" style="background:${l.color}">${l.short_name}</span>`
                    ).join('')}
                </span>
            </div>
            <button class="btn-toggle open" id="btn-station-${s.id}"
                    onclick="toggleStation(${s.id}, '${s.name.replace(/'/g, "\\'")}')">Mở</button>
        `;
        container.appendChild(item);
    });
}

function filterStations(query) {
    const q = query.toLowerCase().trim();
    const filtered = q ? allStations.filter(s => s.name.toLowerCase().includes(q)) : allStations;
    renderStationsList(filtered);
    // Restore đúng trạng thái đóng/mở cho các item vừa render
    filtered.forEach(s => {
        const btn = document.getElementById(`btn-station-${s.id}`);
        if (btn && closedStations.has(s.id)) {
            btn.textContent = 'Đóng';
            btn.className   = 'btn-toggle closed';
        }
    });
}

async function toggleStation(stationId, stationName) {
    if (closedStations.has(stationId)) {
        const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`, { headers: Auth.headers() });
        const scenarios = await res.json();
        const sc = scenarios.find(s => s.type === 'close_station' && s.station_id === stationId);
        if (sc) await fetch(`${CONFIG.API_BASE}/api/scenarios/${sc.id}`, {
            method: 'DELETE', headers: Auth.headers(),
        });
        closedStations.delete(stationId);
    } else {
        await fetch(`${CONFIG.API_BASE}/api/scenarios/close_station`, {
            method: 'POST', headers: Auth.headers(),
            body: JSON.stringify({ station_id: stationId, station_name: stationName }),
        });
        closedStations.add(stationId);
    }
    refreshStationStyle();
    await loadScenarios();
    await autoRefreshAdminRoute();
}

function refreshStationStyle() {
    Object.entries(stationMarkers).forEach(([idStr, obj]) => {
        const id       = parseInt(idStr);
        const isClosed = closedStations.has(id);
        obj.marker.setStyle({
            fillColor:   isClosed ? '#ef4444' : obj.color,
            fillOpacity: isClosed ? 1 : 1,
            color:       isClosed ? '#7f1d1d' : '#fff',
            weight:      isClosed ? 2.5 : 1.5,
            radius:      isClosed ? 7 : 5,
        });
        const btn = document.getElementById(`btn-station-${id}`);
        if (btn) {
            btn.textContent = isClosed ? 'Đóng' : 'Mở';
            btn.className   = `btn-toggle ${isClosed ? 'closed' : 'open'}`;
        }
    });
}

// ── Scenarios list ────────────────────────────────────────────────────────────

async function loadScenarios() {
    const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`, { headers: Auth.headers() });
    if (!res.ok) return;
    const scenarios = await res.json();

    closedLines.clear();
    closedStations.clear();
    scenarios.forEach(s => {
        if (s.type === 'close_line')    closedLines.add(s.line_id);
        if (s.type === 'close_station') closedStations.add(s.station_id);
    });
    refreshNetworkStyle();
    refreshStationStyle();

    const list = document.getElementById('scenario-list');
    list.innerHTML = '';
    if (scenarios.length === 0) {
        list.innerHTML = '<li class="no-scenario">Không có kịch bản nào</li>';
        return;
    }
    scenarios.forEach(s => {
        const li    = document.createElement('li');
        li.className = 'scenario-item';
        const isLine = s.type === 'close_line';
        const label  = isLine ? s.line_name : s.station_name;
        const color  = isLine
            ? (allLines.find(l => l.id === s.line_id)?.color ?? '#888')
            : (allStations.find(st => st.id === s.station_id)?.lines?.[0]?.color ?? '#888');
        const icon = isLine ? '🚇' : '🚉';
        li.innerHTML = `
            <div class="scenario-info">
                <span class="s-dot" style="background:${color}"></span>
                <span class="s-name">${icon} ${label}</span>
            </div>
            <button class="btn-remove" onclick="removeScenario(${s.id})">Mở lại</button>
        `;
        list.appendChild(li);
    });
}

async function removeScenario(id) {
    await fetch(`${CONFIG.API_BASE}/api/scenarios/${id}`, {
        method: 'DELETE', headers: Auth.headers(),
    });
    await loadScenarios();
}

// ── Admin Pathfinding ─────────────────────────────────────────────────────────

function setupRouteClick() {
    adminMap.on('click', async (e) => {
        // Chỉ xử lý click khi đang ở tab Tìm đường
        if (document.getElementById('panel-route').style.display === 'none') return;
        if (routeClickState === 'done') return;

        const { lat, lng: lon } = e.latlng;

        // Marker điểm click (xám nhỏ)
        const clickMark = L.circleMarker([lat, lon], {
            radius: 5, fillColor: routeClickState === 'waiting_start' ? '#16a34a' : '#dc2626',
            color: '#fff', weight: 2, fillOpacity: 0.5,
        }).addTo(adminMap);
        routeClickMarkers.push(clickMark);

        // Snap về ga gần nhất
        const station = await fetchAdminNearest(lat, lon);
        if (!station) return;

        const snapMark = L.marker([station.lat, station.lon], {
            icon: L.divIcon({
                className: '',
                html: `<div style="
                    background:${routeClickState === 'waiting_start' ? '#16a34a' : '#dc2626'};
                    color:#fff;padding:3px 7px;border-radius:6px;
                    font-size:11px;font-weight:600;white-space:nowrap;
                    box-shadow:0 2px 4px rgba(0,0,0,.4)">
                    ${routeClickState === 'waiting_start' ? '▶' : '■'} ${station.name}
                </div>`,
                iconAnchor: [0, 0],
            }),
        }).addTo(adminMap);
        routeClickMarkers.push(snapMark);

        if (routeClickState === 'waiting_start') {
            routeStartStation = station;
            setRoutePointCard('start', station);
            routeClickState = 'waiting_end';
            document.getElementById('route-instruction').innerHTML =
                'Click bản đồ để chọn <strong>điểm đến</strong>';
        } else {
            routeEndStation = station;
            setRoutePointCard('end', station);
            routeClickState = 'done';
            document.getElementById('route-instruction').textContent =
                'Nhấn Tìm đường hoặc click lại để thay đổi';
            document.getElementById('btn-find-route').disabled = false;
        }
    });
}

async function fetchAdminNearest(lat, lon) {
    try {
        const res = await fetch(`${CONFIG.API_BASE}/api/nearest_station?lat=${lat}&lon=${lon}`);
        return res.ok ? await res.json() : null;
    } catch { return null; }
}

function setRoutePointCard(type, station) {
    const nameEl  = document.getElementById(`route-${type}-name`);
    const linesEl = document.getElementById(`route-${type}-lines`);
    nameEl.textContent = station.name;
    nameEl.classList.remove('empty');
    linesEl.innerHTML = (station.lines || [])
        .map(l => `<span class="s-badge" style="background:${l.color}">${l.short_name}</span>`)
        .join('');
}

function clearRoutePoint(type) {
    if (type === 'start') {
        routeStartStation = null;
        routeClickState = 'waiting_start';
    } else {
        routeEndStation = null;
        if (routeStartStation) routeClickState = 'waiting_end';
    }
    document.getElementById(`route-${type}-name`).textContent = 'Chưa chọn';
    document.getElementById(`route-${type}-name`).classList.add('empty');
    document.getElementById(`route-${type}-lines`).innerHTML = '';
    document.getElementById('btn-find-route').disabled = true;
    document.getElementById('route-result').style.display = 'none';
    clearRouteLayersOnly();
    routeClickMarkers.forEach(m => adminMap.removeLayer(m));
    routeClickMarkers = [];
    document.getElementById('route-instruction').innerHTML =
        'Click bản đồ để chọn <strong>điểm xuất phát</strong>';
}

function clearAdminRoute() {
    routeStartStation = routeEndStation = null;
    routeClickState = 'waiting_start';
    ['start','end'].forEach(t => {
        document.getElementById(`route-${t}-name`).textContent = 'Chưa chọn';
        document.getElementById(`route-${t}-name`).classList.add('empty');
        document.getElementById(`route-${t}-lines`).innerHTML = '';
    });
    document.getElementById('btn-find-route').disabled = true;
    document.getElementById('route-result').style.display = 'none';
    clearRouteLayersOnly();
    routeClickMarkers.forEach(m => adminMap.removeLayer(m));
    routeClickMarkers = [];
    document.getElementById('route-instruction').innerHTML =
        'Click bản đồ để chọn <strong>điểm xuất phát</strong>';
}

function clearRouteLayersOnly() {
    routeLayers.forEach(l => adminMap.removeLayer(l));
    routeLayers = [];
}

// ── Modal helper (dùng chung với user page) ───────────────────────────────────

function showModal(title, bodyHtml, buttons) {
    return new Promise(resolve => {
        document.getElementById('mrt-modal-title').textContent = title;
        document.getElementById('mrt-modal-body').innerHTML   = bodyHtml;

        const actionsEl = document.getElementById('mrt-modal-actions');
        actionsEl.innerHTML = '';
        buttons.forEach((btn, i) => {
            const b = document.createElement('button');
            b.className   = 'modal-btn ' + (btn.cls || 'secondary');
            b.textContent = btn.label;
            b.onclick = () => {
                document.getElementById('mrt-modal-overlay').style.display = 'none';
                resolve(i);
            };
            actionsEl.appendChild(b);
        });

        document.getElementById('mrt-modal-overlay').style.display = 'flex';
    });
}

function buildBlockedBodyHtml(blocked) {
    let html = '';
    if (blocked?.lines?.length) {
        html += '<div class="modal-blocked-label">Tuyến bị đóng trên lộ trình:</div>';
        html += '<div class="modal-tags">';
        blocked.lines.forEach(l => {
            html += `<span class="modal-tag" style="background:${l.color}">${l.short_name} ${l.name}</span>`;
        });
        html += '</div>';
    }
    if (blocked?.stations?.length) {
        html += '<div class="modal-blocked-label">Ga bị đóng trên lộ trình:</div>';
        html += '<div class="modal-tags">';
        blocked.stations.forEach(s => {
            html += `<span class="modal-tag" style="background:#dc2626">⊗ ${s.name}</span>`;
        });
        html += '</div>';
    }
    if (!html) html = 'Không có đường đi với cấu hình hiện tại.';
    return html;
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
    btn.disabled = true;

    try {
        const url = `${CONFIG.API_BASE}/api/route`
            + `?start_lat=${routeStartStation.lat}&start_lon=${routeStartStation.lon}`
            + `&goal_lat=${routeEndStation.lat}&goal_lon=${routeEndStation.lon}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            drawAdminRoute(data.segments);
            renderRouteResult(data, null);
            renderAdminBlockedBox(null);
            return;
        }

        // Không tìm được đường trực tiếp – xóa route cũ
        clearRouteLayersOnly();
        document.getElementById('route-result').style.display = 'none';

        let errData = null;
        try { errData = await res.json(); } catch {}
        const blocked = errData?.detail?.blocked ?? null;
        renderAdminBlockedBox(blocked);

        // Bước 1: modal thông báo lý do
        await showModal('Không tìm được đường đi', buildBlockedBodyHtml(blocked),
            [{ label: 'OK', cls: 'primary' }]);

        // Bước 2: hỏi xác nhận đổi ga
        const choice = await showModal(
            'Tìm đường thay thế',
            'Phải di chuyển ra ga xa hơn để có đường đi.<br>Bạn có đồng ý không?',
            [
                { label: 'Đồng ý', cls: 'confirm' },
                { label: 'Hủy',    cls: 'secondary' },
            ]
        );

        if (choice === 1) return;  // user bấm Hủy

        btn.textContent = 'Thử ga lân cận...';
        const alt = await tryAdminAlternativeStations(routeStartStation, routeEndStation);
        if (alt) {
            drawAdminRoute(alt.data.segments);
            renderRouteResult(alt.data, alt.note);
        } else {
            await showModal('Không tìm được', 'Không tìm được đường đi, kể cả khi thử các ga lân cận.',
                [{ label: 'OK', cls: 'primary' }]);
        }
    } catch {
        await showModal('Lỗi', 'Không thể kết nối server!', [{ label: 'OK', cls: 'primary' }]);
    } finally {
        btn.textContent = 'Tìm đường';
        btn.disabled = false;
    }
}

async function tryAdminAlternativeStations(origStart, origEnd) {
    let nearby;
    try {
        const [resS, resE] = await Promise.all([
            fetch(`${CONFIG.API_BASE}/api/nearby_stations?lat=${origStart.lat}&lon=${origStart.lon}&limit=4`),
            fetch(`${CONFIG.API_BASE}/api/nearby_stations?lat=${origEnd.lat}&lon=${origEnd.lon}&limit=4`),
        ]);
        nearby = {
            starts: (await resS.json()).filter(s => s.id !== origStart.id),
            ends:   (await resE.json()).filter(s => s.id !== origEnd.id),
        };
    } catch { return null; }

    for (const s of nearby.starts) {
        if (s.id === origEnd.id) continue;
        const res = await fetch(`${CONFIG.API_BASE}/api/route`
            + `?start_lat=${s.lat}&start_lon=${s.lon}`
            + `&goal_lat=${origEnd.lat}&goal_lon=${origEnd.lon}`);
        if (res.ok) {
            const data = await res.json();
            return { data, note: `Không có đường trực tiếp – đề xuất đi từ <strong>${s.name}</strong> thay vì ${origStart.name}` };
        }
    }

    for (const e of nearby.ends) {
        if (e.id === origStart.id) continue;
        const res = await fetch(`${CONFIG.API_BASE}/api/route`
            + `?start_lat=${origStart.lat}&start_lon=${origStart.lon}`
            + `&goal_lat=${e.lat}&goal_lon=${e.lon}`);
        if (res.ok) {
            const data = await res.json();
            return { data, note: `Không có đường trực tiếp – đề xuất đến <strong>${e.name}</strong> thay vì ${origEnd.name}` };
        }
    }

    return null;
}

function drawAdminRoute(segments) {
    clearRouteLayersOnly();
    segments.forEach(seg => {
        if (!seg.coords || seg.coords.length < 2) return;
        const border = L.polyline(seg.coords, {
            color: seg.line_color || '#888', weight: 18, opacity: 1,
            lineCap: 'round', lineJoin: 'round', pane: 'routePane',
        }).addTo(adminMap);
        routeLayers.push(border);
        const white = L.polyline(seg.coords, {
            color: '#ffffff', weight: 9, opacity: 1,
            lineCap: 'round', lineJoin: 'round', pane: 'routePane',
        }).addTo(adminMap);
        white.bindTooltip(seg.line_name || '', { sticky: true });
        routeLayers.push(white);
    });
    if (routeLayers.length > 0) {
        adminMap.fitBounds(L.featureGroup(routeLayers).getBounds(), { padding: [50, 50] });
    }
}

async function autoRefreshAdminRoute() {
    if (routeStartStation && routeEndStation) {
        await findAdminRoute();
    }
}

function renderRouteResult(data, altNote) {
    document.getElementById('route-stops').textContent = `${data.num_stations} ga`;
    document.getElementById('route-dist').textContent  = `${(data.distance / 1000).toFixed(2)} km`;

    const seen = new Set();
    const usedLines = data.segments.filter(s => {
        if (!s.line_id || seen.has(s.line_id)) return false;
        seen.add(s.line_id); return true;
    });
    document.getElementById('route-lines-used').innerHTML = usedLines
        .map(s => `<span class="s-badge" style="background:${s.line_color}">${s.line_short}</span>`)
        .join('');

    document.getElementById('route-path').textContent =
        data.path.map(p => p.name).join(' → ');

    const altEl = document.getElementById('route-alt');
    if (altNote) {
        altEl.innerHTML = '⚠ ' + altNote;
        altEl.style.display = 'block';
    } else {
        altEl.style.display = 'none';
    }

    document.getElementById('route-result').style.display = '';
}

function renderAdminBlockedBox(blocked) {
    const box = document.getElementById('route-blocked-box');
    if (!blocked || (blocked.lines.length === 0 && blocked.stations.length === 0)) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }

    let html = '<div class="blocked-title">Không tìm được đường – nguyên nhân:</div>';

    if (blocked.lines.length > 0) {
        html += '<div class="blocked-section">';
        html += '<div class="blocked-label">Tuyến bị đóng trên lộ trình:</div>';
        html += '<div class="blocked-tags">';
        blocked.lines.forEach(l => {
            html += `<span class="blocked-tag" style="background:${l.color}">${l.short_name} ${l.name}</span>`;
        });
        html += '</div></div>';
    }

    if (blocked.stations.length > 0) {
        html += '<div class="blocked-section">';
        html += '<div class="blocked-label">Ga bị đóng trên lộ trình:</div>';
        html += '<div class="blocked-tags">';
        blocked.stations.forEach(s => {
            html += `<span class="blocked-tag" style="background:#dc2626">⊗ ${s.name}</span>`;
        });
        html += '</div></div>';
    }

    box.innerHTML = html;
    box.style.display = 'block';
}
