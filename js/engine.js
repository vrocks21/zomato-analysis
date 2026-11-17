/* NCR Restaurant Intelligence: benchmark and recommendation engine.
   Pure, deterministic functions with no DOM access, so the same code runs in the browser and in the
   Node test harness (PHASE3_STAGE3/DATA_PIPELINE/test_engine.js).

   Inputs: an owner profile (entered locally, never uploaded), the aggregated benchmarks
   (data/diagnostic_benchmarks.json) and the copied research estimates (data/research_evidence.json).
   Nothing here estimates a model, computes a composite score or labels a restaurant good or bad.
   Every comparison names its population, denominator and eligibility rule. Every suggestion is produced
   by a documented rule (WEBSITE/Recommendation_Rules.md) whose conditions must all be met. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NCRIEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VERSION = "3.0.0";
  const CITIES = ["New Delhi", "Gurgaon", "Noida", "Faridabad", "Ghaziabad"];
  const THRESHOLDS = [20, 30, 50];
  const PRIMARY_T = 30;
  const MIN_PEER_N = 30;
  const MIN_RATED = 20;
  const MINORITY_TIER_PCT = 20;          // price tier held by < 20% of the reference group = "less common"
  const LOW_VOLUME_MAX = 25;             // rating-volume context applies to 4-25 votes (two lowest research bands)
  const GOALS = {
    visibility: { label: "Become more visible", short: "Visibility", dim: "visibility" },
    quality: { label: "Improve perceived quality (rating)", short: "Perceived quality", dim: "quality" },
    engagement: { label: "Increase customer engagement", short: "Engagement", dim: "engagement" },
    positioning: { label: "Understand my price positioning", short: "Price positioning", dim: "positioning" },
    local: { label: "Benchmark against my local market", short: "Local benchmarking", dim: "local" },
  };
  const EVIDENCE = {
    strong: { label: "Strong statistical association", order: 1,
      text: "A statistically clear association in the research models, holding the other listed characteristics constant. It is an association in historical data, not a demonstrated effect." },
    benchmark: { label: "Benchmark-based", order: 2,
      text: "A descriptive difference between your entered value and the historical reference group. It shows where you stand, not why." },
    sensitive: { label: "Specification-sensitive", order: 3,
      text: "The research result changes with how the model is specified, so no firm conclusion is drawn." },
    general: { label: "General business consideration", order: 4,
      text: "Practical context that follows from the research design or findings; not a measured association for your restaurant." },
  };
  const ENTRY_CAVEAT = "The underlying historical dataset may or may not contain the restaurant entered by the user. The tool cannot reliably identify and remove a matching record. Comparisons are therefore reference benchmarks, not guaranteed independent competitor comparisons.";
  const HISTORICAL_CAVEAT = "All benchmarks come from a single, undated historical Zomato listing snapshot of Delhi NCR (7,947 restaurants). They are research references, not current Zomato performance, and your entries are not verified against live Zomato data.";
  const CHAIN_CAVEAT = "The research chain measure is an operational proxy: a restaurant name that appears 5 or more times in the snapshot. It does not verify ownership. Your self-reported multi-outlet status is not necessarily the same thing.";

  // ------------------------------------------------------------------ formatting
  const nf = (v, d) => (v == null || isNaN(v) ? "n/a" : Number(v).toLocaleString("en-IN", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }));
  const F = {
    int: (v) => nf(v, 0),
    rating: (v) => (v == null ? "n/a" : Number(v).toFixed(1)),
    rating2: (v) => (v == null ? "n/a" : Number(v).toFixed(2)),
    votes: (v) => (v == null ? "n/a" : Number.isInteger(+v) ? nf(v, 0) : Number(v).toFixed(1)),
    pct: (v, d) => (v == null ? "n/a" : Number(v).toFixed(d == null ? 0 : d) + "%"),
    inr: (v) => (v == null ? "n/a" : "₹" + nf(v, 0)),
    p: (p) => (p == null ? "" : p < 0.001 ? "p < .001" : "p = " + Number(p).toFixed(3).replace(/^0/, "")),
    signed: (v, d) => (v == null ? "n/a" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d == null ? 3 : d)),
    signedPct: (v, d) => (v == null ? "n/a" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d == null ? 1 : d) + "%"),
    tier: (t) => "Tier " + t,
  };

  // ------------------------------------------------------------------ lookups
  function index(D) {
    if (D.__ix) return D.__ix;
    const ix = {
      city: Object.fromEntries(D.cities.map((c) => [c.id, c])),
      loc: Object.fromEntries(D.localities.map((l) => [l.id, l])),
      locIndex: Object.fromEntries(D.locality_index.map((l) => [l.id, l])),
      cuisines: new Set(D.cuisines.map((c) => c.tag)),
    };
    Object.defineProperty(D, "__ix", { value: ix, enumerable: false });
    return ix;
  }
  const group = (D, block, key) => (D.peer_groups[block] && D.peer_groups[block].groups[key]) || null;

  // ------------------------------------------------------------------ validation
  const toNum = (v) => (v === "" || v == null ? null : Number(v));
  function normaliseProfile(raw) {
    const p = Object.assign({}, raw);
    p.name = (p.name || "").trim().slice(0, 80);
    p.rating = toNum(p.rating);
    p.votes = toNum(p.votes);
    p.cost = toNum(p.cost);
    p.price = toNum(p.price);
    p.threshold = THRESHOLDS.includes(+p.threshold) ? +p.threshold : PRIMARY_T;
    p.cuisines = Array.isArray(p.cuisines) ? p.cuisines.filter((c, i, a) => c && a.indexOf(c) === i).slice(0, 8) : [];
    p.goals = Array.isArray(p.goals) ? p.goals.filter((g, i, a) => GOALS[g] && a.indexOf(g) === i) : [];
    ["delivery", "booking", "multi_outlet"].forEach((k) => { if (!["yes", "no"].includes(p[k])) p[k] = null; });
    return p;
  }

  function validateProfile(raw, D) {
    const ix = index(D);
    const p = normaliseProfile(raw);
    const errors = {}, warnings = [];
    if (!p.city || !ix.city[p.city]) errors.city = "Select one of the five Delhi NCR cities.";
    if (!p.locality_id) errors.locality_id = "Select your locality, or choose “My locality is not listed”.";
    else if (p.locality_id !== "__none__") {
      const u = ix.locIndex[p.locality_id];
      if (!u) errors.locality_id = "This locality is not in the list for the selected city.";
      else if (u.city !== p.city) errors.locality_id = "This locality belongs to " + u.city + ", not " + p.city + ".";
    }
    if (![1, 2, 3, 4].includes(p.price)) errors.price = "Select a platform price tier from 1 to 4.";
    if (p.rating != null && (isNaN(p.rating) || p.rating < 0 || p.rating > 5)) errors.rating = "Enter a rating between 0 and 5, or leave it blank.";
    if (p.votes != null && (isNaN(p.votes) || p.votes < 0 || !Number.isInteger(p.votes))) errors.votes = "Enter votes as a whole number of 0 or more, or leave it blank.";
    if (p.cost != null && (isNaN(p.cost) || p.cost <= 0 || p.cost > 100000)) errors.cost = "Enter the average cost for two in rupees (a positive number), or leave it blank.";
    const bad = p.cuisines.filter((c) => !ix.cuisines.has(c));
    if (bad.length) errors.cuisines = "Unknown cuisine tag: " + bad.join(", ") + ".";
    if (!Object.keys(errors).length) {
      if (p.rating != null && p.rating > 0 && p.votes != null && p.votes < 4)
        warnings.push("You entered a published rating with fewer than 4 votes. In the historical data, no listing with 0–3 votes showed a rating. The tool will still use your values; please check them.");
      if (p.rating === 0 && p.votes != null && p.votes >= 4)
        warnings.push("You entered a rating of 0 with 4 or more votes. In the historical data, every listing with 4 or more votes showed a rating above 0. A 0 is treated here as “no published rating”.");
      if (p.rating != null && p.rating > 0 && p.rating < 1)
        warnings.push("Ratings below 1.0 did not occur among rated Delhi NCR restaurants in the historical data (range 1.8–4.9). Please check the value.");
    }
    return { ok: !Object.keys(errors).length, errors, warnings, profile: p };
  }

  // ------------------------------------------------------------------ positions
  const BANDS = [
    { id: "below_p10", label: "Lower than about 90% of the group", short: "Below 10th percentile" },
    { id: "p10_p25", label: "In the lower quarter of the group", short: "10th–25th percentile" },
    { id: "p25_median", label: "Below the middle of the group", short: "25th–50th percentile" },
    { id: "at_median", label: "At the group median", short: "At the median" },
    { id: "median_p75", label: "Above the middle of the group", short: "50th–75th percentile" },
    { id: "p75_p90", label: "In the upper quarter of the group", short: "75th–90th percentile" },
    { id: "above_p90", label: "Higher than about 90% of the group", short: "Above 90th percentile" },
  ];
  function position(v, q) {
    if (v == null || !q) return null;
    let id;
    if (v < q.p10) id = "below_p10";
    else if (v < q.p25) id = "p10_p25";
    else if (v < q.median) id = "p25_median";
    else if (v === q.median) id = "at_median";
    else if (v <= q.p75) id = "median_p75";
    else if (v <= q.p90) id = "p75_p90";
    else id = "above_p90";
    const b = BANDS.find((x) => x.id === id);
    return { id, label: b.label, short: b.short, vs_median: v < q.median ? "below" : v > q.median ? "above" : "at",
      in_middle_half: v >= q.p25 && v <= q.p75 };
  }

  // ------------------------------------------------------------------ owner-derived status
  function derive(p) {
    const status = p.rating == null ? "unknown" : p.rating > 0 ? "published" : "not_published";
    const statusLabel = { published: "Published rating", not_published: "No published rating (0 entered)", unknown: "Not provided" }[status];
    // Engagement population: rated-only for a published rating; all restaurants otherwise (explained).
    const engPop = status === "published" ? "rated" : "all";
    const engPopText = status === "published"
      ? "Because you have a published rating, your votes are compared with rated restaurants only (the research's primary engagement population)."
      : status === "not_published"
        ? "Because you do not have a published rating, your votes are compared with all restaurants in the group, including those without a published rating (the all-restaurant population)."
        : "Because your rating status was not provided, your votes are compared with all restaurants in the group, including those without a published rating (the all-restaurant population).";
    return { rating_status: status, rating_status_label: statusLabel, engagement_population: engPop, engagement_population_text: engPopText,
      n_cuisines: p.cuisines.length || null, primary_cuisine: p.cuisines[0] || null };
  }

  // ------------------------------------------------------------------ one reference group -> comparisons
  function popLabel(kind) {
    return kind === "rated" ? "rated restaurants (published rating)" : "all restaurants (with and without a published rating)";
  }
  function compare(p, dv, ref) {
    // ref: { available, rating_available, metrics, n_restaurants, n_rated, ... }
    const out = [];
    if (!ref || !ref.available) return out;
    const m = ref.metrics, N = ref.n_restaurants, NR = ref.n_rated;
    const ratingNA = ref.rating_unavailable_reason || "Rating statistics are not available for this group.";
    // 1 visibility
    out.push({ metric: "visibility", dimension: "visibility", label: "Share with a published rating",
      owner: dv.rating_status === "unknown" ? null : dv.rating_status === "published" ? "Yes" : "No",
      owner_display: dv.rating_status === "unknown" ? "Not provided" : dv.rating_status === "published" ? "Published" : "Not published",
      ref_value: m.pub_rate_pct.value, ref_display: F.pct(m.pub_rate_pct.value, 1), ref_stat: "share of restaurants",
      ci: [m.pub_rate_pct.lo, m.pub_rate_pct.hi], population: "all restaurants", denominator: N,
      differs: dv.rating_status === "not_published" && m.pub_rate_pct.value >= 50,
      plain: `${F.pct(m.pub_rate_pct.value)} of the ${F.int(N)} restaurants in this group had a published rating.`,
      note: "In the historical data, a rating was shown only for listings with 4 or more votes. This pattern is consistent with a publication threshold but is not confirmed Zomato policy. A 0 means “no published rating”, not zero quality." });
    // 2 rating
    if (ref.rating_available) {
      const q = m.rating, pos = dv.rating_status === "published" ? position(p.rating, q) : null;
      out.push({ metric: "rating", dimension: "quality", label: "Rating (perceived quality)", owner: dv.rating_status === "published" ? p.rating : null,
        owner_display: dv.rating_status === "published" ? F.rating(p.rating) : dv.rating_status === "not_published" ? "No published rating" : "Not provided",
        ref_value: q.median, ref_display: F.rating(q.median), ref_stat: "median rating", dist: q, scale: "rating", position: pos,
        gap: pos ? pos.vs_median : null, population: "rated restaurants", denominator: NR,
        extra: { top_rated: m.top_rated_share_pct.value, bottom_rated: m.bottom_rated_share_pct.value },
        plain: `The middle rating among the ${F.int(NR)} rated restaurants was ${F.rating(q.median)}; half were between ${F.rating(q.p25)} and ${F.rating(q.p75)}.` +
          (pos ? ` Your ${F.rating(p.rating)} is ${pos.label.toLowerCase()}.` : ""),
        note: "Ratings are compared only among restaurants with a published rating. Restaurants without one are never counted as 0." });
    } else {
      out.push({ metric: "rating", dimension: "quality", label: "Rating (perceived quality)", unavailable: true, reason: ratingNA, population: "rated restaurants", denominator: NR });
    }
    // 3 votes (population follows rating status)
    const vKey = dv.engagement_population === "rated" ? "votes_rated" : "votes_all";
    if (vKey === "votes_rated" && !ref.rating_available) {
      out.push({ metric: "votes", dimension: "engagement", label: "Votes (engagement)", unavailable: true, reason: ratingNA + " Rated-only vote statistics follow the same rule.",
        population: popLabel("rated"), denominator: NR });
    } else {
      const q = m[vKey], pos = p.votes != null ? position(p.votes, q) : null;
      const n = vKey === "votes_rated" ? NR : N;
      out.push({ metric: "votes", dimension: "engagement", label: "Votes (engagement)", owner: p.votes, owner_display: p.votes == null ? "Not provided" : F.int(p.votes),
        ref_value: q.median, ref_display: F.votes(q.median), ref_stat: "median votes", dist: q, scale: "votes", position: pos, gap: pos ? pos.vs_median : null,
        population: popLabel(dv.engagement_population), population_kind: dv.engagement_population, denominator: n,
        extra: vKey === "votes_all" ? { zero_vote: m.zero_vote_share_pct.value, high: m.high_engagement_share_pct.value, high_cut: 234 }
          : { high: m.high_engagement_rated_share_pct.value, high_cut: 321 },
        plain: `The middle vote count among the ${F.int(n)} ${popLabel(dv.engagement_population)} was ${F.votes(q.median)}; half had between ${F.votes(q.p25)} and ${F.votes(q.p75)}.` +
          (pos ? ` Your ${F.int(p.votes)} votes are ${pos.label.toLowerCase()}.` : ""),
        note: dv.engagement_population_text + " Votes measure interaction with a listing, not customer satisfaction." });
    }
    // 4 price tier
    const share = m.price_mix_pct["tier" + p.price];
    const modal = [1, 2, 3, 4].reduce((a, t) => (m.price_mix_pct["tier" + t] > m.price_mix_pct["tier" + a] ? t : a), 1);
    out.push({ metric: "price_tier", dimension: "positioning", label: "Price tier", owner: p.price, owner_display: F.tier(p.price),
      ref_value: share, ref_display: F.pct(share, 1), ref_stat: "share of restaurants in Tier " + p.price, mix: m.price_mix_pct, modal_tier: modal,
      population: "all restaurants", denominator: N, differs: share < MINORITY_TIER_PCT,
      plain: `${F.pct(share)} of the ${F.int(N)} restaurants in this group were in price Tier ${p.price}; the most common tier was Tier ${modal}.`,
      note: "Price tier is the platform's coarse four-level price range. It bundles format, ambience and cuisine." });
    // 5 cost for two
    const cq = m.cost_for_two, cpos = p.cost != null ? position(p.cost, cq) : null;
    out.push({ metric: "cost", dimension: "positioning", label: "Average cost for two", owner: p.cost, owner_display: p.cost == null ? "Not provided" : F.inr(p.cost),
      ref_value: cq.median, ref_display: F.inr(cq.median), ref_stat: "median cost for two", dist: cq, scale: "inr", position: cpos,
      gap: cpos ? (cpos.in_middle_half ? "within" : cpos.vs_median) : null, population: "all restaurants", denominator: N,
      plain: `The middle listed cost for two in this group was ${F.inr(cq.median)}; half were between ${F.inr(cq.p25)} and ${F.inr(cq.p75)}.` + (cpos ? ` Your ${F.inr(p.cost)} is ${cpos.label.toLowerCase()}.` : ""),
      note: "Listed average cost for two in rupees, as shown in the historical snapshot." });
    // 6 delivery, 7 booking, 8 chain (shares)
    const yn = (v) => (v == null ? "Not provided" : v === "yes" ? "Yes" : "No");
    [["delivery", "delivery_pct", "Online delivery offered", "positioning", "offered online delivery"],
      ["booking", "booking_pct", "Table booking offered", "positioning", "offered table booking"],
      ["multi_outlet", "chain_pct", "Multi-outlet / chain profile", "positioning", "were chain outlets under the research proxy (name appears 5+ times)"]].forEach(([k, mk, lab, dim, verb]) => {
      const s = m[mk];
      const majority = s.value >= 50 ? "yes" : "no";
      out.push({ metric: k, dimension: dim, label: lab, owner: p[k], owner_display: yn(p[k]), ref_value: s.value, ref_display: F.pct(s.value, 1), ref_stat: "share of restaurants",
        ci: [s.lo, s.hi], population: "all restaurants", denominator: N, differs: p[k] != null && p[k] !== majority, majority,
        plain: `${F.pct(s.value)} of the ${F.int(N)} restaurants in this group ${verb}.`,
        note: k === "multi_outlet" ? CHAIN_CAVEAT : k === "booking" ? "Table booking is a specification-sensitive result in the research; this comparison is descriptive only and no suggestion is generated from it." : "Descriptive share only; it does not show whether delivery suits your restaurant." });
    });
    // 9 cuisine breadth
    const bq = m.n_cuisines;
    const bpos = dv.n_cuisines ? position(dv.n_cuisines, bq) : null;
    out.push({ metric: "breadth", dimension: "positioning", label: "Number of cuisine tags listed", owner: dv.n_cuisines, owner_display: dv.n_cuisines ? String(dv.n_cuisines) : "Not provided",
      ref_value: bq.median, ref_display: F.votes(bq.median) + " tags", ref_stat: "median number of tags", dist: bq, scale: "breadth", position: bpos,
      gap: bpos ? bpos.vs_median : null, population: "all restaurants", denominator: N,
      plain: `Restaurants in this group listed a median of ${F.votes(bq.median)} cuisine tag${bq.median === 1 ? "" : "s"} (average ${bq.mean.toFixed(1)}).` + (bpos ? ` You selected ${dv.n_cuisines}.` : ""),
      note: "Cuisine tags are platform listing categories, not menu items." });
    return out;
  }

  // ------------------------------------------------------------------ geographic benchmarks (approved order: locality, city, NCR)
  function geoLevels(p, D) {
    const ix = index(D);
    const levels = [];
    // Locality
    let loc;
    if (p.locality_id === "__none__") {
      loc = { level: "locality", title: "Your locality", available: false, reason: "You indicated that your locality is not listed. The historical data contain no matching City + Locality unit, so no locality benchmark is shown." };
    } else {
      const u = ix.locIndex[p.locality_id], full = ix.loc[p.locality_id];
      const name = u.locality + " (" + u.city + ")";
      if (u.n_restaurants < p.threshold) {
        const alt = THRESHOLDS.filter((t) => t < p.threshold && u.n_restaurants >= t);
        loc = { level: "locality", title: name, id: u.id, available: false, n_restaurants: u.n_restaurants, n_rated: u.n_rated,
          reason: `${name} has ${u.n_restaurants} restaurant${u.n_restaurants === 1 ? "" : "s"} in the historical data. Locality benchmarks require at least ${p.threshold} (the ${p.threshold === PRIMARY_T ? "primary" : "selected"} threshold), so no locality statistic is shown.` +
            (alt.length ? ` It would qualify under the ${alt[alt.length - 1]}-restaurant sensitivity threshold, which you can select on the review step.` : "") };
      } else {
        loc = Object.assign({ level: "locality", title: name, id: u.id, ref: full, eligible_at: THRESHOLDS.filter((t) => u.n_restaurants >= t) }, { available: true, n_restaurants: u.n_restaurants, n_rated: u.n_rated });
        if (!full.rating_available) loc.rating_note = full.rating_unavailable_reason;
        if (p.threshold !== PRIMARY_T) loc.threshold_note = `Shown under the ${p.threshold}-restaurant ${p.threshold < PRIMARY_T ? "sensitivity" : "stricter"} threshold (primary threshold: ${PRIMARY_T}).`;
      }
    }
    levels.push(loc);
    // City
    const c = ix.city[p.city];
    if (c.n_restaurants < MIN_PEER_N) {
      levels.push({ level: "city", title: c.name, available: false, n_restaurants: c.n_restaurants, n_rated: c.n_rated,
        reason: `${c.name} has only ${c.n_restaurants} restaurants (${c.n_rated} rated) in the historical data, below the ${MIN_PEER_N}-restaurant minimum used for benchmarks. The research shows its values for completeness but does not interpret them (see the Research Explorer).` });
    } else {
      levels.push({ level: "city", title: c.name, available: true, ref: c, n_restaurants: c.n_restaurants, n_rated: c.n_rated });
    }
    // NCR
    levels.push({ level: "ncr", title: "Delhi NCR", available: true, ref: D.ncr, n_restaurants: D.ncr.n_restaurants, n_rated: D.ncr.n_rated });
    return levels;
  }

  // ------------------------------------------------------------------ similar-restaurant peer ladder
  function peerLadder(p, D, dv) {
    const ix = index(D);
    const cu = dv.primary_cuisine;
    const rungs = [];
    const mk = (id, title, block, key, ref, why) => {
      const g = ref || (key != null ? group(D, block, key) : null);
      const r = { id, title, characteristics: why };
      if (key === undefined && !ref) { r.status = "not_applicable"; r.reason = "No cuisine was entered, so a cuisine peer group cannot be formed."; return r; }
      if (!g) { r.status = "unavailable"; r.n_restaurants = 0; r.n_rated = 0; r.reason = "No restaurant in the historical data matches all of these characteristics."; return r; }
      r.n_restaurants = g.n_restaurants; r.n_rated = g.n_rated; r.ref = g;
      if (g.n_restaurants < MIN_PEER_N) { r.status = "unavailable"; r.reason = `Only ${g.n_restaurants} restaurant${g.n_restaurants === 1 ? "" : "s"} match; at least ${MIN_PEER_N} are required for a peer comparison.`; return r; }
      r.status = "available";
      r.rating_available = !!g.rating_available;
      if (!g.rating_available) r.rating_reason = g.rating_unavailable_reason || `Fewer than ${MIN_RATED} rated restaurants.`;
      return r;
    };
    const cityRef = ix.city[p.city];
    rungs.push(cu ? mk("city_price_cuisine", `${p.city} · Tier ${p.price} · ${cu}`, "city_price_cuisine", `${p.city}|${p.price}|${cu}`, null, ["City", "Price tier", "Cuisine tag"])
      : mk("city_price_cuisine", `${p.city} · Tier ${p.price} · (cuisine)`, null, undefined, null, ["City", "Price tier", "Cuisine tag"]));
    rungs.push(mk("city_price", `${p.city} · Tier ${p.price}`, "city_price", `${p.city}|${p.price}`, null, ["City", "Price tier"]));
    rungs.push(mk("city_all", `${p.city} · all price tiers`, null, null, cityRef, ["City (broader price comparison)"]));
    rungs.push(mk("ncr_price", `Delhi NCR · Tier ${p.price}`, "ncr_price", String(p.price), null, ["Price tier (all five cities)"]));
    const primary = rungs.find((r) => r.status === "available") || null;
    const primaryRating = rungs.find((r) => r.status === "available" && r.rating_available) || null;
    // explanation of the choice, never silent
    const skipped = primary ? rungs.slice(0, rungs.indexOf(primary)).filter((r) => r.status !== "available") : rungs;
    const choice = primary ? (skipped.length
      ? `The closest peer group with enough restaurants is “${primary.title}”. ` + skipped.map((r) => `“${r.title}” was not used: ${r.reason}`).join(" ")
      : `The closest peer group, “${primary.title}”, has enough restaurants for a comparison.`) : "No peer group meets the minimum sample size.";
    const ratingChoice = primaryRating && primary && primaryRating !== primary
      ? `Rating comparisons use “${primaryRating.title}” because “${primary.title}” has fewer than ${MIN_RATED} rated restaurants (${primary.n_rated}).` : null;
    // supplementary groups (shown, never substituted silently)
    const supp = [];
    if (p.locality_id && p.locality_id !== "__none__") {
      const g = group(D, "locality_price", `${p.locality_id}|${p.price}`);
      const u = ix.locIndex[p.locality_id];
      supp.push(mk("locality_price", `${u.locality} (${u.city}) · Tier ${p.price}`, null, null, g || { n_restaurants: 0, n_rated: 0, available: false }, ["Locality", "Price tier"]));
      if (!g) { supp[supp.length - 1].status = "unavailable"; supp[supp.length - 1].n_restaurants = 0; supp[supp.length - 1].reason = "No restaurant in the historical data matches this locality and price tier."; delete supp[supp.length - 1].ref; }
    }
    if (cu) {
      supp.push(mk("ncr_price_cuisine", `Delhi NCR · Tier ${p.price} · ${cu}`, "ncr_price_cuisine", `${p.price}|${cu}`, null, ["Price tier", "Cuisine tag"]));
      supp.push(mk("city_cuisine", `${p.city} · ${cu} · all tiers`, "city_cuisine", `${p.city}|${cu}`, null, ["City", "Cuisine tag"]));
    }
    return { rungs, primary, primaryRating, choice, ratingChoice, supplementary: supp,
      cuisine_note: cu ? `Cuisine groups include every restaurant whose listing includes the tag “${cu}”, alone or with other tags. ${dv.n_cuisines > 1 ? "Only your first selected cuisine is used to form the peer group." : ""}`.trim() : null,
      caveat: "Peer groups are groups of restaurants that share the listed characteristics in the historical data. They are not your actual competitors, and the tool does not know who your competitors are. Cuisine comparisons are descriptive and do not imply that a cuisine causes higher or lower ratings." };
  }

  // ------------------------------------------------------------------ opportunity analysis (comparison findings, not causes)
  function opportunities(p, dv, geo, peers) {
    const ops = [];
    const locLvl = geo.find((g) => g.level === "locality" && g.available);
    const cityLvl = geo.find((g) => g.level === "city" && g.available);
    const P = peers.primary, PR = peers.primaryRating;
    const pc = P ? compare(p, dv, P.ref) : [];
    const prc = PR ? compare(p, dv, PR.ref) : [];
    const get = (arr, m) => arr.find((x) => x.metric === m && !x.unavailable);
    // rating
    const r = get(prc, "rating");
    if (r && r.position) ops.push({ id: "rating_gap", dimension: "quality", direction: r.gap, group: PR.title, n: r.denominator,
      headline: r.gap === "below" ? "Your rating is below the median of comparable rated restaurants" : r.gap === "above" ? "Your rating is above the median of comparable rated restaurants" : "Your rating equals the median of comparable rated restaurants",
      detail: `${F.rating(p.rating)} vs median ${F.rating(r.dist.median)} (middle half ${F.rating(r.dist.p25)}–${F.rating(r.dist.p75)}); ${r.position.short.toLowerCase()} of ${F.int(r.denominator)} rated restaurants in “${PR.title}”.`, comparison: r });
    // votes: rated-only votes need the rating group; all-restaurant votes use the general group
    const vsrc = dv.engagement_population === "rated" ? prc : pc, vgroup = dv.engagement_population === "rated" ? PR : P;
    const v = get(vsrc, "votes");
    if (v && v.position) ops.push({ id: "votes_gap", dimension: "engagement", direction: v.gap, group: vgroup.title, n: v.denominator,
      headline: v.gap === "below" ? "Your votes are below the median of comparable restaurants" : v.gap === "above" ? "Your votes are above the median of comparable restaurants" : "Your votes equal the median of comparable restaurants",
      detail: `${F.int(p.votes)} vs median ${F.votes(v.dist.median)} among ${F.int(v.denominator)} ${v.population} in “${vgroup.title}”.`, comparison: v });
    // visibility status
    const vis = get(pc, "visibility");
    if (vis && dv.rating_status === "not_published") ops.push({ id: "visibility_status", dimension: "visibility", direction: vis.differs ? "differs" : "similar", group: P.title, n: vis.denominator,
      headline: vis.differs ? "Most comparable restaurants had a published rating; yours does not" : "Your rating status matches many comparable restaurants",
      detail: `${F.pct(vis.ref_value)} of ${F.int(vis.denominator)} restaurants in “${P.title}” had a published rating.`, comparison: vis });
    // price tier (local first)
    const priceRef = locLvl || cityLvl;
    if (priceRef) {
      const pr = get(compare(p, dv, priceRef.ref), "price_tier");
      if (pr) ops.push({ id: "price_tier", dimension: "positioning", direction: pr.differs ? "differs" : "similar", group: priceRef.title, n: pr.denominator,
        headline: pr.differs ? `Tier ${p.price} is less common in ${priceRef.title}` : `Tier ${p.price} is a common tier in ${priceRef.title}`,
        detail: `${F.pct(pr.ref_value, 1)} of ${F.int(pr.denominator)} restaurants were in Tier ${p.price}; the most common tier was Tier ${pr.modal_tier}. “Less common” means below ${MINORITY_TIER_PCT}%.`, comparison: pr });
    }
    const cost = get(pc, "cost");
    if (cost && cost.position) ops.push({ id: "cost", dimension: "positioning", direction: cost.gap, group: P.title, n: cost.denominator,
      headline: cost.gap === "within" ? "Your cost for two is within the middle half of comparable restaurants" : cost.gap === "below" ? "Your cost for two is below the middle half of comparable restaurants" : "Your cost for two is above the middle half of comparable restaurants",
      detail: `${F.inr(p.cost)} vs median ${F.inr(cost.dist.median)} (middle half ${F.inr(cost.dist.p25)}–${F.inr(cost.dist.p75)}) in “${P.title}”.`, comparison: cost });
    ["delivery", "booking", "multi_outlet"].forEach((k) => {
      const c = get(pc, k);
      if (!c || p[k] == null) return;
      const names = { delivery: "online delivery", booking: "table booking", multi_outlet: "multi-outlet status" };
      ops.push({ id: k, dimension: "positioning", direction: c.differs ? "differs" : "similar", group: P.title, n: c.denominator, descriptive_only: k !== "delivery",
        headline: c.differs ? `Your ${names[k]} profile differs from most comparable restaurants` : `Your ${names[k]} profile matches most comparable restaurants`,
        detail: `${F.pct(c.ref_value, 1)} of ${F.int(c.denominator)} restaurants in “${P.title}” ${k === "multi_outlet" ? "were chain outlets under the research proxy" : "offered " + names[k]}; you answered “${p[k]}”.` + (k === "multi_outlet" ? " " + CHAIN_CAVEAT : ""),
        comparison: c });
    });
    const b = get(pc, "breadth");
    if (b && b.position) ops.push({ id: "breadth", dimension: "positioning", direction: b.gap, group: P.title, n: b.denominator,
      headline: b.gap === "below" ? "You list fewer cuisine tags than the median comparable restaurant" : b.gap === "above" ? "You list more cuisine tags than the median comparable restaurant" : "You list the median number of cuisine tags",
      detail: `${dv.n_cuisines} tag${dv.n_cuisines === 1 ? "" : "s"} vs median ${F.votes(b.dist.median)} in “${P.title}”.`, comparison: b });
    return ops;
  }

  // ------------------------------------------------------------------ recommendation rules (see Recommendation_Rules.md)
  function rules(p, dv, geo, peers, ops, EV) {
    const M = EV.models, X = EV.extremes_adjusted_rating, G = p.goals;
    const has = (g) => G.includes(g);
    const op = (id) => ops.find((o) => o.id === id);
    const out = [];
    const add = (s) => out.push(s);
    const vis = M.vis, q = M.qual, e = M.eng;

    // R9 visibility threshold (no published rating, or 0-3 votes) + visibility goal
    const lowVotes = p.votes != null && p.votes <= 3;
    if (has("visibility") && (dv.rating_status === "not_published" || (dv.rating_status !== "published" && lowVotes))) {
      const pv = peers.primary && (peers.primary.comparisons || []).find((c) => c.metric === "visibility");
      add({ rule: "R9", id: "visibility_threshold", goals: ["visibility"], dimension: "visibility", evidence: "benchmark", gap: !!(pv && pv.ref_value >= 50),
        title: "Build a base of genuine customer ratings",
        observed: (dv.rating_status === "not_published" ? "You do not currently have a published rating." : `You entered ${p.votes} vote${p.votes === 1 ? "" : "s"} and no rating.`) +
          (pv ? ` In “${peers.primary.title}”, ${F.pct(pv.ref_value)} of ${F.int(pv.denominator)} restaurants had a published rating.` : ""),
        meaning: "In the historical snapshot, every listing with 0–3 votes showed no rating and every listing with 4 or more votes showed one. This is consistent with a rating-publication threshold, but it is not confirmed Zomato policy.",
        consider: "Consider legitimate ways to invite real customers to rate their visit, within the platform's rules, so that a rating can be published. Do not offer incentives for reviews or generate artificial ones.",
        limits: "The publication pattern is inferred from one undated snapshot. Current platform rules may differ. Without a published rating, the tool cannot compare your perceived quality." });
    }
    // R2 delivery and visibility
    if (p.delivery === "no" && has("visibility")) {
      const d = op("delivery");
      add({ rule: "R2", id: "delivery_visibility", goals: ["visibility", "engagement"], dimension: "visibility", evidence: "strong", gap: !!(d && d.direction === "differs"),
        title: "Evaluate whether online delivery suits your restaurant",
        observed: "You indicated that you do not offer online delivery." + (d ? ` ${d.detail.split(";")[0]}.` : ""),
        meaning: `In the research, restaurants offering delivery had about ${Math.round(vis.online_delivery.estimate)} times the odds of a published rating (odds ratio ${vis.online_delivery.estimate.toFixed(2)}, 95% CI ${vis.online_delivery.lo.toFixed(2)}–${vis.online_delivery.hi.toFixed(2)}), holding price tier, city, booking, cuisine breadth and chain status constant. This compares odds, not probabilities.` +
          (has("engagement") ? ` Among rated restaurants, delivery was also associated with a ${F.signedPct(e.online_delivery.estimate)} difference in the geometric mean of (1 + votes); this is not a percentage change in raw votes.` : "") +
          ` Its association with the rating was small (${F.signed(q.online_delivery.estimate)} rating points), and it did not distinguish top- from bottom-rated restaurants (adjusted odds ratio ${X.online_delivery.OR.toFixed(2)}, ${F.p(X.online_delivery.p)}).`,
        consider: "If visibility is a priority, assess whether delivery fits your format: commercial suitability, kitchen and packaging capacity, delivery costs and whether your customers order this way. Treat it as an access decision, not a way to raise your rating.",
        limits: "Observational association in historical data. Busy restaurants may have been more likely to adopt delivery (reverse causality), and listing age was not observed. Adopting delivery is not guaranteed to change visibility." });
    }
    // R1 rating gap
    const rg = op("rating_gap");
    if (rg && rg.direction === "below") {
      add({ rule: "R1", id: "rating_gap", goals: ["quality", "local"], dimension: "quality", evidence: "benchmark", gap: true,
        title: "Review what drives your customers' ratings",
        observed: rg.detail,
        meaning: "Your published rating sits below the middle of comparable rated restaurants in the historical reference group. This describes where you stand; it does not explain why.",
        consider: "Review recent customer feedback for recurring themes, and check the consistency of food, service and perceived value against what your price tier promises.",
        limits: `These operational drivers (food, service, value) were not measured by the research: listing characteristics explained only ${Math.round(EV.fit.qual_adj_r2 * 100)}% of rating variation. The peer group is a reference set, not your actual competitors.` });
    }
    // R8 rating needs volume
    if (dv.rating_status === "published" && p.votes != null && p.votes >= 4 && p.votes <= LOW_VOLUME_MAX && (has("quality") || has("local"))) {
      const b1 = EV.rating_spread[0], b2 = EV.rating_spread[1];
      add({ rule: "R8", id: "rating_volume", goals: ["quality", "engagement"], dimension: "quality", evidence: "strong", gap: false,
        title: "Read a low-volume rating with caution",
        observed: `Your rating rests on ${p.votes} votes.`,
        meaning: `In the research, ratings based on few votes clustered near 3.0: restaurants with 4–10 votes had a rating spread (SD) of ${b1.sd_rating.toFixed(2)} and none was top-rated; with 11–25 votes, ${b2.pct_top_rated.toFixed(1)}% were top-rated. Ratings differentiated only as votes accumulated (Brown–Forsythe test, p < .001).`,
        consider: "Treat a growing base of genuine customer ratings as a precondition for reading your rating as a clear signal, and track rating together with its vote count.",
        limits: "The data show the pattern but not the platform mechanism behind it (averaging of few evaluations, moderation, or both). Votes accumulate over time and listing age was not observed." });
    }
    // R4 engagement gap (not when R9 already covers 0-3 votes)
    const vg = op("votes_gap");
    if (vg && vg.direction === "below" && !(lowVotes && out.some((s) => s.rule === "R9"))) {
      add({ rule: "R4", id: "engagement_gap", goals: ["engagement", "visibility", "local"], dimension: "engagement", evidence: "benchmark", gap: true,
        title: "Investigate how customers discover your listing",
        observed: vg.detail,
        meaning: `Your vote count is below the middle of the reference group (${vg.comparison.population}). Votes are an engagement proxy: they reflect how often customers interacted with a listing, not how satisfied they were.`,
        consider: "Investigate discoverability, such as listing completeness, photos and menu accuracy, and look for genuine opportunities for customers to leave feedback after their visit.",
        limits: "Votes accumulate with time on the platform and exposure, and listing age was not observed. A lower vote count does not imply lower satisfaction." });
    }
    // R3 chain profile
    if (p.multi_outlet === "yes") {
      add({ rule: "R3", id: "chain_profile", goals: ["visibility", "quality", "engagement", "local"], dimension: "quality", evidence: "strong", gap: false,
        title: "Monitor each outlet's rating separately from its reach",
        observed: "You indicated that you operate more than one outlet.",
        meaning: `In the research, restaurants identified by the chain proxy were more visible (odds ratio ${vis.is_chain.estimate.toFixed(2)}) and more engaged (${F.signedPct(e.is_chain.estimate)} on the geometric scale of 1 + votes), but rated lower (${F.signed(q.is_chain.estimate)} rating points) and much less likely to be top-rated (adjusted odds ratio ${X.is_chain.OR.toFixed(2)}).`,
        consider: "Do not read high visibility or vote counts as evidence of strong perceived quality. Compare each outlet's rating with independent restaurants in the same locality and price tier.",
        limits: CHAIN_CAVEAT + " Operating more outlets is not shown to cause any rating or engagement difference." });
    }
    // R5 price positioning
    const pt = op("price_tier"), co = op("cost");
    if ((pt && pt.direction === "differs") || (co && co.direction !== "within")) {
      const parts = [];
      if (pt && pt.direction === "differs") parts.push(pt.detail.split(" “Less")[0]);
      if (co && co.direction !== "within") parts.push(co.detail);
      add({ rule: "R5", id: "price_positioning", goals: ["positioning", "local", "quality"], dimension: "positioning", evidence: "benchmark", gap: true,
        title: "Review your target segment and value positioning",
        observed: parts.join(" "),
        meaning: `Your price position differs from the reference distribution. In the research, the rating difference between price tiers was concentrated at the Tier 2 to Tier 3 step (${F.signed(EV.price_contrasts["Tier 2 -> 3"].qual_b)} rating points) and was small between Tiers 1 and 2 (${F.signed(EV.price_contrasts["Tier 1 -> 2"].qual_b)}). Higher tiers also bundle format, ambience and cuisine.`,
        consider: "Check that your target customers, format and menu match the price position you hold, and how customers judge value at that price.",
        limits: "Observational association. The data give no basis for raising or lowering prices to change a rating or engagement; a high rating was achieved at every price tier." });
    }
    // R7 cuisine breadth
    const br = op("breadth");
    if (br && br.direction === "below" && (has("visibility") || has("engagement"))) {
      add({ rule: "R7", id: "cuisine_breadth", goals: ["visibility", "engagement"], dimension: "engagement", evidence: "strong", gap: true,
        title: "Check that your listing reflects your full menu",
        observed: br.detail,
        meaning: `In the research, each additional cuisine tag was associated with ${vis.n_cuisines.estimate.toFixed(2)} times the odds of a published rating and a ${F.signedPct(e.n_cuisines.estimate)} difference in the geometric mean of (1 + votes), but only ${F.signed(q.n_cuisines.estimate)} rating points.`,
        consider: "Make sure your listed cuisine categories accurately describe what you serve. Weigh any menu broadening against the operating complexity it adds; there is no evidence that a broader menu raises perceived quality.",
        limits: "Cuisine tags are platform categories that partly reflect format (for example multi-cuisine casual dining). Association only; adding tags that do not describe your menu would misinform customers." });
    }
    // G1 local benchmarking context
    const locOK = geo.some((g) => g.level === "locality" && g.available);
    if (has("local") && locOK) {
      add({ rule: "G1", id: "local_benchmark", goals: ["local"], dimension: "local", evidence: "general", gap: false,
        title: "Use your locality as the main reference point",
        observed: "Your locality has enough restaurants in the historical data for a benchmark.",
        meaning: `In the research, replacing city with locality in the models raised the share of rating variation accounted for from ${EV.fit.qual_adj_r2.toFixed(3)} to 0.235, and for engagement from ${EV.fit.eng_adj_r2.toFixed(3)} to 0.468. The same rating or vote count can mean different things in different localities.`,
        consider: "Judge your rating, rating status and votes against same-locality and same-tier restaurants rather than city-wide or NCR-wide averages.",
        limits: "Locality differences bundle footfall, demographics, rents and restaurant mix; they are not effects of location. 74 of the 98 eligible localities are in New Delhi." });
    }
    // R6 table booking: never a standalone recommendation; an evidence note only
    const notes = [{ rule: "R6", id: "table_booking_note", evidence: "sensitive", title: "About table booking",
      text: `In the primary models, table booking was associated with visibility (odds ratio ${vis.table_booking.estimate.toFixed(2)}, ${F.p(vis.table_booking.p)}) but not with the rating (${F.signed(q.table_booking.estimate)}, ${F.p(q.table_booking.p)}) or with engagement among rated restaurants (${F.p(e.table_booking.p)}). With price measured as log cost for two, booking became significant for quality and engagement, and it was significant in the all-restaurant engagement model. Because the result depends on the specification, no suggestion about introducing table booking is made.` }];
    // prioritise: goal rank, then benchmark gap present, then evidence class; no numeric score
    // rank: the owner's ranking of the rule's own dimension first; a rule that only serves a secondary goal follows
    const rank = (s) => {
      const own = G.indexOf(s.dimension);
      if (own >= 0) return own;
      const r = s.goals.map((g) => G.indexOf(g)).filter((i) => i >= 0);
      return r.length ? 10 + Math.min(...r) : 99;
    };
    const relevant = G.length ? out.filter((s) => rank(s) < 99) : out;
    relevant.sort((a, b) => rank(a) - rank(b) || (b.gap - a.gap) || EVIDENCE[a.evidence].order - EVIDENCE[b.evidence].order || a.rule.localeCompare(b.rule));
    const chosen = relevant.slice(0, 5).map((s, i) => Object.assign(s, { priority: i + 1, evidence_label: EVIDENCE[s.evidence].label,
      goal_match: s.goals.filter((g) => G.includes(g)).map((g) => GOALS[g].short) }));
    const dropped = relevant.slice(5).map((s) => s.rule);
    const notTriggered = ["R1", "R2", "R3", "R4", "R5", "R7", "R8", "R9", "G1"].filter((r) => !out.some((s) => s.rule === r));
    const offGoal = out.filter((s) => !relevant.includes(s)).map((s) => s.rule);
    return { suggestions: chosen, notes, trace: { triggered: out.map((s) => s.rule), not_triggered: notTriggered, outside_goals: offGoal, beyond_cap: dropped } };
  }

  // ------------------------------------------------------------------ main entry
  function buildDiagnostic(raw, D, EV) {
    const v = validateProfile(raw, D);
    if (!v.ok) return { ok: false, errors: v.errors };
    const p = v.profile, dv = derive(p);
    const geo = geoLevels(p, D).map((g) => Object.assign(g, { comparisons: g.available ? compare(p, dv, g.ref) : [] }));
    const peers = peerLadder(p, D, dv);
    peers.rungs.concat(peers.supplementary).forEach((r) => { r.comparisons = r.status === "available" ? compare(p, dv, r.ref) : []; });
    const ops = opportunities(p, dv, geo, peers);
    const rec = rules(p, dv, geo, peers, ops, EV);
    const missing = [];
    if (dv.rating_status === "unknown") missing.push("current rating");
    if (p.votes == null) missing.push("current votes");
    if (!p.cuisines.length) missing.push("cuisine");
    if (p.cost == null) missing.push("average cost for two");
    if (p.delivery == null) missing.push("online delivery");
    if (p.booking == null) missing.push("table booking");
    if (p.multi_outlet == null) missing.push("multi-outlet status");
    return { ok: true, version: VERSION, generated: new Date().toISOString(), profile: p, derived: dv, warnings: v.warnings, missing, geo, peers,
      opportunities: ops, suggestions: rec.suggestions, notes: rec.notes, trace: rec.trace,
      caveats: { entry: ENTRY_CAVEAT, historical: HISTORICAL_CAVEAT, chain: CHAIN_CAVEAT } };
  }

  return { VERSION, CITIES, THRESHOLDS, PRIMARY_T, MIN_PEER_N, MIN_RATED, MINORITY_TIER_PCT, GOALS, EVIDENCE, BANDS, F,
    ENTRY_CAVEAT, HISTORICAL_CAVEAT, CHAIN_CAVEAT, validateProfile, normaliseProfile, derive, position, compare, geoLevels, peerLadder, opportunities, buildDiagnostic };
});
