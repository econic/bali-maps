# Bali Microclimate & Fruit Suitability Atlas

An interactive, high-resolution geospatial atlas visualizing microclimates, meteorological patterns, and crop suitability across the island of Bali, Indonesia.

Built with **Vue 3**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Leaflet**, featuring continuous high-resolution topographic downscaling and real-time HTML5 Canvas raster rendering.

---

## 🌟 Overview

Bali exhibits extreme microclimatic variation over short geographic distances—from arid coastal lowlands in the north and south to lush central rainforests and cool volcanic highlands above 3,000 meters (Mount Agung, Mount Batur, Mount Batukaru).

This application downscales meteorological data across a dense topographic grid (~1.1 km / 0.01° resolution) to provide smooth, continuous climate overlays and dynamic agricultural suitability analysis for 36 tropical crops.

---

## ✨ Features

- **Interactive Climate Overlays**:
  - **Noticeable Rain Coverage (`rain_prop`)**: Percentage of annual hours experiencing noticeable precipitation ($\ge 1.0\text{ mm/h}$).
  - **Annual Rainfall Amount (`annual_rainfall`)**: Accumulated annual precipitation in millimeters, capturing tropical convective rainfall and orographic uplift.
  - **Average Temperature (`avg_temp`)**: Daily mean temperature in °C, modeled using environmental lapse rates with elevation.
  - **Daily Sunshine Hours (`sun_hours`)**: Average clear sunshine hours per day, accounting for diurnal cloud formation over central volcanic ridges.
  - **Average Max Wind Speed (`wind_speed`)**: Typical peak daily wind speeds (km/h) across coastal and mountain passes.
  - **Fruit Suitability (`fruit_suitability`)**: Spatial agricultural suitability score computed dynamically from selected crops and terrain elevation.

- **Dynamic Crop Suitability Engine**:
  - Database of **36 tropical fruits & crops** (Mangosteen, Durian, Snake Fruit / Salak, Rambutan, Cacao, Arabica/Robusta Coffee, Kintamani Orange, Dragon Fruit, Avocado, and more).
  - Multi-select, toggle all, and search filtering.
  - Detailed point inspections showing optimal, marginal, and unsuitable breakdown for chosen crops.

- **Point-Based Climate & Activity Intelligence**:
  - Click anywhere on the island to inspect local elevation and synthesized microclimatic metrics.
  - Calculated outdoor suitability scores:
    - 🏖️ **Beach & Swim Index**: High sunshine, warm temperatures, low rain frequency.
    - 🥾 **Mountain Hiking Index**: Cool comfortable temperatures, low rainfall, moderate winds.
    - 🏄 **Windsurfing & Sailing Index**: Coastal wind strength, comfortable temperatures, minimal squalls.

- **Smooth Continuous Canvas Raster Engine**:
  - Leaflet custom HTML5 Canvas TileLayer that computes color gradients on-the-fly without blocky grid artifacts.
  - Adjustable overlay opacity slider.

- **Multiple Basemaps & Responsive UI**:
  - Switch between **Dark Matter (CartoDB)**, **Satellite Imagery (Esri)**, and **Topographic Terrain (OpenTopoMap)**.
  - Sleek, collapsible dark-mode sidebar built with Tailwind CSS.

---

## 🛠️ Tech Stack

- **Frontend Framework**: [Vue 3](https://vuejs.org/) (Composition API with `<script setup>`)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Mapping & GIS**: [Leaflet](https://leafletjs.com/) with custom HTML5 Canvas raster layers
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [PostCSS](https://postcss.org/)
- **Icons**: [Lucide Vue](https://lucide.dev/) (`@lucide/vue`, `lucide-vue-next`)
- **Data Modeling & Preprocessing**: Python 3 (Open-Meteo elevation API, bilinear interpolation)

---

## 📁 Project Structure

```
bali-maps/
├── index.html                   # Entry HTML template
├── package.json                 # Project dependencies & scripts
├── vite.config.ts               # Vite configuration
├── tailwind.config.js           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript root configuration
├── public/                      # Static assets and icons
├── scripts/                     # Python offline data pipelines
│   ├── collect_data.py          # Queries Open-Meteo elevation & models coarse grid
│   ├── collect_dense_dem.py    # Fetches high-density DEM via API
│   └── generate_dense_dem.py   # Interpolates dense 0.01° DEM grid locally
└── src/
    ├── main.ts                  # Vue application bootstrap
    ├── App.vue                  # Main application container
    ├── style.css                # Global styles and Leaflet overrides
    ├── assets/                  # Project imagery and SVG assets
    ├── components/
    │   ├── BaliMap.vue          # Interactive Leaflet map & canvas raster renderer
    │   └── ClimateSidebar.vue   # Overlay controls, crop selector & metric cards
    ├── data/
    │   ├── bali-fruit-data.json     # 36 crops with elevation ranges & details
    │   ├── bali-weather-data.json   # 194-point baseline meteorological model
    │   └── bali-elevation-grid.json # Dense (~1.1 km) elevation model for Bali
    └── utils/
        ├── climateColors.ts     # Continuous color ramp interpolation
        └── climateSynthesis.ts  # Topographic downscaling & bilinear interpolation
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x, v20.x, or later recommended)
- `npm` (comes with Node.js) or `pnpm` / `yarn`
- *(Optional)* [Python 3](https://www.python.org/) if you wish to run the data collection and DEM generation scripts in `scripts/`.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/econic/bali-maps.git
   cd bali-maps
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

### Running the Application

- **Start Development Server**:
  ```bash
  npm run dev
  ```
  Open your browser and navigate to the local URL displayed in the terminal (typically `http://localhost:5173`).

- **Build for Production**:
  ```bash
  npm run build
  ```
  Runs `vue-tsc` type-checking and builds optimized production bundles into the `dist/` directory.

- **Preview Production Build**:
  ```bash
  npm run preview
  ```
  Starts a local static server to preview the production build in `dist/`.

---

## 🔬 Scientific & Meteorological Methodology

The climate metrics synthesis utilizes physical microclimatic relationships:

1. **Environmental Lapse Rate**:
   $$\Delta T = -0.0065^\circ\text{C} \times \text{Elevation (m)}$$
   Sea-level temperatures in coastal Bali average around $27.2^\circ\text{C}$, dropping to $\sim 8\text{--}10^\circ\text{C}$ on the summit of Mount Agung ($3,142\text{ m}$).

2. **Orographic Precipitation & Rain Shadows**:
   - Base rainfall starts between $950\text{ mm}$ (arid northern leeward coast) and $1,350\text{ mm}$ (central/south slopes).
   - Orographic uplift adds $\approx 1.35\text{ mm}$ of annual precipitation per meter of elevation on windward slopes.
   - High-elevation rain proportion ranges from $4.1\%$ to $5.9\%$ annual hours with rain $\ge 1.0\text{ mm/h}$.

3. **Solar Exposure & Cloud Cover**:
   High mountain elevations experience afternoon convective cloud buildup, reducing average daily sunshine hours from $>7.5\text{ h}$ on arid peninsulas (Bukit, Buleleng) to $<5.5\text{ h}$ in central volcanic calderas.

---

## 📜 License

This project is licensed under the MIT License.
