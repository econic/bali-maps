export interface ColorStop {
  val: number
  color: string
}

// Microclimate gradient stops defined for each metric
export const climateStops: Record<string, { min: number; max: number; stops: ColorStop[] }> = {
  rain_prop: {
    min: 2.5,
    max: 6.5,
    stops: [
      { val: 2.5, color: '#a3e635' }, // Lime (Very Dry)
      { val: 3.3, color: '#34d399' }, // Emerald
      { val: 4.1, color: '#22d3ee' }, // Cyan
      { val: 4.9, color: '#3b82f6' }, // Blue
      { val: 5.7, color: '#4f46e5' }, // Indigo
      { val: 6.5, color: '#8b5cf6' }  // Violet (Very Wet)
    ]
  },
  annual_rainfall: {
    min: 950,
    max: 4200,
    stops: [
      { val: 950, color: '#f97316' },  // Orange (Dry)
      { val: 1600, color: '#fbbf24' }, // Amber
      { val: 2250, color: '#10b981' }, // Emerald
      { val: 2900, color: '#06b6d4' }, // Cyan
      { val: 3550, color: '#2563eb' }, // Blue
      { val: 4200, color: '#7c3aed' }  // Violet (Wet peaks)
    ]
  },
  avg_temp: {
    min: 19.0,
    max: 27.2,
    stops: [
      { val: 19.0, color: '#818cf8' },  // Indigo (Cool peaks)
      { val: 21.05, color: '#22d3ee' }, // Cyan
      { val: 23.1, color: '#34d399' },  // Emerald
      { val: 25.15, color: '#fb923c' }, // Orange
      { val: 27.2, color: '#ef4444' }   // Red (Warm coast)
    ]
  },
  sun_hours: {
    min: 4.5,
    max: 7.8,
    stops: [
      { val: 4.5, color: '#4b5563' },  // Gray (Cloudy mountains)
      { val: 5.325, color: '#818cf8' },// Indigo
      { val: 6.15, color: '#a3e635' }, // Lime
      { val: 6.975, color: '#facc15' },// Yellow
      { val: 7.8, color: '#f97316' }   // Orange (Sunny coasts)
    ]
  },
  wind_speed: {
    min: 8.0,
    max: 24.0,
    stops: [
      { val: 8.0, color: '#10b981' },  // Emerald (Calm)
      { val: 12.0, color: '#06b6d4' }, // Cyan
      { val: 16.0, color: '#3b82f6' }, // Blue
      { val: 20.0, color: '#8b5cf6' }, // Violet
      { val: 24.0, color: '#ec4899' }  // Pink (Gusty cliffs/peaks)
    ]
  }
}

// Convert hex string to RGB
function hexToRgb(hex: string) {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.slice(0, 2), 16)
  const g = parseInt(cleanHex.slice(2, 4), 16)
  const b = parseInt(cleanHex.slice(4, 6), 16)
  return { r, g, b }
}

// Convert RGB to hex string
function rgbToHex(r: number, g: number, b: number): string {
  const toHexStr = (val: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(val)))
    const str = clamped.toString(16)
    return str.length === 1 ? '0' + str : str
  }
  return '#' + toHexStr(r) + toHexStr(g) + toHexStr(b)
}

// Interpolate two colors by a factor [0, 1]
function interpolate(c1: string, c2: string, factor: number): string {
  const r1 = hexToRgb(c1)
  const r2 = hexToRgb(c2)
  
  const r = r1.r + (r2.r - r1.r) * factor
  const g = r1.g + (r2.g - r1.g) * factor
  const b = r1.b + (r2.b - r1.b) * factor
  
  return rgbToHex(r, g, b)
}

// Smoothly gets the color for any metric and value
export function getColorForMetric(metric: string, val: number): string {
  const config = climateStops[metric]
  if (!config) return '#ffffff'

  const { min, max, stops } = config
  const clampedVal = Math.max(min, Math.min(max, val))

  // Find the bounding stops
  let i = 0
  for (i = 0; i < stops.length - 1; i++) {
    if (clampedVal >= stops[i].val && clampedVal <= stops[i + 1].val) {
      break
    }
  }

  const s1 = stops[i]
  const s2 = stops[i + 1]
  
  // Calculate relative factor between s1 and s2
  const range = s2.val - s1.val
  const factor = range > 0 ? (clampedVal - s1.val) / range : 0

  return interpolate(s1.color, s2.color, factor)
}
