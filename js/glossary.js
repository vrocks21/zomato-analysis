/* Reusable statistical explanations (glossary page + inline "?" popovers).
   Each entry: technical term, its meaning, an example from this research, and a common
   misreading to avoid. The same wording is used in the Final Research Presentation and Final Research Report. */
(function () {
  "use strict";
  const esc = (s) => window.NCR.esc(s);
  const TERMS = [
    { id: "odds-ratio", term: "Odds ratio (OR)",
      plain: "Compares the odds of an outcome between two groups. The odds are the chance something happens divided by the chance it does not. An odds ratio of 1 means no difference; 2 means twice the odds; 0.5 means half the odds.",
      example: "Restaurants offering online delivery had an odds ratio of 9.99 for having a published rating: about ten times the odds, holding price tier, city, booking, cuisine breadth and chain status constant.",
      avoid: "An odds ratio of 9.99 does not mean ten times the probability. Turning odds into probabilities needs a baseline probability, which an odds ratio alone does not give." },
    { id: "coefficient", term: "Regression coefficient",
      plain: "The estimated difference in the outcome between two groups (or for one more unit of a characteristic), with the other characteristics in the model held constant. Its unit is the unit of the outcome.",
      example: "In the rating model, the delivery coefficient is +0.0969: restaurants offering delivery had a predicted rating about 0.097 points higher, among restaurants with published ratings.",
      avoid: "+0.097 rating points is not a 9.7% improvement, and it is not the effect of starting delivery. It is an association in observational data." },
    { id: "ci", term: "Confidence interval (95% CI)",
      plain: "A range that reflects the uncertainty of an estimate from this sample, under the statistical model and its assumptions. Narrow intervals mean more precise estimates.",
      example: "The delivery rating coefficient has a 95% CI of +0.071 to +0.123 rating points.",
      avoid: "It is not a range that contains 95% of restaurants, and it does not cover uncertainty from things the model leaves out, such as listing age." },
    { id: "p-value", term: "p-value",
      plain: "How surprising the data would be if the true association were zero, under the model's assumptions. Small values (conventionally below .05) are evidence against a zero association.",
      example: "Table booking in the rating model: p = .107, so the data do not clearly rule out a zero association with rating.",
      avoid: "A p-value is not the probability that a hypothesis is true or false, and a small p-value does not mean the association is large or important." },
    { id: "r-squared", term: "R-squared (R²) and pseudo-R²",
      plain: "The share of the variation in the outcome, in this sample, that the model's characteristics account for together. Logistic models use a pseudo-R² on a similar 0–1 idea.",
      example: "Listing characteristics accounted for 13.1% of rating variation (adjusted R² 0.131) and 31.4% of engagement variation (0.314).",
      avoid: "R² is not causal explanatory power and not a guarantee of predictive accuracy for any individual restaurant." },
    { id: "standardised", term: "Standardised effect (SD units)",
      plain: "A coefficient divided by the standard deviation (typical spread) of the outcome, so that associations with different outcomes can be compared on one scale.",
      example: "Delivery's association was 0.208 SD for rating but 0.48 SD for engagement: less than half as large for rating.",
      avoid: "A standardised effect compares magnitudes; it does not say whether a difference matters commercially." },
    { id: "log-outcome", term: "Log-transformed outcome: log(1 + Votes)",
      plain: "Votes are very skewed (a few restaurants have thousands), so the engagement model uses log(1 + Votes). A coefficient b becomes a percentage, 100 × (exp(b) − 1), which compares the geometric means of (1 + Votes) between groups.",
      example: "Delivery's +97.5% means that, holding the other characteristics constant, the geometric mean of (1 + Votes) was about 1.98 times as high for restaurants offering delivery.",
      avoid: "It is not an exact percentage increase in raw votes or in average (arithmetic mean) votes, and not a predicted change for any restaurant." },
    { id: "significance", term: "Statistical significance vs practical relevance",
      plain: "Statistical significance says an association is unlikely to be exactly zero. Practical relevance asks whether it is large enough to matter. With thousands of restaurants, very small associations can be significant.",
      example: "Each extra cuisine tag was associated with +0.022 rating points (p < .001): statistically clear, but very small in practice.",
      avoid: "Do not treat “significant” as “important”, or a suggestion as justified merely because a coefficient is significant." },
    { id: "percentile", term: "Median, percentiles and the middle half",
      plain: "The median is the middle value of a group. The 25th and 75th percentiles bound the middle half of the group; the 10th and 90th percentiles bound the middle 80%.",
      example: "If a peer group's median rating is 3.4 and its middle half runs from 3.1 to 3.7, a rating of 3.2 is below the median but within the middle half.",
      avoid: "Being below a median is not failure: by definition, half of any group is below its median." },
    { id: "denominator", term: "Population and denominator",
      plain: "Every share or median is calculated over a specific set of restaurants. Rating statistics use rated restaurants only; all-restaurant statistics include listings without a published rating.",
      example: "The all-NCR vote benchmark (7,947 restaurants) and the rated-NCR vote benchmark (5,808) are different populations and are never mixed.",
      avoid: "Do not compare a rated-only figure with an all-restaurant figure as if they described the same group." },
    { id: "published-rating", term: "Published rating (visibility)",
      plain: "Whether a listing shows a rating at all. In the historical snapshot, every listing with 0–3 votes showed a rating of 0 and every listing with 4 or more votes showed a rating.",
      example: "2,139 of 7,947 NCR restaurants (27%) had no published rating.",
      avoid: "A 0 is not zero quality. The pattern is consistent with a publication threshold, but it is not confirmed Zomato policy." },
    { id: "chain-proxy", term: "Chain proxy",
      plain: "The research marks a restaurant as a chain outlet when its name appears 5 or more times in the snapshot (112 names; 16.5% of NCR restaurants).",
      example: "Chain outlets had higher odds of a published rating (OR 2.31) but ratings 0.091 points lower.",
      avoid: "It is an operational proxy, not verified corporate ownership; a self-reported multi-outlet status is not necessarily the same." },
    { id: "quadrants", term: "Four-quadrant framework",
      plain: "Stars, Crowd Magnets, Hidden Gems and Low Profile split rated restaurants at the median rating (3.3) and median votes (40).",
      example: "1,970 rated restaurants were Stars (above-median rating and votes).",
      avoid: "The quadrants are an imposed median split for communication, not natural clusters discovered by statistical learning." },
    { id: "association", term: "Association (not causation)",
      plain: "The study observes restaurants at one point in time. It shows which characteristics go together with which outcomes, not what would happen if a restaurant changed something.",
      example: "Restaurants already busy may have been more likely to adopt delivery, which would produce an association without any effect of delivery.",
      avoid: "Do not read any estimate or suggestion as a guaranteed improvement." },
  ];
  const byId = Object.fromEntries(TERMS.map((t) => [t.id, t]));

  function card(t, compact) {
    return `<article class="gl-card" id="gl-${t.id}"><h2 class="gl-term">${esc(t.term)}</h2>
      <p class="gl-plain">${esc(t.plain)}</p>
      <div class="gl-ex"><span>In this research</span><p>${esc(t.example)}</p></div>
      ${compact ? "" : ""}<div class="gl-avoid"><span>Avoid this misreading</span><p>${esc(t.avoid)}</p></div></article>`;
  }
  function renderList(el) { el.innerHTML = TERMS.map((t) => card(t)).join(""); }
  // inline term button: <button class="gl-q" data-term="odds-ratio">?</button>
  const q = (id, label) => `<button type="button" class="gl-q" data-term="${id}" aria-label="What is ${esc(byId[id] ? byId[id].term : id)}?">${label ? esc(label) : "?"}</button>`;

  function wirePopovers() {
    const pop = document.getElementById("gl-pop");
    let anchor = null;
    function close() { pop.hidden = true; if (anchor) anchor.setAttribute("aria-expanded", "false"); anchor = null; }
    document.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".gl-q");
      if (!b) { if (!pop.hidden && !pop.contains(e.target)) close(); return; }
      e.preventDefault();
      if (anchor === b) { close(); return; }
      const t = byId[b.dataset.term]; if (!t) return;
      if (anchor) anchor.setAttribute("aria-expanded", "false");
      anchor = b; b.setAttribute("aria-expanded", "true");
      pop.innerHTML = `<div class="gl-pop-head"><b id="gl-pop-t">${esc(t.term)}</b><button type="button" class="gl-x" aria-label="Close">×</button></div>
        <p>${esc(t.plain)}</p><p class="gl-pop-ex"><b>Example:</b> ${esc(t.example)}</p><p class="gl-pop-av"><b>Avoid:</b> ${esc(t.avoid)}</p>
        <a href="#glossary" class="gl-more">Open the glossary</a>`;
      pop.hidden = false;
      const r = b.getBoundingClientRect(), w = Math.min(360, window.innerWidth - 24);
      pop.style.width = w + "px";
      let left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + window.scrollX - 20));
      pop.style.left = left + "px";
      pop.style.top = r.bottom + window.scrollY + 8 + "px";
      pop.querySelector(".gl-x").addEventListener("click", close);
      pop.querySelector(".gl-more").addEventListener("click", close);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { const a = anchor; close(); if (a) a.focus(); } });
    window.addEventListener("hashchange", close);
  }
  window.NCRGlossary = { TERMS, byId, renderList, q, wirePopovers, card };
})();
