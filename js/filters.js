/* Locality filtering: eligibility threshold, city and free-text search.
   The unique key is City + Locality (loc_id), never the locality name alone. */
(function () {
  "use strict";
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

  function eligible(localities, threshold) {
    const key = String(threshold);
    return localities.filter((l) => l.eligible && l.eligible[key] === true);
  }

  function byCity(localities, city) {
    return localities.filter((l) => l.city === city).sort((a, b) => a.locality.localeCompare(b.locality));
  }

  function search(localities, query) {
    const q = norm(query);
    if (!q) return localities;
    const terms = q.split(" ");
    return localities.filter((l) => {
      const hay = norm(l.locality + " " + l.city);
      return terms.every((t) => hay.includes(t));
    });
  }

  function countsByCity(localities, cities) {
    const out = {};
    cities.forEach((c) => { out[c] = 0; });
    localities.forEach((l) => { out[l.city] = (out[l.city] || 0) + 1; });
    return out;
  }

  window.NCRFilters = { eligible, byCity, search, countsByCity, norm };
})();
