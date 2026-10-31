# Maya – noter til Claude

- Plan og beslutninger: `docs/PLAN.md`. Billedstil: `docs/billedstil.md`. Deploy: `docs/simply-deploy.md`.
- Backend: `dotnet build -c Release -warnaserror` og `dotnet test` skal være grønne (CI kører det samme).
- Frontend: `npm --prefix web run lint` og `npm --prefix web run build`.
- UI-tekster og indhold er på dansk; kode og kommentarer på engelsk.
- Genbrug: motoren må ikke kende ordet "maya". Alt emne-specifikt ligger i `content/<emne>/` (`topic.json`, `chapters/*.md` med YAML front-matter, `timeline.json`, `places.geojson`, `glossary.json`, `media/`). Emnet vælges med `Content:Topic`. Kapitlernes nummer er deres plads i `topic.json`; kapitler, der ikke er skrevet endnu, springes over.
- Flere emner i samme app er planlagt (fase 8 i `docs/PLAN.md`). Byg alt nyt, så emnet kan komme med i adresser, lagernøgler og prompts – intet emne-specifikt i koden.
- Indhold kopieres med ud ved build/publish (`content/**` → `content/` ved siden af appen) og læses én gang (`ContentStore`). Medier serveres under `/media/`.
- Intet login. Google-stemmen (`src/Maya.Api/Tts/`, kopieret fra read) er begrænset pr. IP (`Tts:RequestsPerMinute`, kun de kald, der syntetiserer) og pr. dag (`Tts:DailyCharLimit`); lyden caches i `App_Data/tts-cache`.
- Oplæsning i frontend (`web/src/speech/`) er kopieret fra read: browserens stemme eller Google Chirp 3 HD bag `SpeechEngine`; kald altid den fælles `engine` fra `speech/settings.ts`. Kapitlets Markdown laves til sætninger i `speech/chapterText.ts`.
- Billedgenkendelse (»Spørg guiden«, `src/Maya.Api/Vision/`, `web/src/pages/GuidePage.tsx`): foto → `POST /api/vision` (multipart: `image`, `mode` = object|sign, `question`) → Gemini (`Gemini:Model`, standard `gemini-3.5-flash`) med kapitlernes titler, resuméer og afsnit som baggrund, svar som JSON. Begrænset pr. IP (`Gemini:RequestsPerMinute`) og pr. dag (`Gemini:DailyLimit`). Uden `Gemini:ApiKey` er fanen slået fra. Klienten skalerer fotoet ned til JPEG (`photo.ts`).
- Offline: service workeren (`web/public/sw.js`) gemmer indhold og medier i cachen `maya-content`; »Hent til offline« (`offline.ts`) henter det hele på én gang. Kortfliser og Google-stemmen kræver net.
- Podcasts: `tools/podcast/lav_podcast.py` (Gemini Pro skriver manus som JSON i `docs/podcasts/`, ret fakta i hånden; Gemini TTS læser op med to stemmer → MP3 i `media/podcasts/`). Afspilles med `<audio>` (`PodcastPlayer`); service workeren svarer på byte-range-forespørgsler fra cachen (Safari kræver 206-svar til lyd; testet i Chromium, ikke på iPhone).
- Afsnitsbilleder: en billedlinje `![alt](afsnit/x.webp "billedtekst")` alene i en blok i kapitlets Markdown hører til afsnittet (vises i teksten, læses ikke op; `ContentStore.Figures`, `chapterContent`). Læseren kan vælge »Følg teksten« eller »Billedshow« (`readerView.ts`): billedshowet holder afsnittets billede fast øverst med sætningen som undertekst. `tools/billeder/afsnit.py` laver manglende afsnitsbilleder (Gemini foreslår motiv, springer praktiske afsnit over) – gennemgå dem bagefter (log i `docs/billeder-afsnit.json`).
- Billeder laves med Gemini i codex-stil med stilarket som reference (`tools/billeder/`). Gemini-nøglen sendes som `x-goog-api-key`-header.
- Hosting er Simply (IIS, 32-bit, self-contained win-x86) på maya.kaspert.dk. Deploy synkroniserer hele sitet og sletter alt, der ikke er i build'et (undtagen `App_Data` og `logs`). Ret aldrig `SIMPLY_WEBDEPLOY_SITE`/`_URL` uden at brugeren bekræfter værdierne. Navnene `SIMPLY_WEBDEPLOY_PASSEORD` og `CLAUDE_CODE_0AUTH_TOKEN` er stavet sådan med vilje.
- Simplys firewall afviser curl med 455; brug `curl -A "Mozilla/5.0" …` ved røgtest.
- Arbejdsgang: branch → PR → CI grøn → merge til `main` → auto-deploy.
