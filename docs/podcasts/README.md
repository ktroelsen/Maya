# Podcasts med NotebookLM

Podcasts laves i NotebookLM (»Lydoversigt«/Audio Overview) og lægges i appen som MP3. Appen afhænger ikke af NotebookLM.

## Sådan laves en podcast

1. Opret en ny notesbog i NotebookLM.
2. Upload kilderne til afsnittet (se tabellen). Kapitlerne ligger i `content/maya/chapters/`. Front-matter øverst i filerne kan blive stående.
3. Vælg **Lydoversigt → Tilpas**, sprog **dansk**, og indsæt teksten fra afsnittets prompt nedenfor.
4. Hent lyden, konvertér til MP3 (fx 64 kbit/s mono – det er tale), og læg den i `content/maya/media/podcasts/<id>.mp3`.
5. Tilføj podcasten i `content/maya/topic.json` under `podcasts`, fx:
   ```json
   { "id": "intro", "title": "Mayaerne på 20 minutter", "src": "podcasts/intro.mp3",
     "description": "Den samlede introduktion", "chapters": ["01-moed-mayaerne"] }
   ```

## Afsnit

| Id | Titel | Kilder | Længde |
|---|---|---|---|
| `intro` | Mayaerne på 20 minutter | `intro-kilde.md` + alle skrevne kapitler | 15–20 min |
| `skrift-og-kalender` | Skrift og kalender | `08-viden.md` | 8–12 min |
| `konger-og-krig` | Konger og krig i klassisk tid | `05-klassisk-tid.md`, `07-tro-og-ritualer.md` | 8–12 min |
| `kollapset` | Kollapset | `10-kollapset.md` (når det er skrevet) | 8–12 min |
| `moesgaard` | Hvad skal vi se på Moesgård | `14-klar-til-moesgaard.md` (når det er skrevet) | 5–10 min |

## Prompt: `intro`

> Lav en levende, dansk samtale for voksne, der skal se udstillingen »Maya – Kongeriget under junglen« på Moesgård Museum. Følg fortællingen i kronologisk rækkefølge: hvem mayaerne var og er, landet, majsen og de første landsbyer, de første byer i præklassisk tid, kongerigerne i klassisk tid med Tikal og Calakmul, hverdagsliv, tro og boldspil, skrift og kalender, kollapset, Chichén Itzá og Mayapán, spaniernes erobring og mayaerne i dag. Brug konkrete personer og historier (Jasaw Chan K'awiil, Pakal, heltetvillingerne, dronning K'abal Xook). Ryd op i myter: mayaerne forsvandt ikke, og de forudsagde ikke verdens undergang i 2012. Hold dig til kilderne, og sig det, når forskerne er uenige. Slut med, hvad man skal kigge efter på udstillingen. Udtal mayanavne roligt og tydeligt.

## Prompt: øvrige afsnit

> Lav en dansk samtale for voksne, der skal se udstillingen »Maya – Kongeriget under junglen« på Moesgård. Gå i dybden med emnet i kilderne, med konkrete eksempler og personer. Ryd op i misforståelser. Hold dig til kilderne, og sig det, når forskerne er uenige.
