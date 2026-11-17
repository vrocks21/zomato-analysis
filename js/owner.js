/* NCR Restaurant Intelligence, Restaurant Owner mode: guided wizard, diagnostic dashboard, printable report.
   All computation is delegated to js/engine.js. The profile lives only in this tab (memory + sessionStorage). */
(function () {
  "use strict";
  const E = window.NCRIEngine, F = E.F, esc = (s) => window.NCR.esc(s), G = window.NCRGlossary;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KEY = "ncri.session.v1";
  const DIMC = { visibility: "#2f6db5", quality: "#d2602a", engagement: "#1d8a5a", positioning: "#6b4fa0", local: "#8a6a00" };
  const DIML = { visibility: "Visibility", quality: "Perceived quality", engagement: "Engagement", positioning: "Positioning", local: "Local benchmarking" };
  const STEPS = ["Restaurant profile", "Operations", "Priorities", "Review"];
  const BLANK = { name: "", city: "", locality_id: "", price: null, cuisines: [], rating: "", votes: "", cost: "", delivery: null, booking: null, multi_outlet: null, goals: [], threshold: 30 };
  let D, EV, ix, profile = Object.assign({}, BLANK, { cuisines: [], goals: [] }), step = 1, diag = null, geoMetric = "rating";

  // ------------------------------------------------------------------ session storage (per-tab convenience only)
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ profile, step, generated: !!diag })); } catch (e) { /* storage unavailable: memory only */ } }
  function restore() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (s && s.profile) { profile = Object.assign({}, BLANK, s.profile); step = Math.min(4, Math.max(1, s.step || 1)); return !!s.generated; }
    } catch (e) { /* ignore */ }
    return false;
  }
  function clearAll() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    profile = Object.assign({}, BLANK, { cuisines: [], goals: [] }); step = 1; diag = null;
    fillWizard(); renderStep();
  }

  // ------------------------------------------------------------------ wizard
  function initWizard() {
    const cities = D.cities;
    $("#f-city").innerHTML = `<option value="">Select a city</option>` + cities.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} · ${F.int(c.n_restaurants)} restaurants in the data</option>`).join("");
    $("#f-city").addEventListener("change", (e) => { profile.city = e.target.value; profile.locality_id = ""; $("#f-loc-search").value = ""; fillLocalities(); clearErr("city"); save(); });
    $("#f-loc-search").addEventListener("input", fillLocalities);
    $("#f-locality").addEventListener("change", (e) => { profile.locality_id = e.target.value; locInfo(); clearErr("locality_id"); save(); });
    // price tier cards with the NCR median cost for two (aggregated, from ncr_price groups)
    $("#f-price").innerHTML = [1, 2, 3, 4].map((t) => {
      const g = D.peer_groups.ncr_price.groups[String(t)];
      return `<label class="tier-card"><input type="radio" name="price" value="${t}"><span class="tc-in"><b>Tier ${t}</b>
        <span class="tc-cost">${F.inr(g.metrics.cost_for_two.median)}</span><span class="tc-sub">typical cost for two · ${F.int(g.n_restaurants)} NCR restaurants</span>
        <span class="tc-dots" aria-hidden="true">${"₹".repeat(t)}</span></span></label>`;
    }).join("");
    $$('input[name="price"]').forEach((r) => r.addEventListener("change", () => { profile.price = +r.value; clearErr("price"); save(); }));
    // cuisines
    $("#f-cuisine-search").addEventListener("input", fillCuisineOptions);
    $("#f-cuisine-options").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tag]"); if (!b) return;
      const t = b.dataset.tag;
      if (profile.cuisines.includes(t)) profile.cuisines = profile.cuisines.filter((x) => x !== t);
      else if (profile.cuisines.length < 8) profile.cuisines.push(t);
      fillCuisineSelected(); fillCuisineOptions(); save();
    });
    $("#f-cuisines-selected").addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]"), up = e.target.closest("[data-up]");
      if (rm) profile.cuisines = profile.cuisines.filter((x) => x !== rm.dataset.rm);
      if (up) profile.cuisines = [up.dataset.up].concat(profile.cuisines.filter((x) => x !== up.dataset.up));
      if (rm || up) { fillCuisineSelected(); fillCuisineOptions(); save(); }
    });
    // numbers
    ["name", "rating", "votes", "cost"].forEach((k) => $("#f-" + k).addEventListener("input", (e) => { profile[k] = e.target.value; clearErr(k); save(); }));
    // yes / no / not sure
    $$(".yn").forEach((box) => {
      const k = box.dataset.field;
      box.insertAdjacentHTML("beforeend", `<div class="segmented sm" role="radiogroup" aria-labelledby="l-${k}">
        ${[["yes", "Yes"], ["no", "No"], ["", "Not sure / skip"]].map(([v, l]) => `<label><input type="radio" name="yn-${k}" value="${v}"><span>${l}</span></label>`).join("")}</div>`);
      $$(`input[name="yn-${k}"]`, box).forEach((r) => r.addEventListener("change", () => { profile[k] = r.value || null; save(); }));
    });
    // goals
    $("#f-goals").innerHTML = Object.entries(E.GOALS).map(([id, g]) => `<button type="button" class="goal-card" data-goal="${id}" aria-pressed="false" style="--gc:${DIMC[g.dim]}">
      <span class="goal-rank" aria-hidden="true"></span><span class="goal-t">${esc(g.label)}</span><span class="goal-d">${esc(goalDesc(id))}</span></button>`).join("");
    $$(".goal-card").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.goal;
      profile.goals = profile.goals.includes(id) ? profile.goals.filter((x) => x !== id) : profile.goals.concat([id]);
      fillGoals(); save();
    }));
    $$('input[name="threshold"]').forEach((r) => r.addEventListener("change", () => { profile.threshold = +r.value; renderReview(); save(); }));
    $("#w-back").addEventListener("click", () => go(step - 1));
    $("#w-next").addEventListener("click", () => { if (step < 4) { if (validStep(step)) go(step + 1); } else generate(); });
    $("#wizard").addEventListener("submit", (e) => e.preventDefault());
  }
  function goalDesc(id) {
    return { visibility: "Get a published rating and be found. Compared with rating-publication shares.",
      quality: "Understand how your rating compares with similar rated restaurants.",
      engagement: "Understand how your vote count compares. Votes measure interaction, not satisfaction.",
      positioning: "See how your price tier and cost for two sit against local and peer restaurants.",
      local: "Use your locality, not city-wide averages, as the main reference point." }[id];
  }
  function fillWizard() {
    $("#f-city").value = profile.city || "";
    $("#f-name").value = profile.name || ""; $("#f-rating").value = profile.rating ?? ""; $("#f-votes").value = profile.votes ?? ""; $("#f-cost").value = profile.cost ?? "";
    $$('input[name="price"]').forEach((r) => { r.checked = +r.value === +profile.price; });
    ["delivery", "booking", "multi_outlet"].forEach((k) => $$(`input[name="yn-${k}"]`).forEach((r) => { r.checked = (r.value || null) === (profile[k] || null); }));
    $$('input[name="threshold"]').forEach((r) => { r.checked = +r.value === +profile.threshold; });
    fillLocalities(); fillCuisineSelected(); fillCuisineOptions(); fillGoals();
  }
  function fillLocalities() {
    const sel = $("#f-locality"), q = window.NCRFilters.norm($("#f-loc-search").value);
    if (!profile.city) { sel.innerHTML = `<option value="" disabled>Select a city first</option>`; sel.disabled = true; $("#f-loc-search").disabled = true; locInfo(); return; }
    sel.disabled = false; $("#f-loc-search").disabled = false;
    const units = D.locality_index.filter((u) => u.city === profile.city).sort((a, b) => a.locality.localeCompare(b.locality));
    const shown = units.filter((u) => !q || q.split(" ").every((t) => window.NCRFilters.norm(u.locality).includes(t)));
    sel.innerHTML = `<option value="__none__">My locality is not listed</option>` +
      shown.map((u) => `<option value="${esc(u.id)}">${esc(u.locality)} · ${u.n_restaurants} restaurant${u.n_restaurants === 1 ? "" : "s"}</option>`).join("");
    if (profile.locality_id && (profile.locality_id === "__none__" || shown.some((u) => u.id === profile.locality_id))) sel.value = profile.locality_id;
    else sel.selectedIndex = -1;
    locInfo(shown.length, units.length);
  }
  function locInfo(nShown, nAll) {
    const el = $("#f-loc-info");
    const u = profile.locality_id && profile.locality_id !== "__none__" ? ix.locIndex[profile.locality_id] : null;
    const list = nShown != null ? `${nShown} of ${nAll} ${profile.city} localities shown. ` : "";
    if (profile.locality_id === "__none__") { el.innerHTML = list + "No locality benchmark will be shown; city, NCR and peer comparisons still apply."; return; }
    if (!u) { el.textContent = profile.city ? list + "Select your locality from the list." : ""; return; }
    const at = [20, 30, 50].filter((t) => u.n_restaurants >= t);
    el.innerHTML = list + `<b>${esc(u.locality)}</b>: ${u.n_restaurants} restaurants (${u.n_rated} rated) in the historical data. ` +
      (u.n_restaurants >= 30 ? `<span class="ok-t">Locality benchmark available.</span>` : at.length ? `<span class="warn-t">Below the primary 30-restaurant threshold; available only under the 20+ sensitivity threshold.</span>` :
        `<span class="warn-t">Too few restaurants for a locality benchmark; city, NCR and peer comparisons will be used.</span>`) +
      (u.n_restaurants >= 20 && u.n_rated < 20 ? " Rating statistics need 20+ rated restaurants and will not be shown for this locality." : "");
  }
  function fillCuisineSelected() {
    const el = $("#f-cuisines-selected");
    el.innerHTML = profile.cuisines.length ? profile.cuisines.map((t, i) => `<span class="chip sel${i === 0 ? " primary" : ""}">${i === 0 ? '<span class="chip-k">Peer cuisine</span>' : `<button type="button" class="chip-up" data-up="${esc(t)}" aria-label="Use ${esc(t)} as peer cuisine" title="Use as peer cuisine">↑</button>`}${esc(t)}<button type="button" class="chip-x" data-rm="${esc(t)}" aria-label="Remove ${esc(t)}">×</button></span>`).join("")
      : `<span class="fine">No cuisine selected. Cuisine peer groups and the cuisine-breadth comparison need at least one.</span>`;
  }
  function fillCuisineOptions() {
    const q = window.NCRFilters.norm($("#f-cuisine-search").value);
    let list = D.cuisines.filter((c) => !q || window.NCRFilters.norm(c.tag).includes(q));
    if (!q) list = list.slice(0, 24);
    $("#f-cuisine-options").innerHTML = list.map((c) => `<button type="button" role="option" class="chip opt" data-tag="${esc(c.tag)}" aria-selected="${profile.cuisines.includes(c.tag)}">${esc(c.tag)} <small>${F.int(c.n_ncr)}</small></button>`).join("") +
      (!q ? `<span class="fine">Showing the 24 most common tags. Search to see all ${D.cuisines.length}.</span>` : !list.length ? `<span class="fine">No matching tag.</span>` : "");
  }
  function fillGoals() {
    $$(".goal-card").forEach((b) => { const i = profile.goals.indexOf(b.dataset.goal); b.setAttribute("aria-pressed", String(i >= 0)); $(".goal-rank", b).textContent = i >= 0 ? i + 1 : ""; });
  }
  function clearErr(k) { const e = $("#e-" + k); if (e) e.textContent = ""; }
  function showErrs(errs) { Object.entries(errs).forEach(([k, m]) => { const e = $("#e-" + k); if (e) e.textContent = m; }); }
  const STEP_FIELDS = { 1: ["city", "locality_id", "price", "cuisines"], 2: ["rating", "votes", "cost"], 3: [], 4: [] };
  function validStep(s) {
    const v = E.validateProfile(profile, D);
    const errs = Object.fromEntries(Object.entries(v.errors).filter(([k]) => STEP_FIELDS[s].includes(k)));
    STEP_FIELDS[s].forEach(clearErr); showErrs(errs);
    if (Object.keys(errs).length) { const first = $("#e-" + Object.keys(errs)[0]); if (first) first.scrollIntoView({ block: "center", behavior: "smooth" }); return false; }
    return true;
  }
  function go(s) {
    if (s < 1 || s > 4) return;
    if (s > step) { for (let i = step; i < s; i++) if (!validStep(i)) { step = i; renderStep(); return; } }
    step = s; renderStep(); save();
    const h = $(`.w-step[data-step="${s}"] .w-legend`); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: false }); }
  }
  function renderStep() {
    $$(".w-step").forEach((f) => { f.hidden = +f.dataset.step !== step; });
    $("#stepper").innerHTML = STEPS.map((t, i) => {
      const n = i + 1, st = n < step ? "done" : n === step ? "current" : "todo";
      return `<li class="${st}"><button type="button" data-go="${n}" ${n === step ? 'aria-current="step"' : ""}><span class="sn">${n < step ? "✓" : n}</span><span class="st">${t}</span></button></li>`;
    }).join("");
    $$("#stepper [data-go]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.go)));
    $("#w-back").hidden = step === 1;
    $("#w-next").innerHTML = step < 4 ? "Continue →" : "Generate my diagnostic →";
    $("#w-count").textContent = `Step ${step} of 4`;
    if (step === 4) renderReview();
  }
  function renderReview() {
    const v = E.validateProfile(profile, D), p = v.profile;
    const u = p.locality_id && p.locality_id !== "__none__" ? ix.locIndex[p.locality_id] : null;
    const row = (k, val, s) => `<div class="rv-row"><dt>${k}</dt><dd>${val}</dd><dd class="rv-edit"><button type="button" class="link" data-go="${s}">Edit</button></dd></div>`;
    const nv = (x, f) => (x == null ? '<span class="muted">Not provided</span>' : esc(f ? f(x) : x === "yes" ? "Yes" : x === "no" ? "No" : x));
    $("#review-summary").innerHTML = `<dl class="rv">` +
      row("Name", p.name ? esc(p.name) : '<span class="muted">Not provided (report titled “Your restaurant”)</span>', 1) +
      row("Location", u ? esc(u.locality + ", " + u.city) : p.locality_id === "__none__" ? esc(p.city) + " · locality not listed" : '<span class="err-t">Missing</span>', 1) +
      row("Price tier", p.price ? "Tier " + p.price : '<span class="err-t">Missing</span>', 1) +
      row("Cuisines", p.cuisines.length ? esc(p.cuisines.join(", ")) + ` <span class="muted">(peer cuisine: ${esc(p.cuisines[0])})</span>` : '<span class="muted">Not provided</span>', 1) +
      row("Rating", p.rating == null ? '<span class="muted">Not provided</span>' : p.rating === 0 ? "0 (no published rating)" : F.rating(p.rating), 2) +
      row("Votes", nv(p.votes, F.int), 2) + row("Cost for two", nv(p.cost, F.inr), 2) +
      row("Online delivery", nv(p.delivery), 2) + row("Table booking", nv(p.booking), 2) + row("Multi-outlet", nv(p.multi_outlet), 2) +
      row("Priorities", p.goals.length ? p.goals.map((g, i) => `${i + 1}. ${esc(E.GOALS[g].short)}`).join(" · ") : '<span class="muted">None selected (all applicable suggestions)</span>', 3) + `</dl>`;
    $$("#review-summary [data-go]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.go)));
    const errs = Object.values(v.errors);
    $("#w-warnings").innerHTML = (errs.length ? `<div class="o-note err"><b>Please fix before generating:</b><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "") +
      (v.warnings.length ? `<div class="o-note warn"><b>Please check:</b><ul>${v.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : "");
  }
  function generate() {
    const v = E.validateProfile(profile, D);
    if (!v.ok) { renderReview(); showErrs(v.errors); const k = Object.keys(v.errors)[0]; go(STEP_FIELDS[1].includes(k) ? 1 : STEP_FIELDS[2].includes(k) ? 2 : 4); return; }
    diag = E.buildDiagnostic(profile, D, EV);
    save();
    location.hash = "#results";
  }

  // ------------------------------------------------------------------ charts (native SVG)
  function scaleFor(kind, q, owner) {
    if (kind === "rating") return { min: 1.5, max: 5, f: (v) => v, fmt: F.rating, ticks: [2, 3, 4, 5] };
    if (kind === "breadth") return { min: 0, max: 8, f: (v) => v, fmt: (v) => String(Math.round(v * 10) / 10), ticks: [0, 2, 4, 6, 8] };
    if (kind === "inr") { const mx = Math.max(q.p90 * 1.25, (owner || 0) * 1.1, 500); return { min: 0, max: mx, f: (v) => v, fmt: F.inr, ticks: [0, mx / 2, mx].map((v) => Math.round(v / 100) * 100) }; }
    const mx = Math.max(q.p90 * 1.4, (owner || 0) * 1.15, 20);
    return { min: 0, max: Math.log1p(mx), f: (v) => Math.log1p(Math.max(0, v)), fmt: F.votes, log: true, ticks: [0, 10, 100, 1000, 10000].filter((t) => Math.log1p(t) <= Math.log1p(mx)) };
  }
  // Responsive HTML/CSS charts (percent positioning), so labels never distort at any width.
  function rangeSVG(o) {
    // o: { q, owner, kind, color, label, small }
    const S = scaleFor(o.kind, o.q, o.owner), q = o.q;
    const X = (v) => Math.max(0, Math.min(100, 100 * (S.f(v) - S.min) / ((S.max - S.min) || 1)));
    const span = (cls, a, b2, tip) => `<span class="${cls}" style="left:${X(a)}%;width:${Math.max(0.8, X(b2) - X(a))}%" data-tip="${esc(tip)}" tabindex="0"></span>`;
    let h = `<span class="rb-track"></span>` + span("rb-p80", q.p10, q.p90, `Middle 80% of the group: ${S.fmt(q.p10)} to ${S.fmt(q.p90)}`) +
      span("rb-p50", q.p25, q.p75, `Middle half of the group: ${S.fmt(q.p25)} to ${S.fmt(q.p75)}`) +
      `<span class="rb-med" style="left:${X(q.median)}%" data-tip="Median: ${esc(S.fmt(q.median))}" tabindex="0"></span>`;
    if (o.owner != null) h += `<span class="rb-you" style="left:${X(o.owner)}%" data-tip="Your entry: ${esc(S.fmt(o.owner))}" tabindex="0"></span>`;
    if (!o.small) {
      h += `<span class="rb-mlab" style="left:${X(q.median)}%">median ${esc(S.fmt(q.median))}</span>`;
      h += `<span class="rb-ticks">${S.ticks.map((t) => `<i style="left:${X(t)}%">${esc(S.fmt(t))}</i>`).join("")}</span>`;
    }
    return `<div class="rb${o.small ? " sm" : ""}" style="--c:${o.color}" role="img" aria-label="${esc(o.label || "Distribution")}: median ${esc(S.fmt(q.median))}, middle half ${esc(S.fmt(q.p25))} to ${esc(S.fmt(q.p75))}${o.owner != null ? ", your entry " + esc(S.fmt(o.owner)) : ""}${S.log ? " (log scale)" : ""}">${h}</div>`;
  }
  function shareSVG(o) {
    // o: { value, lo, hi, color, label }
    let h = `<span class="sb-fill" style="width:${Math.max(0.8, o.value)}%" data-tip="${esc(o.label)}: ${F.pct(o.value, 1)}${o.lo != null ? " (95% CI " + F.pct(o.lo, 1) + "–" + F.pct(o.hi, 1) + ")" : ""}" tabindex="0"></span>`;
    if (o.lo != null && o.hi != null) h += `<span class="sb-ci" style="left:${o.lo}%;width:${Math.max(0.4, o.hi - o.lo)}%"></span>`;
    h += `<span class="sb-half"></span>`;
    return `<div class="sb" style="--c:${o.color}" role="img" aria-label="${esc(o.label)}: ${F.pct(o.value, 1)}${o.lo != null ? ", 95% CI " + F.pct(o.lo, 1) + " to " + F.pct(o.hi, 1) : ""}"><div class="sb-in">${h}</div><span class="sb-val">${F.pct(o.value, 1)}</span></div>`;
  }
  function mixSVG(mix, ownerTier) {
    const cols = ["#d9dee7", "#9aa6b8", "#4a5d7e", "#14213d"], tc = ["#1b2433", "#1b2433", "#fff", "#fff"];
    return `<div class="mb" role="img" aria-label="Price-tier mix: ${[1, 2, 3, 4].map((t) => "Tier " + t + " " + Math.round(mix["tier" + t]) + "%").join(", ")}">${[1, 2, 3, 4].map((t, i) => {
      const w = mix["tier" + t] || 0;
      return w > 0 ? `<span class="${t === ownerTier ? "mine" : ""}" style="width:${w}%;background:${cols[i]};color:${tc[i]}" data-tip="Tier ${t}: ${F.pct(w, 1)}" tabindex="0">${w >= 9 ? `T${t} ${Math.round(w)}%` : ""}</span>` : "";
    }).join("")}</div>`;
  }

  // ------------------------------------------------------------------ dashboard helpers
  const pill = (txt, cls) => `<span class="pill2 ${cls || ""}">${esc(txt)}</span>`;
  const dirPill = (d) => ({ below: pill("Below median", "below"), above: pill("Above median", "above"), at: pill("At median", "at"), within: pill("Within middle half", "at"),
    differs: pill("Differs from most", "differs"), similar: pill("Similar to most", "similar") }[d] || "");
  const evChip = (k) => `<span class="ev-chip ev-${k}" title="${esc(E.EVIDENCE[k].text)}">${esc(E.EVIDENCE[k].label)}</span>`;
  const popTag = (c) => `<span class="pop-tag">${esc(c.population)} · n = ${F.int(c.denominator)}</span>`;
  function levelOf(level) { return diag.geo.find((g) => g.level === level); }
  function firstGeoWith(metric) {
    for (const g of diag.geo) {
      if (!g.available) continue;
      const c = g.comparisons.find((x) => x.metric === metric);
      if (c && !c.unavailable) return { g, c };
    }
    return null;
  }

  // ------------------------------------------------------------------ results
  function renderResults() {
    const has = !!diag;
    $("#results-empty").hidden = has; $("#results-body").hidden = !has;
    if (!has) return;
    const p = diag.profile, dv = diag.derived;
    const u = p.locality_id !== "__none__" ? ix.locIndex[p.locality_id] : null;
    $("#h-results").textContent = (p.name ? p.name : "Your restaurant") + ": diagnostic";
    $("#r-chips").innerHTML = [u ? u.locality : "Locality not listed", p.city, "Tier " + p.price, p.cuisines[0] || null, p.threshold !== 30 ? `Locality threshold ${p.threshold}+` : null]
      .filter(Boolean).map((t) => `<span class="r-chip">${esc(t)}</span>`).join("");
    $("#r-caveat").innerHTML = `<div class="o-note info"><b>Historical reference benchmarks.</b> ${esc(diag.caveats.historical)}
      <details><summary>Can my own restaurant be in the data?</summary><p>${esc(diag.caveats.entry)}</p></details></div>`;
    $("#r-warnings").innerHTML = diag.warnings.length ? `<div class="o-note warn"><b>Please check your entries:</b><ul>${diag.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : "";
    renderOverview(); renderSnapshot(); renderGeo(); renderPeers(); renderOpps(); renderPlan();
  }

  function renderOverview() {
    const p = diag.profile, dv = diag.derived;
    const u = p.locality_id !== "__none__" ? ix.locIndex[p.locality_id] : null;
    const cell = (k, v, miss, note) => `<div class="ov-cell${miss ? " miss" : ""}"><span class="ov-k">${k}</span><span class="ov-v">${v}</span>${note ? `<span class="ov-n">${note}</span>` : ""}</div>`;
    const yn = (v) => (v == null ? "Not provided" : v === "yes" ? "Yes" : "No");
    $("#mod-overview").innerHTML = `<div class="ov-grid">
      ${cell("Location", esc(u ? u.locality : "Locality not listed") + "<br><small>" + esc(p.city) + "</small>", false, u ? `${u.n_restaurants} restaurants in the data` : "No matching locality unit")}
      ${cell("Price tier", "Tier " + p.price, false, "Platform price range 1–4")}
      ${cell("Cuisine", p.cuisines.length ? esc(p.cuisines.join(", ")) : "Not provided", !p.cuisines.length, p.cuisines.length ? `${p.cuisines.length} tag${p.cuisines.length > 1 ? "s" : ""} · peer cuisine ${esc(p.cuisines[0])}` : "")}
      ${cell("Rating", dv.rating_status === "published" ? F.rating(p.rating) : dv.rating_status === "not_published" ? "No published rating" : "Not provided", dv.rating_status === "unknown", dv.rating_status === "not_published" ? "0 means not published, not zero quality" : "")}
      ${cell("Votes", p.votes == null ? "Not provided" : F.int(p.votes), p.votes == null, p.votes != null ? "Interaction, not satisfaction" : "")}
      ${cell("Cost for two", p.cost == null ? "Not provided" : F.inr(p.cost), p.cost == null)}
      ${cell("Online delivery", yn(p.delivery), p.delivery == null)}
      ${cell("Table booking", yn(p.booking), p.booking == null)}
      ${cell("Multi-outlet", yn(p.multi_outlet), p.multi_outlet == null, p.multi_outlet === "yes" ? "Self-reported; not the research's chain proxy" : "")}
      ${cell("Priorities", p.goals.length ? p.goals.map((g, i) => `${i + 1}. ${esc(E.GOALS[g].short)}`).join("<br>") : "None selected", !p.goals.length)}
    </div>` + (diag.missing.length ? `<p class="ov-missing"><b>Not provided:</b> ${esc(diag.missing.join(", "))}. Comparisons that need these items are skipped. <a href="#diagnose" data-edit-step="2">Add them</a>.</p>` : `<p class="ov-missing ok">All optional fields were provided.</p>`) +
      `<p class="fine">Entered by you; not verified against live Zomato data.</p>`;
  }

  function renderSnapshot() {
    const items = [["visibility", "Rating visibility"], ["rating", "Rating"], ["votes", "Votes"], ["price_tier", "Price positioning"], ["cost", "Cost for two"],
      ["delivery", "Delivery profile"], ["booking", "Booking profile"], ["multi_outlet", "Chain-related profile"], ["breadth", "Cuisine tags"]];
    $("#mod-snapshot").innerHTML = `<div class="snap-grid">` + items.map(([m, title]) => {
      const hit = firstGeoWith(m);
      if (!hit) {
        const any = diag.geo.find((g) => g.available);
        const c = any && any.comparisons.find((x) => x.metric === m);
        return `<div class="snap na"><div class="snap-h"><span>${title}</span></div><p class="snap-na">No reference group with enough data.</p>${c && c.reason ? `<p class="fine">${esc(c.reason)}</p>` : ""}</div>`;
      }
      const { g, c } = hit;
      const color = DIMC[c.dimension];
      let viz = "";
      if (c.dist) viz = rangeSVG({ q: c.dist, owner: c.owner, kind: c.scale, color, label: c.label + " in " + g.title, small: true });
      else if (m === "price_tier") viz = mixSVG(c.mix, diag.profile.price);
      else viz = shareSVG({ value: c.ref_value, lo: c.ci && c.ci[0], hi: c.ci && c.ci[1], color, label: c.label + " in " + g.title });
      const status = c.position ? pill(c.position.short, c.gap === "below" ? "below" : c.gap === "above" ? "above" : "at") : c.differs != null && c.owner != null ? dirPill(c.differs ? "differs" : "similar") : "";
      return `<div class="snap" style="--dc:${color}"><div class="snap-h"><span>${title}</span>${status}</div>
        <div class="snap-v"><b>${esc(c.owner_display)}</b><span>you</span></div>
        <div class="snap-ref">vs ${esc(c.ref_stat)} <b>${esc(c.ref_display)}</b> in ${esc(g.title)}</div>${viz}
        <div class="snap-n">${esc(c.population)} · n = ${F.int(c.denominator)}${g.level !== "locality" && levelOf("locality") && !levelOf("locality").available ? " · locality not available" : ""}</div></div>`;
    }).join("") + `</div><p class="fine">Diamond: your entry. Shaded bars: middle half (darker) and middle 80% (lighter) of the reference group. Vertical line: median. Share bars show the percentage of restaurants, with 95% confidence intervals; the dashed line marks 50%.</p>`;
  }

  const GEO_METRICS = [["visibility", "Published rating"], ["rating", "Rating"], ["votes", "Votes"], ["cost", "Cost for two"], ["price_tier", "Price-tier mix"],
    ["delivery", "Delivery"], ["booking", "Table booking"], ["multi_outlet", "Chain profile"], ["breadth", "Cuisine tags"]];
  function renderGeo() {
    const lv = diag.geo;
    const cards = lv.map((g) => `<div class="lvl ${g.available ? "ok" : "no"}"><span class="lvl-k">${{ locality: "1 · Locality", city: "2 · City", ncr: "3 · Delhi NCR" }[g.level]}</span>
      <b>${esc(g.title)}</b><span class="lvl-n">${g.n_restaurants != null ? `${F.int(g.n_restaurants)} restaurants · ${F.int(g.n_rated)} rated` : "No matching unit"}</span>
      ${g.available ? `<span class="lvl-s ok-t">✓ Benchmark available</span>${g.rating_note ? `<span class="lvl-s warn-t">${esc(g.rating_note)}</span>` : ""}${g.threshold_note ? `<span class="lvl-s">${esc(g.threshold_note)}</span>` : ""}` : `<span class="lvl-s warn-t">Not available</span><span class="lvl-r">${esc(g.reason)}</span>`}</div>`).join("");
    $("#mod-geo").innerHTML = `<div class="lvl-grid">${cards}</div>
      <div class="metric-tabs" role="tablist" aria-label="Benchmark metric">${GEO_METRICS.map(([m, l]) => `<button type="button" role="tab" data-gm="${m}" aria-selected="${m === geoMetric}">${l}</button>`).join("")}</div>
      <div id="geo-chart" class="geo-chart" role="tabpanel"></div>`;
    $$("[data-gm]").forEach((b) => b.addEventListener("click", () => { geoMetric = b.dataset.gm; renderGeo(); }));
    const rows = lv.map((g) => {
      const title = `<div class="gr-l"><b>${esc(g.title)}</b><small>${{ locality: "Locality", city: "City", ncr: "Delhi NCR" }[g.level]}</small></div>`;
      if (!g.available) return `<div class="gr na">${title}<div class="gr-c"><span class="na-t">Not available. ${esc(g.reason)}</span></div></div>`;
      const c = g.comparisons.find((x) => x.metric === geoMetric);
      if (!c || c.unavailable) return `<div class="gr na">${title}<div class="gr-c"><span class="na-t">Not available. ${esc(c ? c.reason : "")}</span></div></div>`;
      const color = DIMC[c.dimension];
      const viz = c.dist ? rangeSVG({ q: c.dist, owner: c.owner, kind: c.scale, color, label: c.label + " in " + g.title })
        : geoMetric === "price_tier" ? mixSVG(c.mix, diag.profile.price) : shareSVG({ value: c.ref_value, lo: c.ci && c.ci[0], hi: c.ci && c.ci[1], color, label: c.label + " in " + g.title });
      return `<div class="gr">${title}<div class="gr-c">${viz}<p class="gr-p">${esc(c.plain)}</p><p class="gr-pop">${popTag(c)}${c.ci && c.ci[0] != null ? ` <span class="fine">95% CI ${F.pct(c.ci[0], 1)}–${F.pct(c.ci[1], 1)}</span>` : ""}${c.dist ? ` <span class="fine">10th–90th percentile ${esc(fmtQ(c, c.dist.p10))}–${esc(fmtQ(c, c.dist.p90))}</span>` : ""}</p></div></div>`;
    }).join("");
    const any = lv.map((g) => g.available && g.comparisons.find((x) => x.metric === geoMetric)).find((c) => c && !c.unavailable);
    $("#geo-chart").innerHTML = rows + (any ? `<div class="o-note small"><b>About this metric.</b> ${esc(any.note)} ${geoMetric === "votes" ? G.q("log-outcome", "Why votes are skewed") : ""}</div>` : "") +
      (geoMetric === "price_tier" ? `<p class="fine">Orange outline: your tier (Tier ${diag.profile.price}).</p>` : "");
  }
  function fmtQ(c, v) { return c.scale === "rating" ? F.rating(v) : c.scale === "inr" ? F.inr(v) : F.votes(v); }

  function renderPeers() {
    const P = diag.peers;
    const icon = (r) => (r === P.primary ? "●" : r.status === "available" ? "✓" : r.status === "not_applicable" ? "–" : "✕");
    const ladder = P.rungs.map((r, i) => `<li class="rung ${r === P.primary ? "used" : r.status}"><span class="rg-i" aria-hidden="true">${icon(r)}</span>
      <div><b>${i + 1}. ${esc(r.title)}</b><span class="rg-n">${r.n_restaurants != null ? `${F.int(r.n_restaurants)} restaurants · ${F.int(r.n_rated)} rated` : ""}</span>
      <span class="rg-s">${r === P.primary ? "Used for peer comparisons" : r.status === "available" ? "Eligible (broader than the group used)" : esc(r.reason)}</span>
      ${r === P.primaryRating && r !== P.primary ? `<span class="rg-s ok-t">Used for rating comparisons</span>` : ""}${r.status === "available" && !r.rating_available ? `<span class="rg-s warn-t">${esc(r.rating_reason)}</span>` : ""}</div></li>`).join("");
    let detail = "";
    if (P.primary) {
      const show = ["rating", "votes", "visibility", "cost", "delivery", "booking", "multi_outlet", "breadth"];
      const src = (m) => ((m === "rating" || (m === "votes" && diag.derived.engagement_population === "rated")) && P.primaryRating ? P.primaryRating : P.primary);
      detail = `<div class="peer-card"><div class="pc-h"><div><span class="o-eyebrow">Peer group used</span><h3>${esc(P.primary.title)}</h3>
          <p class="fine">Shared characteristics: ${esc(P.primary.characteristics.join(" · "))}. ${F.int(P.primary.n_restaurants)} restaurants, ${F.int(P.primary.n_rated)} rated.</p></div></div>
        <div class="pc-rows">${show.map((m) => {
          const grp = src(m), c = (grp.comparisons || []).find((x) => x.metric === m);
          if (!c) return "";
          if (c.unavailable) return `<div class="pc-row na"><span class="pc-l">${esc(c.label)}</span><span class="na-t">${esc(c.reason)}</span></div>`;
          const color = DIMC[c.dimension];
          const viz = c.dist ? rangeSVG({ q: c.dist, owner: c.owner, kind: c.scale, color, label: c.label, small: true }) : shareSVG({ value: c.ref_value, lo: c.ci && c.ci[0], hi: c.ci && c.ci[1], color, label: c.label });
          const st = c.position ? pill(c.position.short, c.gap === "below" ? "below" : c.gap === "above" ? "above" : "at") : c.differs != null && c.owner != null ? dirPill(c.differs ? "differs" : "similar") : "";
          return `<div class="pc-row"><span class="pc-l">${esc(c.label)}<small>${esc(grp === P.primary ? "" : "group: " + grp.title)}</small></span><span class="pc-you">${esc(c.owner_display)}</span>
            <span class="pc-ref">${esc(c.ref_stat)}: <b>${esc(c.ref_display)}</b></span><span class="pc-viz">${viz}</span><span class="pc-st">${st}</span><span class="pc-n">${esc(c.population)} · n = ${F.int(c.denominator)}</span></div>`;
        }).join("")}</div></div>`;
    } else detail = `<div class="empty-state"><strong>No similar-restaurant comparison is available.</strong>No peer group in the ladder has at least ${E.MIN_PEER_N} restaurants.</div>`;
    const supp = P.supplementary.length ? `<details class="o-details"><summary>Other peer groups (${P.supplementary.length})</summary><ul class="supp">${P.supplementary.map((r) => `<li><b>${esc(r.title)}</b>: ${r.status === "available" ? `${F.int(r.n_restaurants)} restaurants, ${F.int(r.n_rated)} rated` + (() => {
        const rc = (r.comparisons || []).find((x) => x.metric === "rating"), vc = (r.comparisons || []).find((x) => x.metric === "visibility");
        return ` · published-rating share ${F.pct(vc.ref_value, 1)}` + (rc && !rc.unavailable ? ` · median rating ${F.rating(rc.ref_value)}` : " · rating statistics not available (fewer than 20 rated)");
      })() : esc(r.reason)}</li>`).join("")}</ul><p class="fine">Shown for context only; they do not replace the group used above.</p></details>` : "";
    $("#mod-peers").innerHTML = `<div class="peer-wrap"><div><h3 class="o-h4">How the peer group was chosen</h3><ol class="ladder">${ladder}</ol>
      <p class="fine">Rule: the first group in this order with at least ${E.MIN_PEER_N} restaurants is used. Rating comparisons also need at least ${E.MIN_RATED} rated restaurants. Thresholds are never lowered.</p>
      <p class="fine"><b>Why:</b> ${esc(P.choice)}${P.ratingChoice ? " " + esc(P.ratingChoice) : ""}</p></div>${detail}</div>${supp}
      <div class="o-note small"><b>What peers are and are not.</b> ${esc(P.caveat)}${P.cuisine_note ? " " + esc(P.cuisine_note) : ""}</div>
      ${diag.profile.multi_outlet != null ? `<div class="o-note small"><b>Chain comparisons.</b> ${esc(diag.caveats.chain)}</div>` : ""}`;
  }

  function renderOpps() {
    const ops = diag.opportunities;
    if (!ops.length) { $("#mod-opps").innerHTML = `<div class="empty-state"><strong>No comparison findings.</strong>Add your rating, votes, cost or services to compare them with the reference groups.</div>`; return; }
    const order = ["quality", "engagement", "visibility", "positioning"];
    const sorted = ops.slice().sort((a, b) => order.indexOf(a.dimension) - order.indexOf(b.dimension));
    $("#mod-opps").innerHTML = `<div class="opp-grid">${sorted.map((o) => `<div class="opp" style="--dc:${DIMC[o.dimension]}">
      <div class="opp-h"><span class="opp-d">${esc(DIML[o.dimension])}</span>${dirPill(o.direction)}</div>
      <p class="opp-t">${esc(o.headline)}</p><p class="opp-x">${esc(o.detail)}</p>
      <p class="opp-g">Reference: ${esc(o.group)} · n = ${F.int(o.n)}${o.descriptive_only ? " · descriptive only" : ""}</p></div>`).join("")}</div>
      <p class="fine">“Below median” means lower than the middle value of the reference group; half of any group is below its median. These differences describe where you stand, not why, and are not diagnoses.</p>`;
  }

  function techRows(s) {
    const M = EV.models, X = EV.extremes_adjusted_rating;
    const r = (lab, e, unit) => `<tr><td>${esc(lab)}</td><td class="num">${unit === "or" ? e.estimate.toFixed(2) : unit === "pts" ? F.signed(e.estimate) : F.signedPct(e.estimate)}</td><td class="num">[${unit === "or" ? e.lo.toFixed(2) + ", " + e.hi.toFixed(2) : unit === "pts" ? F.signed(e.lo) + ", " + F.signed(e.hi) : F.signedPct(e.lo, 0) + ", " + F.signedPct(e.hi, 0)}]</td><td class="num">${esc(F.p(e.p))}</td></tr>`;
    const term = { R2: "online_delivery", R3: "is_chain", R7: "n_cuisines" }[s.rule];
    if (!term) return "";
    const xo = X[term];
    return `<table class="tech"><thead><tr><th>Model (population)</th><th class="num">Estimate</th><th class="num">95% CI</th><th class="num">p</th></tr></thead><tbody>
      ${r("Visibility, odds ratio (all NCR, n = 7,947)", M.vis[term], "or")}${r("Perceived quality, rating points (rated NCR, n = 5,808)", M.qual[term], "pts")}
      ${r("Engagement, % difference in geometric mean of (1 + Votes) (rated NCR, n = 5,808)", M.eng[term], "pct")}
      <tr><td>Top- vs bottom-rated, adjusted odds ratio (679 vs 727)</td><td class="num">${xo.OR.toFixed(2)}</td><td class="num">[${xo.lo.toFixed(2)}, ${xo.hi.toFixed(2)}]</td><td class="num">${esc(F.p(xo.p))}</td></tr></tbody></table>
      <p class="fine">All models: online delivery, table booking, price tier, cuisine breadth, chain proxy and city fixed effects. OLS models use HC3 robust standard errors. Source: final research paper, Table 5 and Table 7; RESULTS/key_results.json. ${G.q("odds-ratio", "Odds ratio")} ${G.q("p-value", "p-value")} ${G.q("ci", "Confidence interval")}</p>`;
  }
  function renderPlan() {
    const S = diag.suggestions, p = diag.profile;
    const cards = S.map((s) => `<article class="sug" style="--dc:${DIMC[s.dimension]}"><div class="sug-h"><span class="sug-p">Priority ${s.priority}</span>${evChip(s.evidence)}
        ${s.goal_match.map((g) => `<span class="goal-tag">${esc(g)}</span>`).join("")}</div>
      <h3>${esc(s.title)}</h3>
      <div class="sug-b"><div><span class="sug-k">What we observed</span><p>${esc(s.observed)}</p></div>
        <div><span class="sug-k">What it means</span><p>${esc(s.meaning)}</p></div>
        <div class="consider"><span class="sug-k">What you could consider</span><p>${esc(s.consider)}</p></div></div>
      <details class="o-details"><summary>Evidence and limitations</summary><p><b>Evidence class:</b> ${esc(E.EVIDENCE[s.evidence].label)}. ${esc(E.EVIDENCE[s.evidence].text)}</p><p><b>Limitations:</b> ${esc(s.limits)}</p>${techRows(s)}<p class="fine">Rule ${esc(s.rule)} · see Recommendation_Rules.md.</p></details></article>`).join("");
    const none = !S.length ? `<div class="empty-state"><strong>No suggestion met its conditions.</strong>${p.goals.length ? "None of the documented rules applied to your entries and selected priorities." : "None of the documented rules applied to your entries."} This is a valid result: the tool never invents advice.${diag.missing.length ? " Adding " + esc(diag.missing.join(", ")) + " may make more comparisons possible." : ""}</div>` : "";
    const few = S.length && S.length < 3 ? `<p class="fine">Only ${S.length} suggestion${S.length > 1 ? "s" : ""} met ${S.length > 1 ? "their" : "its"} conditions. The tool does not pad the plan with generic advice.</p>` : "";
    const note = diag.notes.map((n) => `<div class="o-note small"><b>${esc(n.title)}</b> ${evChip(n.evidence)}<br>${esc(n.text)}</div>`).join("");
    const T = diag.trace;
    const RULES = { R1: "Rating below the rating peer median", R2: "No online delivery and visibility selected", R3: "Multi-outlet operation reported", R4: "Votes below the peer median",
      R5: "Price tier less common locally, or cost outside the middle half of peers", R7: "Fewer cuisine tags than peers, with visibility or engagement selected", R8: "Published rating resting on 4–25 votes, with quality or local benchmarking selected",
      R9: "No published rating (or 0–3 votes) and visibility selected", G1: "Local benchmarking selected and locality benchmark available" };
    $("#mod-plan").innerHTML = (cards ? `<div class="sug-list">${cards}</div>` : "") + none + few + note +
      `<details class="o-details"><summary>How these suggestions were chosen</summary>
        <p>Each suggestion comes from a fixed rule. A rule fires only when all its conditions are met by your entries and the benchmark comparisons. Fired rules are ordered by the rank of your priorities, then by whether a measured benchmark gap supports them, then by evidence class. At most five are shown. No numeric priority score and no overall restaurant score are calculated.</p>
        <ul>${Object.entries(RULES).map(([k, v]) => `<li><b>${k}</b> ${esc(v)}: ${T.triggered.includes(k) ? (T.outside_goals.includes(k) ? "conditions met, but not linked to your selected priorities" : T.beyond_cap.includes(k) ? "conditions met, beyond the five-suggestion limit" : "<span class='ok-t'>shown</span>") : "conditions not met"}</li>`).join("")}
        <li><b>R6</b> Table booking: never produces a suggestion (specification-sensitive); shown as a note.</li></ul></details>`;
  }

  // ------------------------------------------------------------------ printable report
  const REFS = [
    "Kumbhat, M., Mohit, Choudhary, T., & Rastogi, V. (2026). Visible, liked, or both? Understanding restaurant visibility, perceived quality and customer engagement on Zomato. Final research paper, Marketing Analytics Research Project, IIT Gandhinagar.",
    "Anderson, M., & Magruder, J. (2012). Learning from the crowd: Regression discontinuity estimates of the effects of an online review database. The Economic Journal, 122(563), 957–989.",
    "Hollenbeck, B. (2018). Online reputation mechanisms and the decreasing value of chain affiliation. Journal of Marketing Research, 55(5), 636–654.",
    "Luca, M. (2011). Reviews, reputation, and revenue: The case of Yelp.com (Harvard Business School Working Paper No. 12-016).",
    "van Doorn, J., Lemon, K. N., Mittal, V., Nass, S., Pick, D., Pirner, P., & Verhoef, P. C. (2010). Customer engagement behavior: Theoretical foundations and research directions. Journal of Service Research, 13(3), 253–266.",
    "Zeithaml, V. A. (1988). Consumer perceptions of price, quality, and value: A means-end model and synthesis of evidence. Journal of Marketing, 52(3), 2–22.",
    "Data source: Zomato restaurant listing dataset (zomato.csv) and Country-Code.xlsx; publicly circulated secondary data, undated. Aggregated by PHASE3_STAGE3/DATA_PIPELINE/build_diagnostic_data.py.",
  ];
  function renderReport() {
    const el = $("#report-doc");
    if (!diag) { el.innerHTML = `<h1 id="h-report">Restaurant diagnostic</h1><div class="empty-state"><strong>No diagnostic yet.</strong><a href="#diagnose">Generate one first.</a></div>`; return; }
    const p = diag.profile, dv = diag.derived, u = p.locality_id !== "__none__" ? ix.locIndex[p.locality_id] : null;
    const yn = (v) => (v == null ? "Not provided" : v === "yes" ? "Yes" : "No");
    const date = new Date(diag.generated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const cmpTable = (comps) => `<table class="rt"><thead><tr><th>Metric</th><th>You</th><th>Reference</th><th>Population · n</th><th>Position</th></tr></thead><tbody>${comps.map((c) => c.unavailable
      ? `<tr><td>${esc(c.label)}</td><td colspan="4" class="muted">Not available: ${esc(c.reason)}</td></tr>`
      : `<tr><td>${esc(c.label)}</td><td>${esc(c.owner_display)}</td><td>${esc(c.ref_stat)}: ${esc(c.ref_display)}${c.dist ? `<br><small>middle half ${esc(fmtQ(c, c.dist.p25))}–${esc(fmtQ(c, c.dist.p75))}</small>` : ""}${c.ci && c.ci[0] != null ? `<br><small>95% CI ${F.pct(c.ci[0], 1)}–${F.pct(c.ci[1], 1)}</small>` : ""}</td><td>${esc(c.population)} · ${F.int(c.denominator)}</td><td>${c.position ? esc(c.position.short) : c.differs != null && c.owner != null ? (c.differs ? "Differs from most" : "Similar to most") : "—"}</td></tr>`).join("")}</tbody></table>`;
    const geoSec = (g, n, t) => `<section class="rs-sec"><h2>${n}. ${t}</h2>${g.available ? `<p><b>${esc(g.title)}</b>: ${F.int(g.n_restaurants)} restaurants, ${F.int(g.n_rated)} rated.${g.threshold_note ? " " + esc(g.threshold_note) : ""}${g.rating_note ? " " + esc(g.rating_note) : ""}</p>${cmpTable(g.comparisons)}` : `<p class="muted">Not available. ${esc(g.reason)}</p>`}</section>`;
    const P = diag.peers;
    el.innerHTML = `<header class="rep-head"><div class="rep-brand"><span class="brand-mark" aria-hidden="true"><i class="v"></i><i class="q"></i><i class="e"></i></span>NCR Restaurant Intelligence</div>
        <h1 id="h-report">${esc(p.name || "Your restaurant")}: restaurant diagnostic</h1>
        <p class="rep-sub">${esc(u ? u.locality + ", " : "")}${esc(p.city)} · Tier ${p.price}${p.cuisines.length ? " · " + esc(p.cuisines.join(", ")) : ""} · generated ${esc(date)} in this browser</p>
        <p class="rep-warn">Historical research reference built from an undated Zomato listing snapshot. Not live Zomato data. Your entries are not verified. Associations, not causes.</p></header>
      <section class="rs-sec"><h2>1. Restaurant profile</h2><table class="rt kv"><tbody>
        <tr><th>Location</th><td>${esc(u ? u.locality : "Locality not listed")}, ${esc(p.city)}</td><th>Price tier</th><td>Tier ${p.price}</td></tr>
        <tr><th>Cuisines</th><td>${p.cuisines.length ? esc(p.cuisines.join(", ")) : "Not provided"}</td><th>Rating</th><td>${esc(dv.rating_status === "published" ? F.rating(p.rating) : dv.rating_status_label)}</td></tr>
        <tr><th>Votes</th><td>${p.votes == null ? "Not provided" : F.int(p.votes)}</td><th>Cost for two</th><td>${p.cost == null ? "Not provided" : F.inr(p.cost)}</td></tr>
        <tr><th>Online delivery</th><td>${yn(p.delivery)}</td><th>Table booking</th><td>${yn(p.booking)}</td></tr>
        <tr><th>Multi-outlet</th><td>${yn(p.multi_outlet)}</td><th>Locality threshold</th><td>${p.threshold}+ restaurants${p.threshold === 30 ? " (primary)" : ""}</td></tr></tbody></table>
        ${diag.missing.length ? `<p class="small">Not provided: ${esc(diag.missing.join(", "))}.</p>` : ""}${diag.warnings.length ? `<p class="small"><b>Entry checks:</b> ${esc(diag.warnings.join(" "))}</p>` : ""}</section>
      <section class="rs-sec"><h2>2. Selected goals</h2><p>${p.goals.length ? p.goals.map((g, i) => `${i + 1}. ${esc(E.GOALS[g].label)}`).join("; ") : "No priorities selected; all applicable suggestions were considered."}</p></section>
      ${geoSec(levelOf("locality"), 3, "Locality benchmark")}${geoSec(levelOf("city"), 4, "City benchmark")}${geoSec(levelOf("ncr"), 5, "Delhi NCR benchmark")}
      <section class="rs-sec"><h2>6. Similar restaurant peers</h2>
        <table class="rt"><thead><tr><th>Peer group</th><th>Restaurants · rated</th><th>Status</th></tr></thead><tbody>${P.rungs.map((r, i) => `<tr><td>${i + 1}. ${esc(r.title)}</td><td>${r.n_restaurants != null ? F.int(r.n_restaurants) + " · " + F.int(r.n_rated) : "—"}</td><td>${r === P.primary ? "<b>Used</b>" : r === P.primaryRating ? "Used for rating" : r.status === "available" ? "Eligible, broader" : esc(r.reason)}</td></tr>`).join("")}</tbody></table>
        <p class="small">${esc(P.choice)}${P.ratingChoice ? " " + esc(P.ratingChoice) : ""}</p>
        ${P.primary ? cmpTable(P.primary.comparisons.map((c) => (c.metric === "rating" || (c.metric === "votes" && dv.engagement_population === "rated")) && P.primaryRating && P.primaryRating !== P.primary ? P.primaryRating.comparisons.find((x) => x.metric === c.metric) : c)) : "<p>No peer group meets the minimum sample size.</p>"}
        <p class="small">${esc(P.caveat)}</p></section>
      <section class="rs-sec"><h2>7. Performance gaps</h2>${diag.opportunities.length ? `<ul>${diag.opportunities.map((o) => `<li><b>${esc(o.headline)}.</b> ${esc(o.detail)} <span class="muted">(${esc(o.group)}, n = ${F.int(o.n)})</span></li>`).join("")}</ul>` : "<p>No comparison could be made with the information provided.</p>"}
        <p class="small">Comparison findings, not causes or diagnoses.</p></section>
      <section class="rs-sec"><h2>8. Prioritised suggestions</h2>${diag.suggestions.length ? diag.suggestions.map((s) => `<div class="rep-sug"><h3>Priority ${s.priority}: ${esc(s.title)} <span class="rep-ev">${esc(s.evidence_label)}</span></h3>
        <p><b>Observed.</b> ${esc(s.observed)}</p><p><b>What it means.</b> ${esc(s.meaning)}</p><p><b>Consider.</b> ${esc(s.consider)}</p><p class="small"><b>Limitations.</b> ${esc(s.limits)}</p></div>`).join("")
        : "<p>No suggestion met its conditions for the information provided. The tool does not invent advice.</p>"}
        ${diag.notes.map((n) => `<p class="small"><b>${esc(n.title)} (${esc(E.EVIDENCE[n.evidence].label)}).</b> ${esc(n.text)}</p>`).join("")}</section>
      <section class="rs-sec"><h2>9. Evidence classifications</h2><table class="rt"><tbody>${Object.values(E.EVIDENCE).map((e) => `<tr><th>${esc(e.label)}</th><td>${esc(e.text)}</td></tr>`).join("")}</tbody></table></section>
      <section class="rs-sec"><h2>10. Sample sizes and denominators</h2><ul class="small">
        <li>Delhi NCR: ${F.int(D.ncr.n_restaurants)} restaurants, of which ${F.int(D.ncr.n_rated)} had a published rating and ${F.int(D.ncr.n_unrated)} did not.</li>
        <li>Rating statistics use rated restaurants only and need at least ${E.MIN_RATED} rated restaurants in the group. Restaurants without a published rating are never counted as a rating of 0.</li>
        <li>${esc(dv.engagement_population_text)} The all-restaurant and rated-only vote benchmarks are separate populations and are never mixed.</li>
        <li>Locality benchmarks need ${p.threshold}+ restaurants (primary threshold 30; sensitivity 20 and 50). Peer groups need ${E.MIN_PEER_N}+ restaurants. Thresholds are never lowered automatically.</li>
        <li>Shares carry Wilson 95% confidence intervals; medians and percentiles use linear interpolation.</li></ul></section>
      <section class="rs-sec"><h2>11. Historical data caveat</h2><p>${esc(diag.caveats.historical)}</p><p>${esc(diag.caveats.entry)}</p></section>
      <section class="rs-sec"><h2>12. Methodological limitations</h2><ul class="small">
        <li>Observational, cross-sectional data: every result is an association. Reverse causality is plausible; no suggestion is a guaranteed improvement.</li>
        <li>Votes are an engagement proxy, not satisfaction; they accumulate with time on the platform, and listing age is not observed.</li>
        <li>A zero rating is not zero quality: the data are consistent with a rating-publication threshold at 4 votes, which is not confirmed Zomato policy.</li>
        <li>${esc(diag.caveats.chain)}</li>
        <li>Table booking results are specification-sensitive; no booking recommendation is made.</li>
        <li>Food, service, ambience, revenue and review text are not observed; listing characteristics explain about 13% of rating variation.</li>
        <li>Locality coverage is concentrated in New Delhi (74 of 98 eligible localities); Ghaziabad has 25 restaurants and is not interpreted.</li></ul></section>
      <section class="rs-sec"><h2>13. Research references</h2><ol class="small refs">${REFS.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></section>
      <footer class="rep-foot">Generated locally by NCR Restaurant Intelligence ${esc(diag.version)} (research prototype). This report was created in your browser; no data were uploaded.</footer>`;
  }

  // ------------------------------------------------------------------ public
  async function init() {
    const d = await window.NCR.loadDiagnostic();
    D = d.D; EV = d.EV; ix = { locIndex: Object.fromEntries(D.locality_index.map((u) => [u.id, u])) };
    initWizard();
    const had = restore();
    fillWizard(); renderStep();
    if (had) { const r = E.buildDiagnostic(profile, D, EV); if (r.ok) diag = r; }
    $("#rep-print").addEventListener("click", () => window.print());
    const clr = $("#about-clear");
    if (clr) clr.addEventListener("click", () => { clearAll(); $("#about-clear-status").textContent = "Cleared. Nothing about your restaurant remains in this browser tab."; });
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("[data-edit-step]");
      if (a) { step = +a.dataset.editStep; renderStep(); save(); }
    });
    // home page content
    const N = D.ncr, M = EV.models;
    $$('[data-k="ncr_n"]').forEach((x) => { x.textContent = F.int(N.n_restaurants); });
    $("#home-dims").innerHTML = [
      ["visibility", "Visibility", "Is a rating published?", `${F.pct(N.metrics.pub_rate_pct.value)} of NCR restaurants had a published rating. Restaurants offering delivery had about ten times the odds (OR ${M.vis.online_delivery.estimate.toFixed(2)}).`, "odds-ratio"],
      ["quality", "Perceived quality", "How is it rated?", `Median rating ${F.rating(N.metrics.rating.median)} among rated restaurants. Delivery was linked to only ${F.signed(M.qual.online_delivery.estimate)} rating points; price positioning mattered more.`, "coefficient"],
      ["engagement", "Customer engagement", "How many customers interact?", `Median ${F.votes(N.metrics.votes_rated.median)} votes among rated restaurants. Votes measure interaction, not satisfaction.`, "log-outcome"],
    ].map(([id, t, q, txt, term]) => `<div class="o-dim ${id}"><div class="o-dim-ic" aria-hidden="true">${{ visibility: "◉", quality: "★", engagement: "◆" }[id]}</div><h3>${t}</h3><p class="o-dim-q">${q}</p><p>${esc(txt)}</p>${G.q(term, "How to read this")}</div>`).join("");
    $("#home-evidence").innerHTML = `<p class="o-eyebrow">Every suggestion is labelled</p>` + Object.entries(E.EVIDENCE).map(([k, e]) => `<div class="ev-row">${evChip(k)}<p>${esc(e.text)}</p></div>`).join("");
  }
  function onShow(view) {
    if (view === "results") { renderResults(); }
    if (view === "report") { renderReport(); }
    if (view === "diagnose") { fillWizard(); renderStep(); }
  }
  // A clearly labelled synthetic profile for demonstration; it does not describe a real restaurant.
  const EXAMPLE = { name: "Synthetic example (not a real restaurant)", city: "New Delhi", locality_id: "New Delhi | Hauz Khas", price: 3, cuisines: ["Italian", "Continental"],
    rating: "3.4", votes: "120", cost: "1500", delivery: "no", booking: "yes", multi_outlet: "no", goals: ["quality", "visibility", "engagement"], threshold: 30 };
  function loadExample() {
    profile = JSON.parse(JSON.stringify(EXAMPLE)); step = 4;
    diag = E.buildDiagnostic(profile, D, EV);
    save(); fillWizard(); renderStep();
  }
  window.NCROwner = { init, onShow, clearAll, loadExample, get diagnostic() { return diag; } };
})();
