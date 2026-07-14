import weatherData from '../data/bali-weather-data.json'
import elevationData from '../data/bali-elevation-grid.json'

// Interfaces
export interface ClimateMetrics {
  lat: number
  lon: number
  elevation: number
  rain_prop: number
  annual_rainfall: number
  avg_temp: number
  sun_hours: number
  wind_speed: number
}

// Bounding box parameters for our coarse 17x27 grid
const minLat = -8.85
const minLon = 114.45
const latStep = 0.05
const lonStep = 0.05

// Initialize regular 17x27 grids for sea-level base climate conditions
// (subtracting altitude-based orographic effects to get baseline sea-level trends)
const baseRainGrid = Array(17).fill(0).map(() => Array(27).fill(1200.0))
const baseRainPropGrid = Array(17).fill(0).map(() => Array(27).fill(4.1))
const baseWindGrid = Array(17).fill(0).map(() => Array(27).fill(10.5))

for (const p of weatherData) {
  const latIdx = Math.round((p.lat - minLat) / latStep)
  const lonIdx = Math.round((p.lon - minLon) / lonStep)
  if (latIdx >= 0 && latIdx < 17 && lonIdx >= 0 && lonIdx < 27) {
    // Subtract altitude dependencies to obtain pure horizontal trends at sea-level
    baseRainGrid[latIdx][lonIdx] = p.annual_rainfall - 1.35 * p.elevation
    baseRainPropGrid[latIdx][lonIdx] = p.rain_prop - 0.0014 * p.elevation
    baseWindGrid[latIdx][lonIdx] = p.wind_speed - 0.005 * p.elevation
  }
}

// Create an O(1) elevation lookup map for our 1.1 km dense grid
const elevationMap = new Map<string, number>()
for (const p of elevationData) {
  // Format coordinate keys to 2 decimal places to match 0.01 degree step
  const latKey = Math.round(p.lat * 100) / 100
  const lonKey = Math.round(p.lon * 100) / 100
  const key = `${latKey.toFixed(2)},${lonKey.toFixed(2)}`
  elevationMap.set(key, p.elev)
}

// Helper: Get elevation with 1.1 km accuracy
export function getElevation(lat: number, lon: number): number {
  const latKey = Math.round(lat * 100) / 100
  const lonKey = Math.round(lon * 100) / 100
  const key = `${latKey.toFixed(2)},${lonKey.toFixed(2)}`
  return elevationMap.get(key) || 0
}

// Helper: Perform bilinear interpolation over a 2D regular grid
function interpolateBilinear(grid: number[][], lat: number, lon: number): number {
  const latF = (lat - minLat) / latStep
  const lonF = (lon - minLon) / lonStep

  const lat0 = Math.max(0, Math.min(16, Math.floor(latF)))
  const lat1 = Math.max(0, Math.min(16, lat0 + 1))
  const lon0 = Math.max(0, Math.min(26, Math.floor(lonF)))
  const lon1 = Math.max(0, Math.min(26, lon0 + 1))

  const t = latF - lat0
  const u = lonF - lon0

  const v00 = grid[lat0][lon0]
  const v10 = grid[lat1][lon0]
  const v01 = grid[lat0][lon1]
  const v11 = grid[lat1][lon1]

  // Standard Bilinear formula
  return (1 - t) * (1 - u) * v00 + t * (1 - u) * v10 + (1 - t) * u * v01 + t * u * v11
}

// Synthesize hyper-detailed climate metrics for any coordinate using topographic downscaling
export function synthesizeClimate(lat: number, lon: number): ClimateMetrics {
  const elev = getElevation(lat, lon)
  
  // If point is in the ocean, return zero defaults
  if (elev === 0) {
    return {
      lat,
      lon,
      elevation: 0,
      rain_prop: 0,
      annual_rainfall: 0,
      avg_temp: 0,
      sun_hours: 0,
      wind_speed: 0
    }
  }

  // 1. Interpolate baseline horizontal trends
  const baseRain = interpolateBilinear(baseRainGrid, lat, lon)
  const baseRainProp = interpolateBilinear(baseRainPropGrid, lat, lon)
  const baseWind = interpolateBilinear(baseWindGrid, lat, lon)

  // 2. Synthesize microclimatic physical downscaling
  // - Temperature lapse rate
  const avg_temp = 27.2 - 0.0065 * elev
  
  // - Orographic precipitation sum
  const annual_rainfall = baseRain + 1.35 * elev
  
  // - Orographic rain coverage
  let rain_prop = baseRainProp + 0.0014 * elev
  // Keep the rain shadow adjustment for north coast
  if (lat > -8.2) {
    rain_prop -= 0.5
  }
  rain_prop = Math.max(2.5, Math.min(6.5, rain_prop))

  // - Solar sunshine hours
  const sun_hours = Math.max(4.5, Math.min(8.2, 7.8 - elev * 0.002 - rain_prop * 0.05))

  // - Altitude-adjusted wind speeds
  const wind_speed = baseWind + elev * 0.005

  return {
    lat,
    lon,
    elevation: elev,
    rain_prop: Math.round(rain_prop * 100) / 100,
    annual_rainfall: Math.round(annual_rainfall * 10) / 10,
    avg_temp: Math.round(avg_temp * 10) / 10,
    sun_hours: Math.round(sun_hours * 10) / 10,
    wind_speed: Math.round(wind_speed * 10) / 10
  }
}

// Fast O(N) lookup helper to find the closest land point
export function findClosestDensePoint(lat: number, lon: number): ClimateMetrics {
  let min_dist = Infinity
  let closest: any = null

  // Since we want to snap to actual land nodes, look up only from land coordinates
  for (const p of elevationData) {
    const dist = Math.pow(p.lat - lat, 2) + Math.pow(p.lon - lon, 2)
    if (dist < min_dist) {
      min_dist = dist
      closest = p
    }
  }

  if (closest) {
    return synthesizeClimate(closest.lat, closest.lon)
  }
  
  // Fail-safe fallback to central Bali
  return synthesizeClimate(-8.45, 115.15)
}
