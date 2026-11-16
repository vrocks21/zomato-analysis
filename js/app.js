/* NCR Restaurant Benchmark Explorer: application logic (views, controls, rendering). */
(async function () {
  "use strict";
  const { fmt, esc, DIM_COLORS, DIM_NAMES } = window.NCR;
  const C = window.NCRCharts, F = window.NCRFilters;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  let D;
  try {
    D = await window.NCR.load();
  } catch (err) {
    const box = $("#load-error");
    box.hidden = false;
    box.innerHTML = "<strong>The data files could not be loaded.</strong> " + esc(err.message) +
      "<br>Run <code>python build_website_data.py</code>, then serve this folder with <code>python -m http.server 8000</code> and open <code>http://localhost:8000</code>.";
    return;
  }
  const SITE = D.site, CM = SITE.metric_catalogue, CITYD = D.cities, LOCD = D.localities, EXT = D.performance_extremes,
    FIND = D.research_findings, METH = D.methodology;
  const CITIES = CITYD.cities.map((c) => c.id);
  const cityById = Object.fromEntries(CITYD.cities.map((c) => [c.id, c]));
  const NCRB = CITYD.ncr;
  const DIMS = ["visibility", "quality", "engagement", "positioning"];
  const metricsByDim = (dim) => Object.values(CM).filter((m) => m.dimension === dim);
  const QCOLORS = { "Stars": "#14213d", "Crowd magnets": "#d2602a", "Hidden gems": "#2f6db5", "Low profile": "#c3cad6" };
  const QKEYS = ["Stars", "Crowd magnets", "Hidden gems", "Low profile"];
  const PRICE_KEYS = ["tier1", "tier2", "tier3", "tier4"], PRICE_COLORS = ["#d9dee7", "#9aa6b8", "#4a5d7e", "#14213d"];
  const PRICE_TEXT = ["#1b2433", "#1b2433", "#ffffff", "#ffffff"];

  // bind simple text
  $$("[data-bind]").forEach((el) => {
    const [obj, key] = el.getAttribute("data-bind").split(".");
    if (obj === "site") el.textContent = SITE[key];
  });

  // metric domains for the inline dot plots (all cities, eligible localities and NCR, incl. CIs)
  const DOMAIN = {};
  Object.keys(CM).forEach((mid) => {
    const vals = [];
    const push = (e) => { if (e && e.value != null) { vals.push(e.value); if (e.lo != null) vals.push(e.lo); if (e.hi != null) vals.push(e.hi); } };
    CITYD.cities.forEach((c) => push(c.metrics[mid]));
    LOCD.localities.forEach((l) => push(l.metrics[mid]));
    push(NCRB.metrics[mid]);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (CM[mid].unit.startsWith("%")) { min = 0; max = Math.max(100, max); }
    else if (CM[mid].unit === "votes" || CM[mid].unit === "INR") { min = 0; }
    else { const pad = (max - min) * 0.05; min -= pad; max += pad; }
    DOMAIN[mid] = [min, max];
  });

  // ======================================================================= generic benchmark table
  function benchTable(container, o) {
    // o: { primary: {name, metrics, n_restaurants, n_rated}, city: {name, metrics} | null, dim, showCity }
    const dims = o.dim && o.dim !== "all" ? [o.dim] : DIMS;
    let h = `<div class="bench-row head"><div>Metric</div><div class="plot-h">Comparison</div><div class="val">${esc(o.primaryHead)}</div>` +
      (o.city ? `<div class="val">City</div>` : "") + `<div class="val">NCR</div></div>`;
    dims.forEach((dim) => {
      h += `<div class="bench-group"><div class="bench-group-title" style="color:${DIM_COLORS[dim]}"><span class="gdot" style="background:${DIM_COLORS[dim]}"></span>${esc(DIM_NAMES[dim])}</div>`;
      metricsByDim(dim).forEach((m) => {
        const p = o.primary.metrics[m.id] || {}, c = o.city ? o.city.metrics[m.id] || {} : null, n = NCRB.metrics[m.id] || {};
        const f = (v) => fmt.metric(m, v);
        const nBasis = m.denominator === "n_rated" ? `n = ${fmt.int(o.primary.n_rated)} rated` : `n = ${fmt.int(o.primary.n_restaurants)} restaurants`;
        const ci = p.lo != null && p.hi != null ? `${f(p.lo)} to ${f(p.hi)}` : "";
        const plot = p.value == null && (!c || c.value == null) && n.value == null ? "" :
          C.dotplot({ min: DOMAIN[m.id][0], max: DOMAIN[m.id][1], loc: p.value, lo: p.lo, hi: p.hi, city: c ? c.value : null, ncr: n.value, fmt: f,
            color: o.primaryColor, locLabel: o.primaryHead,
            aria: `${m.label}: ${o.primaryHead} ${f(p.value)}${c ? ", city " + f(c.value) : ""}, NCR ${f(n.value)}` });
        const expId = "expl-" + container.id + "-" + m.id;
        h += `<div class="bench-row">
          <div class="lab">${esc(m.label)}<button type="button" class="info-btn" aria-expanded="false" aria-controls="${expId}" aria-label="About ${esc(m.label)}">i</button>
            <span class="unit">${esc(m.unit)} · ${esc(m.population.toLowerCase())}</span></div>
          <div class="plot">${plot}</div>
          <div class="val loc">${p.value == null ? `<span class="na" title="${esc(p.unavailable_reason || "")}">Not available</span>` : esc(f(p.value))}
            <small>${p.value == null ? esc(shortReason(p.unavailable_reason)) : (ci ? "95% CI " + esc(ci) + "<br>" : "") + esc(nBasis)}</small></div>
          ${o.city ? `<div class="val">${c.value == null ? '<span class="na">Not available</span>' : esc(f(c.value))}<small>${esc(o.city.name)}</small></div>` : ""}
          <div class="val">${n.value == null ? `<span class="na" title="${esc(n.unavailable_reason || "")}">Not available</span>` : esc(f(n.value))}<small>Delhi NCR</small></div>
          <div class="bench-expl" id="${expId}" hidden>${esc(m.explanation)} <em>Denominator: ${esc(m.population.toLowerCase())}. Source column: ${esc(m.source_column)}.</em>
            ${n.value == null ? " <em>NCR: " + esc(n.unavailable_reason) + "</em>" : n.derivation ? " <em>NCR value: " + esc(n.derivation) + ".</em>" : ""}</div>
        </div>`;
      });
      h += `</div>`;
    });
    container.innerHTML = h;
    $$(".info-btn", container).forEach((btn) => btn.addEventListener("click", () => {
      const ex = document.getElementById(btn.getAttribute("aria-controls"));
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      ex.hidden = open;
    }));
  }
  const shortReason = (r) => (r && r.startsWith("Fewer than") ? "fewer than 20 rated" : r ? "not in verified results" : "");

  // ======================================================================= OVERVIEW
  function renderOverview() {
    $("#headline-stats").innerHTML = SITE.headline_stats.map((s) => `<li><span class="num">${fmt.int(s.value)}</span><span class="lbl">${esc(s.label)}</span></li>`).join("");
    const letters = { visibility: "V", quality: "Q", engagement: "E" };
    const row = (id, term) => FIND.models.find((m) => m.id === id).rows.find((r) => r.term === term);
    const dv = row("visibility", "Online delivery"), dq = row("quality", "Online delivery"), de = row("engagement", "Online delivery");
    const hc = (dim, label, sub, v, vs) => `<div class="hc-row"><div class="badge" style="background:${DIM_COLORS[dim]}" aria-hidden="true">${letters[dim]}</div>
      <div class="t"><b>${esc(label)}</b>${esc(sub)}</div><div class="v" style="color:${DIM_COLORS[dim]}">${esc(v)}<small>${esc(vs)}</small></div></div>`;
    $("#hero-delivery").innerHTML =
      hc("visibility", "Visibility", "odds of a published rating (all NCR)", "×" + dv.estimate.toFixed(2), "odds ratio") +
      hc("engagement", "Engagement", "geometric mean of (1 + Votes), rated NCR", fmt.signedPct(de.estimate), de.sd_units.toFixed(2) + " SD") +
      hc("quality", "Perceived quality", "rating points, rated NCR", fmt.signed(dq.estimate), dq.sd_units.toFixed(2) + " SD");
    $("#dimension-cards").innerHTML = SITE.dimensions.map((d) => `<div class="dim-card ${d.id}"><div class="badge" aria-hidden="true">${letters[d.id]}</div>
      <h3>${esc(d.name)}</h3><p class="q">${esc(d.question)}</p><p class="m">${esc(d.measure)}</p><p class="p">${esc(d.population)}</p></div>`).join("");
    // direction mini table
    const keep = ["Online delivery", "Price tier 3 (vs 1)", "Cuisine breadth (+1 tag)", "Chain indicator (5+ outlets)", "Table booking"];
    const cols = [["Visibility (Model 1)", "Visibility"], ["Quality (Model 2)", "Quality"], ["Engagement, rated (Model 3)", "Engagement"]];
    const rows = FIND.cross_model.direction_table.filter((r) => keep.includes(r.Predictor)).sort((a, b) => keep.indexOf(a.Predictor) - keep.indexOf(b.Predictor));
    let t = `<table><thead><tr><th>Characteristic</th>${cols.map((c) => `<th class="num" style="text-align:center">${c[1]}</th>`).join("")}</tr></thead><tbody>`;
    rows.forEach((r) => {
      t += `<tr${r.Predictor.startsWith("Chain") ? ' class="hl"' : ""}><td>${esc(r.Predictor.replace("Chain indicator", "Chain"))}</td>` +
        cols.map((c) => signCell(r[c[0]], true)).join("") + `</tr>`;
    });
    $("#overview-direction").innerHTML = t + "</tbody></table>";
    C.hbar($("#overview-funnel"), {
      title: "Sample funnel", format: (v) => fmt.int(v), valW: 60,
      items: METH.funnel.map((f, i) => ({ label: f.step, value: f.n, color: ["#c3cad6", "#9aa6b8", "#14213d", "#d2602a", "#98a2b3"][i], tip: f.step + ": " + fmt.int(f.n) + " (" + f.note + ")" })),
    });
  }
  function signCell(s, mini) {
    const ns = /ns/.test(s), neg = /−|-/.test(s.replace("(ns)", "")), pos = s.trim().startsWith("+");
    const cls = ns ? "ns" : neg ? "neg" : pos ? "pos" : "ns";
    const sym = neg ? "−" : "+";
    const label = (ns ? "not significant, " : "significant, ") + (neg ? "negative" : "positive");
    return mini ? `<td class="sign ${cls}" style="text-align:center"><span aria-label="${label}">${sym}</span></td>`
      : `<td class="sign ${cls}" aria-label="${label}">${esc(s)}</td>`;
  }

  // ======================================================================= CITIES
  const cityState = { city: "New Delhi", metric: "pub_rate_pct" };
  function initCities() {
    const sel = $("#city-select");
    sel.innerHTML = CITIES.map((c) => `<option value="${esc(c)}">${esc(c)}${cityById[c].small_sample ? " (n = 25, small sample)" : ""}</option>`).join("");
    sel.addEventListener("change", () => { cityState.city = sel.value; renderCities(); });
    $("#city-cards").innerHTML = CITYD.cities.map((c) => {
      const m = c.metrics;
      return `<button type="button" class="city-card" role="listitem" data-city="${esc(c.id)}" aria-pressed="false">
        <div class="nm">${esc(c.name)}</div><div class="n">${fmt.int(c.n_restaurants)} restaurants · ${fmt.int(c.n_rated)} rated</div>
        <dl><dt>Publication rate</dt><dd>${fmt.pct(m.pub_rate_pct.value)}</dd><dt>Median rating</dt><dd>${fmt.metric(CM.median_rating, m.median_rating.value)}</dd>
        <dt>Median votes</dt><dd>${fmt.metric(CM.median_votes, m.median_votes.value)}</dd><dt>Delivery</dt><dd>${fmt.pct(m.delivery_pct.value)}</dd></dl>
        ${c.small_sample ? '<span class="flag">n = 25 · not interpreted</span>' : ""}</button>`;
    }).join("");
    $$(".city-card").forEach((b) => b.addEventListener("click", () => { cityState.city = b.dataset.city; sel.value = cityState.city; renderCities(); }));
    const ms = $("#city-metric-select");
    ms.innerHTML = DIMS.map((d) => `<optgroup label="${esc(DIM_NAMES[d])}">${metricsByDim(d).map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join("")}</optgroup>`).join("");
    ms.value = cityState.metric;
    ms.addEventListener("change", () => { cityState.metric = ms.value; renderCityCompare(); });
    $("#city-notes").innerHTML = "<ul>" + CITYD.notes.map((n) => `<li>${esc(n)}</li>`).join("") + "</ul>";
    renderCities();
  }
  function renderCities() {
    const c = cityById[cityState.city];
    $$(".city-card").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.city === c.id)));
    $("#city-detail-title").textContent = c.name + " vs Delhi NCR";
    $("#city-detail-n").textContent = `${fmt.int(c.n_restaurants)} restaurants (${fmt.pct(c.share_of_ncr_pct)} of NCR) · ${fmt.int(c.n_rated)} rated · ${fmt.int(c.n_unrated)} unrated · ` +
      `${c.eligible_localities["30"]} localities with 30+ restaurants`;
    $("#city-flag").innerHTML = c.small_sample_note ? `<div class="flag-box" role="note"><strong>Sample size caution.</strong> ${esc(c.small_sample_note)}</div>` : "";
    benchTable($("#city-benchmarks"), { primary: { name: c.name, metrics: c.metrics, n_restaurants: c.n_restaurants, n_rated: c.n_rated },
      city: null, primaryHead: c.name, primaryColor: "#14213d" });
    renderCityCompare();
    C.stacked($("#city-price-mix"), { title: "Price-tier mix by city", keys: PRICE_KEYS, keyLabels: ["Tier 1", "Tier 2", "Tier 3", "Tier 4"], colors: PRICE_COLORS, textColors: PRICE_TEXT,
      rows: CITYD.cities.map((x) => ({ label: x.name + (x.small_sample ? " †" : ""), parts: x.price_mix_pct, n: x.n_restaurants, bold: x.id === c.id })) });
    C.stacked($("#city-quadrant-mix"), { title: "Quadrant mix by city", keys: QKEYS, colors: QKEYS.map((k) => QCOLORS[k]), textColors: ["#fff", "#fff", "#fff", "#1b2433"],
      rows: CITYD.cities.map((x) => ({ label: x.name + (x.small_sample ? " †" : ""), parts: x.quadrant_mix_pct, n: x.quadrant_n_rated, bold: x.id === c.id })) });
    // within-city models
    const ms = c.within_city_models;
    $("#city-models").innerHTML = !ms.length ? `<p class="fine">No city-specific model was estimated for ${esc(c.name)} (too few restaurants).</p>` :
      `<p class="fine">Models 1–3 re-estimated on ${esc(c.name)} only. Engagement values are percentage differences in the geometric mean of (1 + Votes), not % changes in raw votes.
        None of the predictor × city interaction tests is significant after correction, so these do not show that associations differ between cities.${c.id === "Faridabad" ? " Faridabad is a small sample; estimates are imprecise." : ""}</p>
       <div class="table-wrap"><table><thead><tr><th>Outcome</th><th>Predictor</th><th class="num">Estimate [95% CI]</th><th class="num">p</th><th>Unit</th><th class="num">n</th></tr></thead><tbody>` +
      ms.map((m) => {
        const isOR = m.unit === "odds ratio", isPct = m.unit.startsWith("%");
        const f = (v) => (isOR ? fmt.num(v, 2) : isPct ? fmt.signedPct(v) : fmt.signed(v));
        return `<tr><td>${esc(m.outcome)}</td><td>${esc(m.predictor)}</td><td class="num">${f(m.estimate)} [${f(m.lo)}, ${f(m.hi)}]</td><td class="num">${esc(fmt.p(m.p))}</td><td>${esc(m.unit)}</td><td class="num">${fmt.int(m.n)}</td></tr>`;
      }).join("") + "</tbody></table></div>";
  }
  function renderCityCompare() {
    const m = CM[cityState.metric];
    const ncr = NCRB.metrics[m.id];
    C.hbar($("#city-compare-chart"), {
      title: m.label + " by city", format: (v) => fmt.metric(m, v), valW: 90,
      max: m.unit.startsWith("%") ? 100 : undefined,
      ref: ncr.value != null ? { value: ncr.value, label: "NCR " + fmt.metric(m, ncr.value) } : null,
      items: CITYD.cities.map((c) => {
        const e = c.metrics[m.id];
        const n = m.denominator === "n_rated" ? c.n_rated + " rated" : c.n_restaurants + " restaurants";
        return { label: c.name, value: e.value, lo: e.lo, hi: e.hi, color: c.id === cityState.city ? "#d2602a" : "#14213d",
          hatch: c.small_sample, flag: c.small_sample ? "†" : "", bold: c.id === cityState.city,
          tip: `${c.name}: ${fmt.metric(m, e.value)}${e.lo != null ? " (95% CI " + fmt.metric(m, e.lo) + " to " + fmt.metric(m, e.hi) + ")" : ""} · n = ${n}` };
      }),
    });
    $("#city-compare-note").textContent = `${m.unit}; ${m.population.toLowerCase()}. Whiskers: ${m.ci_method || "no interval published"}. ` +
      (ncr.value == null ? "NCR benchmark not available for this metric. " : "Dashed line: NCR benchmark. ") + "† Ghaziabad (n = 25): shown, not interpreted.";
  }

  // ======================================================================= LOCALITIES
  const locState = { t: 30, city: "New Delhi", q: "", id: null, dim: "all" };
  function readLocHash() {
    const m = location.hash.match(/^#localities\?(.*)$/);
    if (!m) return;
    const p = new URLSearchParams(m[1]);
    if (["20", "30", "50"].includes(p.get("t"))) locState.t = +p.get("t");
    const id = p.get("loc");
    const rec = id && LOCD.localities.find((l) => l.id === id && l.eligible[String(locState.t)]);
    if (rec) { locState.city = rec.city; locState.id = rec.id; }
  }
  function writeLocHash() {
    if (!location.hash.startsWith("#localities")) return;
    const p = new URLSearchParams({ t: String(locState.t) });
    if (locState.id) p.set("loc", locState.id);
    history.replaceState(null, "", "#localities?" + p.toString());
  }
  function initLocalities() {
    readLocHash();
    $$('input[name="threshold"]').forEach((r) => {
      r.checked = +r.value === locState.t;
      r.addEventListener("change", () => { locState.t = +r.value; locState.id = null; refreshLocControls(); });
    });
    $("#loc-city-select").addEventListener("change", (e) => { locState.city = e.target.value; locState.id = null; locState.q = ""; $("#loc-search").value = ""; refreshLocControls(); });
    $("#loc-search").addEventListener("input", (e) => { locState.q = e.target.value; refreshLocList(true); });
    $("#loc-select").addEventListener("change", (e) => { locState.id = e.target.value || null; renderLocality(); });
    $("#loc-dim-filter").addEventListener("change", (e) => { locState.dim = e.target.value; renderLocality(); });
    $("#loc-rho").textContent = LOCD.correlations_t30["median_rating ~ median_votes"].rho.toFixed(2);
    $("#loc-notes").innerHTML = "<ul>" + LOCD.notes.map((n) => `<li>${esc(n)}</li>`).join("") + "</ul>";
    refreshLocControls();
  }
  function refreshLocControls() {
    const elig = F.eligible(LOCD.localities, locState.t);
    const counts = F.countsByCity(elig, CITIES);
    const cs = $("#loc-city-select");
    cs.innerHTML = CITIES.map((c) => `<option value="${esc(c)}">${esc(c)} (${counts[c]} ${counts[c] === 1 ? "locality" : "localities"})</option>`).join("");
    cs.value = locState.city;
    // coverage strip
    const total = elig.length;
    const covColors = { "New Delhi": "#14213d", "Gurgaon": "#2f6db5", "Noida": "#1d8a5a", "Faridabad": "#d2602a", "Ghaziabad": "#98a2b3" };
    const e = LOCD.eligibility[String(locState.t)];
    $("#loc-coverage").innerHTML = `<div><strong>${total} City + Locality units</strong> have ${locState.t}+ restaurants
      (${fmt.int(e.restaurants_covered)} restaurants, ${fmt.pct(e.pct_NCR_covered)} of NCR).<br><span class="fine">Coverage is concentrated in New Delhi
      (${counts["New Delhi"]} of ${total} units); Ghaziabad has none at any threshold.</span></div>
      <div class="cov-bar"><svg viewBox="0 0 400 18" preserveAspectRatio="none" width="100%" height="18" role="img" aria-label="Eligible localities by city: ${CITIES.map((c) => c + " " + counts[c]).join(", ")}">${
        (() => { let x = 0; return CITIES.map((c) => { const w = (400 * counts[c]) / Math.max(1, total); const r = w > 0 ? `<rect x="${x}" y="0" width="${w}" height="18" fill="${covColors[c]}" data-tip="${esc(c)}: ${counts[c]} localities"/>` : ""; x += w; return r; }).join(""); })()
      }</svg><div class="cov-legend">${CITIES.map((c) => `<span><i class="mk" style="background:${covColors[c]};border-radius:2px"></i>${esc(c)} ${counts[c]}</span>`).join("")}</div></div>`;
    refreshLocList(false);
  }
  function refreshLocList(fromSearch) {
    const elig = F.eligible(LOCD.localities, locState.t);
    const inCity = F.byCity(elig, locState.city);
    const list = F.search(inCity, locState.q);
    const sel = $("#loc-select");
    const status = $("#loc-filter-status");
    if (!inCity.length) {
      sel.innerHTML = `<option value="">No eligible locality</option>`; sel.disabled = true;
      $("#loc-search").disabled = true;
      status.textContent = "";
      locState.id = null;
      return renderLocality(`<strong>No ${esc(locState.city)} locality has ${locState.t}+ restaurants.</strong>
        ${locState.city === "Ghaziabad" ? "Ghaziabad has only 25 restaurants in the dataset, so no locality reaches any eligibility threshold." :
        "Try a lower threshold (20+) to see more units; the primary threshold is 30."}`);
    }
    sel.disabled = false; $("#loc-search").disabled = false;
    if (!list.length) {
      sel.innerHTML = `<option value="">No match</option>`;
      status.textContent = `No ${locState.city} locality matches “${locState.q}” at ${locState.t}+ restaurants.`;
      locState.id = null;
      return renderLocality(`<strong>No matching locality.</strong> No ${esc(locState.city)} locality with ${locState.t}+ restaurants matches “${esc(locState.q)}”. Clear the search to see all ${inCity.length}.`);
    }
    if (!locState.id || !list.some((l) => l.id === locState.id)) {
      const pref = locState.city === "New Delhi" && !fromSearch ? list.find((l) => l.locality === "Connaught Place") : null;
      locState.id = (pref || list[0]).id;
    }
    sel.innerHTML = list.map((l) => `<option value="${esc(l.id)}">${esc(l.locality)} · ${l.n_restaurants} restaurants</option>`).join("");
    sel.value = locState.id;
    status.textContent = `${list.length} of ${inCity.length} ${locState.city} localities shown (threshold ${locState.t}+).`;
    renderLocality();
  }
  function renderLocality(emptyMsg) {
    const empty = $("#loc-empty"), detail = $("#loc-detail");
    if (emptyMsg || !locState.id) {
      empty.hidden = false; detail.hidden = true;
      empty.innerHTML = emptyMsg || "<strong>Select a locality.</strong>";
      writeLocHash();
      return;
    }
    const l = LOCD.localities.find((x) => x.id === locState.id);
    const c = cityById[l.city];
    empty.hidden = true; detail.hidden = false;
    $("#loc-city-name").textContent = l.city;
    $("#loc-name").textContent = l.locality;
    $("#loc-meta").innerHTML = `${fmt.int(l.n_restaurants)} restaurants · ${fmt.int(l.n_rated)} rated · ${fmt.int(l.n_unrated)} unrated · identifier <code>${esc(l.id)}</code>`;
    const elig = ["20", "30", "50"].map((t) => `<span class="pill ${l.eligible[t] ? "ok" : "no"}">${t}+ ${l.eligible[t] ? "eligible" : "not eligible"}</span>`).join("");
    $("#loc-badges").innerHTML = elig +
      (l.pattern_t30 ? `<span class="pill" title="Relative to the median locality (rating ${LOCD.pattern_medians_t30.median_rating}, votes ${LOCD.pattern_medians_t30.median_votes})">${esc(l.pattern_t30)}</span>` : "") +
      (!l.rating_statistics_available ? `<span class="pill warn">Rating statistics not available (${l.n_rated} rated)</span>` : "") +
      (l.compound_label ? `<span class="pill" title="The source label names a mall or complex inside a locality">Compound label</span>` : "");
    $("#loc-dim-filter").value = locState.dim;
    benchTable($("#loc-benchmarks"), { primary: { name: l.locality, metrics: l.metrics, n_restaurants: l.n_restaurants, n_rated: l.n_rated },
      city: { name: c.name, metrics: c.metrics }, dim: locState.dim, primaryHead: "Locality", primaryColor: "#d2602a" });
    // scatter
    const pts = LOCD.localities.filter((x) => x.eligible["30"] && x.rating_statistics_available)
      .map((x) => ({ id: x.id, city: x.city, label: x.label, x: x.metrics.median_votes.value, y: x.metrics.median_rating.value }));
    C.scatter($("#loc-scatter"), { title: "Median rating vs median votes, localities with 30+ restaurants", points: pts, highlightId: l.id, city: l.city,
      refX: LOCD.pattern_medians_t30.median_votes, refY: LOCD.pattern_medians_t30.median_rating,
      xLabel: "Median votes (all restaurants, log scale)", yLabel: "Median rating (rated restaurants)" });
    const inScatter = pts.some((p) => p.id === l.id);
    $("#loc-scatter-note").innerHTML = (inScatter ? `<span style="color:#d2602a;font-weight:700">●</span> ${esc(l.label)} · ` :
      `${esc(l.label)} is not plotted (${!l.eligible["30"] ? "below the primary 30-restaurant threshold" : "fewer than 20 rated restaurants"}). `) +
      `<span style="color:#14213d;font-weight:700">●</span> other ${esc(l.city)} units · <span style="color:#98a2b3;font-weight:700">●</span> other cities. Dashed lines: median locality (rating ${LOCD.pattern_medians_t30.median_rating}, votes ${LOCD.pattern_medians_t30.median_votes}).`;
    C.stacked($("#loc-price-mix"), { title: "Price-tier mix", keys: PRICE_KEYS, keyLabels: ["Tier 1", "Tier 2", "Tier 3", "Tier 4"], colors: PRICE_COLORS, textColors: PRICE_TEXT,
      rows: [{ label: l.locality, parts: l.price_mix_pct, n: l.n_restaurants, bold: true }, { label: c.name + " (city)", parts: c.price_mix_pct, n: c.n_restaurants }] });
    C.stacked($("#loc-quadrant-mix"), { title: "Quadrant mix", keys: QKEYS, colors: QKEYS.map((k) => QCOLORS[k]), textColors: ["#fff", "#fff", "#fff", "#1b2433"],
      rows: [{ label: l.locality, parts: l.quadrant_mix_pct_t30, n: l.n_rated, bold: true,
        missing: !l.eligible["30"] ? "Not available below 30+" : "Not available (<20 rated)" },
      { label: c.name + " (city)", parts: c.quadrant_mix_pct, n: c.quadrant_n_rated }] });
    // ranks
    const rp = $("#loc-ranks");
    if (!l.rankings_t30) {
      rp.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>No ranks for this unit.</strong>Rankings are published for the primary threshold (30+ restaurants) only.</div>`;
    } else {
      const order = Object.keys(l.rankings_t30).sort();
      const allRanks = ["1 Highest median rating", "2 Lowest median rating", "3 Highest median votes", "4 Lowest median votes", "5 Highest rating publication rate",
        "6 Highest online delivery adoption", "7 Highest table booking adoption", "8 Highest top-rated concentration", "9 Highest high-engagement concentration"];
      rp.innerHTML = allRanks.map((k) => {
        const r = l.rankings_t30[k];
        const name = k.replace(/^\d+ /, "");
        if (!r) return `<div class="rank-card"><div class="r">Not ranked</div><div class="t">${esc(name)} · requires 20+ rated restaurants</div></div>`;
        const isPct = /rate|adoption|concentration/.test(name);
        const v = isPct ? fmt.pct(r.value) : /votes/.test(name) ? fmt.num(r.value, r.value % 1 ? 1 : 0) : fmt.num(r.value, 1);
        return `<div class="rank-card"><div class="r">#${r.rank} <small>of ${r.of}</small></div><div class="t">${esc(name)} (${esc(v)})${r.tied_units > 1 ? ` · tied with ${r.tied_units - 1} other${r.tied_units > 2 ? "s" : ""}` : ""}</div></div>`;
      }).join("");
      void order;
    }
    writeLocHash();
  }

  // ======================================================================= EXTREMES
  const extState = { id: "rating", quad: "Stars", qmetric: "delivery_pct" };
  function initExtremes() {
    $("#extreme-group").innerHTML = EXT.comparisons.map((c) => `<label><input type="radio" name="extreme" value="${c.id}"${c.id === extState.id ? " checked" : ""}><span>${esc(c.title)}</span></label>`).join("");
    $$('input[name="extreme"]').forEach((r) => r.addEventListener("change", () => { extState.id = r.value; renderExtreme(); }));
    const Q = EXT.quadrants;
    $("#quad-caveat").innerHTML = `<strong>An imposed framework, not discovered clusters.</strong> ${esc(Q.caveat)}`;
    $("#quad-def").textContent = Q.definition + " Population: " + Q.population + ".";
    const pos = { "Hidden gems": 0, "Stars": 1, "Low profile": 2, "Crowd magnets": 3 };
    const segs = Q.segments.slice().sort((a, b) => pos[a.name] - pos[b.name]);
    $("#quad-grid").innerHTML = segs.map((s) => `<button type="button" class="quad" data-q="${esc(s.name)}" aria-pressed="false">
        <div class="qn">${esc(s.name)}</div><div class="qs">${fmt.int(s.n)}</div><div class="qr">${fmt.pct(s.share_pct)} of rated · ${esc(s.rule)}</div></button>`).join("") +
      `<div class="quad-axes" style="grid-column:1/-1"><span>← fewer votes</span><span>Rows: higher rating (top) vs lower rating (bottom)</span><span>more votes →</span></div>`;
    $$(".quad").forEach((b) => b.addEventListener("click", () => { extState.quad = b.dataset.q; renderQuad(); }));
    const qm = $("#quad-metric");
    const QM = [["delivery_pct", "Online delivery (%)"], ["booking_pct", "Table booking (%)"], ["chain_pct", "Chain outlets (%)"], ["mean_price_tier", "Mean price tier (1-4)"],
      ["median_cost_for_two", "Median cost for two (INR)"], ["mean_rating", "Mean rating"], ["median_votes", "Median votes"], ["mean_cuisines", "Mean cuisine tags"]];
    qm.innerHTML = QM.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
    qm.addEventListener("change", () => { extState.qmetric = qm.value; renderQuad(); });
    qm.__labels = Object.fromEntries(QM);
    C.stacked($("#quad-city"), { title: "Quadrant mix by city", keys: QKEYS, colors: QKEYS.map((k) => QCOLORS[k]), textColors: ["#fff", "#fff", "#fff", "#1b2433"],
      rows: CITIES.map((c) => ({ label: c + (c === "Ghaziabad" ? " † (n = 23 rated)" : ""), parts: Q.by_city_pct[c], n: Q.by_city_pct[c].n_rated })) });
    // rating spread
    const RS = EXT.rating_spread;
    $("#spread-w").textContent = RS.test.brown_forsythe_W;
    C.grouped($("#spread-chart"), { title: "Top- and bottom-rated share by vote band", format: (v) => fmt.pct(v), max: 50,
      categories: RS.rows.map((r) => r.vote_band + " votes (n = " + fmt.int(r.n) + ", SD " + r.sd_rating.toFixed(2) + ")"),
      series: [{ name: "% top-rated (rating >= 3.9)", color: "#d2602a", values: RS.rows.map((r) => r.pct_top_rated) },
        { name: "% bottom-rated (rating <= 2.7)", color: "#9aa6b8", values: RS.rows.map((r) => r.pct_bottom_rated) }] });
    renderExtreme(); renderQuad();
  }
  function renderExtreme() {
    const c = EXT.comparisons.find((x) => x.id === extState.id);
    $("#ext-title").textContent = c.title;
    $("#ext-pop").textContent = `${c.population} (n = ${fmt.int(c.n_population)})`;
    $("#ext-rules").textContent = `Top: ${c.top_rule}, n = ${fmt.int(c.n_top)}. Bottom: ${c.bottom_rule}, n = ${fmt.int(c.n_bottom)}.`;
    const cats = c.binary.map((b) => b.characteristic.replace("Chain indicator (5+ outlets)", "Chain (5+ outlets)")).concat(["Price tiers 3–4"]);
    const sigNote = (i) => {
      const b = c.binary[i];
      return b ? ` · ${b.significant_BH ? "significant" : "not significant"} after BH correction (${fmt.p(b.p_BH)}), ${b.effect_metric} ${b.effect_size}` : "";
    };
    C.grouped($("#ext-bars"), { title: "Characteristics of top and bottom groups", format: (v) => fmt.pct(v), max: 100, tipSuffix: (ci) => sigNote(ci),
      categories: cats, series: [
        { name: "Top group", color: "#14213d", values: c.binary.map((b) => b.top).concat([c.price34.top]) },
        { name: "Bottom group", color: "#c3cad6", values: c.binary.map((b) => b.bottom).concat([c.price34.bottom]) }] });
    $("#ext-medians").innerHTML = c.medians.map((m) => `<div><b>${esc(m.characteristic.replace(" (INR)", ""))}</b>Top: ${esc(m.top_stat.split(";")[0])}<br>Bottom: ${esc(m.bottom_stat.split(";")[0])}</div>`).join("");
    if (c.adjusted_or) {
      $("#ext-forest").hidden = false;
      C.forest($("#ext-forest"), { title: "Adjusted odds ratios", log: true, ref: 1, color: "#14213d", axisTitle: "Adjusted odds ratio (log scale, 95% CI)",
        ticks: [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50].map((v) => ({ v, label: String(v) })),
        rows: c.adjusted_or.map((r) => ({ label: r.term, est: r.OR, lo: r.lo, hi: r.hi, sig: r.significant, bold: /delivery|Chain/.test(r.term),
          value: "OR " + fmt.num(r.OR, 2) + (r.significant ? "" : " (n.s.)"), tip: `${r.term}: OR ${fmt.num(r.OR, 2)} [${fmt.num(r.lo, 2)}, ${fmt.num(r.hi, 2)}], ${fmt.p(r.p)}` })) });
    } else {
      $("#ext-forest").innerHTML = `<div class="empty-state"><strong>Not shown for this comparison.</strong>${esc(c.adjusted_note)}</div>`;
      $("#ext-forest").__chart = null;
    }
    $("#ext-adj-note").textContent = c.adjusted_or ? c.adjusted_note : "";
    $("#ext-takeaway").textContent = c.takeaway;
  }
  function renderQuad() {
    const Q = EXT.quadrants;
    $$(".quad").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === extState.quad)));
    const s = Q.segments.find((x) => x.name === extState.quad);
    $("#quad-profile").innerHTML = `<h3>${esc(s.name)} profile</h3><dl>
      <dt>Restaurants</dt><dd>${fmt.int(s.n)} (${fmt.pct(s.share_pct)} of rated)</dd><dt>Mean rating</dt><dd>${s.mean_rating.toFixed(2)}</dd>
      <dt>Median votes</dt><dd>${fmt.int(s.median_votes)}</dd><dt>Online delivery</dt><dd>${fmt.pct(s.delivery_pct)}</dd>
      <dt>Table booking</dt><dd>${fmt.pct(s.booking_pct)}</dd><dt>Chain outlets</dt><dd>${fmt.pct(s.chain_pct)}</dd>
      <dt>Mean price tier</dt><dd>${s.mean_price_tier.toFixed(2)}</dd><dt>Median cost for two</dt><dd>₹${fmt.int(s.median_cost_for_two)}</dd></dl>
      <p class="fine">Group description only; not a prediction for any individual restaurant.</p>`;
    const k = extState.qmetric, lab = $("#quad-metric").__labels[k];
    const isPct = k.endsWith("pct");
    C.hbar($("#quad-compare"), { title: lab + " by quadrant", valW: 70, max: isPct ? 100 : undefined,
      format: (v) => (isPct ? fmt.pct(v) : k === "median_cost_for_two" ? "₹" + fmt.int(v) : k === "median_votes" ? fmt.int(v) : fmt.num(v, 2)),
      items: Q.segments.map((x) => ({ label: x.name, value: x[k], color: x.name === extState.quad ? "#d2602a" : "#14213d", bold: x.name === extState.quad,
        tip: `${x.name}: ${lab} ${x[k]} (n = ${fmt.int(x.n)})` })) });
  }

  // ======================================================================= FINDINGS
  const findState = { tab: "visibility", pop: "rated", cities: false, pc: "quality" };
  function initFindings() {
    const tabs = $("#findings-tabs");
    tabs.innerHTML = FIND.models.map((m, i) => `<button type="button" class="tab" role="tab" id="tab-${m.id}" aria-controls="findings-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${m.id}">
      <span class="gdot" style="background:${DIM_COLORS[m.dimension]}"></span>${esc(DIM_NAMES[m.dimension])}</button>`).join("");
    $$(".tab", tabs).forEach((t, i, all) => {
      t.addEventListener("click", () => { findState.tab = t.dataset.tab; renderFindings(); });
      t.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const n = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
        n.focus(); findState.tab = n.dataset.tab; renderFindings();
      });
    });
    $("#f-pop").addEventListener("change", (e) => { findState.pop = e.target.value; renderFindings(); });
    $("#f-cities").addEventListener("change", (e) => { findState.cities = e.target.checked; renderFindings(); });
    $("#pc-outcome").addEventListener("change", (e) => { findState.pc = e.target.value; renderPriceContrasts(); });
    // direction table
    const cols = Object.keys(FIND.cross_model.direction_table[0]);
    $("#direction-table").innerHTML = `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
      FIND.cross_model.direction_table.map((r) => `<tr${r.Predictor.startsWith("Chain") ? ' class="hl"' : ""}><td>${esc(r.Predictor)}</td>${cols.slice(1).map((c) => signCell(r[c], false)).join("")}</tr>`).join("") + "</tbody></table>";
    $("#hypotheses").innerHTML = FIND.hypotheses.map((h) => `<div class="hyp"><span class="hid">${esc(h.id)} ${esc(h.name)}</span>
      <span class="verdict${/qualification|comparative/.test(h.verdict) ? " q" : ""}">${esc(h.verdict)}</span><p>${esc(h.detail)}</p></div>`).join("");
    const B = FIND.table_booking;
    $("#booking-box").innerHTML = `<p>${esc(B.summary)}</p><p class="caveat" style="margin:0"><strong>${esc(B.recommendation)}</strong></p>`;
    const L = FIND.locality_fixed_effects;
    C.grouped($("#lfe-chart"), { title: "Explained variance with city vs locality fixed effects", format: (v) => v.toFixed(3), max: 0.6,
      categories: L.map((x) => x.outcome.replace("engagement", "Engagement").replace("quality", "Quality").replace("visibility", "Visibility (pseudo-R²)")),
      series: [{ name: "City fixed effects", color: "#9aa6b8", values: L.map((x) => x.adj_r2_city_fe) },
        { name: "Locality fixed effects", color: "#14213d", values: L.map((x) => x.adj_r2_locality_fe) }] });
    renderFindings(); renderPriceContrasts();
  }
  function renderFindings() {
    $$(".tab").forEach((t) => { const on = t.dataset.tab === findState.tab; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
    $("#findings-panel").setAttribute("aria-labelledby", "tab-" + findState.tab);
    let m = FIND.models.find((x) => x.id === findState.tab);
    const isEng = m.id === "engagement";
    $("#f-pop-wrap").hidden = !isEng;
    const all = isEng && findState.pop === "all";
    const src = all ? Object.assign({}, m, FIND.engagement_all_ncr) : m;
    $("#f-model").textContent = src.model;
    $("#f-question").textContent = m.question;
    $("#f-headline").textContent = all ? FIND.engagement_all_ncr.caution : m.headline;
    const color = DIM_COLORS[m.dimension];
    const rows = src.rows.filter((r) => findState.cities || !r.is_city_effect);
    const ci = (r) => {
      if (m.id === "visibility") return `OR ${fmt.num(r.estimate, 2)} [${fmt.num(r.lo, 2)}, ${fmt.num(r.hi, 2)}]`;
      if (m.id === "quality") return `${fmt.signed(r.estimate)} [${fmt.signed(r.lo)}, ${fmt.signed(r.hi)}]`;
      return `${fmt.signedPct(r.estimate)} [${fmt.signedPct(r.lo, 0)}, ${fmt.signedPct(r.hi, 0)}]`;
    };
    const conv = (v) => (isEng ? 1 + v / 100 : v);
    const ticks = m.id === "visibility" ? [0.25, 0.5, 1, 2, 5, 10, 20].map((v) => ({ v, label: String(v) }))
      : isEng ? [-50, -25, 0, 50, 100, 200, 400, 800].map((p) => ({ v: 1 + p / 100, label: (p > 0 ? "+" : "") + p + "%" })) : null;
    C.forest($("#f-forest"), { title: m.question, log: m.log_axis, ref: m.id === "quality" ? 0 : 1, color, axisTitle: src.scale, ticks,
      fmtTick: (v) => (v === 0 ? "0" : fmt.signed(v, 1)),
      rows: rows.map((r) => ({ label: r.term, est: conv(r.estimate), lo: conv(r.lo), hi: conv(r.hi), sig: r.significant, bold: !r.is_city_effect,
        color: r.is_city_effect ? "#98a2b3" : color, value: ci(r) + (r.significant ? "" : " n.s."),
        tip: `${r.term}: ${ci(r)}, ${fmt.p(r.p)}${r.sd_units != null ? " · " + r.sd_units.toFixed(2) + " SD" : ""}${/Ghaziabad/.test(r.term) ? " · n = 25, not interpreted" : ""}` })) });
    $("#f-meta").textContent = `${src.population}, n = ${fmt.int(src.n)} · outcome: ${src.outcome} · ` +
      Object.entries(src.fit).map(([k, v]) => k + " " + v).join(" · ") + " · filled markers: p < .05; hollow: not significant · city effects relative to New Delhi.";
    $("#f-reading").innerHTML = `<strong>How to read this.</strong> ${esc(m.reading)}` + (isEng ? ` <br><strong>Votes are an engagement proxy</strong>, not a measure of satisfaction.` : "");
  }
  function renderPriceContrasts() {
    const q = findState.pc === "quality";
    const rows = FIND.price_contrasts;
    C.hbar($("#pc-chart"), { title: "Adjacent price-tier steps", valW: 80, labelW: 120,
      format: (v) => (q ? fmt.signed(v) : fmt.signedPct(v)),
      items: rows.map((r) => ({ label: r.step, value: q ? r.quality_points : r.engagement_pct, lo: q ? r.quality_lo : r.engagement_lo, hi: q ? r.quality_hi : r.engagement_hi,
        color: r.step === "Tier 2 to Tier 3" ? (q ? "#d2602a" : "#1d8a5a") : "#9aa6b8", bold: r.step === "Tier 2 to Tier 3",
        tip: `${r.step}: ${q ? fmt.signed(r.quality_points) + " rating points, " + fmt.p(r.quality_p) : fmt.signedPct(r.engagement_pct) + " (geometric mean of 1 + Votes), " + fmt.p(r.engagement_p)}` })),
      max: q ? 0.4 : 240 });
    $("#pc-note").textContent = FIND.price_contrast_note + (q ? "" : " The Tier 3 to Tier 4 engagement step is not significant (p = .074); its interval crosses zero.");
  }

  // ======================================================================= METHODOLOGY
  function renderMethodology() {
    $("#m-status").textContent = METH.dataset.status;
    C.hbar($("#m-funnel"), { title: "Sample construction", format: (v) => fmt.int(v), valW: 60,
      items: METH.funnel.map((f, i) => ({ label: f.step, value: f.n, color: ["#c3cad6", "#9aa6b8", "#14213d", "#d2602a", "#98a2b3"][i], tip: f.step + ": " + f.note })) });
    $("#m-threshold").innerHTML = `<strong>Rated and unrated observations.</strong> ${esc(METH.threshold_pattern.text)}`;
    const letters = { visibility: "V", quality: "Q", engagement: "E" };
    $("#m-outcomes").innerHTML = METH.outcomes.map((o) => `<div class="outcome-row"><div class="badge" style="background:${DIM_COLORS[o.dimension]}">${letters[o.dimension]}</div>
      <div><strong>${esc(o.name)}</strong>: ${esc(o.measure)}<br><span class="fine">${esc(o.population)} · ${esc(o.model)}</span></div></div>`).join("");
    $("#m-spec").textContent = METH.specification;
    $("#m-analyses").innerHTML = METH.analyses.map((a) => `<div><b>${esc(a.name)}</b>${esc(a.text)}</div>`).join("");
    $("#m-limitations").innerHTML = METH.limitations.map((a) => `<div><b>${esc(a.title)}</b>${esc(a.text)}</div>`).join("");
    $("#m-figures").innerHTML = METH.figures.map((f) => `<figure><a href="${esc(f.file)}" target="_blank" rel="noopener"><img src="${esc(f.file)}" alt="${esc(f.title)}"></a>
      <figcaption>${esc(f.title)}. Select to open full size.</figcaption></figure>`).join("");
    const P = SITE.provenance;
    $("#m-provenance").innerHTML = `<p class="fine">Generated by ${esc(P.generated_by)} on ${esc(P.generated_on)}. Raw restaurant-level data used: ${P.raw_data_used ? "yes" : "no"}. Models estimated: ${P.models_estimated ? "yes" : "no"}.</p>
      <ul class="prov-list">${P.inputs.map((i) => `<li>${esc(i.file)} · md5 ${esc(i.md5)}</li>`).join("")}</ul>`;
  }

  // ======================================================================= router + menu
  const VIEWS = ["overview", "cities", "localities", "extremes", "findings", "methodology"];
  function route() {
    const name = (location.hash.replace(/^#/, "").split("?")[0]) || "overview";
    const view = VIEWS.includes(name) ? name : "overview";
    $$(".view").forEach((v) => { v.hidden = v.dataset.view !== view; });
    $$(".site-nav a").forEach((a) => { if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    const nav = $("#site-nav"); nav.classList.remove("open"); $(".menu-toggle").setAttribute("aria-expanded", "false");
    const sec = $("#view-" + view);
    C.rerenderVisible(sec);
    if (view === "localities") writeLocHash();
    document.title = (view === "overview" ? "" : $("h1", sec).textContent + " · ") + "NCR Restaurant Benchmark Explorer";
    return sec;
  }
  let first = true;
  window.addEventListener("hashchange", () => {
    if (location.hash.startsWith("#localities?")) {
      // a pasted or edited deep link: apply it if it names a different unit or threshold
      const before = locState.id + "|" + locState.t;
      readLocHash();
      if (locState.id + "|" + locState.t !== before) {
        $$('input[name="threshold"]').forEach((r) => { r.checked = +r.value === locState.t; });
        locState.q = ""; $("#loc-search").value = "";
        refreshLocControls();
      }
      const sec = $("#view-localities"); if (!sec.hidden) return;
    }
    const sec = route();
    window.scrollTo(0, 0);
    if (!first) { const h = $("h1", sec); h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  });
  $(".menu-toggle").addEventListener("click", (e) => {
    const nav = $("#site-nav"); const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open); e.currentTarget.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { $("#site-nav").classList.remove("open"); $(".menu-toggle").setAttribute("aria-expanded", "false"); }
  });

  renderOverview();
  initCities();
  initLocalities();
  initExtremes();
  initFindings();
  renderMethodology();
  route();
  first = false;
})();
