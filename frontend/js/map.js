let map, startMarker, endMarker, pathLayer, stationLayers = [];

function initMap() {
    map = L.map('map').setView([1.3521, 103.8198], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);
}

function drawStations(stations) {
    stationLayers.forEach(l => map.removeLayer(l));
    stationLayers = [];
    stations.forEach(s => {
        const m = L.circleMarker([s.lat, s.lon], {
            radius: 5,
            fillColor: '#d42e12',
            color: '#fff',
            weight: 1.5,
            fillOpacity: 1
        }).addTo(map).bindPopup(`<b>${s.name}</b>`);
        stationLayers.push(m);
    });
}

function setStartMarker(lat, lon, name) {
    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: '',
            html: '<div style="background:#16a34a;color:#fff;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap">▶ ' + name + '</div>',
            iconAnchor: [0, 0]
        })
    }).addTo(map);
}

function setEndMarker(lat, lon, name) {
    if (endMarker) map.removeLayer(endMarker);
    endMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: '',
            html: '<div style="background:#dc2626;color:#fff;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap">■ ' + name + '</div>',
            iconAnchor: [0, 0]
        })
    }).addTo(map);
}

function drawPath(pathCoords) {
    if (pathLayer) map.removeLayer(pathLayer);
    const latlngs = pathCoords.map(p => [p.lat, p.lon]);
    pathLayer = L.polyline(latlngs, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.85
    }).addTo(map);
    map.fitBounds(pathLayer.getBounds(), { padding: [40, 40] });
}

function clearMap() {
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker)   map.removeLayer(endMarker);
    if (pathLayer)   map.removeLayer(pathLayer);
    startMarker = endMarker = pathLayer = null;
}