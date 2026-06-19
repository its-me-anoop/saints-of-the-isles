#!/usr/bin/env python3
"""Watch the enrichment workflow journal; when done, write data/enrichment.json.

Classifies each agent result:
  - new saints: result.saints[0] has 'name' and 'wiki'
  - enrichment: result.saints[0] has 'pilgrimageSite' but no 'name'
Writes { newSaints:[...], enrich:[...] } once the new saints + ~all 78
enrichments are present.
"""
import json
import sys

JOURNAL = sys.argv[1]
OUT = sys.argv[2]

new_saints = None
enrich = []
seen = set()

try:
    with open(JOURNAL) as f:
        for line in f:
            try:
                o = json.loads(line)
            except Exception:
                continue
            if o.get("type") != "result":
                continue
            saints = (o.get("result") or {}).get("saints")
            aid = o.get("agentId")
            if not isinstance(saints, list) or not saints or aid in seen:
                continue
            first = saints[0]
            if "name" in first and "wiki" in first:
                new_saints = saints
                seen.add(aid)
            elif "pilgrimageSite" in first:
                enrich.extend(saints)
                seen.add(aid)
except FileNotFoundError:
    sys.exit(1)

if new_saints is not None and len(enrich) >= 70:
    with open(OUT, "w") as f:
        json.dump({"newSaints": new_saints, "enrich": enrich}, f, ensure_ascii=False, indent=2)
    print(f"ENRICHMENT_READY new={len(new_saints)} enrich={len(enrich)}")
    sys.exit(0)

print(f"waiting… new={'yes' if new_saints else 'no'} enrich={len(enrich)}")
sys.exit(1)
