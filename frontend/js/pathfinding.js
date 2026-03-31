let allStations = [];
let startStation = null, endStation = null;

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await loadStations();
    setupSearch();
    setupButtons();
});

async function loadStations() {
    const res = await fetch(`${CONFIG.API_BASE}/api/stations`);
    allStations = await res.json();
    drawStations(allStations);
}

function setupSearch() {
    const startInput = document.getElementById('start-input');
    const endInput   = document.getElementById('end-input');
    const startList  = document.getElementById('start-list');
    const endList    = document.getElementById('end-list');

    startInput.addEventListener('input', () => {
        showSuggestions(startInput.value, startList, (s) => {
            startStation = s;
            startInput.value = s.name;
            startList.innerHTML = '';
            setStartMarker(s.lat, s.lon, s.name);
            map.setView([s.lat, s.lon], 14);
        });
    });

    endInput.addEventListener('input', () => {
        showSuggestions(endInput.value, endList, (s) => {
            endStation = s;
            endInput.value = s.name;
            endList.innerHTML = '';
            setEndMarker(s.lat, s.lon, s.name);
            map.setView([s.lat, s.lon], 14);
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#start-box')) startList.innerHTML = '';
        if (!e.target.closest('#end-box'))   endList.innerHTML = '';
    });
}

function showSuggestions(query, listEl, onSelect) {
    listEl.innerHTML = '';
    if (!query.trim()) return;
    const matches = allStations.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);
    matches.forEach(s => {
        const li = document.createElement('li');
        li.textContent = s.name;
        li.onclick = () => onSelect(s);
        listEl.appendChild(li);
    });
}

function setupButtons() {
    document.getElementById('btn-find').onclick = findRoute;
    document.getElementById('btn-clear').onclick = () => {
        clearMap();
        startStation = endStation = null;
        document.getElementById('start-input').value = '';
        document.getElementById('end-input').value   = '';
        document.getElementById('result-box').style.display = 'none';
    };
}

async function findRoute() {
    if (!startStation || !endStation) {
        alert('Vui lòng chọn điểm đi và điểm đến!');
        return;
    }
    if (startStation.id === endStation.id) {
        alert('Điểm đi và điểm đến phải khác nhau!');
        return;
    }

    document.getElementById('btn-find').textContent = 'Đang tìm...';
    try {
        const url = `${CONFIG.API_BASE}/api/route?start_lat=${startStation.lat}&start_lon=${startStation.lon}&goal_lat=${endStation.lat}&goal_lon=${endStation.lon}`;
        const res  = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            alert('Lỗi: ' + (err.detail || 'Không tìm được đường'));
            return;
        }
        const data = await res.json();
        drawPath(data.path);

        const names = data.path.map(p => p.name);
        document.getElementById('result-stops').textContent  = data.nodes + ' ga';
        document.getElementById('result-dist').textContent   = (data.distance / 1000).toFixed(1) + ' km';
        document.getElementById('result-path').textContent   = names.join(' → ');
        document.getElementById('result-box').style.display  = 'block';
    } catch (e) {
        alert('Không thể kết nối server!');
    } finally {
        document.getElementById('btn-find').textContent = 'Tìm đường';
    }
}