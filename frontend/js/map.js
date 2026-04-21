/* ===== MAP MODULE =====
 * Quản lý Leaflet map, vẽ mạng lưới tuyến tàu, markers, và đường đi.
 *
 * Renderer strategy:
 *   - Network polylines + route polylines → L.svg() (SVG pans via CSS matrix
 *     transform = GPU-accelerated, near-instant on pan)
 *   - Station circleMarkers → L.canvas() / preferCanvas:true (faster for many
 *     small elements)
 */

let map;
let networkEdgeLayers  = [];  // [{fromId, toId, lineId, poly, hit}]
let _closedLineIds     = new Set();
let _closedStationIds  = new Set();
let stationLayers      = [];
let stationLayersById  = {};
let routeLayers        = [];
let startMarker        = null;
let endMarker          = null;
let clickedStart       = null;
let clickedEnd         = null;

// Shared SVG renderers — created once, reused for all polylines.
// padding:0.5 pre-renders 50% beyond viewport so short pans need no redraw.
let _svgNetwork = null;
let _svgRoute   = null;

const SG_BOUNDS = L.latLngBounds(
    L.latLng(1.2050, 103.6200),
    L.latLng(1.4710, 104.0100)
);

function initMap() {
    map = L.map('map', {
        maxBounds: SG_BOUNDS, maxBoundsViscosity: 0.8,
        minZoom: 12, maxZoom: 18,
        preferCanvas: true,   // default Canvas for station circles
    }).setView([1.3521, 103.8198], 12);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        keepBuffer: 10,
        updateWhenIdle: false,
        updateWhenZooming: false,
    }).addTo(map);

    map.createPane('routePane').style.zIndex = 450;

    // Initialise SVG renderers after map exists
    _svgNetwork = L.svg({ padding: 0.5 }).addTo(map);
    _svgRoute   = L.svg({ padding: 0.5 }).addTo(map);
}

/* ----- Vẽ mạng lưới tuyến tàu ----- */
function drawNetwork(networkData) {
    networkEdgeLayers.forEach(e => { map.removeLayer(e.poly); map.removeLayer(e.hit); });
    networkEdgeLayers = [];
    _closedLineIds    = new Set();
    _closedStationIds = new Set();

    networkData.forEach(line => {
        (line.edges || []).forEach(edge => {
            if (!edge.coords || edge.coords.length < 2) return;

            const poly = L.polyline(edge.coords, {
                color: line.color, weight: 4, opacity: 0.75,
                smoothFactor: 2, renderer: _svgNetwork,
                interactive: false,
            }).addTo(map);

            const hit = L.polyline(edge.coords, {
                color: line.color, weight: 20, opacity: 0,
                smoothFactor: 2,
            }).addTo(map);
            hit.bindTooltip(line.name, { sticky: true, direction: 'top', offset: [0, -4] });

            networkEdgeLayers.push({ fromId: edge.from_id, toId: edge.to_id, lineId: line.id, poly, hit });
        });
    });
}

function _refreshEdgeVisibility() {
    networkEdgeLayers.forEach(e => {
        const hidden = _closedLineIds.has(e.lineId)
                    || _closedStationIds.has(e.fromId)
                    || _closedStationIds.has(e.toId);
        e.poly.setStyle({ opacity: hidden ? 0 : 0.75 });
    });
}

function updateNetworkVisibility(closedLineIds) {
    _closedLineIds = closedLineIds;
    _refreshEdgeVisibility();
}

/* ----- Vẽ tất cả ga ----- */
function drawStations(stations) {
    stationLayers.forEach(l => map.removeLayer(l));
    stationLayers = [];
    stationLayersById = {};
    stations.forEach(s => {
        const color = s.lines?.[0]?.color ?? '#888888';
        const m = L.circleMarker([s.lat, s.lon], {
            radius: 4, fillColor: color,
            color: '#fff', weight: 1.5, fillOpacity: 1,
            pane: 'markerPane',
        }).addTo(map);
        const linesHtml = (s.lines || [])
            .map(l => `<span style="background:${l.color};color:#fff;padding:1px 5px;border-radius:8px;font-size:11px">${l.short_name}</span>`)
            .join(' ');
        m.bindTooltip(s.name, { sticky: false, direction: 'top', offset: [0, -6] });
        m.bindPopup(`<b>${s.name}</b><br>${linesHtml}`);
        stationLayers.push(m);
        stationLayersById[s.id] = m;
    });
}

function updateStationVisibility(closedStationIds) {
    _closedStationIds = closedStationIds;
    _refreshEdgeVisibility();
    Object.entries(stationLayersById).forEach(([idStr, m]) => {
        const hidden = closedStationIds.has(parseInt(idStr));
        m.setStyle({ opacity: hidden ? 0 : 1, fillOpacity: hidden ? 0 : 1 });
    });
}

/* ----- Marker điểm user click + snap ga ----- */
function setClickedMarker(lat, lon, type) {
    const isStart = type === 'start';
    const color   = isStart ? '#16a34a' : '#dc2626';
    const tip     = isStart ? 'Điểm click (xuất phát)' : 'Điểm click (đích)';
    const marker  = L.circleMarker([lat, lon], {
        radius: 7, fillColor: color, color: '#fff',
        weight: 2, fillOpacity: 0.5, dashArray: '4 3',
    }).addTo(map).bindTooltip(tip);

    if (isStart) { if (clickedStart) map.removeLayer(clickedStart); clickedStart = marker; }
    else         { if (clickedEnd)   map.removeLayer(clickedEnd);   clickedEnd   = marker; }
}

function setStationMarker(station, type) {
    const isStart = type === 'start';
    const color   = isStart ? '#16a34a' : '#dc2626';
    const symbol  = isStart ? '▶' : '◼';
    const marker  = L.marker([station.lat, station.lon], {
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
    }).addTo(map);

    // Dùng L.DomEvent để gắn sự kiện — đảm bảo click button không lan ra map
    const btn = marker.getElement().querySelector('.marker-clear-btn');
    if (btn) {
        L.DomEvent.on(btn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            clearPoint(type);
        });
    }

    if (isStart) { if (startMarker) map.removeLayer(startMarker); startMarker = marker; }
    else         { if (endMarker)   map.removeLayer(endMarker);   endMarker   = marker; }
}

/* ----- Vẽ đường đi ----- */
function drawRoute(segments) {
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];
    segments.forEach(seg => {
        if (!seg.coords || seg.coords.length < 2) return;
        const border = L.polyline(seg.coords, {
            color: seg.line_color || '#888', weight: 18, opacity: 1,
            lineCap: 'round', lineJoin: 'round', pane: 'routePane',
            smoothFactor: 1, renderer: _svgRoute,
        }).addTo(map);
        const white = L.polyline(seg.coords, {
            color: '#ffffff', weight: 9, opacity: 1,
            lineCap: 'round', lineJoin: 'round', pane: 'routePane',
            smoothFactor: 1, renderer: _svgRoute,
        }).addTo(map);
        white.bindTooltip(seg.line_name || '', { sticky: true });
        routeLayers.push(border, white);
    });
    if (routeLayers.length > 0) {
        map.fitBounds(L.featureGroup(routeLayers).getBounds(), { padding: [50, 50] });
    }
}

/* ----- Xóa markers và route ----- */
function clearRoute() {
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];
}

function clearStartMarkers() {
    if (startMarker)  { map.removeLayer(startMarker);  startMarker  = null; }
    if (clickedStart) { map.removeLayer(clickedStart); clickedStart = null; }
}

function clearEndMarkers() {
    if (endMarker)  { map.removeLayer(endMarker);  endMarker  = null; }
    if (clickedEnd) { map.removeLayer(clickedEnd); clickedEnd = null; }
}

function clearAllMarkers() {
    clearStartMarkers();
    clearEndMarkers();
}
