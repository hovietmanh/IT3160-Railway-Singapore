"""
patch_lrt.py — Fetch missing name tags for BPLRT/PGLRT stop nodes from the
               official OSM API and patch LRT.json in-place.

Run once from the project root:
    python backend/scripts/patch_lrt.py
Then re-run rawprocessing.py to rebuild the DB.
"""

import json
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

LRT_JSON   = Path("backend/scripts/LRT.json")
STOP_ROLES = {"stop", "stop_entry_only", "stop_exit_only"}
TARGET_REFS = {"BPLRT", "PGLRT"}
OSM_API    = "https://api.openstreetmap.org/api/0.6/nodes?nodes={}"
CHUNK_SIZE = 50   # OSM API allows up to ~700 IDs, use 50 to be safe


def fetch_osm_nodes(node_ids: list[int]) -> dict[int, dict]:
    """Fetch node tags from OSM API in chunks. Returns {id: {tag_key: tag_val}}."""
    result = {}
    for i in range(0, len(node_ids), CHUNK_SIZE):
        chunk = node_ids[i: i + CHUNK_SIZE]
        url = OSM_API.format(",".join(str(n) for n in chunk))
        req = urllib.request.Request(
            url, headers={"User-Agent": "HUST-IT3160-Project/1.0 (educational)"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                xml_str = r.read().decode("utf-8")
        except Exception as e:
            print(f"  [warn] chunk {i//CHUNK_SIZE+1} failed: {e}")
            continue

        root = ET.fromstring(xml_str)
        for node_el in root.findall("node"):
            nid = int(node_el.get("id"))
            tags = {tag.get("k"): tag.get("v") for tag in node_el.findall("tag")}
            if tags:
                result[nid] = tags

        if i + CHUNK_SIZE < len(node_ids):
            time.sleep(0.5)   # be polite to OSM API

    return result


def main():
    with open(LRT_JSON, encoding="utf-8") as f:
        data = json.load(f)

    # Collect all stop node IDs for BPLRT / PGLRT
    stop_ids: set[int] = set()
    for rel in data["elements"]:
        if rel.get("type") != "relation":
            continue
        if rel.get("tags", {}).get("ref") not in TARGET_REFS:
            continue
        for m in rel.get("members", []):
            if m.get("role") in STOP_ROLES:
                stop_ids.add(m["ref"])

    print(f"Found {len(stop_ids)} stop nodes for BPLRT/PGLRT")
    print("Fetching name tags from OSM API...")

    osm_tags = fetch_osm_nodes(sorted(stop_ids))
    print(f"Received tags for {len(osm_tags)} nodes")

    # Patch LRT.json: add name tags to matching nodes
    patched = 0
    for el in data["elements"]:
        if el.get("type") != "node":
            continue
        nid = el["id"]
        if nid not in osm_tags:
            continue
        tags = osm_tags[nid]
        if "name" not in tags:
            continue
        if "tags" not in el:
            el["tags"] = {}
        el["tags"]["name"] = tags["name"]
        patched += 1

    print(f"Patched {patched} nodes with name tags")

    with open(LRT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Saved {LRT_JSON}")
    print("\nNext step: python backend/scripts/rawprocessing.py")


if __name__ == "__main__":
    main()
