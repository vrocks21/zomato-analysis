# Website Data Dictionary — NCR Restaurant Intelligence

The website reads only the files in `data/`. All are aggregated; none contains a restaurant-level row, restaurant name, address or Restaurant ID (verified by `DATA_PIPELINE/validate_diagnostic_data.py`).

| File | Produced by | Used by | Content |
|---|---|---|---|
| `diagnostic_benchmarks.json` | `DATA_PIPELINE/build_diagnostic_data.py` | Owner diagnostic | NCR, city, locality and peer-group descriptive benchmarks (Part A) |
| `research_evidence.json` | same | Owner diagnostic (suggestion evidence, technical details) | Model estimates copied from `RESULTS/key_results.json` (Part A §6) |
| `diagnostic_data.js` | same | both files above as `window.NCRI_DATA` / `window.NCRI_EVIDENCE`, so the site opens from disk | — |
| `site.json`, `cities.json`, `localities.json`, `performance_extremes.json`, `research_findings.json`, `methodology.json` | `DATA_PIPELINE/build_research_explorer_data.py` (Stage 2 builder, output folder changed) | Research Explorer | Identical to the approved Stage 2 files (Part B) |
| `site_data.js` | same | the six research files as `window.NCR_DATA` | — |
| `validation_log.json` | same | provenance | 175 Stage 2 pipeline checks |

The owner's profile is never written to any file. It is held in browser memory and in this tab's `sessionStorage` (key `ncri.session.v1`) until cleared or the tab is closed.

---

## Part A — Diagnostic benchmarks
Documents every field produced by `PHASE3_STAGE3/DATA_PIPELINE/build_diagnostic_data.py` and consumed by the NCR Restaurant Intelligence owner diagnostic. All values are **descriptive aggregates** of the historical, undated Zomato listing snapshot. No regression model is estimated; model estimates in `research_evidence.json` are copied from `RESULTS/key_results.json`.

### 1. Inputs and derivation rules (re-used verbatim from Phase 2)

| Input | Use |
|---|---|
| `RAW_DATA/zomato.csv` (Latin-1, 9,551 rows) | Read-only at build time. Never copied to the website. |
| `RAW_DATA/Country-Code.xlsx` | Country lookup (read with the standard-library XLSX reader). |
| `RESULTS/key_results.json` | Sample sizes, eligibility counts, cut-offs, model estimates for validation and evidence. |
| `RESULTS/tables/city_profile.csv`, `locality_profile_all_units.csv` | Reproduction check: the pipeline must reproduce the published profiles exactly. |

Derived variables follow `PHASE2_EXTENDED/zomato_ext.py` (`load_data`, `standardise_locality`):

| Variable | Rule | Source column |
|---|---|---|
| string cleaning | Leading/trailing whitespace trimmed on every text field | all |
| `ncr` | City ∈ {New Delhi, Gurgaon, Noida, Faridabad, Ghaziabad} and Country = India | City, Country Code |
| `is_rated` (visibility) | 1 if Aggregate rating > 0. A 0 means *no published rating*, never zero quality | Aggregate rating |
| `rating` | Aggregate rating; used **only** for rated restaurants | Aggregate rating |
| `votes` | Raw vote count (engagement proxy, not satisfaction) | Votes |
| `delivery`, `booking` | 1 if the field equals "Yes" | Has Online delivery, Has Table booking |
| `price` | Platform price range 1–4 (categorical) | Price range |
| `cost` | Average cost for two, INR (all NCR rows > 0; no imputation) | Average Cost for two |
| `n_cuisines` | Number of comma-separated tags (0 if empty; no NCR row is empty) | Cuisines |
| `tags` | Tags split on commas and trimmed. 86 distinct NCR tags; no case, spelling or similarity merging (a case/punctuation-insensitive check found no variants). A restaurant belongs to every tag it lists, so cuisine groups overlap. | Cuisines |
| `is_chain` | 1 if the trimmed Restaurant Name appears 5+ times in the full file (112 names; 16.5% of NCR). Operational proxy, **not ownership**. | Restaurant Name (used only to derive the flag; never exported) |
| locality unit | `City + " | " + Locality`, with whitespace-only standardisation; 496 NCR units | City, Locality |
| breadth bucket | `1`, `2`, `3`, `4+` (4–8 tags pooled, a transparent Stage 3 grouping for peer comparison) | n_cuisines |

Cut-offs (from `key_results.json.cuts`): top-rated ≥ 3.9, bottom-rated ≤ 2.7 (NCR rated P90/P10); high engagement ≥ 234 votes (all-NCR P90); high engagement among rated ≥ 321 votes (rated P90).

### 2. Eligibility and suppression

| Object | Metrics exported when | Otherwise |
|---|---|---|
| NCR, cities | always (Ghaziabad flagged `small_sample`; the engine treats its 25 restaurants as below the 30 minimum and never uses it for gaps) | — |
| Locality units | n ≥ 20 (lowest sensitivity threshold); flags `eligible.20/30/50`; the site uses 30 by default | count-only entry in `locality_index` |
| Peer groups | n ≥ 30 restaurants | `available: false`, counts only, `unavailable_reason` |
| Rating statistics and rated-only vote statistics (any object) | n_rated ≥ 20 | omitted; `rating_available: false`, `rating_unavailable_reason` |

Thresholds are never lowered automatically. Missing values are never replaced by zero; unsupported metrics are absent and explained.

### 3. `diagnostic_benchmarks.json`

| Key | Type | Description |
|---|---|---|
| `meta` | object | Name, status (historical, not live), generator, timestamp, input MD5s, flags `restaurant_level_rows_exported: false`, `models_estimated: false`, `rules` (thresholds, cut-offs, quantile method, CI method, cuisine normalisation), `price_tiers`. |
| `ncr` | profile | All 7,947 NCR restaurants. |
| `cities[]` | profile + `id`, `name`, `share_of_ncr_pct`, `small_sample`, `small_sample_note` | Five cities. |
| `locality_index[]` | `id`, `city`, `locality`, `n_restaurants`, `n_rated`, `eligible{20,30,50}` | All 496 units (counts only). |
| `localities[]` | profile + `id`, `city`, `locality`, `label`, `eligible`, `compound_label` | 136 units with n ≥ 20. |
| `cuisines[]` | `tag`, `n_ncr` | 86 tags with NCR restaurant counts (overlapping). |
| `peer_groups.<block>` | `definition`, `min_n` (30), `min_rated` (20), `groups{key: profile + key[]}` | See §5. |

### Profile object

| Field | Population / denominator | Transformation |
|---|---|---|
| `n_restaurants`, `n_rated`, `n_unrated` | group | counts |
| `available`, `unavailable_reason` | — | eligibility (§2) |
| `rating_available`, `rating_unavailable_reason` | — | n_rated ≥ 20 |
| `metrics.pub_rate_pct` {value, k, n, lo, hi} | all restaurants (n) | 100·k/n; Wilson 95% CI |
| `metrics.delivery_pct`, `booking_pct`, `chain_pct` | all restaurants | share + Wilson CI |
| `metrics.price_mix_pct.tier1..4`, `price34_pct` | all restaurants | shares |
| `metrics.cost_for_two` {p10, p25, median, p75, p90, mean, n} | all restaurants | quantiles (type 7 linear interpolation), mean |
| `metrics.n_cuisines` (quantiles), `breadth_mix_pct` {1,2,3,4+} | all restaurants | quantiles; shares |
| `metrics.votes_all` (quantiles) | **all restaurants, including unrated (0–3 votes)** | raw votes |
| `metrics.zero_vote_share_pct` | all restaurants | share |
| `metrics.high_engagement_share_pct` | all restaurants | share with votes ≥ 234, Wilson CI |
| `metrics.rating` (quantiles) | **rated restaurants only** (n_rated) | displayed rating |
| `metrics.rating_bands_pct` | rated | shares of Zomato display bands |
| `metrics.top_rated_share_pct` / `bottom_rated_share_pct` | rated | rating ≥ 3.9 (Wilson CI) / ≤ 2.7 |
| `metrics.votes_rated` (quantiles) | **rated restaurants only** | raw votes |
| `metrics.high_engagement_rated_share_pct` | rated | votes ≥ 321 |

`votes_all` and `votes_rated` are separate objects with separate denominators and are never mixed. The site uses `votes_rated` for an owner with a published rating and `votes_all` otherwise, and labels the population every time.

### 4. Group identifiers

Keys join the key parts with `|`: e.g. `city_price_cuisine["New Delhi|3|Italian"]`, `locality_price["New Delhi | Hauz Khas|3"]` (the locality id itself contains ` | `), `city_price_delivery["Noida|2|1"]` (1 = delivery offered).

### 5. Peer-group blocks

| Block | Definition | Groups | With metrics (n ≥ 30) | With rating stats |
|---|---|---|---|---|
| `ncr_price` | NCR × price tier | 4 | 4 | 4 |
| `city_price` | City × price tier | 19 | 13 | 13 |
| `locality_price` | City + Locality × price tier | 1,072 | 55 | 40 |
| `city_cuisine` | City × cuisine tag (membership) | 245 | 71 | 69 |
| `ncr_cuisine` | NCR × cuisine tag | 86 | 32 | 32 |
| `ncr_price_cuisine` | Price tier × cuisine tag | 236 | 65 | 65 |
| `city_price_cuisine` | City × price × cuisine tag | 563 | 93 | 92 |
| `city_breadth` | City × breadth bucket (1, 2, 3, 4+) | 20 | 15 | 15 |
| `city_price_delivery` | City × price × delivery (descriptive service profile) | 37 | 22 | 22 |
| `ncr_price_delivery` | Price × delivery | 8 | 8 | 8 |

Peer ladder used by the engine (first rung with ≥ 30 restaurants is used; rating comparisons use the first rung that also has ≥ 20 rated): (1) city × price × first-selected cuisine → (2) city × price → (3) city, all tiers (broader price comparison; city must have ≥ 30) → (4) NCR × price. Supplementary groups (shown, never substituted): locality × price, NCR × price × cuisine, city × cuisine.

Cuisine groups are descriptive membership groups. They do not imply that a cuisine causes higher or lower ratings, and no cuisine-level claim is made in the suggestions.

### 6. `research_evidence.json` (copied, not estimated)

| Key | Content | Source |
|---|---|---|
| `models.vis/qual/eng/eng_all.<term>` | `label`, `estimate`, `lo`, `hi`, `p`, `unit`, `sd_units` (quality: b / 0.466; engagement: b / 1.407) for delivery, booking, chain, cuisine breadth, price tiers 2–4. Visibility = odds ratio; quality = rating points; engagement = 100·(exp(b) − 1), % difference in the geometric mean of (1 + votes) | `key_results.json.models` |
| `fit`, `sd` | pseudo-R² 0.219, adj. R² 0.131 / 0.314 / 0.406; outcome SDs | `key_results.json.models.fit/sd` |
| `price_contrasts` | Adjacent tier steps (quality, engagement) | `key_results.json.price_contrasts` |
| `extremes_adjusted_rating`, `extremes_adjusted_votes_rated` | Adjusted ORs of top-group membership | `key_results.json.deciles.adj` |
| `r2_booking` | Booking under log cost for two | `key_results.json.robustness.r2_booking` |
| `cuts`, `rating_spread`, `samples` | Cut-offs, rating spread by vote band, sample sizes | `key_results.json` |

### 7. Validation

- `build_diagnostic_data.py`: 4,043 build checks (sample sizes, eligibility counts, exact reproduction of 13 city metrics × 5 cities and ≥ 900 locality metric values against the published Stage 1 profiles, paper spot checks, suppression and privacy) — 0 failed.
- `validate_diagnostic_data.py`: 15,171 checks (schema, denominators, eligibility, identifiers, population separation, privacy scan, no external requests, Stage 2 research data identity, engine tests) — 0 failed.

---

## Part B — Research Explorer data (Stage 2 dictionary, reproduced unchanged)

The research-explorer files are regenerated by the Stage 2 builder and are byte-for-byte equivalent in content to `PHASE3_STAGE2/WEBSITE/data/` (checked by `validate_diagnostic_data.py`). Their dictionary from Stage 2 follows.

### Website Data Dictionary

All files in `data/` are generated by `build_website_data.py` and must not be edited by hand. The pipeline uses the Python standard library only and reads **aggregated, verified results**. It does not read the restaurant-level CSV and estimates no model. `data/site_data.js` contains the same six objects as `window.NCR_DATA = { site, cities, localities, performance_extremes, research_findings, methodology }`.

**General conventions**
- Numbers are rounded to 4 decimals in JSON (3 for effects, 1–2 for some percentages) and formatted for display in the browser.
- Percentages are on a 0–100 scale.
- `null` always comes with an `unavailable_reason`; missing values are never written as 0.
- City + Locality identifier: `"<City> | <Locality>"` (field `id` / `loc_id`). 28 locality names repeat across NCR cities.
- Populations: **All NCR** = 7,947 restaurants in New Delhi, Gurgaon, Noida, Faridabad and Ghaziabad. **Rated NCR** = 5,808 with a published rating (rating > 0, equivalently 4+ votes).

### 1. Input files and provenance

| Input | Used for | Notes |
|---|---|---|
| `RESULTS/key_results.json` | Sample sizes, eligibility, model estimates, price contrasts, deciles, adjusted logits, overlap, rating spread, city tests and interactions, locality fixed effects and correlations, quadrant sizes | Stage 1 frozen source of record |
| `RESULTS/tables/city_profile.csv` | City metrics (same values as `Updated_Results.xlsx`, sheet City_Analysis) | |
| `RESULTS/tables/locality_profile_t20.csv`, `_t30.csv`, `_t50.csv` | Locality metrics at the three thresholds (sheets Locality_t20, Locality_Analysis, Locality_t50) | Values for a unit are identical across thresholds (verified) |
| `RESULTS/tables/locality_rankings_t30_full.csv` | Nine rankings at the primary threshold (sheet Locality_Rankings) | |
| `RESULTS/tables/locality_rating_engagement_patterns.csv` | Pattern label per unit (primary threshold) | |
| `RESULTS/tables/quadrants_by_city.csv`, `quadrants_by_locality_t30.csv` | Quadrant mix | |
| `RESULTS/tables/city_specific_models.csv` | Within-city model estimates | Its unit label "% change in votes" is **relabelled** "% difference in the geometric mean of (1 + Votes)", following the Stage 1 correction; values unchanged |
| `RESULTS/tables/rating_spread_by_vote_band.csv` | Rating spread by vote band | |
| `RESULTS/tables/integrated_direction_table.csv` | Direction table (paper Table 10 plus all-NCR columns) | Used instead of `key_results.json → integration.pillars`, whose minus signs are mis-encoded |
| `PHASE2_EXISTING/Phase2_Results.xlsx` | T3_descriptives (NCR median rating 3.3, NCR median votes among rated 40, cross-checks), T7_cross_model (SD-standardised estimates), T9_segment_profile (quadrant profiles) | Read with a minimal standard-library xlsx reader |

`site.json → provenance` records the MD5 checksum of every input at build time and states `raw_data_used: false` and `models_estimated: false`.

### 2. `site.json`

| Field | Meaning | Source |
|---|---|---|
| `name`, `tagline`, `project`, `team`, `institution`, `status` | Identity text | Brief; final paper title page |
| `headline_stats[]` | `{id, value, label, source}` for 7,947 / 5,808 / 2,139 / 5 cities / 98 localities | `key_results.json` samples, eligibility.30 |
| `dimensions[]` | The three outcomes with question, measure, population | Paper §4.4, §5.1 |
| `central_question`, `answer` | Central research question and the paper's one-word answer ("Partly") | Paper §3, §12 |
| `metric_catalogue{}` | Definition of each benchmark metric (§3 below) | Pipeline |
| `engagement_note` | The exact geometric-scale sentence | Paper §5.1, brief |
| `provenance` | Generator, timestamp, input checksums | Pipeline |

### 3. Metric catalogue (`site.json → metric_catalogue`)

Each entry has `id`, `label`, `dimension`, `unit`, `population`, `denominator` (`n_restaurants` or `n_rated`), `ci_columns`, `ci_method`, `requires_min_rated`, `source_column`, `transformation` and `explanation`.

| id | Label | Dimension | Unit | Population / denominator | Interval | Transformation |
|---|---|---|---|---|---|---|
| `pub_rate_pct` | Rating publication rate | visibility | % of restaurants | all restaurants / n_restaurants | Wilson 95% | none |
| `median_rating` | Median rating | quality | rating points | rated / n_rated | bootstrap 95% | none; requires ≥ 20 rated |
| `mean_rating` | Mean rating | quality | rating points | rated / n_rated | none | none; requires ≥ 20 rated |
| `top_rated_share_pct` | Top-rated share (rating ≥ 3.9) | quality | % of rated | rated / n_rated | Wilson 95% | none; requires ≥ 20 rated |
| `bottom_rated_share_pct` | Bottom-rated share (rating ≤ 2.7) | quality | % of rated | rated / n_rated | none | none; requires ≥ 20 rated |
| `median_votes` | Median votes (all restaurants) | engagement | votes | all / n_restaurants | bootstrap 95% | none |
| `median_votes_rated` | Median votes (rated) | engagement | votes | rated / n_rated | none | none |
| `high_engagement_share_pct` | High-engagement share (votes ≥ 234) | engagement | % of restaurants | all / n_restaurants | Wilson 95% | none |
| `zero_vote_share_pct` | Zero-vote share | engagement | % of restaurants | all / n_restaurants | none | none |
| `delivery_pct` | Online delivery offered | positioning | % | all / n_restaurants | Wilson 95% | none |
| `booking_pct` | Table booking offered | positioning | % | all / n_restaurants | Wilson 95% | none |
| `chain_pct` | Chain outlets (5+ outlets) | positioning | % | all / n_restaurants | Wilson 95% | none |
| `price34_pct` | Price tiers 3–4 | positioning | % | all / n_restaurants | none | `price3_pct + price4_pct` |
| `median_cost_for_two` | Median cost for two | positioning | INR | all / n_restaurants | none | none |

The 3.9 / 2.7 / 234 cut-offs are the NCR-wide P90/P10 thresholds from the paper (§5.2), applied within each unit.

### 4. `cities.json`

| Field | Meaning |
|---|---|
| `ncr.n_restaurants`, `ncr.n_rated` | 7,947 and 5,808 |
| `ncr.metrics{id}` | NCR benchmark per metric: `{value, derivation}` or `{value: null, unavailable_reason}` |
| `cities[]` | One record per city (5) |
| `cities[].n_restaurants / n_rated / n_unrated / share_of_ncr_pct` | Counts from `city_profile.csv`, checked against `key_results.json` |
| `cities[].small_sample`, `small_sample_note` | `true` for Ghaziabad (25 restaurants); note for Faridabad's imprecise city models |
| `cities[].eligible_localities{"20","30","50"}` | Units meeting each threshold |
| `cities[].metrics{id}` | `{value, lo, hi}` per catalogue metric |
| `cities[].price_mix_pct`, `rating_bands_pct` | Price tier shares; rating band shares among rated |
| `cities[].quadrant_mix_pct`, `quadrant_n_rated` | Quadrant shares among rated restaurants |
| `cities[].within_city_models[]` | `{outcome, predictor, estimate, lo, hi, p, sig, unit, n}`; empty for Ghaziabad |
| `tests[]`, `interaction_tests[]` | Five-city tests with effect sizes; predictor × city Wald tests (BH-adjusted) |

**How the NCR benchmark is derived (transformation).** Exact NCR values are rebuilt from the five published city rows. Counts are summed (`n_top_rated`, `n_bottom_rated`, `n_top_vote`, `n_bottom_vote`); city percentages are converted back to counts (`round(pct × n / 100)`), summed and divided by 7,947; and the mean rating is the n_rated-weighted mean of city means. Each rebuilt value is cross-checked against an independent source: 679 / 727 / 798 / 1,093 group sizes from `key_results.json`, and publication 73.1%, delivery 29.2%, booking 13.2%, chain 16.5% and mean rating 3.280 from Phase2_Results.xlsx T3. Medians cannot be rebuilt from city medians, so the NCR median rating (3.3) and NCR median votes among rated (40) come from T3. NCR median votes (all restaurants) and NCR median cost for two are **not available** in the verified results and are shown as "Not available".

### 5. `localities.json`

| Field | Meaning |
|---|---|
| `identifier` | Explanation of the City + Locality key |
| `primary_threshold`, `thresholds` | 30; [20, 30, 50] |
| `eligibility{"20","30","50"}` | Copied from `key_results.json`: totals, covered restaurants, % of NCR, eligible units per city |
| `min_rated_for_rating_statistics` | 20 |
| `pattern_medians_t30`, `pattern_counts_t30` | Median-locality reference (rating 3.2, votes 19) and pattern counts (29 / 37 / 12 / 4) |
| `correlations_t30{}` | Spearman correlations across localities (for example median rating ~ median votes ρ = 0.79, n = 82) |
| `localities[]` | 136 records, every unit eligible at ≥ 20 restaurants |
| `localities[].id, city, locality, label, compound_label` | Identifier and labels (`compound_label` marks source labels naming a mall or complex inside a locality) |
| `localities[].eligible{"20","30","50"}` | Whether the unit meets each threshold (98 at 30; 47 at 50) |
| `localities[].n_restaurants, n_rated, n_unrated` | Counts |
| `localities[].rating_statistics_available` | `n_rated ≥ 20` (82 of 98 at the primary threshold) |
| `localities[].metrics{id}` | `{value, lo, hi}`, or `{value: null, unavailable_reason}` for rating metrics when fewer than 20 rated |
| `localities[].price_mix_pct` | Tier 1–4 shares |
| `localities[].rankings_t30{ranking}` | `{rank, of, value, tied_units}` for each of nine rankings; `null` below the primary threshold |
| `localities[].pattern_t30`, `quadrant_mix_pct_t30` | Pattern label and quadrant shares (primary threshold, ≥ 20 rated only) |

### 6. `performance_extremes.json`

| Field | Meaning |
|---|---|
| `comparisons[]` | Three comparisons: `rating` (rated NCR), `votes_rated` (rated NCR), `votes_all` (all NCR). Each has `population`, `n_population`, cut-off rules, `n_top`, `n_bottom`, `price34`, `binary[]` (delivery, booking, chain: top %, bottom %, effect size, BH-adjusted p), `medians[]` (cost, cuisines), `adjusted_or[]` (`null` for `votes_all`, where the paper reports near-separation) and `takeaway` |
| `quadrants` | Definition (median split: rating 3.3, votes 40, strict `>`), caveat (imposed framework; k-means prefers k = 2), segment sizes and profiles from T9, by-city shares, city and locality association tests |
| `rating_spread` | Vote band, n, mean and SD of rating, % top-rated and % bottom-rated; Brown–Forsythe W |
| `overlap` | Top-vote / top-rated overlap, Jaccard, Spearman rating ~ votes among rated |

### 7. `research_findings.json`

| Field | Meaning |
|---|---|
| `engagement_note` | Exact geometric-scale interpretation sentence |
| `models[]` | Visibility (OR), quality (rating points) and engagement (% difference in the geometric mean of 1 + Votes; `log_coef` holds b). Each row has `term, estimate, lo, hi, p, significant, is_city_effect` and, for OLS, `sd_units` (b ÷ outcome SD: rating SD 0.466, log-votes SD 1.407) |
| `engagement_all_ncr` | Model 3b (all NCR) with its caution; never pooled with Model 3 |
| `price_contrasts[]` | Tier 1 to Tier 2, Tier 2 to Tier 3, Tier 3 to Tier 4 steps for quality and engagement |
| `cross_model` | Rank correlations (0.82–0.93), sign agreement (5 of 7), T7 standardised rows, direction table |
| `locality_fixed_effects[]` | Adjusted R² with city vs locality fixed effects for four outcomes |
| `hypotheses[]` | H1–H4 verdicts; H1 states the Phase 1 threshold was marginally crossed (0.208 SD) and the Phase 2 comparative statement is supported |
| `table_booking` | Baseline vs R2 vs all-NCR results and "No managerial recommendation" |
| `chain_thresholds[]` | Chain estimates at 3, 5, 8 and 10 outlets |

**Transformation.** `engagement_pct = 100 × (exp(b) − 1)` is taken from `key_results.json`, where it was computed in Phase 2. The pipeline re-checks it against `b` for every term (rounding tolerance 1e-6).

### 8. `methodology.json`

`dataset`, `funnel[]` (9,551 → 8,652 → 7,947 → 5,808 / 2,139), `threshold_pattern` (0–3 votes unrated, 4+ rated, 0 exceptions; not confirmed policy), `outcomes[]`, `specification`, `analyses[]`, `figures[]` (the two Stage 1 figures copied to `assets/`) and `limitations[]` (11 items).

### 9. `validation_log.json`

The 175 checks run at build time, each `{check, pass, detail}`. They include sample sizes, city totals, unique identifiers, threshold membership, restaurants covered, the rankable-unit rule, NCR cross-checks, hypothesis statistics, the engagement transformation, NaN/Inf screening and null-with-reason screening.
