"""Render the startup chart from a Windows integration report."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

source, output = map(Path, sys.argv[1:3])
data = json.loads(source.read_text(encoding="utf-8-sig"))
timing = data["startup"]
starts = [0, timing["logo"], timing["reveal"]]
durations = [timing["logo"], timing["reveal"] - timing["logo"], timing["done"] - timing["reveal"]]
colors = ["#727b91", "#527bff", "#9db2ff"]
ink, background = "#eff2fa", "#15171c"
fig, ax = plt.subplots(figsize=(8.2, 2.55), layout="constrained")
fig.patch.set_facecolor(background)
ax.set_facecolor(background)

for row, (start, duration, color) in enumerate(zip(starts, durations, colors)):
    ax.barh(row, duration, left=start, height=.58, color=color)
    ax.text(start + duration + 16, row, f"{duration} ms", color=ink, va="center", fontsize=10)

ax.set_title(f"NOVA {data['version']} · Startup sequence", loc="left", color=ink, fontsize=14, pad=10)
ax.set_yticks(range(3), ["Navigation to mark", "Mark and wordmark", "Blur reveal"])
ax.invert_yaxis()
ax.set_xlabel("Milliseconds from renderer navigation", color="#aeb6ca")
ax.set_xlim(0, timing["done"] + 125)
ax.tick_params(axis="both", colors="#aeb6ca", length=0)
ax.grid(axis="x", color="#35393f", alpha=.55)
ax.set_axisbelow(True)
for spine in ax.spines.values():
    spine.set_visible(False)

fig.savefig(output, dpi=160, facecolor=background)
