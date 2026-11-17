# Recommendation Rules — NCR Restaurant Intelligence

The action plan (dashboard Module 6 and report Section 8) is produced by the deterministic rules below, implemented in `js/engine.js` (function `rules`). There is no AI service, no external call, no composite score and no restaurant grade. A rule fires only when **every** condition is met; when no rule fires, the plan says so and nothing is invented.

## How suggestions are selected and ordered

1. Each rule is evaluated against the owner's entries, the selected goals and the benchmark comparisons produced by the engine (only comparisons whose reference group meets the eligibility rules: locality ≥ selected threshold, peers ≥ 30 restaurants, rating statistics ≥ 20 rated restaurants).
2. If the owner selected goals, only rules linked to at least one selected goal are kept. With no goal selected, every fired rule is kept.
3. Kept rules are ordered by: (a) the owner's rank of the rule's own dimension (a rule that only serves a secondary goal follows); (b) whether a measured benchmark gap supports the rule; (c) evidence class (strong → benchmark → specification-sensitive → general); (d) rule id. This is an ordering, not a score; no number is computed or shown.
4. At most five are shown. The "How these suggestions were chosen" panel lists every rule as shown / not triggered / outside selected goals / beyond the five-suggestion limit.

Every suggestion has five parts: **What we observed**, **What it means**, **What you could consider**, **Evidence class**, **Limitations**. Strong-association rules also show the regression estimates, 95% confidence intervals and p-values under "Evidence and limitations".

## Evidence classes

| Class | Meaning |
|---|---|
| Strong statistical association | A statistically clear association in the research models, holding the other listed characteristics constant. An association in historical data, not a demonstrated effect. |
| Benchmark-based | A descriptive difference between the entered value and the historical reference group. Shows where the restaurant stands, not why. |
| Specification-sensitive | The research result changes with model specification; no firm conclusion is drawn. |
| General business consideration | Practical context following from the research design or findings; not a measured association for the restaurant. |

## Rules

| Rule | Trigger (all conditions) | Fields used | Suggested text (title) | Evidence class | Source finding | Limitations shown |
|---|---|---|---|---|---|---|
| **R1 Rating gap** | Rating entered and > 0 (published); a rating peer group is available (first ladder rung with ≥ 30 restaurants and ≥ 20 rated); rating < peer median. | rating, city, price, cuisine | Review what drives your customers' ratings — review recurring feedback themes; check consistency of food, service and perceived value against what the price tier promises. | Benchmark-based | Peer-group rating quantiles (diagnostic_benchmarks.json); paper §6.2: listing characteristics explain 13.1% of rating variance. | Operational drivers (food, service, value) were not measured by the research; peer group is a reference set, not actual competitors. |
| **R2 Delivery and visibility** | Delivery = "no"; goal "visibility" selected. | delivery, goals | Evaluate whether online delivery suits your restaurant — commercial suitability, kitchen/packaging capacity, delivery costs, customer fit; an access decision, not a route to a higher rating. | Strong statistical association | Model 1 delivery OR 9.99 [8.03, 12.44]; Model 3 +97.5% (geometric mean of 1 + votes; shown if engagement also selected); Model 2 +0.097 rating points; rating-extreme adjusted OR 1.10 (p = .444). Paper Table 5, §7.1. | Observational; reverse causality plausible; listing age unobserved; adopting delivery is not guaranteed to change visibility. |
| **R3 Chain profile** | Multi-outlet = "yes" (self-reported). | multi_outlet | Monitor each outlet's rating separately from its reach — do not read visibility or vote counts as quality; compare each outlet with independent peers in the same locality and tier. | Strong statistical association | Chain proxy: visibility OR 2.31, engagement +34.5% (geometric scale), rating −0.091, top-rated adjusted OR 0.29. Paper Table 5, §7.1. | Proxy = name appearing 5+ times; does not verify ownership; self-reported status may differ; operating more outlets is not shown to cause any difference. |
| **R4 Engagement gap** | Votes entered; vote reference available in the correct population (rated-only if a rating is published; all restaurants otherwise); votes < median. Suppressed when R9 already covers 0–3 votes. | votes, rating status | Investigate how customers discover your listing — listing completeness, photos, menu accuracy, genuine feedback opportunities after visits. | Benchmark-based | Peer vote quantiles (votes_rated or votes_all). | Votes accumulate with time and exposure; listing age unobserved; votes are not satisfaction. |
| **R5 Price positioning** | Owner's tier is held by < 20% of the locality (or city if locality unavailable) **or** cost for two lies outside the peer group's 25th–75th percentile. | price, cost | Review your target segment and value positioning. | Benchmark-based (with research context) | Price mix and cost quantiles; paper Table 6: Tier 1→2 +0.038, Tier 2→3 +0.326 rating points. | No basis for raising or lowering prices; a high rating occurred at every tier. |
| **R6 Table booking** | Never produces a suggestion. Always shown as a note. | — | "About table booking" note. | Specification-sensitive | Visibility OR 1.79 (p = .004); quality −0.040 (p = .107); rated engagement n.s. (p = .170); significant for quality and engagement with log cost (R2) and in the all-NCR engagement model. Paper §6.4, Table 11 row 8. | No managerial recommendation is made about offering table booking. |
| **R7 Cuisine breadth** | Cuisines entered; peer breadth available; number of tags < peer median; goal visibility or engagement selected. | cuisines, goals | Check that your listing reflects your full menu — tags should describe what is served; weigh complexity; no evidence a broader menu raises perceived quality. | Strong statistical association | Per extra tag: visibility OR 1.42, engagement +19.4% (geometric scale), rating +0.022. Paper Table 5. | Tags are platform categories that partly reflect format; adding tags that do not describe the menu would misinform customers. **No claim is made about any individual cuisine.** |
| **R8 Rating needs volume** | Published rating; votes 4–25; goal quality or local selected. | rating, votes | Read a low-volume rating with caution. | Strong statistical association | Rating spread by vote band: 4–10 votes SD 0.16, 0% top-rated; Brown–Forsythe W = 147.4, p < .001. Paper §7.3. | Mechanism not observed; votes accumulate over time. |
| **R9 Visibility threshold** | Goal visibility selected; rating = 0 (not published), or rating not given and votes 0–3. | rating, votes | Build a base of genuine customer ratings — legitimate invitations within platform rules; no incentives or artificial reviews. | Benchmark-based | Observed 0–3 votes ↔ no rating, 4+ ↔ rating (0 exceptions); peer publication share. Paper §4.4. | Pattern consistent with a publication threshold, not confirmed Zomato policy; current rules may differ. |
| **G1 Local benchmarking** | Goal "local" selected; locality benchmark available. | locality, goals | Use your locality as the main reference point. | General business consideration | Adjusted R² city vs locality fixed effects: quality 0.131 → 0.235; engagement 0.314 → 0.468. Paper §8.2. | Locality effects bundle footfall, demographics, rents and mix; 74 of 98 eligible localities are in New Delhi. |

## What the rules never do

- Recommend introducing table booking (R6 is a note only; tested: changing the booking answer never changes the suggestions).
- Recommend raising or lowering prices, or claim that any change will raise a rating, votes or visibility.
- Generate a suggestion merely because a coefficient is significant: every rule needs a profile condition (and, for benchmark rules, a valid measured gap).
- Make claims about individual cuisines, or treat a peer group as the restaurant's real competitors.
- Use the all-restaurant vote benchmark for a restaurant with a published rating, or a rated-only benchmark for one without.
- Lower any eligibility threshold automatically. The 20+ locality threshold is used only when the owner explicitly selects it.

## Testing

`PHASE3_STAGE3/DATA_PIPELINE/test_engine.js` runs 12 synthetic profiles (`synthetic_test_profiles.json`) and checks each rule's trigger and non-trigger conditions, booking invariance, determinism, population selection and evidence wording (497 checks, 0 failed at handoff).
