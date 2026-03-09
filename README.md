# Fort Collins River Level / Streamflow Dashboard

Educational web dashboard prototype built for **AI in Environmental Engineering (Midterm Project)**.  
Focus: **streamflow conditions** (Cache la Poudre River, Fort Collins) using realistic **mock (synthetic) data**.

## Project Goal
Create a simple, professional dashboard that communicates river conditions with:
- an interactive streamflow time-series chart
- computed indicators (current, mean, max)
- at least one dynamic user control (threshold slider)
- an AI-style plain-language summary of what the chart shows

## What the App Does
- Generates **90 days** of daily streamflow data (cfs) with realistic variation and peak events.
- Displays an interactive **line chart** of streamflow.
- Provides **Key Indicators**:
  - Current flow (latest day)
  - 90-day average
  - 90-day max
- Includes a dynamic **Flood Watch Threshold** slider:
  - draws a threshold line
  - highlights points above threshold
  - updates the “Today’s Snapshot” condition label
- Shows an **AI Summary** panel that updates with the selected threshold.

## Tech Stack
- HTML + CSS + JavaScript (static site)
- Chart rendered in-browser (no backend)

## How to Run Locally
Option A (simple): open `index.html` in a browser.  
Option B (recommended): run a local server from the project folder:

```bash
python -m http.server 5173
