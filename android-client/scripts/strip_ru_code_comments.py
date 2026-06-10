#!/usr/bin/env python3
"""Remove or strip Russian text from source comments (not string resources)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

CYR = re.compile(r"[А-Яа-яЁё]")
SKIP_DIRS = {"build", ".gradle", ".cxx", ".idea", "node_modules"}
SKIP_FILES = {"strings.xml"}  # only under values-*/ for localization


def should_skip(path: Path) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    if path.name == "strings.xml" and "values" in path.parts:
        parent = path.parent.name
        if parent.startswith("values"):
            return True
    return False


def strip_kt(content: str) -> str:
    content = re.sub(
        r"/\*\*.*?\*/",
        lambda m: "" if CYR.search(m.group(0)) else m.group(0),
        content,
        flags=re.DOTALL,
    )
    content = re.sub(
        r"/\*.*?\*/",
        lambda m: "" if CYR.search(m.group(0)) else m.group(0),
        content,
        flags=re.DOTALL,
    )
    out: list[str] = []
    for line in content.splitlines():
        if "//" in line:
            code, _, comment = line.partition("//")
            if CYR.search(comment):
                if code.strip():
                    out.append(code.rstrip())
                    continue
                continue
        if line.strip() and CYR.search(line) and not any(
            tok in line for tok in ('"', "'", "R.string", "getString")
        ):
            # Standalone Russian text line (rare) — drop.
            if re.match(r"^\s*$", line):
                out.append(line)
            continue
        out.append(line)
    return "\n".join(out) + ("\n" if content.endswith("\n") else "")


def strip_xml(content: str) -> str:
    def repl(m: re.Match[str]) -> str:
        return "" if CYR.search(m.group(0)) else m.group(0)

    return re.sub(r"<!--.*?-->", repl, content, flags=re.DOTALL)


def process_file(path: Path) -> bool:
    if should_skip(path):
        return False
    text = path.read_text(encoding="utf-8")
    if not CYR.search(text):
        return False
    if path.suffix == ".kt":
        new = strip_kt(text)
    elif path.suffix == ".xml" and "layout" in path.parts:
        new = strip_xml(text)
    else:
        return False
    if new != text:
        path.write_text(new, encoding="utf-8")
        return True
    return False


def main(root: Path) -> int:
    changed = 0
    for path in root.rglob("*"):
        if path.is_file() and path.suffix in {".kt", ".xml"}:
            if process_file(path):
                changed += 1
                print(path.relative_to(root))
    print(f"Updated {changed} file(s)")
    return 0


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    raise SystemExit(main(target.resolve()))
