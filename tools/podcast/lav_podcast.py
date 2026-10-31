#!/usr/bin/env python3
"""Lav en podcast med to stemmer ud fra appens kapitler – med Gemini.

1. Manuskript: en Gemini-tekstmodel skriver en samtale (et sammendrag, ikke oplæsning) ud fra
   kapitlerne og en kildetekst. Gemmes som JSON, så det kan læses og rettes.
2. Lyd: en Gemini TTS-model læser manuskriptet op med to stemmer, i bidder, som sættes sammen
   til én MP3 med ffmpeg.

Brug:
  GEMINI_API_KEY=... python3 tools/podcast/lav_podcast.py manus  intro   # skriv manuskript
  GEMINI_API_KEY=... python3 tools/podcast/lav_podcast.py lyd    intro   # lav lyd af manuskriptet
Se docs/podcasts/README.md.
"""
import base64
import concurrent.futures
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TOPIC = os.environ.get('TOPIC', 'maya')
CONTENT = os.path.join(ROOT, 'content', TOPIC)
DOCS = os.path.join(ROOT, 'docs', 'podcasts')
TEXT_MODEL = os.environ.get('GEMINI_TEXT_MODEL', 'gemini-3.1-pro-preview')
TTS_MODEL = os.environ.get('GEMINI_TTS_MODEL', 'gemini-3.8-flash-tts')
VOICES = {'Lise': 'Kore', 'Jonas': 'Puck'}
CHUNK_WORDS = 320  # per TTS call: a couple of minutes of audio

EPISODES = {
    'intro': {
        'title': 'Mayaerne på et kvarter',
        'minutes': 18,
        'chapters': None,  # all
        'extra': ['intro-kilde.md'],
        'brief': (
            'En samlet introduktion for voksne, der skal se udstillingen »Maya – riget under junglen« på Moesgård. '
            'Følg historien i kronologisk rækkefølge, men som et sammendrag: vælg de bedste historier og de vigtigste pointer '
            'i stedet for at gennemgå alt. Brug konkrete personer (fx Jasaw Chan K\'awiil, Pakal, dronning K\'abal Xook, '
            'heltetvillingerne). Ryd op i myterne (mayaerne forsvandt ikke, 2012). Slut med, hvad man skal kigge efter på '
            'udstillingen, og nævn, at appen har kapitler, tidslinje, kort og en guide til at fotografere genstande.'
        ),
    },
}


def gemini(model, body, timeout=600):
    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'x-goog-api-key': os.environ.get('GEMINI_API_KEY', '')},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


def gemini_stream_text(model, body, timeout=900):
    """Streams the answer (server-sent events), so a long generation keeps the connection busy
    instead of looking idle to proxies, and returns the whole text."""
    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'x-goog-api-key': os.environ.get('GEMINI_API_KEY', '')},
    )
    text = []
    with urllib.request.urlopen(req, timeout=timeout) as res:
        for raw in res:
            line = raw.decode('utf-8').strip()
            if not line.startswith('data:'):
                continue
            event = json.loads(line[5:])
            for cand in event.get('candidates', []):
                for part in cand.get('content', {}).get('parts', []):
                    if 'text' in part and not part.get('thought'):
                        text.append(part['text'])
    return ''.join(text)


def chapter_texts(ids):
    topic = json.load(open(os.path.join(CONTENT, 'topic.json'), encoding='utf-8'))
    out = []
    for n, cid in enumerate(topic['chapters'], 1):
        path = os.path.join(CONTENT, 'chapters', cid + '.md')
        if (ids and cid not in ids) or not os.path.exists(path):
            continue
        text = open(path, encoding='utf-8').read()
        body = text.split('\n---\n', 1)[1] if text.startswith('---') else text
        title = re.search(r'^title:\s*"?(.+?)"?\s*$', text, re.M).group(1)
        out.append(f'## Kapitel {n}: {title}\n\n{body.strip()}')
    return out


def write_script(name):
    ep = EPISODES[name]
    words = ep['minutes'] * 150
    sources = chapter_texts(ep['chapters'])
    for extra in ep['extra']:
        sources.append(open(os.path.join(DOCS, extra), encoding='utf-8').read())
    prompt = f"""Skriv manuskriptet til en dansk podcast med to værter, Lise og Jonas.

Opgave: {ep['brief']}

Krav:
- Omkring {words} ord i alt (ca. {ep['minutes']} minutter). Det er et sammendrag – ikke en oplæsning af kilderne.
- Naturligt, levende talesprog på dansk: korte sætninger, spørgsmål og svar, små reaktioner (»Nå!«, »Præcis«), men ikke fjollet.
- Lise er den nysgerrige, der stiller spørgsmål på lytterens vegne; Jonas har læst kilderne grundigt. Begge bidrager.
- Hold dig til fakta i kilderne. Sig det, når forskerne er uenige. Opfind ikke tal, navne eller detaljer om udstillingen.
- Skriv tal, årstal og forkortelser, så de er lette at læse op (»år 250 efter Kristus«, ikke »250 e.Kr.«).
- Mayanavne skrives som i kilderne.
- Start med en kort velkomst, der siger, hvad podcasten handler om. Slut med en kort afrunding.

Svar som JSON: en liste af replikker {{"speaker": "Lise" eller "Jonas", "text": "..."}}.

Kilder:

""" + '\n\n'.join(sources)
    body = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'responseSchema': {
                'type': 'ARRAY',
                'items': {
                    'type': 'OBJECT',
                    'properties': {'speaker': {'type': 'STRING', 'enum': list(VOICES)}, 'text': {'type': 'STRING'}},
                    'required': ['speaker', 'text'],
                },
            },
        },
    }
    lines = json.loads(gemini_stream_text(TEXT_MODEL, body))
    path = os.path.join(DOCS, f'{name}-manus.json')
    json.dump({'title': ep['title'], 'lines': lines}, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(len(l['text'].split()) for l in lines)
    print(f'Manuskript: {path} – {len(lines)} replikker, {total} ord (ca. {total / 150:.0f} min.)')


def chunks(lines):
    chunk, words = [], 0
    for line in lines:
        n = len(line['text'].split())
        if chunk and words + n > CHUNK_WORDS:
            yield chunk
            chunk, words = [], 0
        chunk.append(line)
        words += n
    if chunk:
        yield chunk


def synthesize(chunk):
    body = {
        'contents': [{'role': 'user', 'parts': [{'text': l['text'], 'speechMetadata': {'speaker': l['speaker']}} for l in chunk]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {
                'languageCode': 'da-DK',
                'multiSpeakerVoiceConfig': {
                    'speakerVoiceConfigs': [
                        {'speaker': s, 'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': v}}} for s, v in VOICES.items()
                    ]
                },
            },
        },
    }
    for attempt in range(3):
        try:
            reply = gemini(TTS_MODEL, body)
            part = next(p for p in reply['candidates'][0]['content']['parts'] if 'inlineData' in p)['inlineData']
            return base64.b64decode(part['data']), part['mimeType']
        except Exception as err:  # noqa: BLE001 – retry transient failures
            print(f'  forsøg {attempt + 1} fejlede: {err}')
    raise SystemExit('TTS fejlede tre gange.')


def make_audio(name):
    script = json.load(open(os.path.join(DOCS, f'{name}-manus.json'), encoding='utf-8'))
    parts = list(chunks(script['lines']))
    print(f'{len(parts)} bidder til {TTS_MODEL} …')
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        audio = list(pool.map(synthesize, parts))
    out_dir = os.path.join(CONTENT, 'media', 'podcasts')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f'{name}.mp3')
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for i, (data, mime) in enumerate(audio):
            # WAV comes with a header; raw PCM (audio/L16) is 24 kHz mono 16-bit.
            path = os.path.join(tmp, f'{i:03}.wav')
            if data[:4] == b'RIFF':
                open(path, 'wb').write(data)
            else:
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-', path], input=data, check=True)
            files.append(path)
        listing = os.path.join(tmp, 'list.txt')
        open(listing, 'w').write(''.join(f"file '{f}'\n" for f in files))
        subprocess.run(
            ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listing,
             '-ac', '1', '-ar', '24000', '-b:a', '48k', '-metadata', f"title={script['title']}", out],
            check=True,
        )
    seconds = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out],
                                   capture_output=True, text=True, check=True).stdout)
    print(f'Lyd: {out} – {seconds / 60:.1f} min., {os.path.getsize(out) / 1e6:.1f} MB')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('manus', 'lyd') or sys.argv[2] not in EPISODES:
        sys.exit(__doc__)
    (write_script if sys.argv[1] == 'manus' else make_audio)(sys.argv[2])
