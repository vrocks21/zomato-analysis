# Website Usage Guide — NCR Restaurant Intelligence

## 1. Opening the site

- **From disk:** double-click `index.html`. Everything works offline (the data are bundled as `data/*.js`).
- **Local server (recommended for printing and for some browsers' file:// restrictions):** in the `WEBSITE` folder run `python serve.py` and open http://127.0.0.1:8010.

The header has two experiences: **For restaurant owners** (default) and **Research explorer**. The status strip reminds you that the benchmarks are historical, not live Zomato data, and that your entries stay in the browser.

## 2. Restaurant Owner mode

### Homepage
"Understand where your restaurant stands." Choose **Benchmark My Restaurant** to start, or **Explore NCR Research**. A labelled *synthetic example* (an invented profile, not a real restaurant) is available from the homepage and the wizard (`#example`).

### Guided diagnostic (four steps, back navigation at any time)

| Step | Fields | Notes |
|---|---|---|
| 1 Restaurant profile | Name (optional, report title only); **City**; **Locality** (searchable; "My locality is not listed" is allowed); **Price tier** (1–4, with the typical NCR cost for two per tier); Cuisines (optional, up to 8; the first is the peer cuisine) | The locality hint shows how many restaurants the historical data hold for it and whether a locality benchmark will be available. |
| 2 Operations | Current rating (0–5; 0 = no published rating), votes (whole number ≥ 0), cost for two (₹), online delivery, table booking, multi-outlet (Yes / No / Not sure) | All optional. Entries are not verified against Zomato. The chain-proxy caution is shown next to multi-outlet. |
| 3 Priorities | Become more visible · Improve perceived quality · Increase engagement · Understand price positioning · Benchmark against my local market | Click in order of importance; the number shows the rank. |
| 4 Review | Summary with Edit links; locality threshold (30 primary, 20 sensitivity, 50 stricter); privacy statement; warnings | **Generate my diagnostic** validates required fields and ranges first. |

Validation: city, locality and price tier are required; ratings must be 0–5; votes non-negative whole numbers; price tier must be one of the four platform tiers. Inconsistent but possible combinations (e.g. a rating with fewer than 4 votes) produce a warning, not a block.

### Diagnostic dashboard (six modules)

1. **Restaurant overview** — your entries; missing items and what they unlock.
2. **Performance snapshot** — each metric against the closest geographic reference with enough data (locality → city → NCR). Diamond = your entry; shaded bars = middle half and middle 80% of the group; line = median. Every card shows its population and n.
3. **Locality and city benchmarks** — availability cards for locality, city, NCR (with reasons when unavailable), then a metric switcher (published rating, rating, votes, cost, price-tier mix, delivery, booking, chain profile, cuisine tags) with an interpretation and the denominator under each chart.
4. **Similar restaurant comparison** — the peer ladder (city · tier · cuisine → city · tier → city · all tiers → NCR · tier) with each group's size and status, the group used, and why narrower groups were not used. Other peer groups are listed for context only.
5. **Opportunity analysis** — where your entries differ from the reference groups (below/above median, within middle half, differs from/similar to most). Comparison findings, not causes.
6. **Personal action plan** — up to five suggestions ordered by your priorities and benchmark gaps. Each shows what was observed, what it means, what you could consider, its evidence class and limitations; "Evidence and limitations" reveals estimates, 95% CIs and p-values. The table-booking note explains why no booking recommendation is made. "How these suggestions were chosen" lists every rule's status.

Inline **?** buttons open short explanations of statistical concepts (odds ratio, p-value, confidence interval, log outcome …). The full **Glossary** page gives each term's meaning, an example from this research and a misreading to avoid.

### Download My Restaurant Diagnostic
Opens a print-ready report (profile, goals, locality/city/NCR benchmarks, peers, gaps, suggestions, evidence classes, sample sizes and denominators, historical caveat, limitations, references). Click **Save as PDF / Print** and choose "Save as PDF" in the browser's print dialog. The report is generated locally; nothing is uploaded.

### Clearing your data
About & privacy → **Clear my data from this browser**, or close the tab.

## 3. Research Explorer mode

The Research Explorer presents the empirical study's results, models, comparisons and limitations. Interpretation panels ("Interpretation", "What this shows") accompany the research evidence:

- **Overview** — the three outcomes, the delivery example, the publication pattern, the central question and answer.
- **Cities** — five city cards, city vs NCR benchmarks with CIs, five-city comparison by metric, price and quadrant mix, within-city model estimates. Ghaziabad (n = 25) is shown but not interpreted.
- **Localities** — threshold (20 / 30 primary / 50), city, search; locality vs city vs NCR benchmarks; rating-vs-engagement scatter; composition; nine separate ranks. Deep links: `#research/localities?t=30&loc=<City | Locality>`.
- **Top vs bottom** — rating extremes, rated-only vote extremes and all-NCR vote extremes (never pooled), adjusted odds ratios, the four quadrants (an imposed median split), rating spread by vote band.
- **Findings** — the three models as forest plots (rated vs all-NCR engagement selectable), price-tier steps, locality fixed effects, direction table, hypotheses with the H1 qualification, table-booking sensitivity.
- **Methodology** — sample construction, outcomes, analyses, limitations, the Stage 1 figures and data provenance.

## 4. What the site cannot do

Show current Zomato performance; verify your entries; know whether your own restaurant is in the historical data (it may or may not be, and cannot be removed); identify your real competitors; or predict the effect of any change.
