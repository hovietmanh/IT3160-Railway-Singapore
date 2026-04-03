

import json
import sys
from pathlib import Path
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")

EXPORT_PATH = Path("backend/scripts/export.json")


def main():
    with open(EXPORT_PATH, encoding="utf-8") as f:
        data = json.load(f)

    elements = data.get("elements", [])

    # Dem cac loai element
    type_count = defaultdict(int)
    for el in elements:
        type_count[el.get("type", "unknown")] += 1

    print("=" * 60)
    print(f"FILE: {EXPORT_PATH}")
    print(f"OSM version: {data.get('version', '?')}")
    print("=" * 60)
    print(f"\nTong so elements: {len(elements)}")
    for t, c in sorted(type_count.items()):
        print(f"  {t:12s}: {c}")

    # Loc cac relation la tuyen tau
    relations  = [el for el in elements if el.get("type") == "relation"]
    route_rels = [r for r in relations
                  if r.get("tags", {}).get("route") in ("subway", "light_rail", "monorail", "rail")]

    print(f"\nSo relations la tuyen tau (route=subway/light_rail/...): {len(route_rels)}")

    # Nhom theo ref (ma tuyen), moi tuyen co the co 2 chieu
    grouped = defaultdict(list)
    for r in route_rels:
        tags = r.get("tags", {})
        ref  = tags.get("ref", f"id={r['id']}")
        grouped[ref].append(r)

    print(f"So tuyen duy nhat (theo ref): {len(grouped)}")
    print()

    # Hien thi chi tiet tung tuyen
    print(f"{'REF':<10} {'LOAI':<12} {'MAU':<12} {'TEN TUYEN'}")
    print("-" * 70)

    mrt_lines = {}
    lrt_count = 0

    for ref, rels in sorted(grouped.items()):
        tags       = rels[0].get("tags", {})
        route_type = tags.get("route", "?")
        color      = tags.get("colour", "N/A")
        name       = tags.get("name", "?")
        # Rut gon ten: bo phan "(X -> Y)"
        base_name  = name.split(" (")[0].replace("MRT ", "").replace("LRT ", "").strip()

        print(f"{ref:<10} {route_type:<12} {color:<12} {base_name}  [{len(rels)} chieu]")

        if route_type == "subway":
            mrt_lines[ref] = {"name": base_name, "color": color}
        else:
            lrt_count += 1

    print("-" * 70)
    print(f"\nTom tat:")
    print(f"  Tuyen MRT (subway)    : {len(mrt_lines)}")
    print(f"  Tuyen LRT/khac        : {lrt_count}")
    print(f"  Tong so tuyen duy nhat: {len(grouped)}")

    # Thong ke nodes & ways
    nodes       = [el for el in elements if el.get("type") == "node"]
    ways        = [el for el in elements if el.get("type") == "way"]
    named_nodes = [n for n in nodes if n.get("tags", {}).get("name")]

    print(f"\nThong ke nodes & ways:")
    print(f"  Nodes (ga + diem duong): {len(nodes)}")
    print(f"  Ways  (doan duong ray) : {len(ways)}")
    print(f"  Nodes co ten (ga)      : {len(named_nodes)}")

    # In mau cua cac tuyen MRT (de cap nhat mrt_lines_mapping.json)
    print("\nMau cac tuyen MRT theo OSM:")
    for ref, info in sorted(mrt_lines.items()):
        print(f"  {ref:<8}  color={info['color']:<12}  {info['name']}")


if __name__ == "__main__":
    main()
