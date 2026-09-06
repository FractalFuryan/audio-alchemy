#!/usr/bin/env python3
"""Local library backup zip create/extract (stdlib zipfile only)."""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def safe_name(name: str) -> str:
    n = name.replace("\\", "/").lstrip("/")
    if not n or n.endswith("/") or ".." in n.split("/") or n.startswith("/"):
        die(f"unsafe entry: {name}")
    return n


def cmd_create(staging: Path, list_path: Path, zip_path: Path) -> None:
    names = json.loads(list_path.read_text(encoding="utf-8"))
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for raw in names:
            name = safe_name(str(raw))
            src = staging / name
            if not src.is_file():
                die(f"missing file: {name}")
            zf.write(src, arcname=name)


def cmd_extract(zip_path: Path, out_dir: Path, list_path: Path) -> None:
    names: list[str] = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            name = safe_name(info.filename)
            if info.is_dir():
                continue
            target = out_dir / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, "r") as src, open(target, "wb") as dst:
                dst.write(src.read())
            names.append(name)
    list_path.write_text(json.dumps(names), encoding="utf-8")


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        die("usage: library-archive.py create|extract ...")
    op = argv[1]
    if op == "create" and len(argv) == 5:
        cmd_create(Path(argv[2]), Path(argv[3]), Path(argv[4]))
    elif op == "extract" and len(argv) == 5:
        cmd_extract(Path(argv[2]), Path(argv[3]), Path(argv[4]))
    else:
        die("usage: library-archive.py create <staging> <files.json> <out.zip>\n"
            "       library-archive.py extract <in.zip> <out_dir> <names.json>")


if __name__ == "__main__":
    main(sys.argv)
