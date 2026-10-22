"""Builds web/items.json (weapon and mount names) from ao-bin-dumps' formatted/items.txt."""
import json
import re
import sys

TIER_PREFIX = re.compile(r"^(Beginner's|Novice's|Journeyman's|Adept's|Expert's|Master's|Grandmaster's|Elder's)\s+")
KEEP = re.compile(r"^(MAIN_|2H_|OFF_|MOUNT_)")

source, target = sys.argv[1], sys.argv[2]
names = {}
for line in open(source, encoding="utf-8"):
    parts = [p.strip() for p in line.split(":")]
    if len(parts) < 3 or "@" in parts[1]:
        continue
    item, name = parts[1], parts[2]
    m = re.match(r"^T\d_(.+)$", item)
    base = m.group(1) if m else item.removeprefix("UNIQUE_") if item.startswith("UNIQUE_MOUNT_") else None
    if not base or not KEEP.match(base) or "TOOL" in base or not name:
        continue
    if item.startswith("UNIQUE_"):
        base = item
    names.setdefault(base, TIER_PREFIX.sub("", name))
json.dump(names, open(target, "w", encoding="utf-8"), ensure_ascii=False, sort_keys=True, indent=0)
print(len(names), "items")
