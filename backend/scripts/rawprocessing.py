"""
rawprocessing.py  —  Build graph from export.json (OSM data).

Algorithm:
  Each OSM relation = one direction of a line.  Opposite directions use
  DIFFERENT platform node IDs for the same physical station, so we
  deduplicate by station NAME, not node ID.

  1. Load export.json, build node_map / way_map.
  2. Collect all stop names across all directions of a line.
  3. For each unique name, choose one canonical node (first seen).
  4. Deduplicate directions by name sequence (ignore reverses).
  5. For each unique direction:
       a. Map stop names → canonical station IDs.
       b. Chain relation ways → ordered node list.
       c. For each consecutive stop pair: find nearest chain nodes to the
          two stops, extract sub-chain as geometry.
       d. Create connection (s1, s2, weight=haversine, line_id).
  6. Insert lines, stations, connections (bidirectional),
     rail_geometry, line_stops into DB.
"""

import json
import math
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = Path("backend/data/pathfinding.db")
EXPORT  = Path("backend/scripts/export.json")

# Lines to process: ref -> (fixed_id, full_name, short_name, color)
LINE_META = {
    "NSL": (1, "MRT North-South Line",          "NSL", "#dc241f"),
    "EWL": (2, "MRT East-West Line",             "EWL", "#009530"),
    "CCL": (3, "MRT Circle Line",                "CCL", "#FF9A00"),
    "DTL": (4, "MRT Downtown Line",              "DTL", "#0354a6"),
    "NEL": (5, "MRT North East Line",            "NEL", "#9016b2"),
    "TEL": (6, "MRT Thomson-East Coast Line",    "TEL", "#9D5B25"),
}

STOP_ROLES = {"stop", "stop_entry_only", "stop_exit_only"}


def normalize_name(name: str) -> str:
    """Strip parenthetical line-code suffixes like '(EW2)' for dedup / lookup."""
    return name.split("(")[0].strip()


# ── Haversine distance (meters) ───────────────────────────────────────────────
def haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Chain OSM way members into ordered node-ID list ───────────────────────────
def chain_ways(way_refs, way_map):
    """
    Given an ordered list of way IDs from a relation, stitch them into a
    single ordered list of node IDs.  Handles both forward and reversed ways.
    """
    segments = []
    for wid in way_refs:
        w = way_map.get(wid)
        if w and len(w.get("nodes", [])) >= 2:
            segments.append(list(w["nodes"]))

    if not segments:
        return []

    chain = segments[0][:]
    remaining = list(segments[1:])

    for _ in range(len(remaining) + 1):
        if not remaining:
            break
        joined = False
        for i, seg in enumerate(remaining):
            if chain[-1] == seg[0]:           # forward append
                chain.extend(seg[1:])
            elif chain[-1] == seg[-1]:         # reversed append
                chain.extend(reversed(seg[:-1]))
            elif chain[0] == seg[-1]:          # forward prepend
                chain = seg[:-1] + chain
            elif chain[0] == seg[0]:           # reversed prepend
                chain = list(reversed(seg))[:-1] + chain
            else:
                continue
            remaining.pop(i)
            joined = True
            break
        if not joined:
            chain.extend(remaining[0])
            remaining.pop(0)

    return chain


# ── Get stop name list from a relation ───────────────────────────────────────
def get_stop_names(relation, node_map):
    """Returns list of (node_id, name, lat, lon) for named stop members."""
    result = []
    for m in relation.get("members", []):
        if m.get("role", "") not in STOP_ROLES:
            continue
        nid = m["ref"]
        n = node_map.get(nid)
        if n is None:
            continue
        name = (n.get("tags") or {}).get("name", "").strip()
        if not name:
            continue
        result.append((nid, name, n["lat"], n["lon"]))
    return result


# ── Find closest node in chain to a given lat/lon ────────────────────────────
def closest_chain_node(chain, lat, lon, node_map):
    """Return the index in chain whose node is closest to (lat, lon)."""
    best_i, best_d = 0, float("inf")
    for i, nid in enumerate(chain):
        n = node_map.get(nid)
        if n is None:
            continue
        d = (n["lat"] - lat) ** 2 + (n["lon"] - lon) ** 2
        if d < best_d:
            best_d = d
            best_i = i
    return best_i


# ── Extract geometry between two stops using chain ───────────────────────────
def extract_segment(chain, s1_lat, s1_lon, s2_lat, s2_lon, node_map):
    """
    Find approximate positions of stop1 and stop2 in the node chain,
    then return [[lat,lon],...] for the sub-chain between them.
    Returns None if chain is empty.
    """
    if not chain:
        return None

    i1 = closest_chain_node(chain, s1_lat, s1_lon, node_map)
    i2 = closest_chain_node(chain, s2_lat, s2_lon, node_map)

    if i1 <= i2:
        sub = chain[i1: i2 + 1]
    else:
        sub = list(reversed(chain[i2: i1 + 1]))

    coords = []
    for nid in sub:
        n = node_map.get(nid)
        if n:
            coords.append([n["lat"], n["lon"]])

    return coords if len(coords) >= 2 else None


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    with open(EXPORT, encoding="utf-8") as f:
        data = json.load(f)
    elements = data["elements"]

    node_map  = {e["id"]: e for e in elements if e["type"] == "node"}
    way_map   = {e["id"]: e for e in elements if e["type"] == "way"}
    relations = [e for e in elements if e["type"] == "relation"]

    print(f"Loaded: {len(node_map)} nodes, {len(way_map)} ways, "
          f"{len(relations)} relations")

    # Group subway relations by ref
    grouped = {}
    for r in relations:
        tags = r.get("tags", {})
        if tags.get("route") not in ("subway", "light_rail", "monorail", "rail"):
            continue
        ref = tags.get("ref", "")
        if ref not in LINE_META:
            continue
        grouped.setdefault(ref, []).append(r)

    # ── Collect all data ──────────────────────────────────────────────────────
    # canonical_stations: name_lower -> {id, name, lat, lon}  (first-seen node)
    canonical_stations = {}
    # connections: (min_canon_id, max_canon_id, line_id) -> dict
    connections = {}
    # line_stops_data: line_id -> list of direction_stops
    #   direction_stops: [(direction_id, seq, station_id), ...]
    line_stops_data = {}

    for ref, rels in grouped.items():
        lid, lname, lshort, lcolor = LINE_META[ref]
        print(f"\nProcessing {ref} ({len(rels)} relations):")

        # First pass: build canonical station map for this line
        # Use normalize_name to merge variants like "Tampines (EW2)" → "Tampines"
        for r in rels:
            for nid, name, lat, lon in get_stop_names(r, node_map):
                key = normalize_name(name).lower()
                if key not in canonical_stations:
                    canonical_stations[key] = {
                        "id": nid,
                        "name": normalize_name(name),
                        "lat": lat, "lon": lon,
                    }

        # Deduplicate directions by normalized name sequence
        seen_name_seqs = set()
        unique_dirs = []
        for r in rels:
            raw = get_stop_names(r, node_map)
            if not raw:
                continue
            names = tuple(normalize_name(x[1]).lower() for x in raw)
            canonical_names = names if names[0] <= names[-1] else names[::-1]
            if canonical_names in seen_name_seqs:
                continue
            seen_name_seqs.add(canonical_names)
            # Store in canonical (forward) direction
            if names[0] <= names[-1]:
                unique_dirs.append((r, raw))
            else:
                unique_dirs.append((r, list(reversed(raw))))

        print(f"  Unique directions: {len(unique_dirs)}")
        line_stops_data[lid] = []

        for dir_idx, (rel, raw_stops) in enumerate(unique_dirs):
            # Map raw stops to canonical stations using normalized name
            can_stops = []
            for nid, name, lat, lon in raw_stops:
                cs = canonical_stations.get(normalize_name(name).lower())
                if cs:
                    can_stops.append(cs)

            if len(can_stops) < 2:
                continue

            # Chain ways
            way_refs = [m["ref"] for m in rel.get("members", [])
                        if m["type"] == "way" and m.get("role", "") == ""]
            chain = chain_ways(way_refs, way_map)

            print(f"  dir={dir_idx}: {len(can_stops)} stops, "
                  f"{len(way_refs)} ways, chain={len(chain)} nodes  "
                  f"({can_stops[0]['name']} -> {can_stops[-1]['name']})")

            # Store line_stops
            dir_entries = [(dir_idx, seq, s["id"]) for seq, s in enumerate(can_stops)]
            line_stops_data[lid].append(dir_entries)

            # Build connections
            fallback = 0
            for i in range(len(can_stops) - 1):
                s1, s2 = can_stops[i], can_stops[i + 1]
                key = (min(s1["id"], s2["id"]), max(s1["id"], s2["id"]), lid)
                if key in connections:
                    continue

                seg = extract_segment(
                    chain, s1["lat"], s1["lon"], s2["lat"], s2["lon"], node_map
                ) if chain else None
                if seg is None:
                    seg = [[s1["lat"], s1["lon"]], [s2["lat"], s2["lon"]]]
                    fallback += 1

                connections[key] = {
                    "s1_id":   s1["id"],
                    "s2_id":   s2["id"],
                    "weight":  round(haversine(s1["lat"], s1["lon"],
                                               s2["lat"], s2["lon"]), 1),
                    "line_id": lid,
                    "geom":    json.dumps(seg),
                }

            if fallback:
                print(f"    fallback segments: {fallback}")

    # ── Write to DB ───────────────────────────────────────────────────────────
    db  = sqlite3.connect(DB_PATH)
    cur = db.cursor()

    for tbl in ("line_stops", "rail_geometry", "connections", "stations", "lines"):
        cur.execute(f"DELETE FROM {tbl}")

    # lines
    for ref, (lid, lname, lshort, lcolor) in LINE_META.items():
        if ref in grouped:
            cur.execute(
                "INSERT INTO lines (id, name, short_name, color) VALUES (?,?,?,?)",
                (lid, lname, lshort, lcolor),
            )

    # stations (only those used in connections)
    used_ids = {c["s1_id"] for c in connections.values()} | \
               {c["s2_id"] for c in connections.values()}
    for s in canonical_stations.values():
        if s["id"] in used_ids:
            cur.execute(
                "INSERT OR REPLACE INTO stations (id, name, lat, lon) VALUES (?,?,?,?)",
                (s["id"], s["name"], s["lat"], s["lon"]),
            )

    # connections (bidirectional) + rail_geometry
    for c in connections.values():
        u, v, w, lid = c["s1_id"], c["s2_id"], c["weight"], c["line_id"]
        cur.execute(
            "INSERT INTO connections (from_id, to_id, weight, line_id) VALUES (?,?,?,?)",
            (u, v, w, lid))
        cur.execute(
            "INSERT INTO connections (from_id, to_id, weight, line_id) VALUES (?,?,?,?)",
            (v, u, w, lid))
        cur.execute(
            "INSERT INTO rail_geometry (from_id, to_id, line_id, geometry) VALUES (?,?,?,?)",
            (u, v, lid, c["geom"]))

    # line_stops
    for lid, directions in line_stops_data.items():
        for dir_entries in directions:
            for direction_id, seq, sid in dir_entries:
                if sid in used_ids:
                    cur.execute(
                        "INSERT INTO line_stops "
                        "(line_id, direction_id, seq, station_id) VALUES (?,?,?,?)",
                        (lid, direction_id, seq, sid))

    db.commit()
    n_lines = cur.execute("SELECT COUNT(*) FROM lines").fetchone()[0]
    n_sta   = cur.execute("SELECT COUNT(*) FROM stations").fetchone()[0]
    n_conn  = cur.execute("SELECT COUNT(*) FROM connections").fetchone()[0]
    n_geom  = cur.execute("SELECT COUNT(*) FROM rail_geometry").fetchone()[0]
    n_ls    = cur.execute("SELECT COUNT(*) FROM line_stops").fetchone()[0]
    db.close()

    print(f"\nSaved: {n_lines} lines, {n_sta} stations, "
          f"{n_conn} connections, {n_geom} geometry, {n_ls} line_stops")
    print("Done!")


if __name__ == "__main__":
    main()
