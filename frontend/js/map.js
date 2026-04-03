/* ===== MAP MODULE =====
 * Quản lý Leaflet map, vẽ mạng lưới tuyến tàu, markers, và đường đi.
 */

let map;
let networkLayers  = [];   // polylines của toàn bộ mạng lưới
let stationLayers  = [];   // circle markers các ga
let routeLayers    = [];   // polylines đường đi tìm được
let startMarker    = null;
let endMarker      = null;
let clickedStart   = null; // marker điểm click của user (start)
let clickedEnd     = null; // marker điểm click của user (end)

function initMap() {
    map = L.map('map').setView([1.3521, 103.8198], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);
}

/* ----- Vẽ mạng lưới tuyến tàu ----- */
function drawNetwork(networkData) {
    networkLayers.forEach(l => map.removeLayer(l));
    networkLayers = [];

    networkData.forEach(line => {
        line.segments.forEach(coords => {
            if (coords.length < 2) return;
            const poly = L.polyline(coords, {
                color:   line.color,
                weight:  4,
                opacity: 0.75
            }).addTo(map);
            poly.bindTooltip(line.name, { sticky: true });
            networkLayers.push(poly);
        });
    });
}

/* ----- Vẽ tất cả ga ----- */
function drawStations(stations) {
    stationLayers.forEach(l => map.removeLayer(l));
    stationLayers = [];

    stations.forEach(s => {
        // Màu ga = màu tuyến đầu tiên, hoặc xám nếu không biết
        const color = s.lines && s.lines.length > 0 ? s.lines[0].color : '#888888';
        const m = L.circleMarker([s.lat, s.lon], {
            radius: 4, fillColor: color,
            color: '#fff', weight: 1.5, fillOpacity: 1,
            pane: 'markerPane'
        }).addTo(map);

        const linesHtml = (s.lines || [])
            .map(l => `<span style="background:${l.color};color:#fff;padding:1px 5px;border-radius:8px;font-size:11px">${l.short_name}</span>`)
            .join(' ');
        m.bindPopup(`<b>${s.name}</b><br>${linesHtml}`);
        stationLayers.push(m);
    });
}

/* ----- Marker điểm user đã click trên map ----- */
function setClickedMarker(lat, lon, type) {
    const isStart = (type === 'start');
    if (isStart) {
        if (clickedStart) map.removeLayer(clickedStart);
        clickedStart = L.circleMarker([lat, lon], {
            radius: 7, fillColor: '#16a34a',
            color: '#fff', weight: 2, fillOpacity: 0.5,
            dashArray: '4 3'
        }).addTo(map).bindTooltip('Điểm click (xuất phát)', { permanent: false });
    } else {
        if (clickedEnd) map.removeLayer(clickedEnd);
        clickedEnd = L.circleMarker([lat, lon], {
            radius: 7, fillColor: '#dc2626',
            color: '#fff', weight: 2, fillOpacity: 0.5,
            dashArray: '4 3'
        }).addTo(map).bindTooltip('Điểm click (đích)', { permanent: false });
    }
}

/* ----- Marker ga được snap tới ----- */
function setStationMarker(station, type) {
    const isStart = (type === 'start');
    if (isStart) {
        if (startMarker) map.removeLayer(startMarker);
        startMarker = L.marker([station.lat, station.lon], {
            icon: L.divIcon({
                className: '',
                html: `<div style="
                    background:#16a34a;color:#fff;
                    padding:4px 8px;border-radius:6px;
                    font-size:12px;font-weight:600;
                    white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.4)
                ">&#9654; ${station.name}</div>`,
                iconAnchor: [0, 0]
            })
        }).addTo(map);
    } else {
        if (endMarker) map.removeLayer(endMarker);
        endMarker = L.marker([station.lat, station.lon], {
            icon: L.divIcon({
                className: '',
                html: `<div style="
                    background:#dc2626;color:#fff;
                    padding:4px 8px;border-radius:6px;
                    font-size:12px;font-weight:600;
                    white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.4)
                ">&#9632; ${station.name}</div>`,
                iconAnchor: [0, 0]
            })
        }).addTo(map);
    }
}

/* ----- Vẽ đường đi màu trắng nổi bật trên nền tuyến ----- */
function drawRoute(segments) {
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];

    segments.forEach(seg => {
        if (!seg.coords || seg.coords.length < 2) return;

        // Viền màu tuyến (dày hơn, phía dưới)
        const border = L.polyline(seg.coords, {
            color:     seg.line_color || '#888888',
            weight:    10,
            opacity:   0.9,
            lineCap:  'round',
            lineJoin: 'round'
        }).addTo(map);
        routeLayers.push(border);

        // Đường trắng phía trên
        const white = L.polyline(seg.coords, {
            color:    '#ffffff',
            weight:   5,
            opacity:  1,
            lineCap:  'round',
            lineJoin: 'round'
        }).addTo(map);
        white.bindTooltip(seg.line_name || '', { sticky: true });
        routeLayers.push(white);
    });

    if (routeLayers.length > 0) {
        const group = L.featureGroup(routeLayers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
}

/* ----- Xóa markers và route, giữ lại mạng lưới và ga ----- */
function clearRoute() {
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];
    if (startMarker)  { map.removeLayer(startMarker);  startMarker  = null; }
    if (endMarker)    { map.removeLayer(endMarker);    endMarker    = null; }
    if (clickedStart) { map.removeLayer(clickedStart); clickedStart = null; }
    if (clickedEnd)   { map.removeLayer(clickedEnd);   clickedEnd   = null; }
}
