# NJ Flood Risk City Fact Sheets

City-by-city fact sheets covering flood exposure, population impact, public asset risk, and disaster recovery for every NJ municipality. Static site, no build step.

## Live site

Deploy via GitHub Pages from the `main` branch root.

City deep link: `?city=<MunicipalityName>`

Example: `https://rebuildbydesign.github.io/nj-flood-risk-fact-sheet-cities/?city=Hoboken`

## Files

| Path | Purpose |
|---|---|
| `index.html` | Page shell, search bar, export button |
| `scripts.js` | CSV loader, fact sheet renderer, PDF/PNG export, URL deep-linking |
| `styles.css` | Layout and print styles |
| `nj-city-findings.csv` | Per-city data, one row per municipality |
| `data/nj_pop_2024.csv` | 2024 population reference |
| `RBD-logo.png`, `nj-banner.png` | Header assets |

## Regenerating the findings CSV

`build_findings.py` rebuilds `nj-city-findings.csv` from the source GIS exports. Inputs expected in `data/`:

- `gis-export-key-findings.csv` (asset-level rows)
- `all-nj-cities.csv` (master 547-municipality list)
- `blueacres_centroids.geojson` (Blue Acres parcels)
- `boundary.json` (statewide municipal boundaries)
- `NJ_FEMA_County.geojson` (Atlas of Disaster county data)

Run: `python build_findings.py data/`
