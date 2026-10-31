# Maya – forberedelses-app til udstillingen

En illustreret app der fortæller historien om mayaerne – hvem de var, hvor de boede, hvornår og hvordan det hele startede – med kort, billeder, tidslinje, oplæsning og podcasts. Den skal bygges så kodedelen kan genbruges til fremtidige emner (andre udstillinger, rejser, historiske emner).

**Udstillingen:** *Maya – riget under junglen* på Moesgård Museum, Aarhus (9. oktober 2026 – 8. august 2027). Den handler om **Slangedynastiet (Kaanul)** i klassisk tid (ca. 250–900 e.Kr.), har ca. 200 genstande lånt fra Mexico (INAH), og hovedværkerne er **7 jademasker fra herskergrave i Dzibanche**. Detaljer og åbne spørgsmål: `docs/moesgaard-mangler.md`. **Besøg: 7. november 2026.**

**Kører på:** https://maya.kaspert.dk

## 1. Vision og principper

- **Fortælling før fakta-liste**: Indholdet er bygget som kapitler, ikke som et leksikon. Man skal kunne læse/lytte sig igennem fra start til slut på 30–60 min.
- **Illustrativt**: Hvert kapitel har mindst ét billede og kobles til kort og tidslinje.
- **Indhold adskilt fra kode** (genbrug): Al tekst, billeder, lyd og data ligger i en "indholdspakke" (`content/maya/`). Motoren kender ikke ordet "maya". Næste emne = ny mappe + nyt tema.
- **Mobil først**: Den skal fungere på telefonen i toget på vej til udstillingen – og helst også offline på selve udstillingen.

## 2. Teknisk arkitektur

Samme opbygning som **read** (read.kaspert.dk), så deploy, oplæsning og konventioner kan genbruges direkte.

```
Maya/
├─ src/Maya.Api/          ASP.NET Core minimal API, .NET 10 – serverer API + React-build (wwwroot)
│   ├─ Content/           Læser indholdspakker fra disk (JSON + Markdown)
│   ├─ Tts/               Google Chirp 3 HD + cache – kopieret fra read
│   ├─ Vision/            Billedgenkendelse med Gemini – porteret fra mission-bear-hug
│   └─ web.config         Som read (OutOfProcess, self-contained)
├─ web/                   React 19 + Vite + Tailwind 4 + TypeScript, PWA
│   └─ src/
│       ├─ speech/        SpeechEngine, WebSpeechEngine, GoogleSpeechEngine, usePlayer – fra read
│       ├─ components/    Generiske moduler: Chapter, Timeline, Map, Gallery,
│       │                 Player, PodcastPlayer, Glossary, Quiz, CameraGuide
│       └─ theme/         Design tokens pr. emne
├─ content/maya/
│   ├─ topic.json         Titel, tema, kapitelrækkefølge, podcasts
│   ├─ chapters/*.md      Tekst med front-matter (periode, steder, billeder, kilder, quiz)
│   ├─ timeline.json      Perioder og begivenheder
│   ├─ places.geojson     Byer, regioner, koordinater
│   ├─ glossary.json      Ord: k'uhul ajaw, milpa, stela, cenote ...
│   └─ media/             Billeder, podcasts
├─ tests/Maya.Tests/
├─ .github/workflows/     ci.yml, deploy.yml, claude.yml – som read
└─ docs/
```

| Område | Valg | Begrundelse |
|---|---|---|
| Backend | ASP.NET Core minimal API, **.NET 10** | Samme som read |
| Frontend | React 19 + Vite + Tailwind 4 + TypeScript | Samme som read; Tailwind gør tema-tokens nemme |
| Kort | Leaflet + react-leaflet, plus eget illustreret kortlag (SVG i codex-stil) | Gratis, ingen nøgle; kan skifte mellem rigtigt og tegnet kort |
| Tidslinje | Egen SVG-komponent | Lange perioder (2000 f.Kr.–i dag), zoom, codex-stil |
| Oplæsning | **Som read**: browserens stemme + Google Chirp 3 HD (danske AI-stemmer), valgt i en stemmemenu. Kapitlet afspilles som ét MP3-spor, så det læser videre med slukket skærm | Genbrug af afprøvet kode. Teksten er fast, så lyden caches og koster kun første gang |
| Podcasts | NotebookLM-lyd i `media/podcasts/`, koblet til kapitler i `topic.json` | Ingen kode-afhængighed til NotebookLM |
| Offline | PWA. Knap "Hent til offline", der gemmer tekst, billeder, kapitel-lyd og podcasts i service worker-cachen | Brug på museet uden net |
| Billedgenkendelse | **Fra mission-bear-hug ("Udforsk → Museum")**: tag et billede af en genstand eller et skilt → Gemini genkender, oversætter og fortæller, med appens kapitler som baggrundsviden | Genbrug; giver en "guide i lommen" på udstillingen |
| Indhold | Filer i git, ingen database og ingen redigering i appen | Simpelt at hoste og versionere |
| Hosting | Simply (IIS, 32-bit), self-contained `win-x86`, Web Deploy fra GitHub Actions | Præcis som read (`docs/simply-deploy.md`) |

### Hosting på Simply (maya.kaspert.dk)
- Opret `maya.kaspert.dk` som **eget site med egen mappe** hos Simply, og bestil SSL (Let's Encrypt).
- GitHub environment `Production` med secrets: `SIMPLY_WEBDEPLOY_URL` (`kaspert.dk`), `SIMPLY_WEBDEPLOY_SITE` (`maya.kaspert.dk`), `SIMPLY_WEBDEPLOY_USERNAME`, `SIMPLY_WEBDEPLOY_PASSEORD`, `GOOGLE_TTS_API_KEY`, `GEMINI_API_KEY`.
- Flow: branch → PR → CI grøn → merge til `main` → automatisk deploy (som read). Første deploy køres manuelt, og loggen tjekkes for slettede filer (erfaringen fra read).

### Hvad genbruges fra de andre repoer
| Fra | Hvad | Tilpasning |
|---|---|---|
| read | `Tts/` (GoogleTts, TtsCache, TtsStreams, Mp3, endpoints) | Næsten uændret |
| read | `web/src/speech/` + `Player`, `VoiceSheet` | Afspiller kapitler i stedet for gemte tekster |
| read | `ci.yml`, `deploy.yml`, `web.config`, `simply-deploy.md`, PWA-ikoner/manifest | Navne og secrets |
| mission-bear-hug | `ExploreAssistantService` (genkend kunstværk, læs skilt, spørg) og dens prompts | Porteres fra Blazor/Clean Architecture til en lille `Vision/`-klasse i minimal API; React-side i stedet for Razor; kapiteltekster sendes med som baggrund |

## 3. Indhold – foreløbig kapiteloversigt

1. **Mød mayaerne** – hvem var (og er!) de? Ca. 6–7 mio. mayaer lever i dag; ~30 mayasprog.
2. **Landet** – Yucatán-halvøen, Guatemala, Belize, Chiapas, Honduras/El Salvador. Regnskov, kalkstensslette, cenoter, højland.
3. **Begyndelsen** – fra jægere/samlere til majsbønder. Arkaisk tid og tidlige landsbyer (ca. 2000 f.Kr.).
4. **Præklassisk tid** (ca. 2000 f.Kr.–250 e.Kr.) – de første store byer: Nakbe, El Mirador; olmekisk påvirkning.
5. **Klassisk tid** (ca. 250–900 e.Kr.) – kongerigerne: Tikal, Calakmul, Palenque, Copán. Guddommelige konger, krige, alliancer.
6. **Hverdagsliv** – milpa (majs, bønner, squash), kakao, huse, familie, mad, handel.
7. **Tro og ritualer** – guder, underverdenen Xibalba, Popol Vuh, blodofringer, boldspillet.
8. **Viden** – hieroglyfskrift, kalendere (Long Count, 260-/365-dages), tallet nul, astronomi.
9. **Kunst og arkitektur** – pyramider, stelaer, jade, keramik, vægmalerier (Bonampak).
10. **Kollapset** – hvorfor de sydlige byer blev forladt ca. 800–900 (tørke, krig, overbefolkning).
11. **Postklassisk tid** (ca. 900–1500) – Chichén Itzá, Mayapán, handelsbyer ved kysten.
12. **Spanierne kommer** – erobringen 1520'erne–1697 (Nojpetén/Tayasal falder sidst).
13. **Mayaerne i dag** – sprog, traditioner, genopdagelse, lidar-fund.
14. **Klar til Moesgård** – hvad skal jeg kigge efter? Jademasker, stelaer, keramik osv. koblet til kapitlerne. Tilpasses udstillingens værker.

Fokus vægtes mod **klassisk tid (kapitel 5–10)**, da det er udstillingens periode.

Hvert kapitel: tekst (kort + "læs mere"), 1–3 illustrationer, markerede steder på kortet, markering på tidslinjen, oplæsning, evt. podcast, 2–3 quizspørgsmål.

**Navigation:** En fortællelinje fra kapitel 1 til 14 med "næste/forrige", men man kan altid hoppe direkte til et kapitel, et sted på kortet, en periode på tidslinjen eller et ord i ordlisten. Kort, tidslinje og ordliste er også selvstændige faner. Bygget til mobil først (bundmenu, store trykflader).

**Podcasts (blandet):** 1 samlet introduktion (ca. 15–20 min) + korte afsnit, hvor emnet fortjener det, fx "Skrift og kalender", "Konger og krig i klassisk tid", "Kollapset" og "Hvad skal vi se på Moesgård". Jeg laver kildetekster til NotebookLM pr. podcast.

**Kildekritik**: Fakta tjekkes mod anerkendte kilder (museer, universiteter). Kilder listes pr. kapitel i front-matter.

## 4. Billedstil – forslag

Billederne skal "ligne noget rigtigt" men være vores egne. Tre kandidater (laves som prøver på samme motiv, fx Tikal Tempel I, så de kan sammenlignes):

| Stil | Beskrivelse | Fordel | Ulempe |
|---|---|---|---|
| **A. Codex-stil** | Inspireret af mayaernes egne bøger (Dresden-kodeksen): flade farver, sorte konturer, mayablå, rød okker, cremet "barkpapir"-baggrund | Autentisk, unik, sammenhængende | Mindre "fotorealistisk" |
| **B. Arkæologisk akvarel** | Som 1800-tals ekspeditionstegninger (Catherwood): blød akvarel, sepia-blæk, ruiner i junglen | Ser "rigtigt" ud, museumsagtigt | Svært at gøre konsistent |
| **C. Moderne flad illustration** | Rene former, begrænset palet, let skygge | Nemmest at lave mange af, nemt med SVG | Kan virke generisk |

**Valgt: A – Codex-stil** til alt.
**Værktøj: Gemini.** Geminis billedgenerering kan bruge et referencebillede, hvilket er det vigtigste for en ensartet stil. Arbejdsgang:
1. ✅ Stilark lavet: Tempel I i Tikal i codex-stil (`content/maya/media/stil/tempel1-codex-stilark.webp`) + palet. Se `docs/billedstil.md`.
2. ✅ Fast prompt-skabelon (`tools/billeder/skabelon.txt`, script `tools/billeder/gemini_billede.py`): `[motiv] i stil som det vedhæftede billede: maya-kodeks, flade farver, ...`.
3. Hvert nyt billede laves med stilarket vedhæftet + skabelonen, så de ligner hinanden.
4. Billeder gemmes som WebP i `content/maya/media/` med en kort note om, hvad der er rekonstruktion og ikke en rigtig genstand. Jeg kan lave SVG-grafik (glyffer, kort, tidslinje, ornamenter) direkte i koden; fotorealistiske/malede scener kræver et billedværktøj eller jeres egne tegninger. Evt. suppleres med licensfri fotos af rigtige genstande (Wikimedia Commons, museers open access).

## 5. Udviklingsproces – faser

| Fase | Indhold | Resultat |
|---|---|---|
| **0. Brainstorm** | Afklare spørgsmålene nedenfor | Beslutninger skrevet ind i denne plan |
| **1. Skelet + deploy** | .NET 10 + React-projekt efter read's skabelon, CI + deploy-workflows, deploy til maya.kaspert.dk | Kører online – risiko for hosting fjernet tidligt |
| **2. Indholdsmodel** | JSON/Markdown-format, API der læser indholdspakker, 2 prøvekapitler | Motoren er generisk og dokumenteret |
| **3. Kernemoduler** | Kapitelvisning med navigation, tidslinje, kort, galleri, oplæsning (fra read), podcastafspiller | Alle byggeklodser virker med prøveindhold |
| **4. Billedstil** | 3 prøvebilleder → vælg stil → stilguide + palet + prompt-skabelon | Fastlagt stil, design tokens |
| **5. Indhold** | Research og skrivning af alle kapitler, illustrationer, NotebookLM-podcasts | Komplet maya-pakke |
| **6. Ekstra** | Quiz, ordliste, glyf-/kalenderleg, offline-download, billedgenkendelse (fra mission-bear-hug) | Klar til brug |
| **7. Polering** | Mobiltest, tilgængelighed, ydelse, endelig deploy | Færdig app |
| **8. Genbrug** | Skabelon-dokumentation: "Sådan laver du et nyt emne" | Klar til næste udstilling |

Fase 1–3 kan køre parallelt med 4–5 (indhold og billeder kan laves mens koden bygges).

## 6. Beslutninger (brainstorm 31. oktober 2026)

- [x] Udstilling: Moesgård Museum, *Maya – riget under junglen*
- [x] Målgruppe: voksne, mest mobil. Ingen børnetilstand
- [x] Sprog: kun dansk
- [x] Navigation: fortællelinje, men man kan hoppe frit rundt
- [x] Omfang: 30–60 min at komme igennem
- [x] Offline: ja
- [x] Quiz, ordliste og interaktive elementer: ja
- [x] Oplæsning: stemmer som i read (browser + Google Chirp 3 HD)
- [x] Podcasts: blandet – en samlet intro og korte afsnit, hvor det giver mening
- [x] Billedstil: A (codex-stil), lavet med Gemini
- [x] Licensfri fotos af rigtige genstande: ja (Wikimedia Commons, museers open access)
- [x] Teknik: .NET 10, deploy som read
- [x] Domæne: maya.kaspert.dk
- [x] Indhold redigeres kun i filerne
- [x] Billedgenkendelse fra mission-bear-hug genbruges
- [x] Gemini-nøglen er testet og virker (31. okt.), inkl. billedmodellerne `gemini-3-pro-image` og `gemini-3.1-flash-image`
- [x] Stilark i codex-stil godkendt til videre brug: Tempel I i Tikal (`docs/billedstil.md`)

- [x] Login: intet login i første omgang – det er kun os, der bruger den
- [x] Nøgler: vores egne Google-/Gemini-nøgler ligger som secrets på serveren (`GOOGLE_TTS_API_KEY`, `GEMINI_API_KEY`). Ingen indtastning i appen. Som værn mod misbrug, når appen er åben: rate limit pr. IP på TTS- og vision-endpoints og et dagligt loft, og Chirp-lyden caches
- [x] Deadline: besøg på Moesgård **7. november 2026** (om 7 dage)

## 7. Plan for de 7 dage

Med en uge til besøget prioriteres det, der giver mest på selve dagen. Resten (fase 6–8) kommer efter besøget.

| Dag | Dato | Mål |
|---|---|---|
| 1 | 1. nov | ✅ Skelet fra read (.NET 10 + React), CI/deploy, indholdsmodel + API, kapitelvisning med oplæsning, 2 prøvekapitler. ⏳ maya.kaspert.dk online (kræver merge til `main`) |
| 2 | 2. nov | ✅ Kapitelvisning, navigation (næste/forrige, bundmenu), tema i codex-stil, læseposition + »Fortsæt«. Kapitel 1, 2, 3 og 5 skrevet, med illustrationer til 2 og 3 |
| 3 | 3. nov | ✅ Oplæsning (fra read) + tidslinje i codex-stil (fremhæver kapitlets begivenheder). Kapitel 3–4 og 6–8 med illustrationer. Kildetekst og prompts til NotebookLM i `docs/podcasts/` |
| 4 | 4. nov | ✅ Kort (Leaflet + OpenStreetMap i sepia, codex-markører, kapitlets steder fremhævet). Kapitel 9–11 med illustrationer |
| 5 | 5. nov | ✅ Kapitel 12–14 inkl. "Klar til Moesgård" (punktlister i kapitler). Ordliste (40 ord). ⏳ Podcasts: venter på MP3 fra NotebookLM. ⏳ Kapitel 14 tilpasses udstillingens værker, når listen kendes |
| 6 | 6. nov | ✅ »Hent til offline« (alle tekster, billeder, data og selve appen), offline-banner, hint om enhedens stemme offline. Testet offline i Chromium og i mørk tilstand. ✅ Billedgenkendelse (»Spørg guiden«), bygget fra bunden med Gemini |
| 7 | 7. nov | Besøg på Moesgård 🎉 |

**Skal med:** alle 14 kapitler (fokus på 5–10 og 14), oplæsning, tidslinje, kort, illustrationer, offline.
**Hvis der er tid:** podcast-afsnit ud over introen, ordliste, quiz, billedgenkendelse.
**Efter besøget:** quiz, glyf-/kalenderleg, polering, skabelon-dokumentation (fase 8).

## 7b. Billedshow (31. oktober)

Under oplæsning kan man vælge »Følg teksten« (siden ruller med) eller »Billedshow« (afsnittets billede bliver stående øverst med sætningen som undertekst). 76 afsnitsbilleder i codex-stil; praktiske afsnit i kapitel 14 har ingen. Offline-pakken er nu ca. 13 MB.

## 8. Senere: flere emner i samme app (fase 8)

Besluttet 31. oktober: én app med flere emner (mayaerne, vikingerne …), samme funktioner og samme udtryk – kun tekster og billeder er forskellige. Laves **efter besøget**, når Maya-appen er på plads. Skøn: ca. en dags arbejde på motoren + vejledning; derefter er et nyt emne kun indhold (svarende til dag 2–5).

**Plan:**
- Backend: indlæs alle mapper under `content/`; adresser med emnet (`/api/topics`, `/api/topics/{emne}/…`, `/media/{emne}/…`); guiden får emnet med.
- Frontend: forside med emnerne; ruter som `/{emne}/kapitel/…`; emnets navn i topbjælken; neutralt app-navn og ikon (én app på hjemmeskærmen).
- Læseposition, »læst«-flueben og »Hent til offline« pr. emne.
- Værktøjerne (billeder, podcast) tager emnet som parameter; podcast-afsnit flyttes ind i emnets mappe.
- Domæne: fx historie.kaspert.dk, hvor maya.kaspert.dk sender videre til `/maya`, så links og installationer virker.
- Vejledning: »Sådan laver du et nyt emne«.

**Husk allerede nu, når der bygges noget nyt** (så fase 8 bliver let):
- Intet emne-specifikt i koden – alt emne-specifikt i `content/<emne>/` (også tekster til guiden og podcasts).
- Nøgler i telefonens lager (`localStorage`, cache-navne) og id'er skal kunne få emnet foran.
- Rester at rydde op i fase 8: »Mayaerne« står fast i topbjælken, `index.html`, manifestet og som kunstner på låseskærmen; lagernøgler hedder `maya.*`; projektet hedder `Maya.Api`.
