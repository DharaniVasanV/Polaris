# POLARIS — Intelligent Antarctic Navigation Co-Pilot

> **Smart India Hackathon Prototype** — Antarctic Maritime Spatiotemporal Decision-Support Platform

---

## Quick Start

### Option A — One-Click (Windows)
Double-click **`run-all.bat`** in the root directory.  
This automatically starts:
1. The **Python FastAPI Tri-AI Model Server** on `http://127.0.0.1:8000`
2. The **React + TypeScript Vite Frontend** on `http://localhost:5173/`

---

### Option B — Run via Terminal

#### Terminal 1 — Start Python AI & Decision Backend
```cmd
cd d:\SIH\polaris\polaris\backend
python run_server.py
```
- **Backend API**: `http://127.0.0.1:8000`
- **Swagger Documentation**: `http://127.0.0.1:8000/docs`
- **Health Check**: `http://127.0.0.1:8000/health`

#### Terminal 2 — Start React Vite Frontend
```cmd
cd d:\SIH\polaris\polaris
npm install
npm run dev
```
- **Frontend UI**: `http://localhost:5173/`

---

### Option C — Run Full Test Suite (156 Tests)
```cmd
cd d:\SIH\polaris\polaris
pytest backend/tests -v
```

---

### Option D — Production Build Check
```cmd
cd d:\SIH\polaris\polaris
npm run build
```

## Demo Credentials

| Field    | Value                 |
|----------|-----------------------|
| Email    | `captain@polaris.ai`  |
| Password | `polaris2026`         |

Also test **EMERGENCY OFFLINE LOGIN** to demonstrate offline-first operation.

---

## Build & Preview

```cmd
npm run build
npm run preview
```

---

## Technology Stack

- **React 18** + **TypeScript 5** (strict mode)
- **Vite 5** (dev server + production bundler)
- **Tailwind CSS 3** (dark utility-first styling)
- **Custom Canvas Map Engine** (zero external tile dependency)
- 100% offline-first — no external API calls at runtime

---

## Core Features

| Feature | Status |
|---|---|
| Login Screen (Regular + Emergency Offline) | ✅ Fully functional |
| Antarctic Polar Stereographic Canvas Map | ✅ Fully functional |
| Spatiotemporal Risk Engine `Risk(Location, Time)` | ✅ Fully functional |
| Time-Aware A* Route Generation | ✅ Fully functional |
| Shortest Route Rejection with explanation | ✅ Fully functional |
| Safe Route A recommendation with trade-off card | ✅ Fully functional |
| Map Layer Toggles (SIC, Icebergs, Routes, Stations) | ✅ Fully functional |
| Timeline Slider (NOW, +6h, +12h, +18h, +24h) | ✅ Fully functional |
| 4D Ice Intelligence (TODAY / +1D / +3D / +7D) | ✅ Fully functional |
| Captain Decision Center with SIMULATE HAZARD | ✅ Fully functional |
| B-22 Iceberg Drift → Critical Alert → Alternative Route B | ✅ Fully functional |
| Human-in-the-loop Captain Approval | ✅ Fully functional |
| What-If Scenario Engine (10 scenarios) | ✅ Fully functional |
| NO SAFE ROUTE FOUND state | ✅ Fully functional |
| Delayed Departure Spatiotemporal Demo | ✅ Fully functional |
| Fleet Management Screen (5 vessels) | ✅ Fully functional |
| Research Operations (Bharati, Maitri) | ✅ Fully functional |
| Demo Director (10 SIH Presentation Stages) | ✅ Fully functional |
| Operational Audit Log | ✅ Fully functional |
| Offline Mode Banner & Reduced Confidence | ✅ Fully functional |
| Presentation Mode HUD | ✅ Fully functional |

---

## Operational Principle

> **AI recommends; Captain / Ice Navigator makes the final operational decision.**

POLARIS is a decision-support system. It never autonomously approves dangerous navigation. Every route change requires explicit human confirmation.

---

## Prototype Transparency

All data in this prototype is **deterministic simulation data**. No live satellite feeds, no external APIs. In a production deployment, POLARIS would integrate:
- Copernicus Sentinel-1 SAR sea-ice feeds
- AMSR2 passive microwave ice concentration
- US National Ice Center (NIC) iceberg telemetry
- GEBCO bathymetry
