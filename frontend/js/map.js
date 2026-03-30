let map, startMarker, endMarker, pathLayer;

const LON_MIN = 103.8400, LON_MAX = 103.8650;
const LAT_MIN = 1.2700,   LAT_MAX = 1.3050;
const PX_W = 8500, PX_H = 7800;

function initMap() {
    console.log('initMap called!');
    map = L.map('map').setView([1.2875, 103.8525], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap © CARTO'
    }).addTo(map);
}

function pxToLatLng(x, y) {
    const lon = LON_MIN + (x / PX_W) * (LON_MAX - LON_MIN);
    const lat = LAT_MIN + ((PX_H - y) / PX_H) * (LAT_MAX - LAT_MIN);
    return [lat, lon];
}

function latLngToPx(latlng) {
    const x = (latlng.lng - LON_MIN) / (LON_MAX - LON_MIN) * PX_W;
    const y = PX_H - (latlng.lat - LAT_MIN) / (LAT_MAX - LAT_MIN) * PX_H;
    return { x: Math.round(x), y: Math.round(y) };
}

function drawPath(pathCoords) {
    if (pathLayer) map.removeLayer(pathLayer);
    const latlngs = pathCoords.map(p => pxToLatLng(p.x, p.y));
    pathLayer = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: 0.9 }).addTo(map);
    map.fitBounds(pathLayer.getBounds(), { padding: [40, 40] });
}

function setStartMarker(latlng) {
    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.circleMarker(latlng, {
        radius: 10, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1
    }).addTo(map).bindPopup('Start').openPopup();
}

function setEndMarker(latlng) {
    if (endMarker) map.removeLayer(endMarker);
    endMarker = L.circleMarker(latlng, {
        radius: 10, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1
    }).addTo(map).bindPopup('End').openPopup();
}

function clearMap() {
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker)   map.removeLayer(endMarker);
    if (pathLayer)   map.removeLayer(pathLayer);
    startMarker = endMarker = pathLayer = null;
}