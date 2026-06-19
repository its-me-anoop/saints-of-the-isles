#!/usr/bin/env python3
"""Scan the running workflow's journal for the curated master list.

The curator merges all slices into a single 45-55 entry list, so it is the
only result with >= 40 saints. When found, write it to data/saints.master.json
and exit 0; otherwise exit 1 (so the waiter keeps polling).
"""
import json
import sys
import os

JOURNAL = sys.argv[1]
OUT = sys.argv[2]

best = None
try:
    with open(JOURNAL, "r") as f:
        for line in f:
            try:
                o = json.loads(line)
            except Exception:
                continue
            if o.get("type") != "result":
                continue
            res = o.get("result") or {}
            saints = res.get("saints")
            if isinstance(saints, list):
                if best is None or len(saints) > len(best):
                    best = saints
except FileNotFoundError:
    sys.exit(1)

if best is not None and len(best) >= 40:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(best, f, ensure_ascii=False, indent=2)
    print(f"MASTER_READY count={len(best)}")
    sys.exit(0)

# Not ready yet — report progress for visibility.
n = len(best) if best else 0
print(f"waiting… largest list so far has {n} saints")
sys.exit(1)
