#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "data" / "timeline-data.js"
raw = path.read_text(encoding="utf-8")
prefix = "window.TIMELINE_DATA="
assert raw.startswith(prefix) and raw.endswith(";\n"), "Invalid JS wrapper"
data = json.loads(raw[len(prefix):-2])
points = data["points"]
assert [point["number"] for point in points] == list(range(1, 112))
assert len(data["chapters"]) == 10 and data["chapters"][-1]["number"] == 10
assert data["meta"]["pageCount"] == 82
assert all(point["title"] and point["content"] and point["searchText"] for point in points)
for keyword in ("鸦片战争", "五四运动", "抗日战争", "中华人民共和国"):
    assert any(keyword in point["searchText"] for point in points), keyword
assert any(1840 in point["years"] for point in points)
assert data.get("supplements") and any(item["chapter"] == 10 for item in data["supplements"])
assert data["meta"]["nodeCount"] == len(points) + len(data["supplements"])
print(f"OK: {len(points)} points, {len(data['supplements'])} chapter overviews, {len(data['chapters'])} chapters, {path.stat().st_size:,} bytes")
