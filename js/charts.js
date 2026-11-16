/* Native SVG charts (no libraries). Every chart re-renders on resize from the options it was given.
   Elements with a data-tip attribute show a tooltip on hover and keyboard focus. */
(function () {
  "use strict";
  const esc = (s) => window.NCR.esc(s);
  const SVGNS = "http://www.w3.org/2000/svg";
  const registry = new Set();

  function width(el) { return Math.max(260, Math.floor(el.clientWidth || el.parentElement.clientWidth || 600)); }
  function mount(el, fn, opts) {
    el.__chart = { fn, opts };
    registry.add(el);
    fn(el, opts);
  }
  function svg(w, h, body, label) {
    return `<svg xmlns="${SVGNS}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label || "Chart")}"><title>${esc(label || "Chart")}</title>${body}</svg>`;
  }
  const tipAttr = (t) => (t ? ` data-tip="${esc(t)}" tabindex="0" class="hit"` : "");
  function textWidthGuess(s, px) { return String(s).length * px * 0.56; }
  // Right-aligned axis label that wraps onto two lines when it is wider than maxW
  function label(x, y, text, maxW, fs, weight) {
    const t = String(text);
    const attrs = `class="lab" x="${x}" text-anchor="end" font-size="${fs}" font-weight="${weight || 400}"`;
    if (textWidthGuess(t, fs) <= maxW || !t.includes(" ")) return `<text ${attrs} y="${y}">${esc(t)}</text>`;
    const words = t.split(" ");
    let l1 = "", i = 0;
    while (i < words.length && textWidthGuess((l1 + " " + words[i]).trim(), fs) <= maxW) { l1 = (l1 + " " + words[i]).trim(); i++; }
    if (!l1) { l1 = words[0]; i = 1; }
    const l2 = words.slice(i).join(" ");
    return `<text ${attrs} y="${y - fs * 0.55}"><tspan x="${x}">${esc(l1)}</tspan><tspan x="${x}" dy="${fs * 1.15}">${esc(l2)}</tspan></text>`;
  }
  // Legend that wraps onto several lines inside width W; returns markup and height
  function legend(items, startX, W, fs) {
    let x = startX, y = 6, b = "";
    const total = items.reduce((s, it) => s + 22 + textWidthGuess(it.label, fs) + 12, 0);
    if (startX + total > W) x = 0;
    const x0 = x;
    items.forEach((it) => {
      const w = 22 + textWidthGuess(it.label, fs) + 12;
      if (x + w > W && x > x0) { x = x0; y += 18; }
      b += `<rect x="${x}" y="${y}" width="11" height="11" rx="2" fill="${it.color}"/><text class="axis-label" x="${x + 16}" y="${y + 9.5}" font-size="${fs}">${esc(it.label)}</text>`;
      x += w;
    });
    return { b, h: y + 20 };
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function ticksLinear(min, max, count) {
    const step = niceMax((max - min) / (count || 5));
    const out = [];
    for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(+t.toFixed(10));
    return out;
  }

  // ---------------------------------------------------------------- horizontal bars
  function hbar(el, o) {
    const W = width(el);
    const fs = W < 420 ? 11.5 : 12.5;
    const labelW = Math.min(o.labelW || Math.max(...o.items.map((i) => textWidthGuess(i.label, fs))) + 14, W * 0.42);
    const valW = o.valW || 70, rowH = o.rowH || 30, top = 6, bottom = o.ref ? 26 : 8;
    const plotW = W - labelW - valW;
    const vals = o.items.map((i) => (i.hi != null ? i.hi : i.value)).filter((v) => v != null);
    const max = o.max != null ? o.max : niceMax(Math.max(...vals, o.ref ? o.ref.value : 0) * 1.05);
    const X = (v) => labelW + (plotW * v) / max;
    let b = "";
    o.items.forEach((it, i) => {
      const y = top + i * rowH;
      b += label(labelW - 10, y + rowH / 2 + 4, it.label, labelW - 14, fs, it.bold ? 700 : 400);
      if (it.value == null) {
        b += `<text class="axis-label" x="${labelW + 4}" y="${y + rowH / 2 + 4}" font-style="italic">Not available</text>`;
        return;
      }
      const w = Math.max(1, X(it.value) - labelW);
      const fill = it.color || o.color || "#14213d";
      b += `<rect x="${labelW}" y="${y + 5}" width="${w}" height="${rowH - 10}" rx="3" fill="${fill}" ${it.hatch ? 'fill-opacity="0.35" stroke="' + fill + '" stroke-dasharray="3 2"' : ""}${tipAttr(it.tip)}/>`;
      if (it.lo != null && it.hi != null) {
        b += `<line x1="${X(it.lo)}" x2="${X(it.hi)}" y1="${y + rowH / 2}" y2="${y + rowH / 2}" stroke="#1b2433" stroke-width="1.3" opacity=".75"/>`;
        b += `<line x1="${X(it.lo)}" x2="${X(it.lo)}" y1="${y + rowH / 2 - 4}" y2="${y + rowH / 2 + 4}" stroke="#1b2433" stroke-width="1.3" opacity=".75"/>`;
        b += `<line x1="${X(it.hi)}" x2="${X(it.hi)}" y1="${y + rowH / 2 - 4}" y2="${y + rowH / 2 + 4}" stroke="#1b2433" stroke-width="1.3" opacity=".75"/>`;
      }
      const vx = Math.max(X(it.value), it.hi != null ? X(it.hi) : 0) + 6;
      b += `<text class="val" x="${vx}" y="${y + rowH / 2 + 4}" font-weight="${it.bold ? 700 : 500}">${esc(o.format(it.value))}${it.flag ? " " + esc(it.flag) : ""}</text>`;
    });
    const H = top + o.items.length * rowH + bottom;
    if (o.ref && o.ref.value != null) {
      const x = X(o.ref.value);
      b += `<line class="refline" x1="${x}" x2="${x}" y1="${top - 2}" y2="${top + o.items.length * rowH}" stroke-dasharray="4 3"/>`;
      const anchor = x > W - 120 ? "end" : "middle";
      b += `<text class="axis-label" x="${x}" y="${H - 8}" text-anchor="${anchor}">${esc(o.ref.label)}</text>`;
    }
    el.innerHTML = svg(W, H, b, o.title);
  }

  // ---------------------------------------------------------------- grouped horizontal bars
  function grouped(el, o) {
    const W = width(el);
    const fs = W < 420 ? 11.5 : 12.5;
    const labelW = Math.min(Math.max(...o.categories.map((c) => textWidthGuess(c, fs))) + 14, W * 0.4);
    const valW = 56, barH = 15, gap = 3, groupGap = 14;
    const plotW = W - labelW - valW;
    const max = o.max || niceMax(Math.max(...o.series.flatMap((s) => s.values.filter((v) => v != null))) * 1.05);
    const X = (v) => labelW + (plotW * v) / max;
    const lg = legend(o.series.map((s) => ({ label: s.name, color: s.color })), labelW, W, 11.5);
    let b = lg.b, y = lg.h + 4;
    o.categories.forEach((c, ci) => {
      const gh = o.series.length * (barH + gap);
      b += label(labelW - 10, y + gh / 2 + 4, c, labelW - 14, fs);
      o.series.forEach((s, si) => {
        const v = s.values[ci];
        const yy = y + si * (barH + gap);
        if (v == null) return;
        b += `<rect x="${labelW}" y="${yy}" width="${Math.max(1, X(v) - labelW)}" height="${barH}" rx="2.5" fill="${s.color}"${tipAttr(s.name + ": " + o.format(v) + (o.tipSuffix ? o.tipSuffix(ci, si) : ""))}/>`;
        b += `<text class="val" x="${X(v) + 5}" y="${yy + barH - 3}" font-size="11.5">${esc(o.format(v))}</text>`;
      });
      y += gh + groupGap;
    });
    el.innerHTML = svg(W, y, b, o.title);
  }

  // ---------------------------------------------------------------- 100% stacked bars
  function stacked(el, o) {
    const W = width(el);
    const fs = W < 420 ? 11.5 : 12.5;
    const labelW = Math.min(Math.max(...o.rows.map((r) => textWidthGuess(r.label, fs))) + 14, W * 0.36);
    const rowH = 30;
    const plotW = W - labelW - 4;
    const lg = legend(o.keys.map((k, i) => ({ label: o.keyLabels ? o.keyLabels[i] : k, color: o.colors[i] })), labelW, W, 11.5);
    const legendH = lg.h + 2;
    let b = lg.b;
    o.rows.forEach((r, ri) => {
      const y = legendH + ri * rowH;
      b += label(labelW - 10, y + rowH / 2 + 4, r.label, labelW - 14, fs, r.bold ? 700 : 400);
      if (!r.parts) {
        b += `<text class="axis-label" x="${labelW + 4}" y="${y + rowH / 2 + 4}" font-style="italic">${esc(r.missing || "Not available")}</text>`;
        return;
      }
      const total = o.keys.reduce((s, k) => s + (r.parts[k] || 0), 0) || 100;
      let x = labelW;
      o.keys.forEach((k, i) => {
        const v = r.parts[k] || 0;
        const w = (plotW * v) / total;
        if (w <= 0) return;
        const lab = (o.keyLabels ? o.keyLabels[i] : k) + ": " + v.toFixed(1) + "%" + (r.n ? " (n = " + r.n + ")" : "");
        b += `<rect x="${x}" y="${y + 5}" width="${w}" height="${rowH - 10}" fill="${o.colors[i]}"${tipAttr(r.label + " · " + lab)}/>`;
        if (w > 34) b += `<text x="${x + w / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-size="11" fill="${o.textColors ? o.textColors[i] : "#fff"}" style="fill:${o.textColors ? o.textColors[i] : "#fff"}">${Math.round(v)}%</text>`;
        x += w;
      });
    });
    el.innerHTML = svg(W, legendH + o.rows.length * rowH + 4, b, o.title);
  }

  // ---------------------------------------------------------------- forest / coefficient plot
  function forest(el, o) {
    const W = width(el);
    const narrow = W < 520;
    const fs = narrow ? 11.5 : 12.5;
    const labelW = Math.min(Math.max(...o.rows.map((r) => textWidthGuess(r.label, fs))) + 16, W * (narrow ? 0.42 : 0.34));
    const valW = narrow ? 0 : Math.max(...o.rows.map((r) => textWidthGuess(r.value, 12))) + 16;
    const rowH = narrow ? 40 : 30, top = 8, axisH = 44;
    const plotW = W - labelW - valW - 12;
    const lo = Math.min(...o.rows.map((r) => r.lo), o.ref), hi = Math.max(...o.rows.map((r) => r.hi), o.ref);
    let dmin, dmax, X;
    if (o.log) {
      dmin = Math.log(lo) - 0.08 * (Math.log(hi) - Math.log(lo)); dmax = Math.log(hi) + 0.05 * (Math.log(hi) - Math.log(lo));
      X = (v) => labelW + plotW * ((Math.log(v) - dmin) / (dmax - dmin));
    } else {
      const pad = 0.06 * (hi - lo);
      dmin = lo - pad; dmax = hi + pad;
      X = (v) => labelW + plotW * ((v - dmin) / (dmax - dmin));
    }
    const n = o.rows.length;
    let b = "";
    o.rows.forEach((r, i) => { if (i % 2 === 0) b += `<rect x="0" y="${top + i * rowH}" width="${W}" height="${rowH}" fill="#f7f8fa"/>`; });
    const ticks = o.ticks || (o.log ? [] : ticksLinear(dmin, dmax, 6));
    ticks.forEach((t) => {
      const v = typeof t === "object" ? t.v : t;
      const lab = typeof t === "object" ? t.label : (o.fmtTick ? o.fmtTick(v) : v);
      const x = X(v);
      if (x < labelW - 1 || x > labelW + plotW + 1) return;
      b += `<line class="grid" x1="${x}" x2="${x}" y1="${top}" y2="${top + n * rowH}"/>`;
      b += `<text class="axis-label" x="${x}" y="${top + n * rowH + 16}" text-anchor="middle">${esc(lab)}</text>`;
    });
    const xr = X(o.ref);
    b += `<line class="refline" x1="${xr}" x2="${xr}" y1="${top - 4}" y2="${top + n * rowH}"/>`;
    b += `<text class="axis-label" x="${labelW + plotW / 2}" y="${top + n * rowH + 36}" text-anchor="middle" font-style="italic">${esc(o.axisTitle)}</text>`;
    o.rows.forEach((r, i) => {
      const cy = top + i * rowH + (narrow ? 14 : rowH / 2);
      const c = r.color || o.color;
      b += label(labelW - 10, cy + 4, r.label, labelW - 14, fs, r.bold ? 700 : 400);
      const x1 = Math.max(labelW, X(r.lo)), x2 = Math.min(labelW + plotW, X(r.hi));
      b += `<line x1="${x1}" x2="${x2}" y1="${cy}" y2="${cy}" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`;
      b += `<circle cx="${X(r.est)}" cy="${cy}" r="6" fill="${r.sig ? c : "#fff"}" stroke="${c}" stroke-width="2"${tipAttr(r.tip || r.label + ": " + r.value)}/>`;
      if (narrow) b += `<text class="val" x="${labelW + 2}" y="${cy + 19}" font-size="11">${esc(r.value)}</text>`;
      else b += `<text class="val" x="${labelW + plotW + 14}" y="${cy + 4}" font-weight="${r.bold ? 700 : 500}">${esc(r.value)}</text>`;
    });
    el.innerHTML = svg(W, top + n * rowH + axisH, b, o.title);
  }

  // ---------------------------------------------------------------- scatter (median rating vs median votes)
  function scatter(el, o) {
    const W = width(el);
    const H = Math.round(Math.min(420, Math.max(280, W * 0.7)));
    const m = { l: 46, r: 14, t: 12, b: 44 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const xs = o.points.map((p) => p.x), ys = o.points.map((p) => p.y);
    const xv = (v) => Math.log10(v + 1);
    const xmin = 0, xmax = xv(Math.max(...xs)) * 1.04;
    const ymin = Math.floor(Math.min(...ys) * 10 - 1) / 10, ymax = Math.ceil(Math.max(...ys) * 10 + 1) / 10;
    const X = (v) => m.l + (pw * (xv(v) - xmin)) / (xmax - xmin);
    const Y = (v) => m.t + ph - (ph * (v - ymin)) / (ymax - ymin);
    let b = "";
    [0, 10, 30, 100, 300, 1000].forEach((t) => {
      if (xv(t) > xmax) return;
      b += `<line class="grid" x1="${X(t)}" x2="${X(t)}" y1="${m.t}" y2="${m.t + ph}"/><text class="axis-label" x="${X(t)}" y="${m.t + ph + 16}" text-anchor="middle">${t}</text>`;
    });
    for (let t = Math.ceil(ymin * 10) / 10; t <= ymax + 1e-9; t += 0.2) {
      b += `<line class="grid" x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="axis-label" x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${t.toFixed(1)}</text>`;
    }
    if (o.refX != null) b += `<line x1="${X(o.refX)}" x2="${X(o.refX)}" y1="${m.t}" y2="${m.t + ph}" stroke="#98a2b3" stroke-dasharray="4 3"/>`;
    if (o.refY != null) b += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(o.refY)}" y2="${Y(o.refY)}" stroke="#98a2b3" stroke-dasharray="4 3"/>`;
    b += `<text class="axis-label" x="${m.l + pw / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel)}</text>`;
    b += `<text class="axis-label" transform="translate(12 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(o.yLabel)}</text>`;
    const sorted = o.points.slice().sort((a, b2) => (a.id === o.highlightId) - (b2.id === o.highlightId) || (a.city === o.city) - (b2.city === o.city));
    sorted.forEach((p) => {
      const hl = p.id === o.highlightId, inCity = p.city === o.city;
      const r = hl ? 7.5 : 4.6;
      const fill = hl ? "#d2602a" : inCity ? "#14213d" : "#c3cad6";
      b += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${r}" fill="${fill}" fill-opacity="${hl ? 1 : inCity ? 0.8 : 0.75}" stroke="#fff" stroke-width="1"${tipAttr(p.label + " · median rating " + p.y.toFixed(1) + " · median votes " + p.x)}/>`;
      if (hl) b += `<circle class="sel-ring" cx="${X(p.x)}" cy="${Y(p.y)}" r="12"/>`;
    });
    el.innerHTML = svg(W, H, b, o.title);
  }

  // ---------------------------------------------------------------- inline benchmark dot plot (returns HTML; markers stay round at any width)
  function dotplot(o) {
    const P = (v) => Math.max(0, Math.min(100, (100 * (v - o.min)) / ((o.max - o.min) || 1)));
    let b = `<span class="dp-track"></span>`;
    if (o.loc != null && o.lo != null && o.hi != null) b += `<span class="dp-ci" style="left:${P(o.lo)}%;width:${Math.max(0.5, P(o.hi) - P(o.lo))}%;background:${o.color || "#d2602a"}"></span>`;
    if (o.ncr != null) b += `<span class="dp-ncr" style="left:${P(o.ncr)}%" title="NCR ${esc(o.fmt(o.ncr))}"></span>`;
    if (o.city != null) b += `<span class="dp-city" style="left:${P(o.city)}%" title="City ${esc(o.fmt(o.city))}"></span>`;
    if (o.loc != null) b += `<span class="dp-loc" style="left:${P(o.loc)}%;background:${o.color || "#d2602a"}" title="${esc(o.locLabel || "")} ${esc(o.fmt(o.loc))}"></span>`;
    return `<div class="dp" role="img" aria-label="${esc(o.aria)}">${b}</div>`;
  }

  // ---------------------------------------------------------------- resize + tooltips
  let raf = null;
  window.addEventListener("resize", () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => registry.forEach((el) => { if (el.isConnected && el.offsetParent !== null && el.__chart) el.__chart.fn(el, el.__chart.opts); }));
  });
  function rerenderVisible(root) {
    registry.forEach((el) => { if (el.isConnected && root.contains(el) && el.__chart) el.__chart.fn(el, el.__chart.opts); });
  }
  const tip = () => document.getElementById("tooltip");
  function showTip(target, x, y) {
    const t = tip(); if (!t) return;
    t.textContent = target.getAttribute("data-tip");
    t.hidden = false;
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    t.style.left = Math.max(8, left) + "px"; t.style.top = Math.max(8, top) + "px";
  }
  document.addEventListener("mousemove", (e) => {
    const target = e.target.closest && e.target.closest("[data-tip]");
    if (target) showTip(target, e.clientX, e.clientY); else if (tip()) tip().hidden = true;
  });
  document.addEventListener("focusin", (e) => {
    const target = e.target.closest && e.target.closest("[data-tip]");
    if (target) { const r = target.getBoundingClientRect(); showTip(target, r.right, r.top); }
  });
  document.addEventListener("focusout", () => { if (tip()) tip().hidden = true; });
  document.addEventListener("scroll", () => { if (tip()) tip().hidden = true; }, { passive: true });

  window.NCRCharts = {
    hbar: (el, o) => mount(el, hbar, o), grouped: (el, o) => mount(el, grouped, o), stacked: (el, o) => mount(el, stacked, o),
    forest: (el, o) => mount(el, forest, o), scatter: (el, o) => mount(el, scatter, o), dotplot, rerenderVisible, niceMax,
  };
})();
