# Website Usage Guide: NCR Restaurant Benchmark Explorer

## 1. Starting the website

You need Python 3 (any recent version) and a modern browser (Chrome, Edge, Firefox or Safari). No internet connection is needed once the files are on your computer.

1. Open a terminal in the website folder (`PHASE3_STAGE2/WEBSITE`, or `FINAL_SUBMISSION/Website/Website_Source` in the submission).
2. Start the local server:

```bash
python -m http.server 8000
```

3. Open **http://localhost:8000** in the browser.
4. Stop the server with Ctrl+C in the terminal.

If port 8000 is busy, use another port (for example `python -m http.server 8080`, then open http://localhost:8080).

**Without a server.** `index.html` also loads `data/site_data.js`, a copy of the same data, so double-clicking `index.html` should work in most browsers. This file:// mode was not tested; the local server is the supported method.

## 2. Navigation

The top bar links to the six sections: Overview, Cities, Localities, Performance extremes, Research findings and Methodology. On narrow screens, the **Menu** button opens the same links. Every section has its own address (for example `#cities`), so the browser's Back button works. The dark strip under the header is a permanent reminder that this is a historical research benchmark.

## 3. City explorer

- Pick a city from the **City** list or click a city card.
- **City vs Delhi NCR** lists 14 metrics in four groups (visibility, perceived quality, engagement, positioning). Each row shows the city value with its 95% interval where one was published, the NCR benchmark, the sample size it is based on, and a small comparison line (dot = city, diamond = NCR). Select **i** next to a metric to see its definition, denominator and source column.
- **Compare all five cities** charts any metric across the cities. The selected city is orange, the dashed line is the NCR benchmark, and Ghaziabad is hatched and marked † because it has only 25 restaurants.
- **Within-city model estimates** (collapsed by default) shows Models 1–3 re-estimated for New Delhi, Gurgaon, Noida and Faridabad. No predictor × city interaction is significant, so these do not show that associations differ between cities.

## 4. Locality benchmark explorer

1. **Eligibility threshold.** 30+ restaurants is the primary threshold used in the paper (98 units). 20+ (136 units) and 50+ (47 units) are the paper's sensitivity thresholds. Only units meeting the selected threshold can be chosen.
2. **City.** Each option shows how many eligible units the city has. Ghaziabad has none at any threshold, and the page says so.
3. **Search.** Type part of a locality name to filter the list (for example "sector", "cyber" or "nagar").
4. **Locality.** Choose a unit. Units are identified as **City + Locality**, because names such as "MG Road", "Sector 15" and "Sector 37" exist in more than one city.

For the selected unit you get:

- **Header**: restaurants, rated and unrated counts, the identifier, the thresholds it meets, and its rating–engagement pattern label (primary threshold only).
- **Benchmarks**: locality value (with 95% interval and the n it is based on), city benchmark and NCR benchmark for every metric. Use **Show** to restrict the table to one dimension.
- **Where it sits**: median rating against median votes for the 82 units with 30+ restaurants and 20+ rated restaurants. The selected unit is orange, its city's other units navy, and the rest grey.
- **Composition**: price-tier mix and rating–engagement quadrant mix, each next to the city.
- **Ranks**: the unit's position in each of the nine separate rankings (primary threshold only; ties share a rank).

The address bar keeps the selection (for example `#localities?t=30&loc=New+Delhi+%7C+Khan+Market`), so a view can be bookmarked or shared.

**"Not available".** A value is never replaced with zero. You will see "Not available" when:
- the unit has fewer than 20 rated restaurants (rating statistics are not reported, following the paper's rule);
- no NCR-wide value exists in the verified results (NCR median votes and NCR median cost for two: a median cannot be rebuilt from city medians);
- the quadrant mix or ranks are requested for a unit below the primary threshold.

## 5. Performance extremes

- **Comparison** switches between three separate populations: highest- vs lowest-rated (rated NCR), most- vs least-voted (rated NCR), and most-voted vs zero-vote (all NCR). The population and group sizes are shown above the charts.
- **Adjusted odds ratios** come from the paper's extreme-group logistic regressions. They are not shown for the all-NCR comparison, because the paper reports near-separation there.
- **Quadrants.** Select a quadrant to see its profile, and choose a characteristic to compare all four. The quadrants are a median split (rating 3.3, votes 40), not discovered clusters, and they describe groups. They must not be used to predict an individual restaurant's success.

## 6. Research findings

- Tabs switch between the visibility, perceived quality and engagement models (arrow keys also work). Each chart shows estimates with 95% intervals; filled markers are significant at p < .05.
- On the engagement tab, **Population** switches between the primary rated-NCR model and the all-NCR sensitivity model.
- **Show city fixed effects** adds the city coefficients (Ghaziabad, n = 25, is shown but not interpreted).
- Engagement values are percentage differences in the geometric mean of (1 + Votes), not percentage changes in raw vote counts.

## 7. Accessibility

All controls have labels and work from the keyboard (Tab, Enter or Space, and arrow keys in the outcome tabs). Charts have text labels and accessible names, and chart elements with a tooltip can be focused. The layout adapts to phones, tablets and desktops.

## 8. Rebuilding the data

After any change to the verified results, regenerate the data from the project root:

```bash
python PHASE3_STAGE2/WEBSITE/build_website_data.py
```

It prints the number of validation checks passed and refuses to write data if any check fails. If you run a copy of the script from somewhere else (for example `FINAL_SUBMISSION/Website/Website_Source/`), point it at the project folder and it will write into that copy's `data/` folder:

```bash
python build_website_data.py --root "<path to ZOMATO_RESEARCH_PROJECT>"
```

The generated data are already included, so rebuilding is only needed if the underlying results change.
