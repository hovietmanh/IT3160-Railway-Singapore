/* ===== PATHFINDING MODULE =====
 * Luồng:
 *   1. User click map → chọn điểm start (click lần 1) hoặc end (click lần 2)
 *   2. Backend trả về ga gần nhất → hiển thị marker
 *   3. Khi có cả start + end → bật nút Tìm đường
 *   4. Gọi /api/route → vẽ đường đi với màu theo tuyến
 */

// 'waiting_start' | 'waiting_end' | 'done'
let clickState   = 'waiting_start';
let startStation = null;
let endStation   = null;
let startClick   = null;  // {lat, lon} điểm user click
let endClick     = null;

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await Promise.all([loadNetwork(), loadStations()]);
    setupMapClick();
    setupButtons();
    updateInstruction();
});

async function loadNetwork() {
    const res  = await fetch(`${CONFIG.API_BASE}/api/network`);
    const data = await res.json();
    drawNetwork(data);
    renderLegend(data);
}

async function loadStations() {
    const res  = await fetch(`${CONFIG.API_BASE}/api/stations`);
    const data = await res.json();
    drawStations(data);
}

function renderLegend(networkData) {
    const list = document.getElementById('legend-list');
    list.innerHTML = '';
    networkData.forEach(line => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background:${line.color}"></div>
            <span class="legend-name">${line.short_name} – ${line.name}</span>
        `;
        list.appendChild(item);
    });
}

function setupMapClick() {
    map.on('click', async (e) => {
        if (clickState === 'done') return;

        const { lat, lng: lon } = e.latlng;

        if (clickState === 'waiting_start') {
            startClick = { lat, lon };
            setClickedMarker(lat, lon, 'start');
            const station = await fetchNearestStation(lat, lon);
            if (!station) return;
            startStation = station;
            setStationMarker(station, 'start');
            renderPointCard('start', station);
            clickState = 'waiting_end';
            updateInstruction();
        } else if (clickState === 'waiting_end') {
            endClick = { lat, lon };
            setClickedMarker(lat, lon, 'end');
            const station = await fetchNearestStation(lat, lon);
            if (!station) return;
            endStation = station;
            setStationMarker(station, 'end');
            renderPointCard('end', station);
            clickState = 'done';
            updateInstruction();
            document.getElementById('btn-find').disabled = false;
        }
    });
}

async function fetchNearestStation(lat, lon) {
    try {
        const res = await fetch(`${CONFIG.API_BASE}/api/nearest_station?lat=${lat}&lon=${lon}`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function renderPointCard(type, station) {
    const nameEl  = document.getElementById(`${type}-station-name`);
    const linesEl = document.getElementById(`${type}-station-lines`);

    nameEl.textContent = station.name;
    nameEl.classList.remove('empty');

    linesEl.innerHTML = (station.lines || [])
        .map(l => `<span class="line-badge" style="background:${l.color}">${l.short_name}</span>`)
        .join('');
}

function updateInstruction() {
    const el = document.getElementById('instruction-text');
    if (clickState === 'waiting_start') {
        el.innerHTML = 'Click lên bản đồ để chọn <strong>điểm xuất phát</strong>';
        document.getElementById('start-card').classList.remove('active-selection');
        document.getElementById('end-card').classList.remove('active-selection');
        document.getElementById('start-card').classList.add('active-selection');
    } else if (clickState === 'waiting_end') {
        el.innerHTML = 'Click lên bản đồ để chọn <strong>điểm đến</strong>';
        document.getElementById('start-card').classList.remove('active-selection');
        document.getElementById('end-card').classList.add('active-selection');
    } else {
        el.innerHTML = 'Nhấn <strong>Tìm đường</strong> hoặc click lại để thay đổi điểm';
        document.getElementById('end-card').classList.remove('active-selection');
    }
}

function setupButtons() {
    document.getElementById('btn-find').onclick  = findRoute;
    document.getElementById('btn-clear').onclick = clearAll;

    document.getElementById('btn-clear-start').onclick = () => {
        startStation = startClick = null;
        resetPointCard('start');
        clearRoute();
        document.getElementById('result-box').style.display = 'none';
        document.getElementById('btn-find').disabled = true;
        clickState = 'waiting_start';
        updateInstruction();
    };

    document.getElementById('btn-clear-end').onclick = () => {
        endStation = endClick = null;
        resetPointCard('end');
        clearRoute();
        document.getElementById('result-box').style.display = 'none';
        document.getElementById('btn-find').disabled = true;
        clickState = startStation ? 'waiting_end' : 'waiting_start';
        updateInstruction();
    };
}

function resetPointCard(type) {
    const nameEl  = document.getElementById(`${type}-station-name`);
    const linesEl = document.getElementById(`${type}-station-lines`);
    nameEl.textContent = 'Chưa chọn';
    nameEl.classList.add('empty');
    linesEl.innerHTML  = '';
}

function clearAll() {
    startStation = endStation = startClick = endClick = null;
    clearRoute();
    resetPointCard('start');
    resetPointCard('end');
    document.getElementById('result-box').style.display = 'none';
    document.getElementById('btn-find').disabled = true;
    clickState = 'waiting_start';
    updateInstruction();
}

async function findRoute() {
    if (!startStation || !endStation) return;
    if (startStation.id === endStation.id) {
        alert('Điểm đi và điểm đến là cùng một ga!');
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
        if (!res.ok) {
            const err = await res.json();
            alert('Lỗi: ' + (err.detail || 'Không tìm được đường đi'));
            return;
        }
        const data = await res.json();
        drawRoute(data.segments);
        renderResult(data);
    } catch {
        alert('Không thể kết nối server!');
    } finally {
        btn.textContent = 'Tìm đường';
        btn.disabled    = false;
    }
}

function renderResult(data) {
    document.getElementById('result-stops').textContent = data.num_stations + ' ga';
    document.getElementById('result-dist').textContent  = (data.distance / 1000).toFixed(2) + ' km';

    // Tuyến sử dụng (dedup)
    const usedLines = [];
    const seenLineIds = new Set();
    data.segments.forEach(seg => {
        if (seg.line_id && !seenLineIds.has(seg.line_id)) {
            seenLineIds.add(seg.line_id);
            usedLines.push(seg);
        }
    });
    const linesEl = document.getElementById('result-lines');
    linesEl.innerHTML = usedLines.map(seg =>
        `<span class="line-badge" style="background:${seg.line_color}">${seg.line_short || seg.line_name}</span>`
    ).join('');

    // Chuỗi tên ga
    const names = data.path.map(p => p.name);
    document.getElementById('result-path').textContent = names.join(' → ');

    document.getElementById('result-box').style.display = 'block';
}
