# Website Validation Report — NCR Restaurant Intelligence

Validated on 17 November 2026 against the built site in `PHASE3_STAGE3/WEBSITE/`. Automated suites can be re-run with `python PHASE3_STAGE3/DATA_PIPELINE/validate_diagnostic_data.py` (which also runs `test_engine.js`).

## 1. Summary

| Area | Test | Result |
|---|---|---|
| Data pipeline | `build_diagnostic_data.py` build checks: sample sizes, eligibility counts, exact reproduction of Stage 1 city and locality profiles, paper spot checks, suppression, privacy | 4,043 checks, 0 failed |
| JSON schema | required keys/types in `diagnostic_benchmarks.json`, `research_evidence.json` | 45 checks, 0 failed |
| Denominators | shares in range, k ≤ n, n_rated ≤ n, mixes sum to 100, quantiles ordered and n correct | 7,130 checks, 0 failed |
| Eligibility | locality metrics only ≥ 20 with correct 20/30/50 flags; 98 units at 30; peer metrics only ≥ 30; rating stats only ≥ 20 rated; suppressed groups carry no metrics | 3,460 checks, 0 failed |
| Population separation | votes_all vs votes_rated separate with correct n; rated vote minimum ≥ 4 | 938 checks, 0 failed |
| Identifiers | 496 unique City + Locality ids; peer keys parse; 86 clean cuisine tags | 3,585 checks, 0 failed |
| Privacy / raw-data exposure | no CSV/XLSX in the website; no restaurant name, address or Restaurant ID in data files; no per-restaurant arrays | 5 checks, 0 failed |
| No external requests | no external src/href, CDN, analytics or remote fetch in HTML/CSS/JS; only same-folder data fetches | 2 checks, 0 failed; browser network log: 0 non-local requests |
| Research explorer data | 5 research JSON files identical to approved Stage 2 data | 5 checks, 0 failed |
| Diagnostic engine | 12 synthetic profiles + validation, invariance, determinism, edge and evidence tests (`test_engine.js`) | 497 checks, 0 failed |
| Cross-artefact consistency | canonical values, qualifications, forbidden wording, including the rendered pages (`stage3_consistency_audit.py`) | 184 checks (all artefacts), 0 failed |
| Browser console | home, wizard, results, report, glossary, about, all six research views | no errors |
| Responsive layout | 1400×900 desktop; 375×812 mobile (document width = viewport, no horizontal scroll) | PASS |
| Print / Save as PDF | headless Edge print-to-PDF of the report view | 7 A4 pages, report only (header, navigation and other views hidden) |

## 2. Synthetic diagnostic cases

All profiles are invented (`DATA_PIPELINE/synthetic_test_profiles.json`) and labelled as synthetic; none describes a real restaurant.

| ID | Synthetic case | Locality benchmark | Peer group used | Engagement population | Suggestions (rule, evidence class) |
|---|---|---|---|---|---|
| T01 | Restaurant with rating above peer median | Connaught Place (New Delhi) (n = 122) | New Delhi · Tier 3 · North Indian (n = 339) | rated | 1. R7 Check that your listing reflects your full menu [Strong statistical association] |
| T02 | Restaurant with rating below peer median | Hauz Khas (New Delhi) (n = 74) | New Delhi · Tier 3 · Italian (n = 162) | rated | 1. R1 Review what drives your customers' ratings [Benchmark-based]<br>2. R2 Evaluate whether online delivery suits your restaurant [Strong statistical association]<br>3. R7 Check that your listing reflects your full menu [Strong statistical association]<br>4. R4 Investigate how customers discover your listing [Benchmark-based]<br>5. R5 Review your target segment and value positioning [Benchmark-based] |
| T03 | Restaurant with missing rating | Sector 29 (Gurgaon) (n = 38) | Gurgaon · Tier 3 · Continental (n = 47) | all | 1. R7 Check that your listing reflects your full menu [Strong statistical association] |
| T04 | Restaurant with no votes (and no published rating) | Sector 18 (Noida) (n = 75) | Noida · Tier 1 · Fast Food (n = 158) | all | 1. R9 Build a base of genuine customer ratings [Benchmark-based]<br>2. R7 Check that your listing reflects your full menu [Strong statistical association] |
| T05 | Delivery unavailable and visibility selected | unavailable | New Delhi · Tier 2 · North Indian (n = 926) | rated | 1. R2 Evaluate whether online delivery suits your restaurant [Strong statistical association]<br>2. R4 Investigate how customers discover your listing [Benchmark-based] |
| T06 | Delivery available | unavailable | New Delhi · Tier 2 · North Indian (n = 926) | rated | 1. R4 Investigate how customers discover your listing [Benchmark-based] |
| T07 | Multi-outlet restaurant | Sector 29 (Gurgaon) (n = 38) | Gurgaon · Tier 2 (n = 440) | rated | 1. R3 Monitor each outlet's rating separately from its reach [Strong statistical association] |
| T08 | Restaurant in Ghaziabad | unavailable | Delhi NCR · Tier 2 (n = 2596) | rated | none (no rule conditions met) |
| T09 | Restaurant in a locality below the minimum sample threshold | unavailable | Gurgaon · Tier 2 · Chinese (n = 141) | rated | none (no rule conditions met) |
| T10 | Restaurant with a cuisine peer group that fails eligibility | Sector 29 (Gurgaon) (n = 38) | Gurgaon · Tier 4 (n = 67) | rated | 1. R5 Review your target segment and value positioning [Benchmark-based] |
| T11 | Restaurant with missing optional fields (required fields only) | Sector 15 (Faridabad) (n = 31) | Faridabad · Tier 1 (n = 151) | all | none (no rule conditions met) |
| T12 | Restaurant with all optional fields supplied | Sector 62 (Noida) (n = 76) | Noida · Tier 2 · Chinese (n = 183) | rated | 1. R2 Evaluate whether online delivery suits your restaurant [Strong statistical association]<br>2. R3 Monitor each outlet's rating separately from its reach [Strong statistical association]<br>3. R7 Check that your listing reflects your full menu [Strong statistical association]<br>4. R4 Investigate how customers discover your listing [Benchmark-based]<br>5. G1 Use your locality as the main reference point [General business consideration] |

Checked for every case (safeguards): at most 5 suggestions; no table-booking recommendation; R6 note present and classified specification-sensitive; every suggestion has observed / meaning / consider / evidence / limitations; every suggestion linked to a selected goal; no causal or guarantee wording; priorities numbered 1…n; no score field; engagement population follows rating status and vote comparisons are labelled with their population; an available locality meets the threshold; rating statistics only with ≥ 20 rated; every unavailable comparison and peer rung has a reason; primary peer ≥ 30; peer, entry and historical caveats present.

Case-specific expectations (all PASS): T01 rating above median and no R1/R2/R4; T02 R1 first (quality is the first goal); T03 no rating position, all-restaurant votes; T04 rating 0 → R9 fires, R4 suppressed; T05 R2 fires; T06 no R2 when delivery is offered; T07 R3 with the chain-proxy caveat; T08 Ghaziabad → locality and city unavailable with reasons, NCR × tier peers; T09 locality with 21 restaurants unavailable at 30 with a pointer to the 20+ sensitivity threshold, available only when the owner explicitly selects 20; T10 cuisine rung (6 restaurants) unavailable and explained, city × tier used; T11 required fields only → 7 missing fields, no profile-dependent rule fires; T12 all fields → 5 suggestions.

Other engine tests: 12 invalid inputs rejected (rating > 5, negative rating, non-integer and negative votes, tier 5, missing tier/city/locality, locality from another city, unknown cuisine or city, cost 0); warnings, not blocks, for a rating with < 4 votes and a rating of 0 with ≥ 4 votes; the booking answer never changes the suggestions (12 profiles); identical output for identical input; R2 requires the visibility goal; suggestion text cites OR 9.99 [8.03, 12.44], "odds, not probabilities", +0.097, OR 1.10, p = .444 and the geometric-scale wording.

## 3. Functional and interface tests (built-in browser)

| Test | Result |
|---|---|
| Wizard: Continue with empty required fields | Inline errors for city, locality and price tier; no navigation |
| Wizard: city → locality search ("hauz") → select; tier cards; cuisine chips; yes / no / not sure; priorities ranked by click order; review with Edit links; threshold selector | All values captured (verified in session storage); review shows the entered profile |
| Back navigation and editing previous steps | Stepper and Back work; later steps validate earlier ones before advancing |
| Generate → dashboard | Six modules render; module navigation highlights the module in view |
| Module 3 metric switcher | Rating, votes and other metrics re-render with population and n under each level |
| Empty state (no profile) | "No diagnostic yet" with a link to the wizard |
| Missing data | Overview lists missing items; comparisons needing them are skipped, never estimated |
| Ghaziabad profile | Locality and city unavailable with reasons; NCR and NCR × tier used; "No suggestion met its conditions" shown honestly |
| Report view and print | All 13 report sections; Save as PDF via the browser print dialog; privacy statement |
| Clear my data | Session storage cleared; wizard reset |
| Research explorer | Overview, cities, localities (deep link `#research/localities?t=30&loc=…`), extremes, findings and methodology render; data identical to Stage 2 |
| Glossary popovers | Open and close with click and Escape; link to the glossary page |

## 4. Issues found and fixed during validation

1. Small range charts drawn as stretched SVG were too thin in narrow cards → replaced with responsive HTML/CSS range, share and mix bars (no text distortion).
2. Band labels such as "Top 10%" read as praise (e.g. for a cost) → neutral "Above 90th percentile" etc.
3. "about 10.0 times the odds" → "about 10 times".
4. Python `http.server` on Windows intermittently refused connections when many files load at once → added `serve.py` (threaded, larger backlog, bound to 127.0.0.1). Opening `index.html` from disk also works.
5. Printing showed every view because the Stage 2 stylesheet prints all views (`.view[hidden] { display: block !important }`) → `print.css` overrides it; the printed report is 7 pages.
6. Mobile: the sticky module bar overlapped the header strip → static on phones.
7. The research explorer showed "SD 0.15" for the 4–10 vote band where the paper reports 0.16 (Stage 2 re-rounded a stored 3-decimal value) → the Stage 3 explorer shows the stored value (0.155). Data files unchanged.
8. Validator false positives (a UI word equal to one restaurant name; mall locality labels contained in addresses; 2–3-digit numbers) → checks restricted to data files, label-aware, IDs of 4+ digits; rationale documented in the validator.

## 5. Not tested / limitations

- Only Chromium-based browsers (Edge engine) were tested; Firefox and Safari were not available.
- No screen-reader test was performed; semantic HTML, labels, ARIA roles and keyboard operation were implemented and spot-checked only.
- Tablet width (768 px) is covered by CSS breakpoints but was not inspected separately.
- Printing was verified with headless Edge print-to-PDF; a physical printer was not used.
