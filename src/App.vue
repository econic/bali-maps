<script setup lang="ts">
import { ref } from 'vue'
import BaliMap from './components/BaliMap.vue'
import ClimateSidebar from './components/ClimateSidebar.vue'
import { Menu } from '@lucide/vue'

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

// Global shared states
const selectedOverlay = ref<'rain_prop' | 'annual_rainfall' | 'avg_temp' | 'sun_hours' | 'wind_speed'>('rain_prop')
const overlayOpacity = ref<number>(0.65)
const selectedPoint = ref<WeatherRecord | null>(null)
const sidebarOpen = ref<boolean>(true)

// Reference to map component to trigger basemap style changes
const mapRef = ref<any>(null)

function handleBaseMapChange(style: 'dark' | 'satellite' | 'terrain') {
  if (mapRef.value) {
    mapRef.value.setBaseLayer(style)
  }
}
</script>

<template>
  <div class="relative w-screen h-screen bg-[#0b0f19] text-gray-100 overflow-hidden font-sans">
    
    <!-- Immersive Interactive Map Component (Fills full viewport behind sidebar) -->
    <BaliMap
      ref="mapRef"
      :selectedOverlay="selectedOverlay"
      :opacity="overlayOpacity"
      v-model:selectedPoint="selectedPoint"
      class="absolute inset-0 w-full h-full"
    />

    <!-- Sidebar Controls Panel (Floating Absolute Overlay) -->
    <ClimateSidebar
      v-model:selectedOverlay="selectedOverlay"
      v-model:opacity="overlayOpacity"
      v-model:sidebarOpen="sidebarOpen"
      :selectedPoint="selectedPoint"
      @changeBaseMap="handleBaseMapChange"
    />

    <!-- Floating Re-open Sidebar Button (Only visible when sidebar collapsed) -->
    <button 
      v-if="!sidebarOpen"
      @click="sidebarOpen = true"
      class="absolute top-5 left-5 z-[400] p-3 bg-slate-950/90 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl shadow-xl backdrop-blur transition-all duration-200"
      title="Open Control Panel"
    >
      <Menu class="w-5 h-5" />
    </button>
  </div>
</template>

<style>
/* Global Leaflet icon fix and baseline transitions */
.leaflet-fade-anim .leaflet-tile,
.leaflet-zoom-anim .leaflet-tile {
  transition: opacity 0.2s linear !important;
}
</style>
