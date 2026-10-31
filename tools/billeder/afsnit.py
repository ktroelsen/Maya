#!/usr/bin/env python3
"""Lav et billede til hvert afsnit (## overskrift) i kapitlerne – til billedshowet i læseren.

For hvert afsnit uden billede:
  1. Gemini (tekst) læser afsnittet og foreslår et motiv (engelsk), en dansk billedtekst og
     alt-tekst – eller springer afsnittet over, hvis et billede ikke giver mening (fx »Praktisk«).
  2. Gemini (billede) tegner motivet med stilarket som reference (samme stil som resten).
  3. Billedet gemmes som WebP i media/afsnit/, og en Markdown-billedlinje sættes ind lige under
     overskriften: ![alt](afsnit/<kapitel>-<n>.webp "billedtekst").

Kan køres igen: afsnit, der allerede har et billede, springes over. Motiverne logges i
docs/billeder-afsnit.json, så de kan gennemgås.

Brug:  GEMINI_API_KEY=... python3 tools/billeder/afsnit.py [kapitel-id ...]
"""
import base64
import concurrent.futures
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TOPIC = os.environ.get('TOPIC', 'maya')
CONTENT = os.path.join(ROOT, 'content', TOPIC)
STYLE = os.path.join(CONTENT, 'media', 'stil', 'tempel1-codex-stilark.webp')
TEXT_MODEL = os.environ.get('GEMINI_TEXT_MODEL', 'gemini-3.5-flash')
IMAGE_MODEL = os.environ.get('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image')
TEMPLATE = open(os.path.join(ROOT, 'tools', 'billeder', 'skabelon.txt'), encoding='utf-8').read()
LOG = os.path.join(ROOT, 'docs', 'billeder-afsnit.json')
IMAGE_LINE = re.compile(r'^!\[[^\]]*\]\([^)]+\)\s*$')


def gemini(model, body, timeout=300):
    """POST to Gemini; waits and retries on 429/5xx (rate limits when many calls run at once)."""
    import time
    for attempt in range(5):
        try:
            return _gemini(model, body, timeout)
        except urllib.error.HTTPError as err:
            if err.code not in (429, 500, 502, 503) or attempt == 4:
                raise
            time.sleep(15 * (attempt + 1))


def _gemini(model, body, timeout):
    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'x-goog-api-key': os.environ.get('GEMINI_API_KEY', '')},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


def sections(text):
    """(line index of heading, heading, section text, has image) for each ## section."""
    lines = text.split('\n')
    heads = [i for i, l in enumerate(lines) if l.startswith('## ')]
    out = []
    for k, i in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else len(lines)
        body = [l for l in lines[i + 1:end]]
        first = next((l for l in body if l.strip()), '')
        out.append((i, lines[i][3:].strip(), '\n'.join(body).strip(), bool(IMAGE_LINE.match(first))))
    return out


def motif(chapter_title, heading, body):
    prompt = f"""You plan illustrations for a Danish app about the history of the Maya, drawn in the style of an ancient Maya codex.
Chapter: {chapter_title}
Section heading: {heading}
Section text (Danish):
{body}

Decide if an illustration helps here. Skip practical sections (opening hours, prices, address, lists of questions or tips on how to read things) – set skip=true.
Otherwise describe ONE scene that shows the core of this section, historically accurate (architecture, clothing, objects, landscape, period), concrete and visual, 60-120 words, in English.
No written text or numbers in the image except decorative glyphs. Avoid gore. Do not show modern people unless the section is about today.
Also give a short Danish caption (max 20 words, says what we see, no "illustration") and a Danish alt text (max 15 words)."""
    body = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'responseSchema': {
                'type': 'OBJECT',
                'properties': {'skip': {'type': 'BOOLEAN'}, 'motif': {'type': 'STRING'}, 'caption': {'type': 'STRING'}, 'alt': {'type': 'STRING'}},
                'required': ['skip', 'motif', 'caption', 'alt'],
            },
        },
    }
    return json.loads(gemini(TEXT_MODEL, body)['candidates'][0]['content']['parts'][-1]['text'])


def draw(text, out):
    style = base64.b64encode(open(STYLE, 'rb').read()).decode()
    prompt = TEMPLATE.replace('[MOTIV – beskriv på engelsk, med præcise detaljer om arkitektur, genstande, tøj og landskab]', text)
    body = {
        'contents': [{'parts': [{'inlineData': {'mimeType': 'image/webp', 'data': style}}, {'text': prompt}]}],
        'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '4:3'}},
    }
    for attempt in range(3):
        try:
            reply = gemini(IMAGE_MODEL, body)
            part = next(p for p in reply['candidates'][0]['content']['parts'] if 'inlineData' in p)['inlineData']
            from PIL import Image  # pip install pillow
            Image.open(io.BytesIO(base64.b64decode(part['data']))).save(out, 'WEBP', quality=80)
            return
        except Exception as err:  # noqa: BLE001 – retry transient failures (429, 5xx, no image)
            print(f'    forsøg {attempt + 1} fejlede for {os.path.basename(out)}: {err}', flush=True)
    raise RuntimeError(f'Kunne ikke tegne {out}')


def do_section(chapter_id, chapter_title, n, heading, body):
    m = motif(chapter_title, heading, body)
    if m['skip']:
        return n, heading, m, None
    rel = f'afsnit/{chapter_id}-{n}.webp'
    out = os.path.join(CONTENT, 'media', rel)
    if not os.path.exists(out):
        draw(m['motif'], out)
    return n, heading, m, rel


def main():
    topic = json.load(open(os.path.join(CONTENT, 'topic.json'), encoding='utf-8'))
    only = sys.argv[1:]
    os.makedirs(os.path.join(CONTENT, 'media', 'afsnit'), exist_ok=True)
    log = json.load(open(LOG, encoding='utf-8')) if os.path.exists(LOG) else {}
    for cid in topic['chapters']:
        path = os.path.join(CONTENT, 'chapters', cid + '.md')
        if (only and cid not in only) or not os.path.exists(path):
            continue
        text = open(path, encoding='utf-8').read()
        title = re.search(r'^title:\s*"?(.+?)"?\s*$', text, re.M).group(1)
        todo = [(n, h, b) for n, (_, h, b, has) in enumerate(sections(text), 1) if not has and f'{cid}#{n}' not in log]
        if not todo:
            continue
        print(f'{cid}: {len(todo)} afsnit', flush=True)
        with concurrent.futures.ThreadPoolExecutor(4) as pool:
            results = list(pool.map(lambda t: do_section(cid, title, *t), todo))
        # Insert the image lines bottom-up, so earlier line numbers stay valid.
        lines = open(path, encoding='utf-8').read().split('\n')
        secs = sections('\n'.join(lines))
        for n, heading, m, rel in sorted(results, reverse=True):
            log[f'{cid}#{n}'] = {'heading': heading, **m, 'src': rel}
            if rel is None:
                continue
            i = secs[n - 1][0]
            caption = m['caption'].replace('"', "'")
            alt = m['alt'].replace(']', ')')
            lines[i + 1:i + 1] = ['', f'![{alt}]({rel} "{caption}")']
        open(path, 'w', encoding='utf-8').write('\n'.join(lines))
        json.dump(log, open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'  {sum(1 for r in results if r[3])} billeder, {sum(1 for r in results if not r[3])} sprunget over', flush=True)


if __name__ == '__main__':
    main()
