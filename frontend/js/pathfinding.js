let selectingStart = false, selectingEnd = false;
let startCoord = null, endCoord = null;

document.addEventListener('DOMContentLoaded', () => {
    initMap();

    map.on('click', (e) => {
    const coord = latLngToPx(e.latlng);
    if (selectingStart) {
        startCoord = coord;
        setStartMarker(e.latlng);
        document.getElementById('start-display').textContent =
            `(${coord.x}, ${coord.y})`;
        selectingStart = false;
        document.getElementById('btn-select-start').classList.remove('active');
    } else if (selectingEnd) {
        endCoord = coord;
        setEndMarker(e.latlng);
        document.getElementById('end-display').textContent =
            `(${coord.x}, ${coord.y})`;
        selectingEnd = false;
        document.getElementById('btn-select-end').classList.remove('active');
    }
    });

    document.getElementById('btn-select-start').onclick = () => {
        selectingStart = true; selectingEnd = false;
        document.getElementById('btn-select-start').classList.add('active');
        document.getElementById('btn-select-end').classList.remove('active');
    };

    document.getElementById('btn-select-end').onclick = () => {
        selectingEnd = true; selectingStart = false;
        document.getElementById('btn-select-end').classList.add('active');
        document.getElementById('btn-select-start').classList.remove('active');
    };

    document.getElementById('btn-car').onclick = () => {
        document.getElementById('btn-car').classList.add('active');
        document.getElementById('btn-foot').classList.remove('active');
        document.getElementById('speed').value = 40;
    };

    document.getElementById('btn-foot').onclick = () => {
        document.getElementById('btn-foot').classList.add('active');
        document.getElementById('btn-car').classList.remove('active');
        document.getElementById('speed').value = 5;
    };

    document.getElementById('btn-find').onclick = findPath;
    document.getElementById('btn-clear').onclick = () => {
        clearMap();
        startCoord = endCoord = null;
        document.getElementById('start-display').textContent = 'Chưa chọn';
        document.getElementById('end-display').textContent = 'Chưa chọn';
        document.getElementById('result-distance').textContent = '-';
        document.getElementById('result-nodes').textContent = '-';
        document.getElementById('result-time').textContent = '-';
    };

    window.addEventListener('storage', () => {
        if (startCoord && endCoord) findPath();
    });
});

function getVehicle() {
    return document.getElementById('btn-car').classList.contains('active') ? 'car' : 'foot';
}

async function findPath() {
    if (!startCoord || !endCoord) {
        alert('Vui lòng chọn điểm bắt đầu và kết thúc!');
        return;
    }

    const vehicle = getVehicle();
    const speed   = parseFloat(document.getElementById('speed').value) || 5;
    console.log('startCoord:', startCoord);
    console.log('endCoord:', endCoord);
    const url = `${CONFIG.API_BASE}/api/path?sx=${startCoord.x}&sy=${startCoord.y}&gx=${endCoord.x}&gy=${endCoord.y}&vehicle=${vehicle}&speed=${speed}`;

    document.getElementById('btn-find').textContent = 'Đang tìm...';
    try {
        const res  = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            alert('Lỗi: ' + (err.detail || 'Không tìm được đường'));
            return;
        }
        const data = await res.json();
        console.log('Full response:', JSON.stringify(data));
        if (data.path && data.path.length > 0) {
            drawPath(data.path);
        } else {
            console.log('No path in response!');
        }

        document.getElementById('result-distance').textContent = data.distance + ' m';
        document.getElementById('result-nodes').textContent    = data.nodes;
        const mins = Math.floor(data.time_seconds / 60);
        const secs = data.time_seconds % 60;
        document.getElementById('result-time').textContent = `${mins}m ${secs}s`;
    } catch (e) {
        alert('Không thể kết nối server!');
    } finally {
        document.getElementById('btn-find').textContent = 'Tìm đường tối ưu';
    }
}