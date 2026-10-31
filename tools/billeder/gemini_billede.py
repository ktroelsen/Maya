#!/usr/bin/env python3
"""Lav et billede med Gemini, evt. med referencebilleder (stilark).

Brug:
  GEMINI_API_KEY=... python3 tools/billeder/gemini_billede.py prompt.txt ud.webp [ref1.webp ref2.png ...]

Referencebillederne sendes før prompten, så prompten kan henvise til
"billede 1", "billede 2" osv. Se docs/billedstil.md.
"""
import base64
import io
import json
import mimetypes
import os
import sys
import urllib.request

MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
ASPECT = os.environ.get("GEMINI_ASPECT", "4:3")


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    prompt_file, out, *refs = sys.argv[1:]
    parts = []
    for ref in refs:
        mime = mimetypes.guess_type(ref)[0] or "image/jpeg"
        with open(ref, "rb") as f:
            parts.append({"inlineData": {"mimeType": mime, "data": base64.b64encode(f.read()).decode()}})
    with open(prompt_file, encoding="utf-8") as f:
        parts.append({"text": f.read()})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": ASPECT}},
    }
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ.get("GEMINI_API_KEY", "")},
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.load(resp)

    for part in data["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            raw = base64.b64decode(part["inlineData"]["data"])
            if out.lower().endswith(".webp"):
                from PIL import Image  # pip install pillow

                Image.open(io.BytesIO(raw)).save(out, "WEBP", quality=85)
            else:
                with open(out, "wb") as f:
                    f.write(raw)
            print("Gemt:", out)
        elif "text" in part:
            print(part["text"])


if __name__ == "__main__":
    main()
