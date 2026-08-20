#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "data" / "timeline-data.js"
raw = path.read_text(encoding="utf-8")
prefix = "window.TIMELINE_DATA="
assert raw.startswith(prefix) and raw.endswith(";\n"), "Invalid JS wrapper"
data = json.loads(raw[len(prefix):-2])
events = data["events"]
points = [point for event in events for point in event["knowledge"]]
years = [event["year"] for event in events]
assert years == sorted(set(years)), "Date nodes must be unique and chronological"
assert years[0] == 1840 and years[-1] == 1978
assert data["meta"]["pageCount"] == 82 and data["meta"]["sourcePointCount"] == 111
assert data["meta"]["nodeCount"] == len(events)
assert data["meta"]["knowledgeCount"] == len(points)
assert all(point["title"] and point["content"] and point["searchText"] for point in points)
assert all(point["primaryYear"] == event["year"] for event in events for point in event["knowledge"])
assert all(point["primaryYear"] not in point["relatedYears"] for point in points)
assert not any(line["kind"] == "source-note" for point in points for line in point["content"])
assert not any("未讲" in point["title"] for point in points)
for keyword in ("鸦片战争", "五四运动", "抗日战争", "中华人民共和国"):
    assert any(keyword in point["searchText"] for point in points), keyword
assert "学长小谭" not in raw and "公众号" not in raw
print(f"OK: {len(events)} chronological nodes, {len(points)} taught topics, {path.stat().st_size:,} bytes")
