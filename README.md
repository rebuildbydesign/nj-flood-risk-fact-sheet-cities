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
| `nj-city-findings.csv` | Per-city data, one row per municipality (564) |
| `data/nj-cities-cleanup-564.csv` | Master municipality list and 2024 populations |
| `RBD-logo.png`, `nj-banner.png` | Header assets |

## Population

Populations come from `data/nj-cities-cleanup-564.csv`, sourced from the Census
Bureau's Vintage 2024 Subcounty Population Estimates (SUB-EST2024). It is the only
population source; the page reads it via `nj-city-findings.csv`.

Twelve township names repeat across counties (five Washington Townships, two
Hamilton Townships, and so on). The master labels those rows `NAME (COUNTY)` and
every join is keyed on name **and** county. Joining on name alone collapses them.

## Regenerating the findings CSV

`build_findings.py` rebuilds `nj-city-findings.csv`. Inputs come from two places.

In this repo, under `data/`:

- `nj-cities-cleanup-564.csv` (master 564-municipality list with Census populations)
- `boundary.json` (statewide municipal boundaries, authoritative MUN to COUNTY)
- `NJ_FEMA_County.geojson` (Atlas of Disaster county data)

In the sibling `../nj-flood-risk-city/data/`:

- `gis-export-key-findings.csv` (asset-level rows)
- `all-nj-cities.csv` (outreach tier and priority rank)
- `blueacres_centroids.geojson` (Blue Acres parcels)

Run from the repo root: `python build_findings.py`

The argument is the repo root, not `data/`. The script prints a Blue Acres
reconciliation on completion; the parcel count must reach 1,677, the statewide
total the fact sheets cite. Any shortfall means a municipality name failed to
join, which fails silently in the output as a zero.
