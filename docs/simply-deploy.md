# Deploy til Simply (maya.kaspert.dk)

> Kopieret fra read og tilpasset. Appen har intet login; de betalte kald (Google-stemmen) er begrænset pr. IP (`Tts:RequestsPerMinute`) og pr. dag (`Tts:DailyCharLimit`).

Sådan kommer Maya-appen fra GitHub ud på Simply.com, og hvad vi har lært undervejs. Alt herunder
passer til workflowsene i `.github/workflows/` – ret begge steder, hvis noget ændres.

## Flow

```
push/merge til main ─► CI (ubuntu) ─► grøn? ─► Deploy to Simply (windows) ─► maya.kaspert.dk
                       lint, build,             workflow_run på CI
                       test                     (eller manuelt: Actions → Run workflow)
```

- **`ci.yml`** kører på PR'er og push til `main` (ikke ved ændringer kun i `*.md`/`docs/`):
  `npm ci`, `npm run lint`, `npm run build`, `dotnet build -c Release -warnaserror`, `dotnet test`.
- **`deploy.yml`** starter først, når CI er grøn på `main`, og deployer præcis den commit, CI testede.
  Kun én deploy ad gangen. Kan også startes manuelt (`workflow_dispatch`) – fx efter rettede secrets.
- **`claude.yml`** svarer på `@claude` i issues og PR-kommentarer.

## Hvad deploy-jobbet gør

1. Bygger frontend'en (`web/`) og kopierer `web/dist` til `src/Maya.Api/wwwroot`.
2. `dotnet publish -c Release -r win-x86 --self-contained` – Simply har ingen .NET 10-runtime, og
   app-poolen kører 32-bit. Commit-SHA'en kommer med som version og ses i `/api/health`.
3. Skriver `publish/appsettings.Production.json` med `Tts:Google:ApiKey` og `Gemini:ApiKey` fra
   secrets. Mangler en af dem, advarer trinnet, men deployen fortsætter (kun enhedens stemme
   tilbydes / billedgenkendelse er slået fra).
4. Synkroniserer `publish/` til sitet med `msdeploy -verb:sync -enableRule:AppOffline`.

**Vigtigt om synkroniseringen:** `sync` gør sitet identisk med `publish/`. **Alt på sitet, der ikke er
i build'et, slettes** – undtagen `App_Data` (Google-lydcachen) og `logs`, som er
undtaget med `-skip`. Sitet skal derfor være Maya-appens eget og må ikke dele mappe med noget andet.

`web.config` kommer fra `src/Maya.Api/web.config`, som publish udfylder (`processPath`), og
overskrives ved hver deploy:

```xml
<aspNetCore processPath=".\Maya.Api.exe" arguments="" stdoutLogEnabled="false"
            stdoutLogFile=".\logs\stdout" hostingModel="OutOfProcess" requestTimeout="04:00:00" />
```

`requestTimeout` er hævet, fordi læseren afspiller Google-stemmen som ét langt lydspor, der streames
i hele oplæsningens længde. Med standardværdien kunne IIS kappe forbindelsen undervejs.

Hemmeligheder ligger altså **ikke** i `web.config`, men i `appsettings.Production.json`.

## GitHub Secrets (environment `Production`)

Navnene skal stå præcis sådan – to af dem er stavet anderledes end normalt, og workflowsene bruger
netop de navne.

| Secret | Værdi | Bruges til |
|---|---|---|
| `SIMPLY_WEBDEPLOY_URL` | `kaspert.dk` | Serveren, msdeploy forbinder til (`https://<url>:8172/msdeploy.axd`). Uden `https://` og port. |
| `SIMPLY_WEBDEPLOY_SITE` | `maya.kaspert.dk` | **IIS-sitet, der overskrives.** Det er denne, der afgør, hvor appen lander. |
| `SIMPLY_WEBDEPLOY_USERNAME` | (fra Simply) | Web Deploy-login |
| `SIMPLY_WEBDEPLOY_PASSEORD` | (fra Simply) | Web Deploy-adgangskode (stavet med E) |
| `GOOGLE_TTS_API_KEY` | `AIza…` | Google Chirp 3 HD-stemmen. Valgfri – uden den tilbydes kun enhedens stemme. |
| `GEMINI_API_KEY` | `AIza…` | Billedgenkendelse (Gemini). Valgfri. |
| `CLAUDE_CODE_0AUTH_TOKEN` | fra `claude setup-token` | Kun `claude.yml` (`@claude`). Stavet med nul. Kan ikke bruges af appen. |

Både `deploy.yml` og `claude.yml` kører i environmentet `Production`, så de kan se secrets'ene.

## Nyt site hos Simply (engangsopgave)

1. Opret `maya.kaspert.dk` som **eget website med egen mappe** – ikke som alias til `kaspert.dk`.
2. Bestil SSL (Let's Encrypt) til `maya.kaspert.dk`. Ellers viser serveren `kaspert.dk`'s
   certifikat, browsere advarer, og appen kan ikke installeres som PWA.
3. Sørg for, at sitets rod er skrivbar for app-poolen: appen opretter selv `App_Data/tts-cache`, og `logs/` bruges ved fejlfinding.
4. Sæt `SIMPLY_WEBDEPLOY_SITE` / `_URL` som i tabellen, og kør deploy manuelt én gang.
5. Tjek i deploy-loggen (`Total changes: … deleted`), at der ikke er slettet andet end Simplys
   pladsholder-`index.html`.

## Google-nøgle til Chirp 3 HD (engangsopgave)

1. Opret (eller vælg) et projekt i Google Cloud Console, og tilknyt en betalingskonto – det kræves
   også for at bruge den gratis kvote (1M tegn Chirp 3 HD).
2. Slå **Cloud Text-to-Speech API** til under *APIs & Services → Library*.
3. Opret en API-nøgle under *APIs & Services → Credentials*, og begræns den til netop
   Text-to-Speech API'et (*API restrictions*). Nøglen bruges kun fra serveren.
4. Læg den som `GOOGLE_TTS_API_KEY` i environmentet `Production`, og deploy.
5. Sæt gerne et budget med e-mail-advarsel under *Billing → Budgets & alerts*. Appen har desuden
   sit eget loft (`Tts:DailyCharLimit`, 300.000 tegn om dagen), og gentagne sætninger hentes fra
   cachen i `App_Data/tts-cache` uden at koste noget.

## Verificér efter deploy

- Åbn `https://maya.kaspert.dk/api/health` i en browser. Forventet:
  `{"status":"ok","version":"1.0.0+<commit-sha>","ai":true,"googleVoice":true}`.
- Fra kommandolinjen skal der bruges en browser-user-agent (se fejlfinding, 455):

  ```bash
  curl -A "Mozilla/5.0" https://maya.kaspert.dk/api/health
  ```

- Log ind, gem en tekst, deploy igen, og tjek at teksten stadig er der (beviser `App_Data`-skip).

## Fejlfinding

| Symptom | Årsag / løsning |
|---|---|
| `455 ModSecurity Action` fra curl/scripts | Simplys firewall afviser curl's user-agent. Brug en browser-UA (`-A "Mozilla/5.0"`). Browsere rammes ikke. |
| Certifikatfejl / curl exit 60 | Sitet har ikke sit eget certifikat. Bestil SSL til underdomænet hos Simply. |
| Appen dukker op på `kaspert.dk` | Deployen ramte hoveddomænets site: `_SITE`/`_URL` er byttet om, eller underdomænet er et alias i stedet for eget site. |
| En anden app er forsvundet | `_SITE` pegede på dens site – `sync` sletter alt, der ikke er i build'et. Redeploy den anden app fra dens eget repo, og ret `_SITE`. |
| `Could not connect … 8172` | Forkert `SIMPLY_WEBDEPLOY_URL`, eller Web Deploy er ikke slået til hos Simply. |
| `ERROR_USER_UNAUTHORIZED` | Forkert brugernavn/adgangskode, eller brugeren har ikke adgang til det site, `_SITE` peger på. |
| Låst fil under deploy | `AppOffline` stopper appen før kopiering; låste filer i `logs/` er undtaget med `-skip`. |
| `500.x` ved opstart | Sæt midlertidigt `stdoutLogEnabled="true"` i `web.config` på serveren og læs `logs/stdout_*.log` (næste deploy nulstiller `web.config`). |
| `/api/health` viser `"ai":false` | `ANTHROPIC_API_KEY` mangler. |
| `/api/health` viser `"googleVoice":false` | `GOOGLE_TTS_API_KEY` mangler. |
| Google-stemmen svarer 502 | Se app-loggen: typisk 403 (API'et ikke slået til, nøglen begrænset til et andet API, eller ingen betalingskonto). |
| Google-stemmen svarer 429 | Appens daglige tegnloft er nået; nulstilles ved midnat (UTC) eller genstart. |
| Google-stemmen stopper midt i en lang tekst | Appen genopretter forbindelsen selv op til to gange. Sker det ofte, kappes sporet af IIS: tjek `requestTimeout` i `web.config` på serveren. |

## Erfaringer fra første deploy (27. oktober 2026)

1. `SIMPLY_WEBDEPLOY_SITE` pegede på det site, hvor hits-appen kørte. Den første deploy erstattede
   hits (33 filer slettet). Hits' `App_Data` overlevede pga. `-skip`.
2. Efter rettelsen landede appen i roden af `kaspert.dk` (`d:\web\localuser\kaspert.dk\public_html`)
   og slettede den forside, der lå der. `maya.kaspert.dk` viste samme site med `kaspert.dk`'s
   certifikat.
3. Lære: tjek altid `_SITE`, før en ny app deployes første gang, og læs `Deleting file`-linjerne i
   deploy-loggen bagefter.
