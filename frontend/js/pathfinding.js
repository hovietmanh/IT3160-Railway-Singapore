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

let _scenarioFingerprint = null;  // null = uninitialized

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await Promise.all([loadNetwork(), loadStations()]);
    setupMapClick();
    setupButtons();
    updateInstruction();
    startScenarioPolling();
});

function startScenarioPolling() {
    setInterval(async () => {
        try {
            const res = await fetch(`${CONFIG.API_BASE}/api/scenarios`);
            if (!res.ok) return;
            const scenarios = await res.json();
            const fp = JSON.stringify(scenarios.map(s => s.id + s.type));
            if (_scenarioFingerprint === null) {
                // Lần đầu poll – chỉ ghi nhớ, không tự tìm lại
                _scenarioFingerprint = fp;
            } else if (fp !== _scenarioFingerprint) {
                _scenarioFingerprint = fp;
                if (startStation && endStation) {
                    await findRoute();
                }
            }
        } catch { /* bỏ qua lỗi mạng */ }
    }, 3000);
}

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

// ── Modal helper ─────────────────────────────────────────────────────────────

function showModal(title, bodyHtml, buttons) {
    return new Promise(resolve => {
        document.getElementById('mrt-modal-title').textContent   = title;
        document.getElementById('mrt-modal-body').innerHTML      = bodyHtml;

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

// ── findRoute ────────────────────────────────────────────────────────────────

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

        // Không tìm được đường trực tiếp – xóa route cũ
        drawRoute([]);
        document.getElementById('result-box').style.display = 'none';

        let errData = null;
        try { errData = await res.json(); } catch {}
        const blocked = errData?.detail?.blocked ?? null;
        renderBlockedBox(blocked);

        // Bước 1: modal thông báo lý do
        const bodyHtml = buildBlockedBodyHtml(blocked);
        await showModal('Không tìm được đường đi', bodyHtml,
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

        // Thử ga lân cận
        btn.textContent = 'Thử ga lân cận...';
        const alt = await tryAlternativeStations(startStation, endStation);
        if (alt) {
            drawRoute(alt.data.segments);
            renderResult(alt.data, alt.note);
        } else {
            await showModal('Không tìm được', 'Không tìm được đường đi, kể cả khi thử các ga lân cận.',
                [{ label: 'OK', cls: 'primary' }]);
        }
    } catch {
        await showModal('Lỗi', 'Không thể kết nối server!', [{ label: 'OK', cls: 'primary' }]);
    } finally {
        btn.textContent = 'Tìm đường';
        btn.disabled    = false;
    }
}

async function tryAlternativeStations(origStart, origEnd) {
    let nearby;
    try {
        const [resS, resE] = await Promise.all([
            fetch(`${CONFIG.API_BASE}/api/nearby_stations?lat=${origStart.lat}&lon=${origStart.lon}&limit=4`),
            fetch(`${CONFIG.API_BASE}/api/nearby_stations?lat=${origEnd.lat}&lon=${origEnd.lon}&limit=4`),
        ]);
        const [nearStart, nearEnd] = await Promise.all([resS.json(), resE.json()]);
        nearby = {
            starts: nearStart.filter(s => s.id !== origStart.id),
            ends:   nearEnd.filter(s => s.id !== origEnd.id),
        };
    } catch { return null; }

    // Thử ga xuất phát thay thế → điểm đến gốc
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

    // Thử ga xuất phát gốc → điểm đến thay thế
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

function renderResult(data, altNote) {
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

    // Thông báo ga thay thế
    const altEl = document.getElementById('result-alt');
    if (altNote) {
        altEl.innerHTML = '⚠ ' + altNote;
        altEl.style.display = 'block';
    } else {
        altEl.style.display = 'none';
    }

    document.getElementById('result-box').style.display = 'block';
}

function renderBlockedBox(blocked) {
    const box = document.getElementById('blocked-box');
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
