<script setup lang="ts">
import { onMounted, watch, ref, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import fruitData from '../data/bali-fruit-data.json'
import { getColorForMetric } from '../utils/climateColors'
import { 
  synthesizeClimate, 
  findClosestDensePoint 
} from '../utils/climateSynthesis'
import type { ClimateMetrics } from '../utils/climateSynthesis'

// Component props
const props = defineProps<{
  selectedOverlay: 'rain_prop' | 'annual_rainfall' | 'avg_temp' | 'sun_hours' | 'wind_speed' | 'fruit_suitability'
  selectedFruits: string[]
  opacity: number
  selectedPoint: ClimateMetrics | null
}>()

// Component emits
const emit = defineEmits<{
  (e: 'update:selectedPoint', point: ClimateMetrics | null): void
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let currentBaseLayer: L.TileLayer | null = null
let rasterLayer: L.GridLayer | null = null

// Cursor hover tooltip states
const hoveredMetrics = ref<ClimateMetrics | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

// Map layers definition
const tileProviders = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
}

// Get the color stops for our agricultural overlay (Wine Red -> Orange -> Yellow -> Green -> Emerald)
function getSuitabilityColor(score: number): string {
  const stops = [
    { val: 0, color: '#881337' },    // Deep Wine Red (Unsuitable)
    { val: 35, color: '#d97706' },   // Orange/Amber (Marginal)
    { val: 65, color: '#eab308' },   // Yellow (Fair/Some)
    { val: 85, color: '#22c55e' },   // Green (Good)
    { val: 100, color: '#059669' }   // Deep Emerald (Perfect)
  ]
  
  let i = 0
  for (i = 0; i < stops.length - 1; i++) {
    if (score >= stops[i].val && score <= stops[i+1].val) {
      break
    }
  }
  const s1 = stops[i]
  const s2 = stops[i+1]
  const range = s2.val - s1.val
  const factor = range > 0 ? (score - s1.val) / range : 0
  
  // Direct hex interpolation
  const c1 = s1.color
  const c2 = s2.color
  const r1 = parseInt(c1.slice(1, 3), 16)
  const g1 = parseInt(c1.slice(3, 5), 16)
  const b1 = parseInt(c1.slice(5, 7), 16)
  
  const r2 = parseInt(c2.slice(1, 3), 16)
  const g2 = parseInt(c2.slice(3, 5), 16)
  const b2 = parseInt(c2.slice(5, 7), 16)
  
  const r = Math.round(r1 + (r2 - r1) * factor)
  const g = Math.round(g1 + (g2 - g1) * factor)
  const b = Math.round(b1 + (b2 - b1) * factor)
  
  const toHex = (val: number) => {
    const clamped = Math.max(0, Math.min(255, val))
    const str = clamped.toString(16)
    return str.length === 1 ? '0' + str : str
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Calculate Suitability breakdown for selected fruits at a specific elevation
function calculateSuitabilityBreakdown(elevation: number, activeFruits: any[]) {
  if (activeFruits.length === 0) {
    return { goodCount: 0, kindaCount: 0, notCount: 0, score: 0 }
  }
  let goodCount = 0
  let kindaCount = 0
  let notCount = 0
  
  for (const fruit of activeFruits) {
    if (elevation >= fruit.good.min && elevation <= fruit.good.max) {
      goodCount++
    } else {
      let isKinda = false
      for (const range of fruit.kinda) {
        if (elevation >= range.min && elevation <= range.max) {
          isKinda = true
          break
        }
      }
      if (isKinda) {
        kindaCount++
      } else {
        notCount++
      }
    }
  }
  
  const score = ((goodCount * 1.0 + kindaCount * 0.4) / activeFruits.length) * 100
  return { goodCount, kindaCount, notCount, score }
}

// Function to redraw the continuous Canvas Raster Layer
function initRasterLayer() {
  if (!map) return

  // Remove existing raster layer if present
  if (rasterLayer) {
    map.removeLayer(rasterLayer)
  }

  // Extend L.GridLayer for HTML5 Canvas drawing
  const CustomRasterLayer = L.GridLayer.extend({
    createTile: function (coords: any, done: any) {
      const tile = document.createElement('canvas')
      const size = this.getTileSize()
      tile.width = size.x
      tile.height = size.y
      
      const ctx = tile.getContext('2d')
      if (!ctx) return tile

      const zoom = coords.z
      const overlay = props.selectedOverlay
      const isFruit = overlay === 'fruit_suitability'

      // Block size optimizes drawing speeds depending on zoom level:
      // Zoom 12-13 (detailed): 2x2 blocks (very high res)
      // Zoom 9-11 (coarse): 3x3 or 4x4 blocks (extremely fast, sub-millisecond per tile)
      const blockSize = zoom >= 12 ? 2 : (zoom >= 11 ? 3 : 4)
      const overlap = 0.4 // Overlap prevents sub-pixel gaps between adjacent blocks due to rounding
      const halfBlock = blockSize / 2

      const activeFruits = isFruit ? fruitData.filter((f: any) => props.selectedFruits.includes(f.name)) : []

      // Loop over the tile pixel coordinates
      for (let px = 0; px < size.x; px += blockSize) {
        for (let py = 0; py < size.y; py += blockSize) {
          
          // Map local tile pixel center to global world project point
          const worldX = coords.x * size.x + px + halfBlock
          const worldY = coords.y * size.y + py + halfBlock
          
          // Unproject world pixels to geographical coordinates (lat, lon)
          const latLng = map!.unproject([worldX, worldY], zoom)

          // Filter bounds to speed up loops
          if (
            latLng.lat < -9.0 || latLng.lat > -8.0 ||
            latLng.lng < 114.3 || latLng.lng > 115.8
          ) {
            continue
          }

          // Fetch topographic downscaling climate attributes
          const metrics = synthesizeClimate(latLng.lat, latLng.lng)
          
          // Skip drawing if the point lies in the ocean (elevation = 0)
          if (metrics.elevation === 0) {
            continue
          }

          let color = ''
          if (isFruit) {
            if (activeFruits.length === 0) continue
            const { score } = calculateSuitabilityBreakdown(metrics.elevation, activeFruits)
            color = getSuitabilityColor(score)
          } else {
            const val = metrics[overlay as keyof ClimateMetrics]
            color = getColorForMetric(overlay, val)
          }

          // Draw the dense colored block
          ctx.fillStyle = color
          ctx.fillRect(px, py, blockSize + overlap, blockSize + overlap)
        }
      }

      // Complete Leaflet async tile callback
      setTimeout(() => done(null, tile), 0)
      return tile
    }
  })

  // Instantiate the Custom Grid Layer on our gridPane overlay pane
  rasterLayer = new (CustomRasterLayer as any)({
    pane: 'gridPane',
    opacity: props.selectedOverlay === 'fruit_suitability' ? props.opacity * 1.15 : props.opacity
  })

  rasterLayer!.addTo(map)
}

// Function to select and highlight a point on click
function selectPoint(item: ClimateMetrics, openPopup = true, eLatLng?: L.LatLng) {
  emit('update:selectedPoint', item)

  if (openPopup && map) {
    const overlayName = getOverlayLabel(props.selectedOverlay)
    let popupContent = ''
    
    if (props.selectedOverlay === 'fruit_suitability') {
      const activeFruits = fruitData.filter(f => props.selectedFruits.includes(f.name))
      const { score } = calculateSuitabilityBreakdown(item.elevation, activeFruits)
      popupContent = `
        <div class="p-2 text-gray-100 min-w-[200px]">
          <h3 class="font-bold text-sm text-lime-400 mb-1">Local Agriculture Index</h3>
          <p class="text-xs text-gray-400 mb-2">Coords: ${item.lat.toFixed(3)}°S, ${item.lon.toFixed(3)}°E</p>
          <div class="space-y-1.5 text-xs">
            <div class="flex justify-between border-b border-gray-800 pb-1">
              <span class="text-gray-400">Elevation:</span>
              <span class="font-bold">${item.elevation} m</span>
            </div>
            <div class="flex justify-between font-semibold pt-0.5">
              <span class="text-gray-300">Suitability Index:</span>
              <span class="text-lime-300 font-extrabold">${Math.round(score)}%</span>
            </div>
          </div>
        </div>
      `
    } else {
      const overlayVal = item[props.selectedOverlay as keyof ClimateMetrics]
      const unit = getOverlayUnit(props.selectedOverlay)
      popupContent = `
        <div class="p-2 text-gray-100 min-w-[180px]">
          <h3 class="font-bold text-sm text-blue-400 mb-1">Local Microclimate</h3>
          <p class="text-xs text-gray-400 mb-2">Coords: ${item.lat.toFixed(3)}°S, ${item.lon.toFixed(3)}°E</p>
          <div class="space-y-1.5 text-xs">
            <div class="flex justify-between border-b border-gray-800 pb-1">
              <span class="text-gray-400">Elevation:</span>
              <span class="font-semibold">${item.elevation} m</span>
            </div>
            <div class="flex justify-between pt-0.5">
              <span class="text-gray-300 font-medium">${overlayName}:</span>
              <span class="font-bold text-blue-300">${overlayVal}${unit}</span>
            </div>
          </div>
        </div>
      `
    }

    const popupLocation = eLatLng || L.latLng(item.lat, item.lon)
    L.popup()
      .setLatLng(popupLocation)
      .setContent(popupContent)
      .openOn(map)
  }
}

// Helper labels for tooltips and sidebar
function getOverlayLabel(key: string): string {
  switch(key) {
    case 'rain_prop': return 'Noticeable Rain'
    case 'annual_rainfall': return 'Annual Rainfall'
    case 'avg_temp': return 'Avg Temp'
    case 'sun_hours': return 'Avg Sunshine'
    case 'wind_speed': return 'Max Wind'
    case 'fruit_suitability': return 'Fruit Suitability'
    default: return ''
  }
}

function getOverlayUnit(key: string): string {
  switch(key) {
    case 'rain_prop': return '%'
    case 'annual_rainfall': return ' mm'
    case 'avg_temp': return '°C'
    case 'sun_hours': return ' hrs/day'
    case 'wind_speed': return ' km/h'
    default: return ''
  }
}

// Helpers for the floating cursor tooltip card
function getTooltipValue(overlay: string, metrics: ClimateMetrics): string {
  if (overlay === 'fruit_suitability') {
    const activeFruits = fruitData.filter(f => props.selectedFruits.includes(f.name))
    const { score } = calculateSuitabilityBreakdown(metrics.elevation, activeFruits)
    return `${Math.round(score)}% Suitable`
  }
  const val = metrics[overlay as keyof ClimateMetrics] as number
  const unit = getOverlayUnit(overlay)
  return `${val}${unit}`
}

function getTooltipColor(overlay: string, metrics: ClimateMetrics): string {
  if (overlay === 'fruit_suitability') {
    const activeFruits = fruitData.filter(f => props.selectedFruits.includes(f.name))
    const { score } = calculateSuitabilityBreakdown(metrics.elevation, activeFruits)
    return getSuitabilityColor(score)
  }
  const val = metrics[overlay as keyof ClimateMetrics] as number
  return getColorForMetric(overlay, val)
}

// Switch base tile layer
function setBaseLayer(type: 'dark' | 'satellite' | 'terrain') {
  if (!map) return
  if (currentBaseLayer) {
    map.removeLayer(currentBaseLayer)
  }
  
  const url = tileProviders[type]
  const attribution = type === 'satellite' 
    ? 'Imagery © Esri' 
    : type === 'terrain'
      ? 'Map data © OpenStreetMap, SRTM'
      : '© OpenStreetMap contributors, © CARTO'
      
  currentBaseLayer = L.tileLayer(url, {
    maxZoom: 14,
    attribution: attribution
  }).addTo(map)
}

onMounted(() => {
  if (!mapContainer.value) return

  // Initialize leaflet map centered on Bali
  map = L.map(mapContainer.value, {
    center: [-8.45, 115.15],
    zoom: 10,
    minZoom: 9,
    maxZoom: 13,
    zoomControl: false
  })

  // Constrain map view to Bali bounds
  const southWest = L.latLng(-9.2, 114.1)
  const northEast = L.latLng(-7.8, 116.1)
  const bounds = L.latLngBounds(southWest, northEast)
  map.setMaxBounds(bounds)

  // Create gridPane overlay pane
  const gridPane = map.createPane('gridPane')
  gridPane.style.zIndex = '400'

  // Add zoom control to top-right
  L.control.zoom({ position: 'topright' }).addTo(map)

  // Set default basemap
  setBaseLayer('dark')

  // Render initial continuous raster tile layer
  initRasterLayer()

  // Continuous hover coordinate downscaler
  map.on('mousemove', (e: L.LeafletMouseEvent) => {
    const lat = e.latlng.lat
    const lon = e.latlng.lng

    // If outside Bali bounds, hide hover tooltip
    if (lat < -9.0 || lat > -8.0 || lon < 114.3 || lon > 115.8) {
      hoveredMetrics.value = null
      return
    }

    const metrics = synthesizeClimate(lat, lon)
    if (metrics.elevation > 0) {
      // Land coordinate: display custom HTML mouse tooltip card
      const containerPoint = e.containerPoint
      tooltipX.value = containerPoint.x + 15
      tooltipY.value = containerPoint.y + 15
      hoveredMetrics.value = metrics
      
      // Update sidebar in real-time as the cursor floats! Makes the dashboard feel incredibly alive
      emit('update:selectedPoint', metrics)
    } else {
      // Ocean coordinate: hide tooltip
      hoveredMetrics.value = null
    }
  })

  // Hide hover tooltip if cursor leaves the map container
  map.on('mouseout', () => {
    hoveredMetrics.value = null
  })

  // Continuous click downscaler: snaps and locks popup to precise clicked coordinates
  map.on('click', (e: L.LeafletMouseEvent) => {
    const lat = e.latlng.lat
    const lon = e.latlng.lng
    
    if (lat < -9.0 || lat > -8.0 || lon < 114.3 || lon > 115.8) return
    
    const metrics = synthesizeClimate(lat, lon)
    if (metrics.elevation > 0) {
      selectPoint(metrics, true, e.latlng)
    } else {
      // Clicked ocean: snap to nearest land point
      const closest = findClosestDensePoint(lat, lon)
      selectPoint(closest, true)
    }
  })
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
  }
})

// Watches to trigger canvas redraws on prop modifications
watch(() => props.selectedOverlay, () => {
  initRasterLayer()
  if (props.selectedPoint) {
    selectPoint(props.selectedPoint, false)
  }
})

watch(() => props.opacity, () => {
  initRasterLayer()
})

watch(() => props.selectedFruits, () => {
  if (props.selectedOverlay === 'fruit_suitability') {
    initRasterLayer()
    if (props.selectedPoint) {
      selectPoint(props.selectedPoint, false)
    }
  }
}, { deep: true })

// Expose setBaseLayer to parent component
defineExpose({
  setBaseLayer
})
</script>

<template>
  <div class="relative w-full h-full flex-grow">
    <!-- Map Div -->
    <div ref="mapContainer" class="w-full h-full z-0"></div>

    <!-- Floating Sub-Pixel Cursor Tooltip Card -->
    <div 
      v-if="hoveredMetrics"
      class="absolute z-[500] pointer-events-none bg-slate-950/90 backdrop-blur border border-slate-800/80 rounded-xl p-3 shadow-2xl flex flex-col space-y-1.5 min-w-[170px] select-none"
      :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
    >
      <div class="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono leading-none">
        Cursor Tracking
      </div>
      <div class="flex justify-between items-center text-[11px] font-bold border-b border-slate-900 pb-1.5 mb-1 select-none">
        <span class="text-slate-400">Elevation:</span>
        <span class="text-indigo-400 font-mono font-extrabold leading-none">{{ hoveredMetrics.elevation }}m</span>
      </div>
      
      <div class="flex justify-between items-center text-[11px] font-bold select-none">
        <span class="text-slate-400 font-semibold">{{ getOverlayLabel(selectedOverlay) }}:</span>
        <span class="font-mono font-extrabold leading-none" :style="{ color: getTooltipColor(selectedOverlay, hoveredMetrics) }">
          {{ getTooltipValue(selectedOverlay, hoveredMetrics) }}
        </span>
      </div>
    </div>

    <!-- Quick Floating Layer Indicators -->
    <div class="absolute bottom-5 left-5 z-[400] bg-gray-950/80 backdrop-blur border border-gray-800 rounded-lg p-2 px-3 text-xs flex items-center gap-2 pointer-events-none">
      <span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
      <span class="text-gray-300 font-medium capitalize">
        Overlay: {{ selectedOverlay.replace('_', ' ') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Leaflet customizations are handled globally in style.css */
</style>
