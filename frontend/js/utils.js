/* ===== SHARED UTILITIES =====
 * Dùng chung cho cả user page (pathfinding.js) và admin page (admin.js).
 */


// ── Modal ─────────────────────────────────────────────────────────────────────

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
        html += '<div class="modal-blocked-label">Tuyến bị đóng trên lộ trình:</div>'
              + '<div class="modal-tags">';
        blocked.lines.forEach(l => {
            html += `<span class="modal-tag" style="background:${l.color}">${l.short_name} ${l.name}</span>`;
        });
        html += '</div>';
    }
    if (blocked?.stations?.length) {
        html += '<div class="modal-blocked-label">Ga bị đóng trên lộ trình:</div>'
              + '<div class="modal-tags">';
        blocked.stations.forEach(s => {
            html += `<span class="modal-tag" style="background:#dc2626">⊗ ${s.name}</span>`;
        });
        html += '</div>';
    }
    return html || 'Không có đường đi với cấu hình hiện tại.';
}

// ── Alternative station search ────────────────────────────────────────────────

async function tryAlternativeRoute(origStart, origEnd) {
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
            return {
                data:       await res.json(),
                note:       `Không có đường trực tiếp – đề xuất đi từ <strong>${s.name}</strong> thay vì ${origStart.name}`,
                altType:    'start',
                altStation: s,
            };
        }
    }

    for (const e of nearby.ends) {
        if (e.id === origStart.id) continue;
        const res = await fetch(`${CONFIG.API_BASE}/api/route`
            + `?start_lat=${origStart.lat}&start_lon=${origStart.lon}`
            + `&goal_lat=${e.lat}&goal_lon=${e.lon}`);
        if (res.ok) {
            return {
                data:       await res.json(),
                note:       `Không có đường trực tiếp – đề xuất đến <strong>${e.name}</strong> thay vì ${origEnd.name}`,
                altType:    'end',
                altStation: e,
            };
        }
    }

    return null;
}
