#!/usr/bin/env python3
"""
NJ Underwater - All-City Fact Sheet findings builder
=====================================================
Reproduces the manually-built nj-city-findings.csv for ALL ~547 NJ municipalities,
computed directly from the GIS asset export plus county-level FEMA/Atlas data and
Blue Acres buyout parcels.

Inputs (all under nj-flood-risk-city/data unless noted):
  - gis-export-key-findings.csv   asset-level rows: PUBLIC_ASSET, MUNCIPALITY, COUNTY, 2025_FLOOD, 2050 FLOOD
  - all-nj-cities.csv             per-city population, outreach tier, priority rank (547 unique munis)
  - blueacres_centroids.geojson   Blue Acres buyout parcels (MUNICIPALI property)
  - boundary.json                 statewide municipal boundaries -> authoritative MUN -> COUNTY
  - NJ_FEMA_County.geojson  (repo root)   Atlas of Disaster county-level: disaster count, FEMA $, per-capita, SVI

Output:
  - nj-city-findings.csv          one row per municipality, app-ready schema

Duplicate names (FIXED 2026-06): NJ has 12 township names shared across counties
(5 "Washington Twp", 4 "Franklin Twp", etc.). This script now keys every
municipality by NAME + COUNTY so each same-named township is a SEPARATE row.
Pine Valley Borough (dissolved 2022) is excluded. Populations come from the
authoritative 564-municipality master (Census 2024 SUB-EST estimates).

Run from the fact-sheet repo root:  python build_findings.py
Inputs:
  this repo:    data/boundary.json, data/NJ_FEMA_County.geojson,
                data/nj-cities-cleanup-564.csv  (the 564 master, with Census pops)
  sibling repo: ../nj-flood-risk-city/data/gis-export-key-findings.csv,
                ../nj-flood-risk-city/data/all-nj-cities.csv (outreach tier/rank),
                ../nj-flood-risk-city/data/blueacres_centroids.geojson
"""
import json, csv, os, sys, re

# Repo root (folder containing this script) unless overridden.
BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
LOCAL = os.path.join(BASE, "data")
DATA = os.path.join(BASE, "..", "nj-flood-risk-city", "data")  # sibling map repo
FEMA_GEO = os.path.join(LOCAL, "NJ_FEMA_County.geojson")
MASTER = os.path.join(LOCAL, "nj-cities-cleanup-564.csv")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BASE, "nj-city-findings.csv")

# PUBLIC_ASSET value -> (output column prefix)
ASSET_TYPES = [
    ("AIRPORT", "Infra_Airports"),
    ("HOSPITAL", "Infra_Hospitals"),
    ("KNOWN CONTAMINATED SITE", "Infra_Contaminated_Sites"),
    ("LIBRARY", "Infra_Libraries"),
    ("PARK", "Infra_Parks"),
    ("POWERPLANT", "Infra_Power_Plants"),
    ("SCHOOL", "Infra_Schools"),
    ("SOLID & HAZARDOUS WASTE SITE", "Infra_Hazardous_Waste"),
    ("SOLID WASTE LANDFILL", "Infra_Landfills"),
    ("SUPERFUND", "Infra_Superfund_Sites"),
    ("WASTEWATER TREATMENT", "Infra_Wastewater_Treatment"),
    ("POLICE STATION", "Infra_Police_Stations"),
    ("FIRE DEPARTMENT", "Infra_Fire_Departments"),
]
# friendly singular label for narrative facts
ASSET_LABEL = {
    "Infra_Airports": "airport",
    "Infra_Hospitals": "hospital",
    "Infra_Contaminated_Sites": "contaminated site",
    "Infra_Libraries": "library",
    "Infra_Parks": "park",
    "Infra_Power_Plants": "power plant",
    "Infra_Schools": "school",
    "Infra_Hazardous_Waste": "solid & hazardous waste site",
    "Infra_Landfills": "landfill",
    "Infra_Superfund_Sites": "Superfund site",
    "Infra_Wastewater_Treatment": "wastewater treatment center",
    "Infra_Police_Stations": "police station",
    "Infra_Fire_Departments": "fire department",
}

def norm(s):
    return str(s or "").upper().strip()

def titlecase_mun(mun):
    """NEWARK CITY -> Newark City ; expand common type suffixes nicely."""
    repl = {"TWP": "Township", "BORO": "Borough", "VLG": "Village"}
    words = []
    for w in mun.split():
        wu = w.upper()
        if wu in repl:
            words.append(repl[wu])
        elif "-" in w:
            words.append("-".join(p.capitalize() for p in w.split("-")))
        else:
            words.append(w.capitalize())
    return " ".join(words)

def pct(n, d):
    return f"{(100.0*n/d):.2f}%" if d else "0.00%"

# ---- authoritative municipalities from boundary.json (NAME + COUNTY) ----
# Each same-named township is a separate record; Pine Valley (dissolved) excluded.
records = []                 # [(MUN, COUNTY)] for all 564 real municipalities
name_county_count = {}       # MUN -> number of counties it appears in
with open(os.path.join(LOCAL, "boundary.json"), encoding="utf-8") as f:
    bd = json.load(f)
for feat in bd["features"]:
    p = feat["properties"]
    m = norm(p.get("MUN")); c = norm(p.get("COUNTY"))
    if not m or m == "PINE VALLEY BORO":
        continue
    records.append((m, c))
    name_county_count[m] = name_county_count.get(m, 0) + 1

def is_same_named(mun):
    return name_county_count.get(mun, 0) > 1

def city_key(mun, county):
    # Composite key for same-named towns; plain name otherwise (so border-tagged
    # strays aggregate under the one city, matching the 564 master).
    return f"{mun}|{county}" if (county and is_same_named(mun)) else mun

# ---- load GIS asset export (aggregate by composite NAME+COUNTY key) ----
assets = {}   # key -> { prefix: [total, f25, f50] }, plus '_all'
type_lookup = {a[0]: a[1] for a in ASSET_TYPES}
with open(os.path.join(DATA, "gis-export-key-findings.csv"), newline="", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        mun = norm(r.get("MUNCIPALITY"))
        if not mun:
            continue
        # GIS export uses "SOUTH ORANGE VILLAGE"; boundary/master use "... TWP".
        if mun == "SOUTH ORANGE VILLAGE":
            mun = "SOUTH ORANGE VILLAGE TWP"
        cnty = norm(r.get("COUNTY"))
        key = city_key(mun, cnty)
        ptype = norm(r.get("PUBLIC_ASSET"))
        prefix = type_lookup.get(ptype)
        f25 = 1 if str(r.get("2025_FLOOD", "")).strip() in ("1", "1.0") else 0
        f50 = 1 if str(r.get("2050 FLOOD", "")).strip() in ("1", "1.0") else 0
        d = assets.setdefault(key, {})
        cell = d.setdefault(prefix or "_other", [0, 0, 0])
        cell[0] += 1; cell[1] += f25; cell[2] += f50
        allc = d.setdefault("_all", [0, 0, 0])
        allc[0] += 1; allc[1] += f25; allc[2] += f50

# ---- 2024 population from the authoritative 564 master (Census SUB-EST) ----
# Master labels: "NEWARK CITY" (unique) or "WASHINGTON TWP (GLOUCESTER)" (same-named).
pop_by_key = {}
with open(MASTER, newline="", encoding="utf-8-sig") as f:
    reader = csv.reader(f)
    next(reader, None)  # header
    for row in reader:
        if not row or not row[0].strip():
            continue
        label = row[0].strip()
        mm = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", label)
        if mm:
            mun = norm(mm.group(1)); county = norm(mm.group(2))
        else:
            mun = norm(label); county = None
        pop_by_key[city_key(mun, county)] = str(row[1]).strip()  # "2024 POP" column

# ---- county-level FEMA / Atlas of Disaster ----
county_fema = {}  # COUNTY (upper) -> dict
with open(FEMA_GEO, encoding="utf-8") as f:
    fg = json.load(f)
for feat in fg["features"]:
    p = feat["properties"]
    cn = norm(p.get("COUNTY_NAM"))
    county_fema[cn] = {
        "disasters": p.get("COUNTY_DISASTER_COUNT", ""),
        "total_fema": p.get("COUNTY_TOTAL_FEMA", ""),
        "per_capita": p.get("COUNTY_PER_CAPITA", ""),
        "svi": p.get("SVI_2022", ""),
    }

# ---- Blue Acres parcels per municipality ----
blueacres = {}
with open(os.path.join(DATA, "blueacres_centroids.geojson"), encoding="utf-8") as f:
    ba = json.load(f)
for feat in ba["features"]:
    m = norm(feat["properties"].get("MUNICIPALI"))
    if m:
        blueacres[m] = blueacres.get(m, 0) + 1

# ---- per-city population + tier from all-nj-cities.csv (master 547 list) ----
cities = {}  # MUN -> {pop, tier, rank}
with open(os.path.join(DATA, "all-nj-cities.csv"), newline="", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        m = norm(r.get("MUNCIPALITY"))
        if not m:
            continue
        cities[m] = {
            "pop": str(r.get("2024_POP", "")).strip(),
            "tier": str(r.get("OUTREACH_TIER", "")).strip(),
            "rank": str(r.get("PRIORITY_RANK", "")).strip(),
        }

# ---- narrative fact generation ----
def make_facts(name_disp, a):
    facts = ["", "", ""]
    allc = a.get("_all", [0, 0, 0])
    total, r25, r50 = allc
    if total == 0:
        return facts
    def fmtpct(n, d):
        # match the table's formatting: whole number if integral, else one decimal
        v = round(100.0 * n / d, 1) if d else 0
        return str(int(v)) if v == int(v) else str(v)
    p25n = (100.0 * r25 / total) if total else 0   # numeric, for logic
    p50n = (100.0 * r50 / total) if total else 0
    p25 = fmtpct(r25, total)                        # string, for display
    p50 = fmtpct(r50, total)
    added = r50 - r25
    # Fact1: overall exposure trajectory
    if r25 > 0 and added > 0:
        if p25n >= 50:
            # already majority-exposed today
            tail = (f"<strong>{p50}% of the city's public assets exposed by 2050</strong>, "
                    f"among the highest exposure in the state.")
        elif r50 >= 2 * r25 and p50n >= 50:
            tail = f"<strong>more than doubling exposure and putting {p50}% of the city's public assets at risk by 2050</strong>."
        elif r50 >= 2 * r25:
            tail = f"<strong>more than doubling exposure and adding {added} facilities by 2050</strong>."
        elif p50n >= 50:
            tail = f"<strong>pushing over half ({p50}%) of the city's public assets into flood risk by 2050</strong>."
        else:
            tail = f"<strong>adding {added} facilities by 2050</strong>."
        facts[0] = (f"<strong>{r25} assets ({p25}%)</strong> sit in flood zones today. "
                    f"That rises to {r50} ({p50}%), {tail}")
    elif r25 == 0 and r50 > 0:
        facts[0] = (f"No public assets sit in flood zones today, but <strong>{r50} ({p50}%) "
                    f"become exposed by 2050</strong>.")
    elif r25 > 0 and added == 0:
        facts[0] = (f"<strong>{r25} assets ({p25}%)</strong> already sit in flood zones, "
                    f"a level that holds through 2050.")
    # Fact2 / Fact3: lone critical assets that flip or stay exposed
    # priority order for "the city's only ___" call-outs
    crit_order = ["Infra_Wastewater_Treatment", "Infra_Airports", "Infra_Hospitals",
                  "Infra_Power_Plants", "Infra_Superfund_Sites", "Infra_Hazardous_Waste",
                  "Infra_Landfills"]
    callouts = []
    for prefix in crit_order:
        cell = a.get(prefix)
        if not cell:
            continue
        t, c25, c50 = cell
        label = ASSET_LABEL[prefix]
        if t == 1 and c25 == 0 and c50 == 1:
            callouts.append(f"{name_disp}'s <strong>only {label}</strong> moves from no flood "
                            f"exposure to <strong>full exposure by 2050</strong>.")
        elif t == 1 and c25 == 1:
            callouts.append(f"{name_disp}'s <strong>only {label}</strong> is already in a flood "
                            f"zone today and remains at risk through 2050.")
    if len(callouts) >= 1:
        facts[1] = callouts[0]
    if len(callouts) >= 2:
        facts[2] = callouts[1]
    return facts

# ---- assemble output ----
header = ["CITY", "COUNTY", "Atlas_Total_Disaster_Declarations", "POPULATION"]
for _, prefix in ASSET_TYPES:
    header += [f"{prefix}_Total", f"{prefix}_In_Floodplain_2025", f"{prefix}_Pct_2025",
               f"{prefix}_In_Floodplain_2050", f"{prefix}_Pct_2050"]
header += ["County_FEMA_Total", "County_FEMA_Per_Capita", "County_SVI_2022",
           "blueacres", "OUTREACH_TIER", "PRIORITY_RANK", "Fact1", "Fact2", "Fact3"]

rows = []
# Iterate over the authoritative 564 municipalities (NAME + COUNTY), so every real
# municipality appears, including each same-named township and zero-asset towns.
for mun, county in sorted(records, key=lambda x: (titlecase_mun(x[0]), x[1])):
    key = city_key(mun, county)
    a = assets.get(key, {})
    disp = titlecase_mun(mun)
    cnty_title = county.title() if county else ""
    fema = county_fema.get(county, {})
    cinfo = cities.get(mun, {})  # outreach tier/rank keyed by name (carried to siblings)
    row = {
        "CITY": disp,
        "COUNTY": cnty_title,
        "Atlas_Total_Disaster_Declarations": fema.get("disasters", ""),
        "POPULATION": pop_by_key.get(key, ""),
        "County_FEMA_Total": fema.get("total_fema", ""),
        "County_FEMA_Per_Capita": fema.get("per_capita", ""),
        "County_SVI_2022": fema.get("svi", ""),
        # Blue Acres parcels lack a county field; only assign for unique names.
        "blueacres": (blueacres.get(mun, "") if not is_same_named(mun) else ""),
        "OUTREACH_TIER": cinfo.get("tier", ""),
        "PRIORITY_RANK": cinfo.get("rank", ""),
    }
    for _, prefix in ASSET_TYPES:
        t, c25, c50 = a.get(prefix, [0, 0, 0])
        row[f"{prefix}_Total"] = t
        row[f"{prefix}_In_Floodplain_2025"] = c25 if c25 else ""
        row[f"{prefix}_Pct_2025"] = pct(c25, t)
        row[f"{prefix}_In_Floodplain_2050"] = c50 if c50 else ""
        row[f"{prefix}_Pct_2050"] = pct(c50, t)
    f1, f2, f3 = make_facts(disp, a)
    row["Fact1"], row["Fact2"], row["Fact3"] = f1, f2, f3
    rows.append(row)

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=header)
    w.writeheader()
    for r in rows:
        w.writerow(r)

# summary to stderr
n_assets = sum(1 for r in rows if any(r[f"{p}_Total"] for _, p in ASSET_TYPES))
print(f"Wrote {len(rows)} cities to {OUT} ({n_assets} with at least one public asset).", file=sys.stderr)
