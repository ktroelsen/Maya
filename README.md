# Mayaerne

En illustreret app om mayaernes historie – kapitler, tidslinje, kort, ordliste, quiz og oplæsning – som forberedelse til udstillingen *Maya – riget under junglen* på Moesgård. Bygget, så motoren kan genbruges til nye emner: alt indhold ligger i `content/<emne>/`.

Kører på https://maya.kaspert.dk. Se `docs/PLAN.md` for plan og beslutninger.

## Arkitektur

| Del | Teknologi |
|---|---|
| Backend | ASP.NET Core minimal API, .NET 10 (`src/Maya.Api`) |
| Frontend | React 19 + Vite + Tailwind 4, installerbar PWA (`web/`) |
| Indhold | `content/maya/`: `topic.json`, `chapters/*.md` (YAML front-matter + Markdown), `timeline.json`, `places.geojson`, `glossary.json`, `media/` |
| Oplæsning | Browserens stemme eller Google Chirp 3 HD (fra read), cachet i `App_Data/tts-cache` |
| Billeder | Gemini i codex-stil (`docs/billedstil.md`, `tools/billeder/`) |
| Guide | Foto af genstand eller skilt → Gemini forklarer på dansk og peger på kapitler (`/api/vision`) |
| Offline | PWA; »Hent til offline« gemmer tekster, billeder og data på telefonen |
| Hosting | Simply.com (IIS), self-contained `win-x86`, Web Deploy fra GitHub Actions |

## Kør lokalt

```bash
dotnet run --project src/Maya.Api          # API på http://localhost:5280
npm --prefix web install
npm --prefix web run dev                   # app på http://localhost:5184
```

Google-stemmen kræver en nøgle (gemmes uden for repoet):

```bash
dotnet user-secrets set "Tts:Google:ApiKey" "AIza..." --project src/Maya.Api
```

Billedgenkendelsen kræver en Gemini-nøgle:

```bash
dotnet user-secrets set "Gemini:ApiKey" "AIza..." --project src/Maya.Api
```

Tjek før push: `dotnet build -c Release -warnaserror`, `dotnet test`, `npm --prefix web run lint` og `npm --prefix web run build`.

## Nyt kapitel

Opret `content/maya/chapters/<id>.md` med front-matter (`title`, `summary`, `period`, `places`, `images`, `sources`, `quiz` – se de eksisterende) og tilføj id'et i `topic.json` på den rigtige plads.

## Deploy

Branch → PR → CI grøn → merge til `main` → **Deploy to Simply** kører automatisk. Se [`docs/simply-deploy.md`](docs/simply-deploy.md).
