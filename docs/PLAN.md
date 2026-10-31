# Maya – forberedelses-app til udstillingen

En illustreret app der fortæller historien om mayaerne – hvem de var, hvor de boede, hvornår og hvordan det hele startede – med kort, billeder, tidslinje, oplæsning og podcasts. Den skal bygges så kodedelen kan genbruges til fremtidige emner (andre udstillinger, rejser, historiske emner).

## 1. Vision og principper

- **Fortælling før fakta-liste**: Indholdet er bygget som kapitler, ikke som et leksikon. Man skal kunne læse/lytte sig igennem fra start til slut på 30–60 min.
- **Illustrativt**: Hvert kapitel har mindst ét billede og kobles til kort og tidslinje.
- **Indhold adskilt fra kode** (genbrug): Al tekst, billeder, lyd og data ligger i en "indholdspakke" (`content/maya/`). Motoren kender ikke ordet "maya". Næste emne = ny mappe + nyt tema.
- **Mobil først**: Den skal fungere på telefonen i toget på vej til udstillingen – og helst også offline på selve udstillingen.

## 2. Teknisk arkitektur

```
Maya/
├─ src/
│  ├─ Server/            ASP.NET Core (.NET 8 LTS) – API + serverer React-build
│  │   ├─ Endpoints/     /api/topics, /api/topics/{id}/chapters, /api/media ...
│  │   ├─ Content/       læser indholdspakker fra disk (JSON + Markdown)
│  │   └─ wwwroot/       React-build lægges her ved publish
│  └─ Client/            React + TypeScript + Vite
│      ├─ components/    Generiske moduler: Chapter, Timeline, Map, Gallery,
│      │                 ReadAloud, PodcastPlayer, Glossary, Quiz
│      ├─ theme/         Design tokens (farver, typografi) pr. emne
│      └─ pages/
├─ content/
│  └─ maya/
│      ├─ topic.json     Titel, tema, kapitel-rækkefølge
│      ├─ chapters/*.md  Tekst med front-matter (periode, steder, billeder)
│      ├─ timeline.json  Perioder og begivenheder
│      ├─ places.geojson Byer, regioner, koordinater
│      ├─ glossary.json  Ord: k'uhul ajaw, milpa, stela, cenote ...
│      └─ media/         Billeder, lyd, podcasts
└─ docs/
```

| Område | Valg | Begrundelse |
|---|---|---|
| Backend | ASP.NET Core minimal API, .NET 8 | Kører på Simply.com (Windows/IIS), samme stak som tidligere apps |
| Frontend | React + TypeScript + Vite | Hurtig udvikling, nem at genbruge komponenter |
| Kort | Leaflet + react-leaflet, evt. med eget illustreret kortlag | Gratis, ingen API-nøgle; kan skifte mellem "rigtigt" kort og tegnet kort |
| Tidslinje | Egen komponent (SVG) | Skal kunne vise lange perioder (2000 f.Kr.–i dag) og zoome; fuld kontrol over stil |
| Oplæsning | Fase 1: Web Speech API (gratis, i browseren). Fase 2: forudgenererede MP3'er (Azure TTS dansk stemme) | Browserens danske stemmer varierer i kvalitet; MP3 giver ens oplevelse og virker offline |
| Podcasts | NotebookLM "Audio Overview" eksporteres og lægges i `media/podcasts/`, kobles til kapitler i `topic.json` | Ingen kode-afhængighed til NotebookLM |
| Offline | PWA (service worker) | Brug på udstillingen uden net |
| Database | Ingen i starten – filbaseret indhold | Simpelt at hoste og versionere i git. Kan udvides senere |

### Hosting på Simply.com
- `dotnet publish -c Release` → upload via Web Deploy/FTP til Simply-webhotellet (som de andre apps).
- React bygges som en del af publish (MSBuild-target kører `npm run build` og kopierer til `wwwroot`).
- Tidligt i forløbet laves en "hello world"-deploy for at sikre at .NET-version og opsætning passer.

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
14. **Klar til udstillingen** – tjekliste: hvad skal jeg kigge efter? (tilpasses udstillingens værker)

Hvert kapitel: tekst (kort + "læs mere"), 1–3 illustrationer, markerede steder på kortet, markering på tidslinjen, oplæsning, evt. podcast, 2–3 quizspørgsmål.

**Kildekritik**: Fakta tjekkes mod anerkendte kilder (museer, universiteter). Kilder listes pr. kapitel i front-matter.

## 4. Billedstil – forslag

Billederne skal "ligne noget rigtigt" men være vores egne. Tre kandidater (laves som prøver på samme motiv, fx Tikal Tempel I, så de kan sammenlignes):

| Stil | Beskrivelse | Fordel | Ulempe |
|---|---|---|---|
| **A. Codex-stil** | Inspireret af mayaernes egne bøger (Dresden-kodeksen): flade farver, sorte konturer, mayablå, rød okker, cremet "barkpapir"-baggrund | Autentisk, unik, sammenhængende | Mindre "fotorealistisk" |
| **B. Arkæologisk akvarel** | Som 1800-tals ekspeditionstegninger (Catherwood): blød akvarel, sepia-blæk, ruiner i junglen | Ser "rigtigt" ud, museumsagtigt | Svært at gøre konsistent |
| **C. Moderne flad illustration** | Rene former, begrænset palet, let skygge | Nemmest at lave mange af, nemt med SVG | Kan virke generisk |

Forslag: **A til ikoner/glyffer/dekoration + B til store scenebilleder**, bundet sammen af én fælles farvepalet.
Billederne kan laves med billed-AI ud fra en fast "stil-prompt", tegnes selv, eller begge. Jeg kan lave SVG-grafik (glyffer, kort, tidslinje, ornamenter) direkte i koden; fotorealistiske/malede scener kræver et billedværktøj eller jeres egne tegninger. Evt. suppleres med licensfri fotos af rigtige genstande (Wikimedia Commons, museers open access).

## 5. Udviklingsproces – faser

| Fase | Indhold | Resultat |
|---|---|---|
| **0. Brainstorm** | Afklare spørgsmålene nedenfor | Beslutninger skrevet ind i denne plan |
| **1. Skelet + deploy** | .NET + React-projekt, build-pipeline, deploy "hello world" til Simply | Kører online – risiko for hosting fjernet tidligt |
| **2. Indholdsmodel** | JSON/Markdown-format, API der læser indholdspakker, 2 prøvekapitler | Motoren er generisk og dokumenteret |
| **3. Kernemoduler** | Kapitelvisning, tidslinje, kort, galleri, oplæsning, podcastafspiller | Alle byggeklodser virker med prøveindhold |
| **4. Billedstil** | 3 prøvebilleder → vælg stil → stilguide + palet + prompt-skabelon | Fastlagt stil, design tokens |
| **5. Indhold** | Research og skrivning af alle kapitler, illustrationer, NotebookLM-podcasts | Komplet maya-pakke |
| **6. Ekstra** | Quiz, ordliste, "på udstillingen"-tilstand, offline/PWA, MP3-oplæsning | Klar til brug |
| **7. Polering** | Mobiltest, tilgængelighed, ydelse, endelig deploy | Færdig app |
| **8. Genbrug** | Skabelon-dokumentation: "Sådan laver du et nyt emne" | Klar til næste udstilling |

Fase 1–3 kan køre parallelt med 4–5 (indhold og billeder kan laves mens koden bygges).

## 6. Åbne spørgsmål (brainstorm)

Se svar fra brainstorm – udfyldes efterhånden:

- [ ] Hvilken udstilling, hvor og hvornår? (deadline)
- [ ] Målgruppe: voksne, børn, begge?
- [ ] Sprog: kun dansk?
- [ ] Billedstil: A, B, C eller mix?
- [ ] Oplæsning: browserstemme ok, eller betale lidt for bedre dansk stemme?
- [ ] Simply-opsætning: .NET-version, deploy-metode, domæne/subdomæne
- [ ] Skal der være login/redigering, eller er indholdet statisk?
- [ ] Ekstra funktioner: quiz, ordliste, børnetilstand, offline?
