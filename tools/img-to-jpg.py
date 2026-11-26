#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把采集到的原始配图统一转为 jpg：
  - 最长边不超过 1024px（不超过 1024 x 1024）
  - 文件体积压缩到 1MB 以内
  - 输出到 assets/img/<date>/<owner>__<name>.jpg
  - 回写 tools/.cache/<date>.mapping.json：{"owner/name": "assets/img/..."}

用法：python tools/img-to-jpg.py 2026-11-22
"""
import json
import io
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_SIDE = 1024
MAX_BYTES = 1024 * 1024  # 1MB


def to_jpg(src_bytes, dst_path):
    im = Image.open(io.BytesIO(src_bytes))
    # 动图取首帧
    try:
        im.seek(0)
    except Exception:
        pass
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        conv = im.convert("RGBA")
        bg.paste(conv, mask=conv.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")

    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    q = 86
    while q >= 40:
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        data = buf.getvalue()
        if len(data) <= MAX_BYTES:
            with open(dst_path, "wb") as f:
                f.write(data)
            return len(data), im.size, q
        q -= 8
    # 极端情况再缩一次尺寸
    im.thumbnail((720, 720), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=72, optimize=True, progressive=True)
    data = buf.getvalue()
    with open(dst_path, "wb") as f:
        f.write(data)
    return len(data), im.size, 72


def main():
    date = sys.argv[1] if len(sys.argv) > 1 else None
    if not date:
        print("need date")
        return 1

    cache_json = os.path.join(ROOT, "tools", ".cache", date + ".json")
    with open(cache_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    out_dir = os.path.join(ROOT, "assets", "img", date)
    os.makedirs(out_dir, exist_ok=True)

    mapping, kept, skipped = {}, 0, 0
    for repo, info in data.get("detail", {}).items():
        fname = info.get("imgFile")
        if not fname:
            skipped += 1
            continue
        src = os.path.join(ROOT, "tools", ".cache", "img", fname)
        if not os.path.exists(src):
            skipped += 1
            continue
        owner, name = repo.split("/", 1)
        dst_name = owner + "__" + name + ".jpg"
        dst = os.path.join(out_dir, dst_name)
        try:
            with open(src, "rb") as f:
                size, dim, q = to_jpg(f.read(), dst)
        except Exception as e:
            print("  ! %s: %s" % (repo, e))
            skipped += 1
            continue
        # 太小的图标 / 长条徽章不适合当卡片配图，直接弃用，交给排版封面兜底
        w, h = dim
        if min(w, h) < 150 or max(w, h) < 420 or max(w, h) / float(min(w, h)) > 4.5:
            os.remove(dst)
            print("  - %-40s 弃用 %dx%d" % (repo, w, h))
            skipped += 1
            continue

        mapping[repo] = {"src": "assets/img/%s/%s" % (date, dst_name), "w": w, "h": h}
        kept += 1
        print("  %-42s %5dKB %sx%s q%d" % (repo, size // 1024, dim[0], dim[1], q))

    with open(os.path.join(ROOT, "tools", ".cache", date + ".mapping.json"), "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1)

    print("\nconverted=%d skipped=%d total=%d" % (kept, skipped, len(data.get("detail", {}))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
