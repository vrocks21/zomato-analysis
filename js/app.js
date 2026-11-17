/* NCR Restaurant Intelligence: router and shell (header, menu, mode switch, about page). */
(async function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => window.NCR.esc(s);
  const OWNER = ["home", "diagnose", "results", "report", "glossary", "about"];
  const RESEARCH = ["research", "research/cities", "research/localities", "research/extremes", "research/findings", "research/methodology"];
  const TITLES = { home: "", diagnose: "Benchmark my restaurant", results: "My diagnostic", report: "Diagnostic report", glossary: "Glossary", about: "About & privacy",
    research: "Research explorer", "research/cities": "Cities · Research", "research/localities": "Localities · Research", "research/extremes": "Top vs bottom · Research",
    "research/findings": "Findings · Research", "research/methodology": "Methodology · Research" };

  let research = null;
  try {
    await window.NCROwner.init();
    research = await window.NCRResearchReady;
  } catch (err) {
    const box = $("#load-error");
    box.hidden = false;
    box.innerHTML = "<strong>The data files could not be loaded.</strong> " + esc(err.message) +
      "<br>Open this folder with a local server (<code>python -m http.server 8000</code>) and visit <code>http://localhost:8000</code>.";
    console.error(err);
  }
  window.NCRGlossary.renderList($("#glossary-list"));
  window.NCRGlossary.wirePopovers();

  // About page body (static facts, from the verified results)
  $("#about-body").innerHTML = [
    ["What it is", "A research prototype that turns the findings of a Delhi NCR restaurant study into a benchmarking tool for restaurant owners and managers. It compares what you enter with historical reference groups and suggests areas worth investigating."],
    ["The data", "An undated, publicly circulated Zomato listing snapshot: 9,551 listings, of which 7,947 are Delhi NCR restaurants (5,808 with a published rating). The website contains aggregated benchmarks only; no restaurant-level record, name or ID is included."],
    ["How comparisons work", "Benchmarks appear in a fixed order: your locality (30+ restaurants, the research's primary threshold; 20 and 50 available as sensitivity settings), your city, all of Delhi NCR, then similar-restaurant peer groups (30+ restaurants). Rating statistics need 20+ rated restaurants. Unsupported statistics are hidden, never estimated."],
    ["How suggestions work", "Transparent, deterministic rules (documented in Recommendation_Rules.md). A rule fires only when your entries and a valid benchmark meet all its conditions. There is no AI service, no composite score and no restaurant grade."],
    ["What it cannot do", "Show current Zomato performance, verify your entries, identify your real competitors, or predict the effect of any change. The study is observational: every result is an association."],
    ["Three outcomes", "Visibility (whether a rating is published), perceived quality (the rating, among rated restaurants) and engagement (votes, modelled as log(1 + Votes)). They are related but different, and are never treated as interchangeable."],
  ].map(([t, x]) => `<div class="about-card"><h2>${esc(t)}</h2><p>${esc(x)}</p></div>`).join("");

  function current() {
    const h = location.hash.replace(/^#/, "").split("?")[0];
    if (/^m-/.test(h)) return { view: "results", anchor: h };
    if (OWNER.includes(h) || RESEARCH.includes(h)) return { view: h };
    return { view: "home" };
  }
  function route() {
    // #example and #example/report load the labelled synthetic example profile (no data in the URL)
    const raw = location.hash.replace(/^#/, "");
    if ((raw === "example" || raw === "example/report") && window.NCROwner) {
      window.NCROwner.loadExample();
      history.replaceState(null, "", raw === "example" ? "#results" : "#report");
    }
    const { view, anchor } = current();
    const mode = RESEARCH.includes(view) ? "research" : "owner";
    document.body.dataset.mode = mode;
    $$(".view").forEach((v) => { v.hidden = v.dataset.view !== view; });
    $$(".site-nav [data-view], .sub-nav [data-view]").forEach((a) => { if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $$("[data-mode-link]").forEach((a) => a.classList.toggle("on", a.dataset.modeLink === mode));
    $("#research-nav").hidden = mode !== "research";
    $("#site-nav").classList.remove("open"); $(".menu-toggle").setAttribute("aria-expanded", "false");
    if (mode === "research" && research) research.onShow(view);
    else if (window.NCROwner) window.NCROwner.onShow(view);
    document.title = (TITLES[view] ? TITLES[view] + " · " : "") + "NCR Restaurant Intelligence";
    if (anchor) { const t = document.getElementById(anchor); if (t) setTimeout(() => t.scrollIntoView({ behavior: "smooth", block: "start" }), 30); return null; }
    return document.querySelector(`.view[data-view="${view}"]`);
  }
  let first = true;
  window.addEventListener("hashchange", () => {
    if (location.hash.startsWith("#research/localities?") && research) {
      research.onHashDeepLink();
      if (!$("#view-localities").hidden) return;
    }
    const sec = route();
    if (!sec) return;
    window.scrollTo(0, 0);
    if (!first) { const h = $("h1", sec); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } }
  });
  // in-dashboard module links scroll without leaving the results view
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest(".r-nav a");
    if (!a) return;
    e.preventDefault();
    const t = document.getElementById(a.dataset.mod);
    if (t) { t.scrollIntoView({ behavior: "smooth", block: "start" }); const h = $("h2", t); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } }
  });
  // highlight the module in view
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) $$(".r-nav a").forEach((a) => a.classList.toggle("on", a.dataset.mod === en.target.id));
    }), { rootMargin: "-30% 0px -60% 0px" });
    $$(".mod").forEach((m) => io.observe(m));
  }
  $(".menu-toggle").addEventListener("click", (e) => {
    const nav = $("#site-nav"); const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open); e.currentTarget.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { $("#site-nav").classList.remove("open"); $(".menu-toggle").setAttribute("aria-expanded", "false"); }
  });
  route();
  first = false;
})();
