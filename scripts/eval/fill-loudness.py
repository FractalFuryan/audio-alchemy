#!/usr/bin/env python3
import csv, subprocess, sys, os, re
manifest, run_dir = sys.argv[1], sys.argv[2]
rows = []
with open(manifest, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        rel = row.get("path") or ""
        abs_path = os.path.join(run_dir, rel) if rel else ""
        lufs = row.get("loudness_lufs") or ""
        if abs_path and os.path.isfile(abs_path) and not lufs:
            try:
                p = subprocess.run(
                    ["ffmpeg","-hide_banner","-i",abs_path,"-af",
                     "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=summary",
                     "-f","null","-"],
                    capture_output=True, text=True, timeout=120,
                )
                m = re.search(r"Input Integrated:\s*([-\d.]+)\s*LUFS", p.stderr or "", re.I)
                if m:
                    lufs = m.group(1)
            except Exception:
                pass
        row["loudness_lufs"] = lufs
        rows.append(row)
with open(manifest, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)
print("loudness updated", manifest)
