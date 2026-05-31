"""
Summer 2026 — HUC-2 Active-Signal Bar + All-Gage Location Map
=============================================================
LEFT  : Vertical stacked bar chart — HUC-2 basin composition using only the
         three ACTIVE categories (P-Increasing / P-Decreasing / Hidden Change).
         Truly Stable gages are excluded, so bars do NOT sum to 100%.
         Basins sorted by % Hidden Change (descending).

RIGHT : CONUS map — all active gages plotted on the HUC-2 basins.
         Colour = category (green / red / orange).
         Uniform dot size (pure location / coverage map).

Output: Results_Summer_2026/geo_huc2_bar_hcmap_Summer2026.png
"""
import os
import glob
import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.gridspec as gridspec
import matplotlib.lines as mlines
import warnings
warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
MASTER  = (r"C:\Users\najam\OneDrive - Colostate\Spring2026"
           r"\Precip_Project_NSF_S26\Results_Summer_2026\master_Summer2026.csv")
HUC_DIR = (r"C:\Users\najam\OneDrive - Colostate\Spring2026"
           r"\Precip_Project_S26\HUCs")
OUT_DIR = (r"C:\Users\najam\OneDrive - Colostate\Spring2026"
           r"\Precip_Project_NSF_S26\Results_Summer_2026")

P_THRESH = 0.05
C_INC = "#27AE60"
C_DEC = "#E74C3C"
C_HC  = "#E67E22"
C_TS  = "#2980B9"

HUC2_NAMES = {
    "01": "New England",        "02": "Mid-Atlantic",
    "03": "S. Atlantic-Gulf",   "04": "Great Lakes",
    "05": "Ohio",               "06": "Tennessee",
    "07": "Upper Mississippi",  "08": "Lower Mississippi",
    "09": "Souris-Red-Rainy",   "10": "Missouri",
    "11": "Ark-White-Red",      "12": "Texas-Gulf",
    "13": "Rio Grande",         "14": "Upper Colorado",
    "15": "Lower Colorado",     "16": "Great Basin",
    "17": "Pacific Northwest",  "18": "California",
}

# ── Load & classify ───────────────────────────────────────────────────────────
df  = pd.read_csv(MASTER)
pns = df["P_cat"] == "P-Not Significant"

df["cat4"] = "Truly Stable"
df.loc[df["P_cat"] == "P-Increasing", "cat4"] = "P-Increasing"
df.loc[df["P_cat"] == "P-Decreasing", "cat4"] = "P-Decreasing"
df.loc[pns & ((df["p_N"] <= P_THRESH) | (df["p_D"] <= P_THRESH)),
       "cat4"] = "Hidden Change"

mask = ((df["latitude"]  >= 24) & (df["latitude"]  <= 50) &
        (df["longitude"] >= -125) & (df["longitude"] <= -66))
df = df[mask].copy()

# ── Spatial join → HUC-2 ─────────────────────────────────────────────────────
huc4_files = sorted(glob.glob(
    os.path.join(HUC_DIR, "wbd_*_hu2_shape__shapewbdhu4shp.gpkg")))
huc4_files = [f for f in huc4_files
              if any(f"wbd_{r:02d}_" in f for r in range(1, 19))]
huc4_parts = [gpd.read_file(f) for f in huc4_files]
huc4_all   = gpd.GeoDataFrame(
    pd.concat(huc4_parts, ignore_index=True), crs=huc4_parts[0].crs)
huc4_all["huc2"] = huc4_all["huc4"].str[:2]
huc2_geo = (huc4_all.dissolve(by="huc2")
                    .reset_index()[["huc2", "geometry"]]
                    .to_crs("EPSG:5070"))

gdf_all = gpd.GeoDataFrame(
    df, geometry=gpd.points_from_xy(df["longitude"], df["latitude"]),
    crs="EPSG:4326").to_crs("EPSG:5070")

joined = gpd.sjoin(gdf_all, huc2_geo[["huc2", "geometry"]],
                   how="left", predicate="within")

# Active categories only (Truly Stable dropped from the bar composition)
ACTIVE   = ["P-Increasing", "P-Decreasing", "Hidden Change"]
ALL_CATS = ACTIVE + ["Truly Stable"]
COLORS   = [C_INC, C_DEC, C_HC]

# Per-basin counts (keep Truly Stable in the denominator so % is share of
# all gages in the basin, then plot only the three active segments)
agg = (joined.groupby(["huc2", "cat4"])
             .size()
             .unstack(fill_value=0)
             .reindex(columns=ALL_CATS, fill_value=0)
             .reset_index())
agg["n_total"] = agg[ALL_CATS].sum(axis=1)
for c in ALL_CATS:
    agg[f"pct_{c}"] = agg[c] / agg["n_total"] * 100

agg["label"] = agg["huc2"].map(HUC2_NAMES)

# Sort by % Hidden Change (descending → highest HC on the left)
agg = agg.sort_values("pct_Hidden Change", ascending=False).reset_index(drop=True)

# ── Active gages for map ──────────────────────────────────────────────────────
act_df  = df[df["cat4"].isin(ACTIVE)].copy()
act_gdf = gpd.GeoDataFrame(
    act_df,
    geometry=gpd.points_from_xy(act_df["longitude"], act_df["latitude"]),
    crs="EPSG:4326"
).to_crs("EPSG:5070")

print(f"Active gages plotted : {len(act_gdf)}")
for c in ACTIVE:
    print(f"  {c:<15}: {(act_gdf['cat4'] == c).sum()}")

# ── HUC-2 for map ─────────────────────────────────────────────────────────────
conus = huc2_geo.copy()

# ── Figure: 1 row × 2 cols, map wider ────────────────────────────────────────
fig = plt.figure(figsize=(22, 9))
fig.patch.set_facecolor("white")
gs  = gridspec.GridSpec(1, 2, width_ratios=[1, 1.55], wspace=0.06)

ax_bar = fig.add_subplot(gs[0])
ax_map = fig.add_subplot(gs[1])

# ══ LEFT — stacked vertical bar chart (active categories only) ════════════════
ax_bar.set_facecolor("white")

x       = np.arange(len(agg))
width   = 0.65
bottoms = np.zeros(len(agg))

for cat, color in zip(ACTIVE, COLORS):
    vals = agg[f"pct_{cat}"].values
    ax_bar.bar(x, vals, width=width, bottom=bottoms,
               color=color, alpha=0.85,
               edgecolor="white", linewidth=0.6,
               zorder=3)
    for i, (v, b) in enumerate(zip(vals, bottoms)):
        if v >= 4:
            ax_bar.text(x[i], b + v / 2, f"{v:.0f}%",
                        ha="center", va="center",
                        fontsize=6.8, fontweight="bold",
                        color="white", zorder=4)
    bottoms += vals

y_top = max(bottoms.max() * 1.12, 5)
ax_bar.set_xticks(x)
ax_bar.set_xticklabels(agg["label"], fontsize=6.2, rotation=35, ha="right")
ax_bar.set_ylabel("Percentage of stations (%)", fontsize=10.5)
ax_bar.set_ylim(0, y_top)
ax_bar.set_xlim(-0.6, len(agg) - 0.4)
ax_bar.yaxis.grid(True, linestyle=":", alpha=0.35, color="black", zorder=0)
ax_bar.set_axisbelow(True)
ax_bar.spines[["top", "right"]].set_visible(False)
ax_bar.tick_params(axis="x", length=0)
ax_bar.tick_params(axis="y", labelsize=9)
ax_bar.set_title("HUC-2 Basin Composition (Active Signals)", fontsize=11,
                 fontweight="bold", pad=8)

bar_handles = [mpatches.Patch(facecolor=c, alpha=0.85, label=cat)
               for cat, c in zip(ACTIVE, COLORS)]
ax_bar.legend(handles=bar_handles, fontsize=8, loc="upper right",
              framealpha=0.92, edgecolor="#CCCCCC")

# ══ RIGHT — all active gages on HUC-2 basins ══════════════════════════════════
ax_map.set_facecolor("#EAF3FB")
conus.plot(ax=ax_map, facecolor="#F7F7F0", edgecolor="#888888",
           linewidth=0.5, zorder=1)
ax_map.set_axis_off()

DOT_SIZE = 16
# Draw P-Inc and P-Dec first, Hidden Change on top so it stays visible
for cat, color, z in [("P-Increasing", C_INC, 2),
                      ("P-Decreasing", C_DEC, 3),
                      ("Hidden Change", C_HC, 4)]:
    sub = act_gdf[act_gdf["cat4"] == cat]
    ax_map.scatter(sub.geometry.x, sub.geometry.y,
                   c=color, s=DOT_SIZE,
                   alpha=0.80, linewidths=0.3,
                   edgecolors="white", zorder=z, label=cat)

ax_map.set_title("All Active Gages on HUC-2 Basins",
                 fontsize=11, fontweight="bold", pad=8)

map_handles = [mlines.Line2D([], [], marker="o", linestyle="none",
                             markerfacecolor=c, markeredgecolor="white",
                             markersize=8, label=cat)
               for cat, c in zip(ACTIVE, COLORS)]
ax_map.legend(handles=map_handles, fontsize=9, loc="lower right",
              framealpha=0.92, edgecolor="#CCCCCC", title="Category",
              title_fontsize=9)

# ── HUC-2 basin name labels on map ───────────────────────────────────────────
huc2_named = huc2_geo.copy()
huc2_named["name"] = huc2_named["huc2"].map(HUC2_NAMES)

for _, row in huc2_named.iterrows():
    cx = row.geometry.centroid.x
    cy = row.geometry.centroid.y
    ax_map.text(cx, cy, row["name"],
                ha="center", va="center",
                fontsize=5.8, color="#333333",
                zorder=5,
                bbox=dict(facecolor="white", alpha=0.45,
                          edgecolor="none", pad=0.8,
                          boxstyle="round,pad=0.2"))

fig.suptitle(
    "CONUS  |  OLS  |  1990-2025  |  "
    r"Snow $\leq$ 20%  |  p $\leq$ 0.05",
    fontsize=12, fontweight="bold", y=1.01)

plt.tight_layout()
out = os.path.join(OUT_DIR, "geo_huc2_bar_hcmap_Summer2026.png")
plt.savefig(out, dpi=300, bbox_inches="tight", facecolor="white")
plt.close()
print(f"Saved: {out}")
