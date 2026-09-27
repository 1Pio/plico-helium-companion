#!/usr/bin/env python3
"""Add timestamp-derived keycaps to a real silent capture; never invent input.

Run with Pillow 11.3.0 and ffmpeg/ffprobe. Input log combines capture-start and
predefined native helper events. All output and intermediate files must be new.
"""

import argparse
import json
import math
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

KEYS = [
    (55, "⌘"),
    (-1, "click"),
    (56, "⇧"),
    (59, "⌃"),
    (4, "H"),
    (38, "J"),
    (40, "K"),
    (37, "L"),
    (123, "←"),
    (125, "↓"),
    (126, "↑"),
    (124, "→"),
    (18, "1"),
    (19, "2"),
    (20, "3"),
    (17, "T"),
    (11, "B"),
    (48, "⇥"),
    (36, "↵"),
    (53, "esc"),
]
FONT = "/System/Library/Fonts/SFNS.ttf"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("capture", type=Path)
    p.add_argument("events", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--caption", required=True)
    p.add_argument(
        "--crop", help="Fixed centered detail crop WIDTHxHEIGHT; never changes timing"
    )
    p.add_argument(
        "--crop-y", type=int, help="Fixed top offset for the crop; defaults to centered"
    )
    args = p.parse_args()
    if args.output.exists():
        raise SystemExit("Output already exists")
    events = [
        json.loads(line)
        for line in args.events.read_text().splitlines()
        if line.startswith("{")
    ]
    (start,) = [e for e in events if e.get("event") == "capture-start"]
    (end,) = [e for e in events if e.get("event") == "capture-end"]
    if end["failed"]:
        raise SystemExit("Interrupted capture cannot be published")
    # Sample delivery may lag the actual capture; PTS and key uptime must be the
    # same monotonic clock, never wall clock or inferred from the clip duration.
    if abs(start["pts"] - start["uptime"]) > 2:
        raise SystemExit("Capture/input clocks are not aligned")
    meta = json.loads(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                str(args.capture),
            ]
        )
    )
    (video,) = [s for s in meta["streams"] if s["codec_type"] == "video"]
    if any(s["codec_type"] == "audio" for s in meta["streams"]):
        raise SystemExit("Unexpected audio")
    duration = float(meta["format"]["duration"])
    last_key = max(
        (e["uptime"] - start["pts"] for e in events if e.get("event") == "key"),
        default=duration,
    )
    duration = min(duration, last_key + 1.2)
    source_width, source_height = video["width"], video["height"]
    crop_filter = ""
    if args.crop:
        source_width, source_height = map(int, args.crop.split("x"))
        if not (
            600 <= source_width <= video["width"]
            and 300 <= source_height <= video["height"]
        ):
            raise SystemExit("Invalid fixed crop")
        if (
            args.crop_y is not None
            and not 0 <= args.crop_y <= video["height"] - source_height
        ):
            raise SystemExit("Crop offset falls outside source")
        y = str(args.crop_y) if args.crop_y is not None else "(ih-oh)/2"
        crop_filter = f"crop={source_width}:{source_height}:(iw-ow)/2:{y},"
    elif args.crop_y is not None:
        raise SystemExit("Crop offset requires --crop")
    scale = min(1, 1920 / source_width, 972 / source_height)
    width, height = (
        int(source_width * scale) // 2 * 2,
        int(source_height * scale) // 2 * 2,
    )
    changes = [(0.0, frozenset(), args.caption)]
    caption = args.caption
    pressed = set()
    for e in events:
        if e.get("event") not in ("key", "chapter"):
            continue
        t = e["uptime"] - start["pts"]
        if not 0 <= t <= duration:
            raise SystemExit("Key event outside recording interval")
        if e["event"] == "chapter":
            caption = e["text"]
        elif e["down"]:
            pressed.add(e["key"])
        else:
            pressed.discard(e["key"])
        changes.append((round(t * 60) / 60, frozenset(pressed), caption))
    if pressed:
        raise SystemExit("Recording ends with held test keys")
    # Only the keys actually demonstrated get permanent dim labels. The bright
    # state is limited to the true down/up interval, quantized to a video frame.
    used = {e["key"] for e in events if e.get("event") == "key"}
    keys = [(code, label) for code, label in KEYS if code in used]
    folder = args.output.parent / (args.output.stem + "-keyframes")
    folder.mkdir(parents=True, exist_ok=False)
    cap_scale = width / 1100
    cap_width, cap_gap = round(48 * cap_scale), round(8 * cap_scale)
    font = ImageFont.truetype(FONT, round(23 * cap_scale))
    small = ImageFont.truetype(FONT, round(16 * cap_scale))
    lines = []
    for i, (t, state, caption) in enumerate(changes):
        next_t = changes[i + 1][0] if i + 1 < len(changes) else duration
        if next_t <= t:
            continue
        image = Image.new("RGBA", (width, 108), (19, 21, 25, 255))
        draw = ImageDraw.Draw(image)
        draw.line([(28, 0), (width - 28, 0)], fill=(58, 61, 67), width=1)
        draw.text((30, 53), caption, font=small, anchor="lm", fill=(207, 211, 219))
        total = len(keys) * cap_width + max(0, len(keys) - 1) * cap_gap
        left = width - total - 30
        if draw.textlength(caption, font=small) > left - 60:
            raise SystemExit(
                "Caption overlaps keys; shorten it or use a wider composition"
            )
        for j, (code, label) in enumerate(keys):
            x = left + j * (cap_width + cap_gap)
            active = code in state
            draw.rounded_rectangle(
                (x, 54 - cap_width / 2, x + cap_width, 54 + cap_width / 2),
                radius=round(11 * cap_scale),
                fill=(227, 230, 236) if active else (34, 37, 44),
                outline=(249, 250, 252) if active else (69, 74, 84),
                width=1,
            )
            key_label = {48: "tab", 36: "enter"}.get(code, label)
            draw.text(
                (x + cap_width / 2, 54),
                key_label,
                font=small if code in (-1, 36, 48, 53) else font,
                anchor="mm",
                fill=(22, 25, 31) if active else (147, 155, 170),
            )
        path = folder / f"{i:04d}.png"
        image.save(path)
        lines += [
            f"file '{path.resolve()}'",
            "option framerate 60",
            f"duration {next_t - t:.9f}",
        ]
    # Repeat the final frame so concat honors its last duration.
    lines += [lines[-3], "option framerate 60"]
    timeline = folder / "timeline.txt"
    timeline.write_text("\n".join(lines) + "\n")
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-i",
            str(args.capture),
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(timeline),
            "-filter_complex",
            f"[0:v]{crop_filter}scale={width}:{height},fps=60,pad={width}:{height + 108}:0:0:color=0x131519[base];[base][1:v]overlay=0:{height}:eof_action=repeat,format=yuv420p[v]",
            "-map",
            "[v]",
            "-an",
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "slow",
            "-map_metadata",
            "-1",
            "-movflags",
            "+faststart",
            str(args.output),
        ],
        check=True,
    )
    args.output.with_suffix(".timing.json").write_text(
        json.dumps(
            {
                "duration": duration,
                "fps": 60,
                "events": len(changes) - 1,
                "clock_delta": start["uptime"] - start["pts"],
                "quantization_ms": 1000 / 60,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
