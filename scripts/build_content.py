#!/usr/bin/env python3
"""Build searchable timeline data from the supplied history-outline PDF."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UPLOAD_DIR = ROOT.parent / "upload"
PDF = next(iter(sorted(UPLOAD_DIR.glob("*史纲*.pdf"))), UPLOAD_DIR / "史纲笔记.pdf")
OUTPUT = ROOT / "data" / "timeline-data.js"

CHAPTER_RE = re.compile(r"第([一二三四五六七八九十]+)章\s+(.+)")
SECTION_RE = re.compile(r"第([一二三四五六七八九十]+)节\s+(.+)")
POINT_RE = re.compile(r"考点\s*(\d+)\s*(.*)")
YEAR_RE = re.compile(r"(?<!\d)((?:18|19|20)\d{2})\s*年")
RANGE_RE = re.compile(r"(?<!\d)((?:18|19|20)\d{2})\s*[-—至]\s*((?:18|19|20)\d{2})(?:\s*年)?")
TIME_CODE_RE = re.compile(r"^\s*(?:\d{1,2}\s*课程定位\s*)?(?:\d{1,3}:\d{2}(?:-\d{1,3}:\d{2})?)?\s*$")
LEADING_META_RE = re.compile(r"^\s*(?:\d{1,2}\s*课程定位\s+|\d{1,3}:\d{2}(?:-\d{1,3}:\d{2})?\s+)")

CHAPTER_ANCHORS = {
    1: 1840,
    2: 1851,
    3: 1894,
    4: 1915,
    5: 1927,
    6: 1931,
    7: 1945,
    8: 1949,
    9: 1978,
    10: 2012,
}

# The PDF is organized by teaching points, while the product is organized by
# historical time. Each retained knowledge point is assigned to the single
# date that best represents the event it explains; other extracted dates stay
# attached as related dates.
PRIMARY_YEAR = {
    3: 1840, 4: 1840, 5: 1840, 6: 1840, 7: 1840, 8: 1840, 9: 1840,
    10: 1885, 11: 1900, 12: 1895, 13: 1840, 14: 1840,
    15: 1851, 16: 1851, 17: 1861, 18: 1895, 19: 1898, 20: 1898,
    21: 1901, 22: 1905, 23: 1905, 24: 1905, 25: 1911, 26: 1912,
    27: 1911, 28: 1912, 29: 1912, 30: 1915, 31: 1917,
    32: 1919, 33: 1919, 34: 1919, 35: 1920, 36: 1921, 37: 1922,
    38: 1924, 39: 1927, 40: 1927, 41: 1928, 42: 1927, 43: 1927,
    44: 1931, 45: 1935, 46: 1936, 47: 1935, 48: 1931, 49: 1931,
    50: 1931, 51: 1931, 52: 1935, 53: 1935, 54: 1936, 55: 1937,
    56: 1937, 57: 1937, 58: 1937, 59: 1939, 60: 1940, 61: 1939,
    62: 1938, 63: 1940, 64: 1942, 65: 1945, 66: 1945, 67: 1945,
    68: 1945, 69: 1945, 70: 1946, 71: 1947, 72: 1947, 73: 1947,
    74: 1949, 75: 1947, 76: 1949, 77: 1949, 78: 1949, 79: 1949,
    80: 1949, 81: 1953, 82: 1953, 83: 1953, 84: 1953, 85: 1953,
    86: 1956, 87: 1956, 89: 1956, 91: 1957, 95: 1956, 96: 1978,
}

# These four entries are course-orientation/background headings rather than
# expanded history-outline teaching points.  A title marked "非重点" is still
# examinable at low frequency, so it must remain available to search and review.
EXCLUDED_UNTAUGHT_POINTS = {1, 2, 84, 85}
UNTAUGHT_TITLE_RE = re.compile(r"未讲")

CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def cn_to_int(value: str) -> int:
    if value in CN_NUM:
        return CN_NUM[value]
    if value.startswith("十"):
        return 10 + CN_NUM.get(value[1:], 0)
    if value.endswith("十"):
        return CN_NUM.get(value[:-1], 0) * 10
    left, _, right = value.partition("十")
    return CN_NUM.get(left, 0) * 10 + CN_NUM.get(right, 0)


def clean_line(raw: str) -> str:
    line = raw.replace("\u200b", "").replace("\uf0b7", "•").replace("\uf06c", "•").replace("\uf075", "◆").replace("\uf0d8", "▸")
    line = LEADING_META_RE.sub("", line)
    line = re.sub(r"\s+", " ", line).strip()
    line = re.sub(r"^◆\s*(?:逻辑框架图?|时间框架)\s*", "", line)
    line = re.sub(r"【?公众号[：:]?[^】]*】?", "", line)
    line = re.sub(r"学长[^】\s，,。]*", "", line)
    line = re.sub(r"^涛言涛语[：:]\s*", "", line)
    line = line.replace("19178 年", "1978 年").replace("19178年", "1978年")
    return line


def should_drop(line: str) -> bool:
    if not line:
        return False
    if "关注公众号" in line or "获取更多考研干货资料" in line:
        return True
    if "27 徐涛强化班笔记" in line or "27徐涛强化班笔记" in line:
        return True
    if TIME_CODE_RE.match(line):
        return True
    if re.fullmatch(r"\d{1,2}", line):
        return True
    return False


def normalize_title(title: str) -> str:
    title = re.sub(r"【?公众号[：:]?[^】]*】?", "", title)
    title = re.sub(r"学长[^】\s，,。]*", "", title)
    return re.sub(r"\s+", " ", title).strip(" ：:。")


def extract_years(text: str) -> list[int]:
    years = [int(y) for y in YEAR_RE.findall(text)]
    for start, end in RANGE_RE.findall(text):
        years.extend((int(start), int(end)))
    return sorted(set(y for y in years if 1800 <= y <= 2099))


def line_kind(line: str) -> str:
    if re.match(r"^(?:[（(]?\d+[）).、]|[一二三四五六七八九十]+[、.]|[•◆◇▸]|【|涛言涛语|出题角度|表现|意义|原因|内容|评价|特点|结果|教训|核心|关键|标志)", line):
        return "item"
    if len(line) <= 26 and (line.endswith("：") or re.match(r"^《.*》$", line)):
        return "subheading"
    return "paragraph"


def merge_wrapped_lines(lines: list[dict]) -> list[dict]:
    """Join PDF visual line wraps while preserving lists and short subheadings."""
    merged = []
    for item in lines:
        if (
            merged
            and merged[-1]["kind"] in {"paragraph", "item"}
            and item["kind"] in {"paragraph", "subheading"}
            and not re.search(r"[。！？；：】）》”]$", merged[-1]["text"])
        ):
            spacer = " " if re.search(r"[A-Za-z0-9]$", merged[-1]["text"]) and re.match(r"[A-Za-z0-9]", item["text"]) else ""
            merged[-1]["text"] += spacer + item["text"]
        else:
            merged.append(item.copy())
    return merged


def prune_non_exam_content(point: dict, lines: list[dict]) -> list[dict]:
    """Remove only spans the handout explicitly says are outside the exam."""
    number = point["number"]

    if number == 3:
        # Remove the long trade/economic anecdote, but retain the factual bridge
        # about the Qing ban on opium before the examinable Humen destruction.
        background_markers = (
            "鸦片战争的细节多",
            "这场战争爆发的逻辑",
            "那既然有这个矛盾",
            "在跟中国做生意的过程当中",
        )
        lines = [
            item for item in lines
            if not item["text"].startswith(background_markers)
        ]

    cleaned = []
    for item in lines:
        text = item["text"]
        if number == 31 and "考得不算太多" in text:
            # Study-frequency commentary is not knowledge the learner must retain.
            continue
        if number == 54:
            text = re.sub(r"1945-1949：解放战争时期\s*（不考）", "", text).strip()
        if text:
            cleaned.append({**item, "text": text})
    return cleaned


def finalize_point(point: dict | None) -> dict | None:
    if not point:
        return None
    lines = []
    for raw in point.pop("raw_lines"):
        line = clean_line(raw)
        if not line or should_drop(line):
            continue
        # Remove layout-only framework labels that appear between chapters.
        if line in {"◆ 逻辑框架", "◆ 逻辑框架图", "时间框架", "学科知识框架图"}:
            continue
        lines.append({"kind": line_kind(line), "text": line})

    if not lines:
        lines.append({"kind": "source-note", "text": "原笔记此处仅列出考点标题，未展开正文。"})

    lines = prune_non_exam_content(point, merge_wrapped_lines(lines))

    text = "\n".join(item["text"] for item in lines)
    years = extract_years("\n".join([point["chapterTitle"], point["sectionTitle"], point["title"], text]))
    point["content"] = lines
    point["years"] = years
    point["searchText"] = " ".join(
        [point["chapterTitle"], point["sectionTitle"], point["title"], text]
    )
    return point


def parse(text: str) -> tuple[list[dict], list[dict], list[dict]]:
    pages = text.split("\f")
    chapter_number = 0
    chapter_title = ""
    section_title = ""
    point = None
    points = []
    chapter_titles = {}
    chapter_tail_lines = {}
    chapter_pages = {}

    # The first two pages are cover/course-orientation pages, not the knowledge body.
    for page_number, page in enumerate(pages[2:], start=3):
        for raw in page.splitlines():
            candidate = clean_line(raw)
            if not candidate or should_drop(candidate):
                continue

            chapter_match = CHAPTER_RE.search(candidate)
            if chapter_match:
                title = normalize_title(chapter_match.group(2))
                # Ignore the table of contents and repeated framework headings.
                if "...." not in title and len(title) < 80:
                    finished = finalize_point(point)
                    if finished:
                        points.append(finished)
                    point = None
                    chapter_number = cn_to_int(chapter_match.group(1))
                    chapter_title = title
                    chapter_titles[chapter_number] = chapter_title
                    chapter_pages[chapter_number] = page_number
                    chapter_tail_lines.setdefault(chapter_number, [])
                    section_title = ""
                continue

            section_match = SECTION_RE.search(candidate)
            if section_match:
                section_title = normalize_title(section_match.group(2))
                continue

            point_match = POINT_RE.match(candidate)
            if point_match:
                finished = finalize_point(point)
                if finished:
                    points.append(finished)
                number = int(point_match.group(1))
                title = normalize_title(point_match.group(2)) or f"考点 {number}"
                point = {
                    "id": f"point-{number}",
                    "number": number,
                    "chapter": chapter_number,
                    "chapterTitle": chapter_title,
                    "sectionTitle": section_title,
                    "title": title,
                    "sourcePage": page_number,
                    "anchorYear": CHAPTER_ANCHORS.get(chapter_number),
                    "raw_lines": [],
                }
                continue

            if point is not None:
                point["raw_lines"].append(raw)
            elif chapter_number:
                chapter_tail_lines.setdefault(chapter_number, []).append(raw)

    finished = finalize_point(point)
    if finished:
        points.append(finished)

    points.sort(key=lambda item: item["number"])
    chapters = []
    for chapter in sorted(chapter_titles):
        chapter_points = [p for p in points if p["chapter"] == chapter]
        year_counts = Counter(y for p in chapter_points for y in p["years"])
        chapters.append({
            "number": chapter,
            "title": chapter_titles[chapter],
            "anchorYear": CHAPTER_ANCHORS[chapter],
            "pointStart": chapter_points[0]["number"] if chapter_points else None,
            "pointEnd": chapter_points[-1]["number"] if chapter_points else None,
            "years": sorted(year_counts),
        })

    supplements = []
    for chapter, raw_lines in chapter_tail_lines.items():
        lines = []
        for raw in raw_lines:
            line = clean_line(raw)
            if line and not should_drop(line):
                lines.append({"kind": line_kind(line), "text": line})
        if lines:
            lines = merge_wrapped_lines(lines)
            supplements.append({
                "id": f"chapter-{chapter}-overview",
                "chapter": chapter,
                "chapterTitle": chapter_titles[chapter],
                "sectionTitle": "章节说明",
                "title": chapter_titles[chapter],
                "sourcePage": chapter_pages.get(chapter),
                "content": lines,
                "years": [],
                "anchorYear": CHAPTER_ANCHORS.get(chapter),
                "searchText": " ".join([chapter_titles[chapter]] + [line["text"] for line in lines]),
            })

    return points, chapters, supplements


def main() -> int:
    pdf = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else PDF
    if not pdf.exists():
        raise SystemExit(f"PDF not found: {pdf}")
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf), "-"],
        check=True,
        stdout=subprocess.PIPE,
    )
    text = result.stdout.decode("utf-8", errors="replace")
    points, chapters, supplements = parse(text)
    numbers = [point["number"] for point in points]
    expected = list(range(1, 112))
    if numbers != expected:
        missing = sorted(set(expected) - set(numbers))
        duplicates = sorted(n for n, count in Counter(numbers).items() if count > 1)
        raise SystemExit(f"Point coverage failed. Missing={missing}, duplicates={duplicates}")
    taught_points = [
        point for point in points
        if point["number"] not in EXCLUDED_UNTAUGHT_POINTS
        and not UNTAUGHT_TITLE_RE.search(point["title"])
        and not any(line["kind"] == "source-note" for line in point["content"])
    ]
    missing_primary = [point["number"] for point in taught_points if point["number"] not in PRIMARY_YEAR]
    if missing_primary:
        raise SystemExit(f"Missing primary-year decisions: {missing_primary}")

    for point in taught_points:
        point["primaryYear"] = PRIMARY_YEAR[point["number"]]
        point["relatedYears"] = [year for year in point["years"] if year != point["primaryYear"]]
        # “五四运动” is written without its year in this overview, so the
        # extractor cannot infer the final stage of national awakening.
        if point["number"] == 14 and 1919 not in point["relatedYears"]:
            point["relatedYears"].append(1919)
            point["relatedYears"].sort()

    events = []
    for year in sorted({point["primaryYear"] for point in taught_points}):
        knowledge = [point for point in taught_points if point["primaryYear"] == year]
        events.append({
            "id": f"year-{year}",
            "year": year,
            "label": f"{year}年",
            "chapters": sorted({point["chapter"] for point in knowledge}),
            "knowledge": knowledge,
            "searchText": " ".join(point["searchText"] for point in knowledge),
        })

    visible_chapter_numbers = sorted({point["chapter"] for point in taught_points})
    visible_chapters = [chapter for chapter in chapters if chapter["number"] in visible_chapter_numbers]
    payload = {
        "meta": {
            "title": "考研政治·史纲时间线",
            "source": "27考研政治史纲强化班笔记.pdf",
            "pageCount": len(text.split("\f")) - 1,
            "sourcePointCount": len(points),
            "knowledgeCount": len(taught_points),
            "nodeCount": len(events),
            "omittedCount": len(points) - len(taught_points),
            "generatedFromPdf": True,
        },
        "chapters": visible_chapters,
        "events": events,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(f"window.TIMELINE_DATA={encoded};\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(events)} date nodes, {len(taught_points)} knowledge topics, {len(encoded):,} chars)")
    print(f"Timeline: {events[0]['year']}-{events[-1]['year']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
