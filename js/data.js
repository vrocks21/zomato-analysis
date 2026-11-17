/* Data loading and formatting helpers (Stage 2 helpers retained, Stage 3 diagnostic data added).
   Research-explorer data: data/*.json from build_research_explorer_data.py (identical to Stage 2).
   Diagnostic data: data/diagnostic_benchmarks.json + research_evidence.json from build_diagnostic_data.py.
   data/site_data.js and data/diagnostic_data.js hold the same objects so the site also opens from disk
   (file://); when they are missing, the JSON files are fetched from the same folder. No other request is made. */
(function () {
  "use strict";
  const FILES = ["site", "cities", "localities", "performance_extremes", "research_findings", "methodology"];

  async function getJSON(f) {
    const res = await fetch("data/" + f + ".json", { cache: "no-cache" });
    if (!res.ok) throw new Error("Could not load data/" + f + ".json (HTTP " + res.status + ")");
    return res.json();
  }
  async function load() {
    if (window.NCR_DATA && FILES.every((f) => window.NCR_DATA[f])) return window.NCR_DATA;
    const out = {};
    await Promise.all(FILES.map(async (f) => { out[f] = await getJSON(f); }));
    return out;
  }
  async function loadDiagnostic() {
    if (window.NCRI_DATA && window.NCRI_EVIDENCE) return { D: window.NCRI_DATA, EV: window.NCRI_EVIDENCE };
    const [D, EV] = await Promise.all([getJSON("diagnostic_benchmarks"), getJSON("research_evidence")]);
    return { D, EV };
  }

  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const fmt = {
    int: (v) => (v == null ? "Not available" : nf0.format(v)),
    num: (v, d = 1) => (v == null ? "Not available" : Number(v).toFixed(d)),
    pct: (v, d = 1) => (v == null ? "Not available" : Number(v).toFixed(d) + "%"),
    signed: (v, d = 3) => (v == null ? "Not available" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d)),
    signedPct: (v, d = 1) => (v == null ? "Not available" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d) + "%"),
    p: (p) => (p == null ? "" : p < 0.001 ? "p < .001" : "p = " + p.toFixed(3).replace(/^0/, "")),
    metric: (meta, v) => {
      if (v == null) return "Not available";
      if (meta.unit.startsWith("%")) return Number(v).toFixed(1) + "%";
      if (meta.unit.startsWith("rating")) return Number(v).toFixed(meta.id === "mean_rating" ? 2 : 1);
      if (meta.unit === "INR") return "₹" + nf0.format(v);
      if (meta.unit === "votes") return Number.isInteger(v) ? nf0.format(v) : Number(v).toFixed(1);
      return String(v);
    },
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  window.NCR = { load, loadDiagnostic, fmt, esc,
    DIM_COLORS: { visibility: "#2f6db5", quality: "#d2602a", engagement: "#1d8a5a", positioning: "#6b4fa0", local: "#8a6a00" },
    DIM_NAMES: { visibility: "Visibility", quality: "Perceived quality", engagement: "Customer engagement", positioning: "Positioning (context)", local: "Local benchmarking" } };
})();
