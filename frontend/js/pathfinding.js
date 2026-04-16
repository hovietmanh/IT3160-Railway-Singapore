/* ===== PATHFINDING MODULE (User page) =====
 * 1. User click map → snap về ga gần nhất
 * 2. Khi có đủ start + end → Tìm đường
 * 3. Polling /api/scenarios mỗi 3s → auto-refresh khi kịch bản thay đổi
 */

let clickState   = 'waiting_start';  // 'waiting_start' | 'waiting_end' | 'done'
let startStation = null;
let endStation   = null;
let startClick   = null;
let endClick     = null;

let _scenarioFingerprint = null;

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await Promise.all([loadNetwork(), loadStations()]);
    setupMapClick();
    setupButtons();
    updateInstruction();
    startScenarioPolling();
});

// ── Polling kịch bản ─────────────────────────────────────────────────────────

function startScenarioPolling() {
    setInterval(async () => {
        try {
            const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`);
            if (!res.ok) return;
            const scenarios = await res.json();
            const fp = JSON.stringify(scenarios.map(s => s.id + s.type));
            if (_scenarioFingerprint === null) {
                _scenarioFingerprint = fp;
                _applyScenarioVisibility(scenarios);  // áp dụng ngay lần đầu load
            } else if (fp !== _scenarioFingerprint) {
                _scenarioFingerprint = fp;
                _applyScenarioVisibility(scenarios);
                if (startStation && endStation) await findRoute();
            }
        } catch { /* bỏ qua lỗi mạng */ }
    }, 3000);
}

function _applyScenarioVisibility(scenarios) {
    const closedLineIds    = new Set(scenarios.filter(s => s.type === 'close_line').map(s => s.line_id));
    const closedStationIds = new Set(scenarios.filter(s => s.type === 'close_station').map(s => s.station_id));
    updateNetworkVisibility(closedLineIds);
    updateStationVisibility(closedStationIds);
}

// ── Load data ────────────────────────────────────────────────────────────────

async function loadNetwork() {
    const res  = await fetch(`${CONFIG.API_BASE}/api/network`);
    const data = await res.json();
    drawNetwork(data);
    renderLegend(data);
}

async function loadStations() {
    const data = await fetch(`${CONFIG.API_BASE}/api/stations`).then(r => r.json());
    drawStations(data);
}

function renderLegend(networkData) {
    document.getElementById('legend-list').innerHTML = networkData.map(line => `
        <div class="legend-item">
            <div class="legend-color" style="background:${line.color}"></div>
            <span class="legend-name">${line.short_name} – ${line.name}</span>
        </div>
    `).join('');
}

// ── Map click ────────────────────────────────────────────────────────────────

function setupMapClick() {
    map.on('click', async (e) => {
        if (clickState === 'done') return;
        const { lat, lng: lon } = e.latlng;
        const isStart = clickState === 'waiting_start';
        const type    = isStart ? 'start' : 'end';

        setClickedMarker(lat, lon, type);
        const station = await fetchNearestStation(lat, lon);
        if (!station) {
            if (isStart) clearStartMarkers(); else clearEndMarkers();
            return;
        }

        setStationMarker(station, type);
        renderPointCard(type, station);

        if (isStart) {
            startStation = station; startClick = { lat, lon };
            if (endStation) {
                clickState = 'done';
                document.getElementById('btn-find').disabled = false;
            } else {
                clickState = 'waiting_end';
            }
        } else {
            endStation = station; endClick = { lat, lon };
            clickState = 'done';
            document.getElementById('btn-find').disabled = false;
        }
        updateInstruction();
    });
}

async function fetchNearestStation(lat, lon) {
    try {
        const res = await fetch(`${CONFIG.API_BASE}/api/nearest_station?lat=${lat}&lon=${lon}`);
        return res.ok ? await res.json() : null;
    } catch { return null; }
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function renderPointCard(type, station) {
    const nameEl  = document.getElementById(`${type}-station-name`);
    nameEl.textContent = station.name;
    nameEl.classList.remove('empty');
    document.getElementById(`${type}-station-lines`).innerHTML = (station.lines || [])
        .map(l => `<span class="line-badge" style="background:${l.color}">${l.short_name}</span>`)
        .join('');
}

function resetPointCard(type) {
    const nameEl = document.getElementById(`${type}-station-name`);
    nameEl.textContent = 'Chưa chọn';
    nameEl.classList.add('empty');
    document.getElementById(`${type}-station-lines`).innerHTML = '';
}

function updateInstruction() {
    const el    = document.getElementById('instruction-text');
    const start = document.getElementById('start-card');
    const end   = document.getElementById('end-card');
    start.classList.remove('active-selection');
    end.classList.remove('active-selection');

    if (clickState === 'waiting_start') {
        el.innerHTML = 'Click lên bản đồ để chọn <strong>điểm xuất phát</strong>';
        start.classList.add('active-selection');
    } else if (clickState === 'waiting_end') {
        el.innerHTML = 'Click lên bản đồ để chọn <strong>điểm đến</strong>';
        end.classList.add('active-selection');
    } else {
        el.innerHTML = 'Nhấn <strong>Tìm đường</strong> hoặc click lại để thay đổi điểm';
    }
}

function setupButtons() {
    document.getElementById('btn-find').onclick  = findRoute;
    document.getElementById('btn-clear').onclick = clearAll;
    document.getElementById('btn-clear-start').onclick = () => clearPoint('start');
    document.getElementById('btn-clear-end').onclick   = () => clearPoint('end');
}

// Exposed globally để nút ✕ trên cờ hiệu bản đồ gọi được
function clearPoint(type) {
    if (type === 'start') {
        startStation = startClick = null;
        clearStartMarkers();
        resetPointCard('start');
        clickState = 'waiting_start';
    } else {
        endStation = endClick = null;
        clearEndMarkers();
        resetPointCard('end');
        clickState = startStation ? 'waiting_end' : 'waiting_start';
    }
    clearRoute();
    document.getElementById('result-box').style.display = 'none';
    document.getElementById('blocked-box').style.display = 'none';
    document.getElementById('btn-find').disabled = true;
    updateInstruction();
}

function clearAll() {
    startStation = endStation = startClick = endClick = null;
    clearRoute();
    clearAllMarkers();
    resetPointCard('start');
    resetPointCard('end');
    document.getElementById('result-box').style.display = 'none';
    document.getElementById('blocked-box').style.display = 'none';
    document.getElementById('btn-find').disabled = true;
    clickState = 'waiting_start';
    updateInstruction();
}

// ── Tìm đường ────────────────────────────────────────────────────────────────

async function findRoute() {
    if (!startStation || !endStation) return;
    if (startStation.id === endStation.id) {
        await showModal('Lưu ý', 'Điểm đi và điểm đến là cùng một ga!', [{ label: 'OK', cls: 'primary' }]);
        return;
    }

    const btn = document.getElementById('btn-find');
    btn.textContent = 'Đang tìm...';
    btn.disabled    = true;

    try {
        const url = `${CONFIG.API_BASE}/api/route`
            + `?start_lat=${startStation.lat}&start_lon=${startStation.lon}`
            + `&goal_lat=${endStation.lat}&goal_lon=${endStation.lon}`;
        const res = await fetch(url);

        if (res.ok) {
            const data = await res.json();
            drawRoute(data.segments);
            renderResult(data, null);
            renderBlockedBox(null);
            return;
        }

        drawRoute([]);
        document.getElementById('result-box').style.display = 'none';

        let errData = null;
        try { errData = await res.json(); } catch {}
        const blocked = errData?.detail?.blocked ?? null;
        renderBlockedBox(blocked);

        await showModal('Không tìm được đường đi', buildBlockedBodyHtml(blocked),
            [{ label: 'OK', cls: 'primary' }]);

        const choice = await showModal(
            'Tìm đường thay thế',
            'Phải di chuyển ra ga xa hơn để có đường đi.<br>Bạn có đồng ý không?',
            [{ label: 'Đồng ý', cls: 'confirm' }, { label: 'Hủy', cls: 'secondary' }]
        );
        if (choice === 1) return;

        btn.textContent = 'Thử ga lân cận...';
        const alt = await tryAlternativeRoute(startStation, endStation);
        if (alt) {
            drawRoute(alt.data.segments);
            renderResult(alt.data, alt.note);
            // Chỉ di chuyển cờ hiệu của ga bị thay thế
            setStationMarker(alt.altStation, alt.altType);
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

// ── Render kết quả ───────────────────────────────────────────────────────────

function renderResult(data, altNote) {
    document.getElementById('result-stops').textContent = data.num_stations + ' ga';
    document.getElementById('result-dist').textContent  = (data.distance / 1000).toFixed(2) + ' km';

    const seen = new Set();
    document.getElementById('result-lines').innerHTML = data.segments
        .filter(s => s.line_id && !seen.has(s.line_id) && seen.add(s.line_id))
        .map(s => `<span class="line-badge" style="background:${s.line_color}">${s.line_short || s.line_name}</span>`)
        .join('');

    document.getElementById('result-path').textContent = data.path.map(p => p.name).join(' → ');

    const altEl = document.getElementById('result-alt');
    altEl.style.display = altNote ? 'block' : 'none';
    if (altNote) altEl.innerHTML = '⚠ ' + altNote;

    document.getElementById('result-box').style.display = 'block';
}

function renderBlockedBox(blocked) {
    const box = document.getElementById('blocked-box');
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
