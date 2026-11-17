# NCR Restaurant Intelligence

**Benchmark. Understand. Improve.**

A research-backed restaurant benchmarking and diagnostic prototype based on historical Delhi NCR restaurant data. It applies the research project *"Visible, Liked, or Both? Understanding Restaurant Visibility, Perceived Quality and Customer Engagement on Zomato"* (Marketing Analytics Research Project, IIT Gandhinagar).

- **Primary users:** restaurant owners and managers (Restaurant Owner mode).
- **Secondary users:** students, researchers, general readers (Research Explorer mode, the Stage 2 explorer preserved and reworded).
- **Status:** research prototype. Historical benchmarks from an undated Zomato listing snapshot. Not live Zomato data, not affiliated with Zomato. Associations, not causes.

## Run it

Double-click `index.html` (works from disk), or serve the folder locally:

```bash
python serve.py
```

then open http://127.0.0.1:8010. `python -m http.server 8010` also works; `serve.py` is the same standard-library server with a larger connection backlog, which avoids intermittent refused connections on Windows. No internet connection, account, API key, CDN, database or backend is used.

## What is inside

```
WEBSITE/
  index.html                  single-page app (owner views + research explorer views, hash routing)
  css/base.css                Stage 2 explorer stylesheet (copied unchanged)
  css/app.css                 Stage 3 theme, owner components, responsive rules
  css/print.css               print / Save-as-PDF layout for the diagnostic report
  js/engine.js                benchmark + rule engine (pure functions; also runs in Node for tests)
  js/owner.js                 guided wizard, six-module dashboard, printable report
  js/glossary.js              reusable plain-language statistical explanations + popovers
  js/research.js              Research Explorer (generated from the Stage 2 app.js by tools/port_research_explorer.py)
  js/charts.js, filters.js    Stage 2 chart and filter helpers (copied unchanged)
  js/data.js                  data loader and formatting helpers
  js/app.js                   router, header, mode switch
  data/                       aggregated JSON only (see Website_Data_Dictionary.md)
  assets/                     favicon and the two Stage 1 research figures
  serve.py                    optional local server (127.0.0.1 only)
  tools/port_research_explorer.py
  README.md, Website_Usage_Guide.md, Website_Data_Dictionary.md, Website_Validation_Report.md, Recommendation_Rules.md
```

## Rebuild and validate

```bash
python PHASE3_STAGE3/DATA_PIPELINE/build_diagnostic_data.py
```

```bash
python PHASE3_STAGE3/DATA_PIPELINE/build_research_explorer_data.py
```

```bash
python PHASE3_STAGE3/DATA_PIPELINE/validate_diagnostic_data.py
```

The first reads the raw CSV at build time only and writes aggregates; the second regenerates the Stage 2 research data; the third runs 15,000+ data, privacy and network checks and the Node engine tests (`test_engine.js`). No regression model is run.

## Key design rules

- Benchmarks in the approved order: locality (30+ restaurants primary; 20/50 selectable), city, Delhi NCR, then similar-restaurant peers (30+). Rating statistics need 20+ rated restaurants. Unsupported statistics are hidden with a reason, never estimated, and thresholds are never lowered automatically.
- Visibility, perceived quality and engagement are kept separate. Ratings are compared among rated restaurants only. Votes use the rated-only benchmark for a restaurant with a published rating and the all-restaurant benchmark otherwise, always labelled.
- No composite score, no grade. Suggestions come from documented deterministic rules (`Recommendation_Rules.md`) with evidence classes and limitations; table booking never produces a recommendation.
- Privacy: no accounts, uploads, analytics or tracking. The profile stays in the browser tab.
