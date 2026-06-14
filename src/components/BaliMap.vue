<script setup lang="ts">
import { onMounted, watch, ref, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import weatherData from '../data/bali-weather-data.json'

import { getColorForMetric } from '../utils/climateColors'

// Custom interface for our weather record
interface WeatherRecord {
  lat: number
  lon: number
  elevation: number
  rain_prop: number
  annual_rainfall: number
  avg_temp: number
  sun_hours: number
  wind_speed: number
}

// Component props
const props = defineProps<{
  selectedOverlay: 'rain_prop' | 'annual_rainfall' | 'avg_temp' | 'sun_hours' | 'wind_speed'
  opacity: number
  selectedPoint: WeatherRecord | null
}>()

// Component emits
const emit = defineEmits<{
  (e: 'update:selectedPoint', point: WeatherRecord | null): void
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let currentBaseLayer: L.TileLayer | null = null
let gridLayersGroup: L.LayerGroup | null = null
const activeCircles = ref<Map<string, L.Circle>>(new Map())

// Map layers definition
const tileProviders = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
}

// Helper: Get color based on value and selected metric (using continuous gradient)
function getColor(metric: string, val: number): string {
  return getColorForMetric(metric, val)
}

// Helper: Find closest grid point
function findClosestPoint(lat: number, lon: number): WeatherRecord {
  let min_dist = Infinity
  let closest = weatherData[0] as WeatherRecord
  
  for (const p of weatherData as WeatherRecord[]) {
    const dist = Math.pow(p.lat - lat, 2) + Math.pow(p.lon - lon, 2)
    if (dist < min_dist) {
      min_dist = dist
      closest = p
    }
  }
  return closest
}

// Function to redraw the climate grid circles
function renderGrid() {
  if (!map || !gridLayersGroup) return

  // Clear existing layers
  gridLayersGroup.clearLayers()
  activeCircles.value.clear()

  const overlay = props.selectedOverlay
  const opac = props.opacity

  // Draw a circle for each land coordinate
  for (const item of weatherData as WeatherRecord[]) {
    const key = `${item.lat},${item.lon}`
    const val = item[overlay]
    const color = getColor(overlay, val)

    // Scaled radius: 1167 meters (1/3 of original 3500m overlapping radius for discrete circles).
    const circle = L.circle([item.lat, item.lon], {
      pane: 'gridPane',
      radius: 1167,
      stroke: true,
      color: color,
      weight: 0.5,
      opacity: 0.2,
      fillColor: color,
      fillOpacity: opac,
      className: 'transition-all duration-300'
    })

    // Fast sneak peek tooltip on hover
    const unit = getOverlayUnit(overlay)
    circle.bindTooltip(`
      <div class="text-[10px] font-extrabold font-mono text-slate-100">
        ${val}${unit}
      </div>
    `, {
      permanent: false,
      direction: 'top',
      opacity: 0.95,
      className: 'custom-tooltip'
    })

    // Setup interactive events
    circle.on('mouseover', () => {
      circle.setStyle({
        weight: 2,
        color: '#ffffff',
        opacity: 0.9,
        fillOpacity: Math.min(1.0, opac + 0.15)
      })
      emit('update:selectedPoint', item)
    })

    circle.on('mouseout', () => {
      // Restore original style unless this is the locked selected point
      const isSelected = props.selectedPoint && 
                         props.selectedPoint.lat === item.lat && 
                         props.selectedPoint.lon === item.lon

      if (!isSelected) {
        circle.setStyle({
          weight: 0.5,
          color: color,
          opacity: 0.2,
          fillOpacity: opac
        })
      }
    })

    circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e)
      selectPoint(item, true)
    })

    gridLayersGroup.addLayer(circle)
    activeCircles.value.set(key, circle)
  }
}

// Function to select and highlight a point on click
function selectPoint(item: WeatherRecord, openPopup = true) {
  emit('update:selectedPoint', item)

  // Clear high-level styles on all circles first
  activeCircles.value.forEach((circle, key) => {
    const [lat, lon] = key.split(',').map(Number)
    const overlay = props.selectedOverlay
    const val = (weatherData as WeatherRecord[]).find(p => p.lat === lat && p.lon === lon)?.[overlay] || 0
    const color = getColor(overlay, val)
    
    circle.setStyle({
      weight: 0.5,
      color: color,
      opacity: 0.2,
      fillOpacity: props.opacity
    })
  })

  // Highlight the selected circle
  const selectedKey = `${item.lat},${item.lon}`
  const selectedCircle = activeCircles.value.get(selectedKey)
  if (selectedCircle) {
    selectedCircle.setStyle({
      weight: 2.5,
      color: '#ffffff',
      opacity: 1.0,
      fillOpacity: Math.min(1.0, props.opacity + 0.2)
    })
    
    if (openPopup && map) {
      const overlayName = getOverlayLabel(props.selectedOverlay)
      const overlayVal = item[props.selectedOverlay]
      const unit = getOverlayUnit(props.selectedOverlay)
      
      const popupContent = `
        <div class="p-2 text-gray-100 min-w-[180px]">
          <h3 class="font-bold text-sm text-blue-400 mb-1">Grid Weather Station</h3>
          <p class="text-xs text-gray-400 mb-2">Coords: ${item.lat.toFixed(2)}°S, ${item.lon.toFixed(2)}°E</p>
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
      selectedCircle.bindPopup(popupContent).openPopup()
    }
  }
}

// Helper labels for dynamic popups
function getOverlayLabel(key: string): string {
  switch(key) {
    case 'rain_prop': return 'Noticeable Rain'
    case 'annual_rainfall': return 'Annual Rainfall'
    case 'avg_temp': return 'Avg Temp'
    case 'sun_hours': return 'Avg Sunshine'
    case 'wind_speed': return 'Max Wind'
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
    zoomControl: false // we will place zoom control in a better place
  })

  // Constrain map view to Bali bounding box (with buffers)
  const southWest = L.latLng(-9.2, 114.1)
  const northEast = L.latLng(-7.8, 116.1)
  const bounds = L.latLngBounds(southWest, northEast)
  map.setMaxBounds(bounds)

  // Create a custom pane specifically for the weather grid.
  // This allows smooth CSS opacity fading for all grid cells during zoom animations.
  const gridPane = map.createPane('gridPane')
  gridPane.style.zIndex = '400'
  gridPane.style.transition = 'opacity 150ms ease-in-out'
  gridPane.style.opacity = '1'

  // Add zoom control manually to top-right
  L.control.zoom({ position: 'topright' }).addTo(map)

  // Set default base layer (Sleek Dark Map)
  setBaseLayer('dark')

  // Create grid layer group
  gridLayersGroup = L.layerGroup().addTo(map)

  // Render initial grid
  renderGrid()

  // Zoom animation handling: Fade out during zoom, recalculate and fade in after zoom stabilizes
  map.on('zoomstart', () => {
    const pane = map?.getPane('gridPane')
    if (pane) {
      pane.style.opacity = '0'
    }
  })

  map.on('zoomend', () => {
    // Redraw and recalculate all grid positions and scale for the new zoom level
    renderGrid()
    
    // Re-highlight the selected point if there is one
    if (props.selectedPoint) {
      selectPoint(props.selectedPoint, false)
    }

    // Short timeout to guarantee Leaflet has completed DOM transforms and positioning before fading back in
    setTimeout(() => {
      const pane = map?.getPane('gridPane')
      if (pane) {
        pane.style.opacity = '1'
      }
    }, 50)
  })

  // Catch clicks anywhere on the map to select nearest grid point
  map.on('click', (e) => {
    const lat = e.latlng.lat
    const lon = e.latlng.lng
    
    // Ensure the click is within Bali bounds
    if (lat < -9.0 || lat > -8.0 || lon < 114.3 || lon > 115.8) return
    
    const closest = findClosestPoint(lat, lon)
    selectPoint(closest, true)
  })
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
  }
})

// React to changes in overlay
watch(() => props.selectedOverlay, () => {
  renderGrid()
  // Re-highlight if a point was selected
  if (props.selectedPoint) {
    selectPoint(props.selectedPoint, false)
  }
})

// React to opacity adjustments
watch(() => props.opacity, () => {
  renderGrid()
  if (props.selectedPoint) {
    selectPoint(props.selectedPoint, false)
  }
})

// React to external selected point changes (like snapping on clicking search or clicking analyzer)
watch(() => props.selectedPoint, (newVal) => {
  if (newVal) {
    // If popup is closed or we clicked another spot, highlight it
    const activeCircle = activeCircles.value.get(`${newVal.lat},${newVal.lon}`)
    if (activeCircle && !activeCircle.isPopupOpen()) {
      selectPoint(newVal, false)
    }
  }
})

// Expose setBaseLayer to the parent component
defineExpose({
  setBaseLayer
})
</script>

<template>
  <div class="relative w-full h-full flex-grow">
    <!-- Map Div -->
    <div ref="mapContainer" class="w-full h-full z-0"></div>

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
/* Scoped adjustments if needed, Leaflet container overrides are handled in style.css */
</style>
