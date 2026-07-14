<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  CloudRain, 
  Droplets, 
  Thermometer, 
  Sun, 
  Wind, 
  Layers, 
  Map, 
  Navigation, 
  Info, 
  Activity, 
  HelpCircle,
  X,
  TrendingUp,
  Compass,
  ArrowRight,
  Sprout
} from '@lucide/vue'
import type { ClimateMetrics } from '../utils/climateSynthesis'
import fruitData from '../data/bali-fruit-data.json'

// Props
const props = defineProps<{
  selectedOverlay: 'rain_prop' | 'annual_rainfall' | 'avg_temp' | 'sun_hours' | 'wind_speed' | 'fruit_suitability'
  selectedFruits: string[]
  opacity: number
  selectedPoint: ClimateMetrics | null
  sidebarOpen: boolean
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:selectedOverlay', overlay: 'rain_prop' | 'annual_rainfall' | 'avg_temp' | 'sun_hours' | 'wind_speed' | 'fruit_suitability'): void
  (e: 'update:selectedFruits', fruits: string[]): void
  (e: 'update:opacity', val: number): void
  (e: 'update:sidebarOpen', val: boolean): void
  (e: 'changeBaseMap', style: 'dark' | 'satellite' | 'terrain'): void
}>()

const activeTab = ref<'overlays' | 'insights' | 'help'>('overlays')
const activeBaseMap = ref<'dark' | 'satellite' | 'terrain'>('dark')

// List of available overlays
const overlays = [
  {
    id: 'rain_prop' as const,
    label: 'Noticeable Rain Coverage',
    description: '% of annual hours with rain >= 1.0mm/h. Our primary metric showing true rain frequency.',
    icon: CloudRain,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    glowColor: 'group-hover:border-indigo-500/30'
  },
  {
    id: 'annual_rainfall' as const,
    label: 'Annual Rainfall Amount',
    description: 'Average accumulated precipitation in millimeters per year. Shows the heavy tropical volumes.',
    icon: Droplets,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    glowColor: 'group-hover:border-emerald-500/30'
  },
  {
    id: 'avg_temp' as const,
    label: 'Average Temperature',
    description: 'Daily mean temperature in Celsius. Vividly highlights the cooling lapse rate with altitude.',
    icon: Thermometer,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    glowColor: 'group-hover:border-rose-500/30'
  },
  {
    id: 'sun_hours' as const,
    label: 'Daily Sunshine Hours',
    description: 'Average clear sun hours per day, factoring in afternoon mountain cloud buildup.',
    icon: Sun,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    glowColor: 'group-hover:border-amber-500/30'
  },
  {
    id: 'wind_speed' as const,
    label: 'Average Max Wind Speed',
    description: 'Typical daily maximum wind speed in km/h. Great for windsurfing and coastal breezes.',
    icon: Wind,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    glowColor: 'group-hover:border-pink-500/30'
  },
  {
    id: 'fruit_suitability' as const,
    label: 'Fruit Suitability',
    description: 'Dynamic suitability mapping of 36 tropical crops in Bali, showing what share thrives by elevation.',
    icon: Sprout,
    color: 'text-lime-400',
    bgColor: 'bg-lime-500/10',
    glowColor: 'group-hover:border-lime-500/30'
  }
]

const fruitSearchQuery = ref('')

const filteredFruits = computed(() => {
  if (!fruitSearchQuery.value) return fruitData
  const q = fruitSearchQuery.value.toLowerCase()
  return fruitData.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
})

function toggleFruit(name: string) {
  const list = [...props.selectedFruits]
  const idx = list.indexOf(name)
  if (idx > -1) {
    list.splice(idx, 1)
  } else {
    list.push(name)
  }
  emit('update:selectedFruits', list)
}

function enableAllFruits() {
  emit('update:selectedFruits', fruitData.map(f => f.name))
}

function disableAllFruits() {
  emit('update:selectedFruits', [])
}

const activeFruitAnalysis = computed(() => {
  if (!props.selectedPoint) return null
  const elevation = props.selectedPoint.elevation
  const activeFruits = fruitData.filter(f => props.selectedFruits.includes(f.name))
  
  if (activeFruits.length === 0) {
    return { goodCount: 0, kindaCount: 0, notCount: 0, score: 0, individualStatuses: [] }
  }
  
  let goodCount = 0
  let kindaCount = 0
  let notCount = 0
  const individualStatuses: { name: string; status: 'good' | 'kinda' | 'not' }[] = []
  
  for (const fruit of activeFruits) {
    let status: 'good' | 'kinda' | 'not' = 'not'
    if (elevation >= fruit.good.min && elevation <= fruit.good.max) {
      goodCount++
      status = 'good'
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
        status = 'kinda'
      } else {
        notCount++
        status = 'not'
      }
    }
    individualStatuses.push({ name: fruit.name, status })
  }
  
  const score = ((goodCount * 1.0 + kindaCount * 0.4) / activeFruits.length) * 100
  
  // Sort individual statuses: optimal first, then marginal, then unsuitable
  individualStatuses.sort((a, b) => {
    const weights = { good: 3, kinda: 2, not: 1 }
    return weights[b.status] - weights[a.status]
  })
  
  return { goodCount, kindaCount, notCount, score, individualStatuses }
})

// Dynamic suitabilities calculated from physical microclimate values
const suitabilityScores = computed(() => {
  if (!props.selectedPoint) return null

  const p = props.selectedPoint

  // 1. Beach & Swim index:
  // Favorable: High sun hours (> 7h is best), warm temp (> 25.5C is best), low rain (< 4% is best)
  const sunWeight = Math.min(100, ((p.sun_hours - 4.5) / 3.3) * 100)
  const tempWeight = Math.min(100, ((p.avg_temp - 19.0) / 8.2) * 100)
  const rainWeight = Math.max(0, 100 - ((p.rain_prop - 2.5) / 4.0) * 100)
  const beachIndex = Math.round(sunWeight * 0.4 + tempWeight * 0.4 + rainWeight * 0.2)

  // 2. Mountain Hiking index:
  // Favorable: Cool temp (around 18-22C is ideal, hot is hard, very cold is okay), low rain coverage, low wind
  const hikingTempFactor = p.avg_temp < 22.0
    ? Math.min(100, ((p.avg_temp - 15.0) / 7.0) * 100) // cool is perfect
    : Math.max(0, 100 - ((p.avg_temp - 22.0) / 6.0) * 100) // heat decreases comfort
  const hikingRainFactor = Math.max(0, 100 - ((p.rain_prop - 2.5) / 4.0) * 100)
  const hikingWindFactor = Math.max(0, 100 - ((p.wind_speed - 8.0) / 16.0) * 100)
  const hikingIndex = Math.round(hikingTempFactor * 0.4 + hikingRainFactor * 0.4 + hikingWindFactor * 0.2)

  // 3. Windsurfing & Sailing index:
  // Favorable: Stronger wind (15-20 km/h is best), warm temperature, low rain
  const windFactor = Math.min(100, ((p.wind_speed - 8.0) / 14.0) * 100)
  const surfTempFactor = Math.min(100, ((p.avg_temp - 19.0) / 8.2) * 100)
  const surfRainFactor = Math.max(0, 100 - ((p.rain_prop - 2.5) / 4.0) * 100)
  const surfIndex = Math.round(windFactor * 0.5 + surfTempFactor * 0.3 + surfRainFactor * 0.2)

  return {
    beach: Math.max(10, Math.min(98, beachIndex)),
    hiking: Math.max(10, Math.min(98, hikingIndex)),
    surf: Math.max(10, Math.min(98, surfIndex))
  }
})

// Switch base maps
function selectBaseMap(style: 'dark' | 'satellite' | 'terrain') {
  activeBaseMap.value = style
  emit('changeBaseMap', style)
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
  if (score >= 60) return 'bg-teal-500/20 text-teal-400 border-teal-500/20'
  if (score >= 40) return 'bg-amber-500/20 text-amber-400 border-amber-500/20'
  return 'bg-rose-500/20 text-rose-400 border-rose-500/20'
}

function getBarColorClass(score: number): string {
  if (score >= 80) return 'bg-emerald-500 shadow-emerald-500/20'
  if (score >= 60) return 'bg-teal-500 shadow-teal-500/20'
  if (score >= 40) return 'bg-amber-500 shadow-amber-500/20'
  return 'bg-rose-500 shadow-rose-500/20'
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Optimal'
  if (score >= 60) return 'Favorable'
  if (score >= 40) return 'Moderate'
  return 'Suboptimal'
}

// Color scale legend data matching our map visualization
const legendData = computed(() => {
  switch (props.selectedOverlay) {
    case 'rain_prop':
      return {
        title: 'Noticeable Rain Coverage',
        stops: [
          { color: '#a3e635', label: '<3.0%' },
          { color: '#34d399', label: '3.0%-4.0%' },
          { color: '#22d3ee', label: '4.0%-4.8%' },
          { color: '#3b82f6', label: '4.8%-5.5%' },
          { color: '#4f46e5', label: '5.5%-6.0%' },
          { color: '#8b5cf6', label: '>6.0%' }
        ]
      }
    case 'annual_rainfall':
      return {
        title: 'Annual Rainfall Amount',
        stops: [
          { color: '#f97316', label: '<1.2k' },
          { color: '#fbbf24', label: '1.2k-1.6k' },
          { color: '#10b981', label: '1.6k-2.2k' },
          { color: '#06b6d4', label: '2.2k-2.8k' },
          { color: '#2563eb', label: '2.8k-3.5k' },
          { color: '#7c3aed', label: '>3.5k' }
        ]
      }
    case 'avg_temp':
      return {
        title: 'Average Temperature',
        stops: [
          { color: '#818cf8', label: '<20.5°' },
          { color: '#22d3ee', label: '20.5°-22.5°' },
          { color: '#34d399', label: '22.5°-24.5°' },
          { color: '#fb923c', label: '24.5°-26.0°' },
          { color: '#ef4444', label: '>26.0°' }
        ]
      }
    case 'sun_hours':
      return {
        title: 'Daily Sunshine Hours',
        stops: [
          { color: '#4b5563', label: '<5.0h' },
          { color: '#818cf8', label: '5.0h-6.0h' },
          { color: '#a3e635', label: '6.0h-6.8h' },
          { color: '#facc15', label: '6.8h-7.4h' },
          { color: '#f97316', label: '>7.4h' }
        ]
      }
    case 'wind_speed':
      return {
        title: 'Average Max Wind Speed',
        stops: [
          { color: '#10b981', label: '<11 km/h' },
          { color: '#06b6d4', label: '11-14' },
          { color: '#3b82f6', label: '14-17' },
          { color: '#8b5cf6', label: '17-20' },
          { color: '#ec4899', label: '>20' }
        ]
      }
    case 'fruit_suitability':
      return {
        title: 'Selected Fruits Suitability Index',
        stops: [
          { color: '#881337', label: '0%-20%' },
          { color: '#d97706', label: '20%-45%' },
          { color: '#eab308', label: '45%-70%' },
          { color: '#22c55e', label: '70%-90%' },
          { color: '#059669', label: '>90%' }
        ]
      }
  }
})

// Calculate smooth CSS linear-gradient background from color stops
const legendBackground = computed(() => {
  if (!legendData.value) return ''
  const colors = legendData.value.stops.map(s => s.color).join(', ')
  return `linear-gradient(to right, ${colors})`
})
</script>

<template>
  <!-- Sidebar Container (Absolute Overlay Panel) -->
  <div 
    class="absolute top-0 left-0 h-full flex flex-col transition-transform duration-300 ease-out z-[1000] border-r border-slate-900 shrink-0 bg-[#070a13]/98 backdrop-blur-md text-slate-200 w-full sm:w-[420px]"
    :class="[sidebarOpen ? 'translate-x-0' : '-translate-x-full border-r-0']"
  >
    <!-- Toggle Collapse Button on Sidebar (Inside sidebar itself when open) -->
    <button 
      @click="emit('update:sidebarOpen', false)"
      class="absolute top-5 right-5 text-slate-500 hover:text-white p-1.5 hover:bg-slate-900/60 rounded-xl transition-all duration-200 border border-transparent hover:border-slate-800/80 z-10"
      title="Collapse Sidebar"
    >
      <X class="w-4.5 h-4.5" />
    </button>

    <!-- Sidebar Scrollable Content -->
    <div class="flex-1 overflow-y-auto p-7 flex flex-col space-y-7 scroll-smooth">
      
      <!-- App Header Title -->
      <div class="flex items-center gap-4 pb-4 border-b border-slate-900">
        <div class="p-2.5 bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-700 rounded-2xl shadow-xl shadow-indigo-500/10 border border-white/10 shrink-0">
          <Layers class="w-5.5 h-5.5 text-white" />
        </div>
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <h1 class="text-sm font-extrabold tracking-tight text-white uppercase leading-none">
              Bali Climate Atlas
            </h1>
            <span class="text-[9px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider scale-90">
              SaaS v1.1
            </span>
          </div>
          <p class="text-[10px] text-slate-500 font-bold tracking-wider uppercase">
            5-Year High-Fidelity Climatology
          </p>
        </div>
      </div>

      <!-- Segmented Tab Controls (Premium iOS/SaaS style) -->
      <div class="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl text-[11px] font-bold border border-slate-900">
        <button 
          @click="activeTab = 'overlays'"
          class="py-2.5 px-3 rounded-lg transition-all duration-300 uppercase tracking-wide"
          :class="[activeTab === 'overlays' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200']"
        >
          Overlays
        </button>
        <button 
          @click="activeTab = 'insights'"
          class="py-2.5 px-3 rounded-lg transition-all duration-300 uppercase tracking-wide"
          :class="[activeTab === 'insights' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200']"
        >
          Insights
        </button>
        <button 
          @click="activeTab = 'help'"
          class="py-2.5 px-3 rounded-lg transition-all duration-300 uppercase tracking-wide"
          :class="[activeTab === 'help' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-200']"
        >
          Grid Info
        </button>
      </div>

      <!-- TAB CONTENT: OVERLAYS -->
      <div v-if="activeTab === 'overlays'" class="flex flex-col space-y-7">
        
        <!-- Overlay Layer Selection -->
        <div class="flex flex-col space-y-3.5">
          <div class="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-wider uppercase">
            <Layers class="w-3.5 h-3.5 text-indigo-400/80" />
            <span>Select Climate Overlay</span>
          </div>

          <div class="space-y-2.5">
            <div 
              v-for="item in overlays" 
              :key="item.id"
              @click="emit('update:selectedOverlay', item.id)"
              class="group flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-300 select-none bg-slate-900/10 hover:bg-slate-900/30 hover:-translate-y-0.5"
              :class="[
                selectedOverlay === item.id 
                  ? 'border-indigo-500/80 shadow-xl shadow-indigo-500/5 bg-slate-900/40' 
                  : 'border-slate-900 ' + item.glowColor
              ]"
            >
              <div class="p-2.5 rounded-xl shrink-0 transition-transform duration-300 group-hover:scale-105" :class="item.bgColor">
                <component :is="item.icon" class="w-4 h-4" :class="item.color" />
              </div>
              
              <div class="flex-1 space-y-1.5 min-w-0">
                <div class="flex items-center justify-between">
                  <h3 class="text-xs font-bold transition-colors text-slate-200 group-hover:text-white">
                    {{ item.label }}
                  </h3>
                  <!-- Premium SaaS Dot indicator -->
                  <span 
                    v-if="selectedOverlay === item.id"
                    class="w-2 h-2 rounded-full bg-indigo-500 shadow shadow-indigo-500/50 relative flex"
                  >
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  </span>
                </div>
                <p class="text-[11px] leading-relaxed text-slate-400/90 font-medium">
                  {{ item.description }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Fruit Selector Panel (Visible only when Fruit Suitability is selected) -->
        <div v-if="selectedOverlay === 'fruit_suitability'" class="flex flex-col space-y-3.5 bg-slate-900/20 p-5 rounded-2xl border border-slate-900/60">
          <div class="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Filter Active Fruits</span>
            <span class="font-mono text-lime-400 font-extrabold text-[11px]">{{ selectedFruits.length }} / {{ fruitData.length }} Active</span>
          </div>

          <!-- Quick Action Buttons -->
          <div class="grid grid-cols-2 gap-2 text-[10px] font-bold">
            <button 
              @click="enableAllFruits" 
              class="py-2 px-3 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-300 hover:text-white rounded-xl transition-all duration-200 cursor-pointer"
            >
              Select All
            </button>
            <button 
              @click="disableAllFruits" 
              class="py-2 px-3 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-300 hover:text-white rounded-xl transition-all duration-200 cursor-pointer"
            >
              Clear All
            </button>
          </div>

          <!-- Search Input -->
          <div class="relative">
            <input 
              v-model="fruitSearchQuery"
              type="text" 
              placeholder="Search fruits..."
              class="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 text-xs text-slate-200 placeholder-slate-600 px-3.5 py-2 rounded-xl outline-none transition-all"
            />
          </div>

          <!-- Fruit List (Scrollable) -->
          <div class="max-h-[220px] overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar text-xs font-semibold">
            <div 
              v-for="fruit in filteredFruits" 
              :key="fruit.name"
              @click="toggleFruit(fruit.name)"
              class="flex items-center gap-3 p-2 rounded-xl bg-slate-950/40 hover:bg-slate-950/90 border border-transparent hover:border-slate-900 cursor-pointer select-none transition-all duration-150"
            >
              <input 
                type="checkbox" 
                :checked="selectedFruits.includes(fruit.name)"
                @click.stop="toggleFruit(fruit.name)"
                class="rounded border-slate-800 text-lime-500 bg-slate-950 focus:ring-0 cursor-pointer h-3.5 w-3.5 accent-lime-500"
              />
              <div class="flex-1 min-w-0 leading-tight">
                <div class="flex items-center justify-between">
                  <span class="truncate text-slate-200 font-bold group-hover:text-white text-[11px]">{{ fruit.name }}</span>
                  <span class="text-[8px] bg-slate-900 border border-slate-800/80 px-1.5 py-0.5 rounded-md text-slate-500 scale-95 shrink-0">{{ fruit.category }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Opacity Slider -->
        <div class="flex flex-col space-y-3.5 bg-slate-900/20 p-5 rounded-2xl border border-slate-900/60">
          <div class="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Overlay Opacity</span>
            <span class="font-mono text-indigo-400 font-extrabold text-[11px]">{{ Math.round(opacity * 100) }}%</span>
          </div>
          <div class="flex items-center">
            <input 
              type="range" 
              :value="opacity" 
              @input="e => emit('update:opacity', parseFloat((e.target as HTMLInputElement).value))"
              min="0.1" 
              max="1.0" 
              step="0.05"
              class="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>

        <!-- Color Gradient Map Legend Scale -->
        <div v-if="legendData" class="flex flex-col space-y-3.5 bg-slate-900/20 p-5 rounded-2xl border border-slate-900/60 select-none">
          <div class="flex justify-between items-center text-[10px] font-bold text-slate-500 tracking-wider uppercase">
            <span>Map Legend Scale</span>
            <span class="text-[9px] text-indigo-400 font-extrabold tracking-normal leading-none bg-indigo-500/10 border border-indigo-500/10 px-2 py-0.5 rounded">{{ legendData.title }}</span>
          </div>
          <div class="space-y-2.5">
            <!-- Smooth continuous flex color strip -->
            <div 
              class="h-2 w-full rounded-full border border-slate-950/80 shadow shadow-black/80"
              :style="{ background: legendBackground }"
            ></div>
            <!-- Dynamic stop markers and labels -->
            <div class="grid grid-cols-6 gap-0.5 text-[8.5px] text-slate-400/90 font-bold font-mono leading-none">
              <div 
                v-for="stop in legendData.stops" 
                :key="stop.label"
                class="flex flex-col items-center text-center shrink-0 min-w-0"
              >
                <span class="w-1.5 h-1.5 rounded-full mb-1.5 border border-black/40" :style="{ backgroundColor: stop.color }"></span>
                <span class="truncate w-full max-w-full px-0.5">{{ stop.label }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Map Base Toggles -->
        <div class="flex flex-col space-y-3.5">
          <div class="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-wider uppercase">
            <Map class="w-3.5 h-3.5 text-cyan-400/80" />
            <span>Map Basemap Style</span>
          </div>
          <div class="grid grid-cols-3 gap-2.5">
            <button 
              @click="selectBaseMap('dark')"
              class="flex flex-col items-center gap-2 p-3 rounded-2xl text-[10px] font-bold tracking-wide uppercase border transition-all duration-300 group"
              :class="[activeBaseMap === 'dark' ? 'bg-indigo-950/20 border-indigo-500/80 text-white' : 'bg-slate-900/10 border-slate-900 text-slate-400 hover:text-slate-200']"
            >
              <Layers class="w-4 h-4 text-indigo-400 transition-transform duration-300 group-hover:scale-105" />
              <span>Dark Vector</span>
            </button>
            <button 
              @click="selectBaseMap('satellite')"
              class="flex flex-col items-center gap-2 p-3 rounded-2xl text-[10px] font-bold tracking-wide uppercase border transition-all duration-300 group"
              :class="[activeBaseMap === 'satellite' ? 'bg-indigo-950/20 border-indigo-500/80 text-white' : 'bg-slate-900/10 border-slate-900 text-slate-400 hover:text-slate-200']"
            >
              <Sun class="w-4 h-4 text-amber-400 transition-transform duration-300 group-hover:scale-105" />
              <span>Satellite</span>
            </button>
            <button 
              @click="selectBaseMap('terrain')"
              class="flex flex-col items-center gap-2 p-3 rounded-2xl text-[10px] font-bold tracking-wide uppercase border transition-all duration-300 group"
              :class="[activeBaseMap === 'terrain' ? 'bg-indigo-950/20 border-indigo-500/80 text-white' : 'bg-slate-900/10 border-slate-900 text-slate-400 hover:text-slate-200']"
            >
              <Navigation class="w-4 h-4 text-emerald-400 transition-transform duration-300 group-hover:scale-105" />
              <span>Terrain</span>
            </button>
          </div>
        </div>

        <!-- Location Analyzer Section (Grid Inspection) -->
        <div class="flex flex-col space-y-3.5 pt-2">
          <div class="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-wider uppercase">
            <Activity class="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Grid Location Analyzer</span>
          </div>

          <!-- Empty State -->
          <div 
            v-if="!selectedPoint"
            class="flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-900/10 text-slate-500 space-y-3"
          >
            <Compass class="w-8 h-8 text-slate-700 animate-spin-slow" />
            <div class="space-y-1">
              <h4 class="text-xs font-bold text-slate-400">No Location Highlighted</h4>
              <p class="text-[11px] leading-relaxed max-w-[260px] text-slate-500 font-semibold">
                Hover over the map grid or click any location to calculate localized microclimate data.
              </p>
            </div>
          </div>

          <!-- Selected State Scorecard (High-end glassmorphic scorecard) -->
          <div 
            v-else
            class="flex flex-col space-y-5 p-5 rounded-2xl border border-slate-800 bg-gradient-to-br from-indigo-500/[0.04] via-slate-900/50 to-slate-950 shadow-2xl"
          >
            <!-- Location Details Header -->
            <div class="flex justify-between items-center border-b border-slate-900 pb-3.5">
              <div class="space-y-1">
                <h4 class="text-xs font-black text-white uppercase tracking-wider">Active Cell Metrics</h4>
                <p class="font-mono text-[10px] text-slate-400 font-semibold flex items-center gap-1.5">
                  <Compass class="w-3 h-3 text-indigo-400" />
                  <span>{{ selectedPoint.lat.toFixed(3) }}°S , {{ selectedPoint.lon.toFixed(3) }}°E</span>
                </p>
              </div>
              <div class="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-extrabold px-3 py-1 rounded-xl uppercase tracking-wider">
                Alt: {{ selectedPoint.elevation }}m
              </div>
            </div>

            <!-- Quantitative Metrics Grid -->
            <div class="grid grid-cols-2 gap-2.5 text-xs font-semibold">
              <div class="p-3 bg-slate-950/60 border border-slate-900 rounded-xl flex items-center gap-3">
                <CloudRain class="w-4 h-4 text-blue-400 shrink-0" />
                <div class="space-y-0.5">
                  <div class="text-[9px] font-bold text-slate-500 uppercase tracking-wide leading-none">Rain Coverage</div>
                  <div class="font-extrabold text-slate-200 font-mono text-[11px]">{{ selectedPoint.rain_prop }}%</div>
                </div>
              </div>
              <div class="p-3 bg-slate-950/60 border border-slate-900 rounded-xl flex items-center gap-3">
                <Droplets class="w-4 h-4 text-emerald-400 shrink-0" />
                <div class="space-y-0.5">
                  <div class="text-[9px] font-bold text-slate-500 uppercase tracking-wide leading-none">Annual Rain</div>
                  <div class="font-extrabold text-slate-200 font-mono text-[11px]">{{ Math.round(selectedPoint.annual_rainfall) }}mm</div>
                </div>
              </div>
              <div class="p-3 bg-slate-950/60 border border-slate-900 rounded-xl flex items-center gap-3">
                <Thermometer class="w-4 h-4 text-rose-400 shrink-0" />
                <div class="space-y-0.5">
                  <div class="text-[9px] font-bold text-slate-500 uppercase tracking-wide leading-none">Avg Temp</div>
                  <div class="font-extrabold text-slate-200 font-mono text-[11px]">{{ selectedPoint.avg_temp }}°C</div>
                </div>
              </div>
              <div class="p-3 bg-slate-950/60 border border-slate-900 rounded-xl flex items-center gap-3">
                <Sun class="w-4 h-4 text-amber-400 shrink-0" />
                <div class="space-y-0.5">
                  <div class="text-[9px] font-bold text-slate-500 uppercase tracking-wide leading-none">Daily Sunshine</div>
                  <div class="font-extrabold text-slate-200 font-mono text-[11px]">{{ selectedPoint.sun_hours }}h</div>
                </div>
              </div>
              <div class="col-span-2 p-3 bg-slate-950/60 border border-slate-900 rounded-xl flex items-center gap-3 justify-between">
                <div class="flex items-center gap-3">
                  <Wind class="w-4 h-4 text-pink-400 shrink-0" />
                  <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Daily Max Wind Speed</span>
                </div>
                <span class="font-extrabold text-slate-200 font-mono text-[11px]">{{ selectedPoint.wind_speed }} km/h</span>
              </div>
            </div>

            <!-- Activity Comfort Indexes -->
            <div v-if="selectedOverlay !== 'fruit_suitability'" class="space-y-3.5 pt-3.5 border-t border-slate-900">
              <h5 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp class="w-3.5 h-3.5 text-indigo-400" />
                <span>Microclimatic Suitability Scores</span>
              </h5>

              <div class="space-y-3.5" v-if="suitabilityScores">
                <!-- Beach & Swim Index -->
                <div class="space-y-1.5">
                  <div class="flex justify-between items-center text-[11px] font-bold">
                    <span class="text-amber-300">🏖️ Beach & Swim comfort</span>
                    <div class="flex items-center gap-2 text-[9px]">
                      <span class="font-extrabold font-mono text-slate-100">{{ suitabilityScores.beach }}%</span>
                      <span class="text-[9.5px] border font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-95" :class="getScoreColor(suitabilityScores.beach)">
                        {{ getScoreLabel(suitabilityScores.beach) }}
                      </span>
                    </div>
                  </div>
                  <div class="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      class="h-full rounded-full transition-all duration-500 shadow-sm" 
                      :class="getBarColorClass(suitabilityScores.beach)"
                      :style="{ width: `${suitabilityScores.beach}%` }"
                    ></div>
                  </div>
                </div>

                <!-- Mountain Trekking Index -->
                <div class="space-y-1.5">
                  <div class="flex justify-between items-center text-[11px] font-bold">
                    <span class="text-emerald-300">🥾 Mountain Trekking comfort</span>
                    <div class="flex items-center gap-2 text-[9px]">
                      <span class="font-extrabold font-mono text-slate-100">{{ suitabilityScores.hiking }}%</span>
                      <span class="text-[9.5px] border font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-95" :class="getScoreColor(suitabilityScores.hiking)">
                        {{ getScoreLabel(suitabilityScores.hiking) }}
                      </span>
                    </div>
                  </div>
                  <div class="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      class="h-full rounded-full transition-all duration-500 shadow-sm" 
                      :class="getBarColorClass(suitabilityScores.hiking)"
                      :style="{ width: `${suitabilityScores.hiking}%` }"
                    ></div>
                  </div>
                </div>

                <!-- Surfing & Marine Activities Index -->
                <div class="space-y-1.5">
                  <div class="flex justify-between items-center text-[11px] font-bold">
                    <span class="text-cyan-300">⛵ Marine/Wind Sports suitability</span>
                    <div class="flex items-center gap-2 text-[9px]">
                      <span class="font-extrabold font-mono text-slate-100">{{ suitabilityScores.surf }}%</span>
                      <span class="text-[9.5px] border font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-95" :class="getScoreColor(suitabilityScores.surf)">
                        {{ getScoreLabel(suitabilityScores.surf) }}
                      </span>
                    </div>
                  </div>
                  <div class="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      class="h-full rounded-full transition-all duration-500 shadow-sm" 
                      :class="getBarColorClass(suitabilityScores.surf)"
                      :style="{ width: `${suitabilityScores.surf}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Active Fruit Suitability Breakdown Scorecard -->
            <div v-if="selectedOverlay === 'fruit_suitability'" class="space-y-4 pt-3.5 border-t border-slate-900">
              <h5 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sprout class="w-3.5 h-3.5 text-lime-400" />
                <span>Agricultural Suitability Summary</span>
              </h5>

              <div class="space-y-3.5" v-if="activeFruitAnalysis">
                <!-- Share Score Bar -->
                <div class="space-y-1.5">
                  <div class="flex justify-between items-center text-[11px] font-bold">
                    <span class="text-lime-300">📈 Selected Fruits Suitability Index</span>
                    <div class="flex items-center gap-2 text-[9px]">
                      <span class="font-extrabold font-mono text-slate-100">{{ Math.round(activeFruitAnalysis.score) }}%</span>
                      <span class="text-[9.5px] border font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-95" :class="getScoreColor(activeFruitAnalysis.score)">
                        {{ getScoreLabel(activeFruitAnalysis.score) }}
                      </span>
                    </div>
                  </div>
                  <div class="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      class="h-full rounded-full transition-all duration-500 shadow-sm" 
                      :class="getBarColorClass(activeFruitAnalysis.score)"
                      :style="{ width: `${activeFruitAnalysis.score}%` }"
                    ></div>
                  </div>
                </div>

                <!-- Numerical Shares Breakdown Grid -->
                <div class="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                  <div class="p-2 bg-emerald-950/20 border border-emerald-900/10 rounded-xl">
                    <div class="text-[14px] font-black font-mono text-emerald-400 leading-none mb-1">
                      {{ activeFruitAnalysis.goodCount }}
                    </div>
                    <div class="text-[8px] text-slate-500 uppercase tracking-wider">Good (Thrives)</div>
                  </div>
                  <div class="p-2 bg-amber-950/20 border border-amber-900/10 rounded-xl">
                    <div class="text-[14px] font-black font-mono text-amber-400 leading-none mb-1">
                      {{ activeFruitAnalysis.kindaCount }}
                    </div>
                    <div class="text-[8px] text-slate-500 uppercase tracking-wider">Kinda (Marginal)</div>
                  </div>
                  <div class="p-2 bg-rose-950/20 border border-rose-900/10 rounded-xl">
                    <div class="text-[14px] font-black font-mono text-rose-400 leading-none mb-1">
                      {{ activeFruitAnalysis.notCount }}
                    </div>
                    <div class="text-[8px] text-slate-500 uppercase tracking-wider">Not (Poor)</div>
                  </div>
                </div>

                <!-- Quick list of individual fruit statuses -->
                <div class="space-y-1.5">
                  <div class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Horticultural Standings</div>
                  <div class="max-h-[140px] overflow-y-auto space-y-1 pr-1 custom-scrollbar text-[10px]">
                    <div 
                      v-for="item in activeFruitAnalysis.individualStatuses" 
                      :key="item.name"
                      class="flex justify-between items-center p-1.5 bg-slate-950/30 rounded-lg border border-slate-900/40"
                    >
                      <span class="font-bold text-slate-300 truncate max-w-[140px]">{{ item.name }}</span>
                      <div class="flex items-center gap-1 shrink-0 font-mono text-[9px] font-black">
                        <span 
                          v-if="item.status === 'good'" 
                          class="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold"
                        >
                          🟢 Optimal
                        </span>
                        <span 
                          v-else-if="item.status === 'kinda'" 
                          class="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-bold"
                        >
                          🟡 Marginal
                        </span>
                        <span 
                          v-else 
                          class="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-bold"
                        >
                          🔴 Unsuitable
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB CONTENT: BALI CLIMATE INSIGHTS -->
      <div v-if="activeTab === 'insights'" class="flex flex-col space-y-6 text-xs text-slate-400 leading-relaxed font-medium">
        <div class="bg-indigo-950/15 border border-indigo-500/10 p-5 rounded-2xl space-y-2.5">
          <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Info class="w-4 h-4 text-indigo-400" />
            <span>The Volcanic Rain Engine</span>
          </h3>
          <p class="leading-relaxed text-slate-400 font-semibold">
            Bali's climate is powerfully dictated by its physical geography. A prominent chain of active volcanic peaks, running from West to East (including Mount Agung at 3,142m and Mount Batur at 1,717m), acts as a dramatic physical barrier to monsoon winds.
          </p>
        </div>

        <div class="space-y-4">
          <h4 class="font-extrabold text-slate-500 tracking-wider uppercase text-[10px]">Seasonal Wind Regimes</h4>
          <div class="space-y-3">
            <div class="p-4 bg-slate-900/10 rounded-2xl border border-slate-900/80 space-y-1 hover:bg-slate-900/20 transition-all duration-300">
              <div class="font-bold text-slate-200 flex items-center gap-1.5">
                <CloudRain class="w-4 h-4 text-indigo-400" />
                <span>NW Monsoon (Nov – March)</span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed font-semibold">
                Brings moist maritime air from the Indian Ocean and South China Sea. Standard tropical storms drop extreme rainfall, especially on southern mountain slopes (Ubud, Bedugul).
              </p>
            </div>
            <div class="p-4 bg-slate-900/10 rounded-2xl border border-slate-900/80 space-y-1 hover:bg-slate-900/20 transition-all duration-300">
              <div class="font-bold text-slate-200 flex items-center gap-1.5">
                <Sun class="w-4 h-4 text-amber-400" />
                <span>SE Trade Winds (April – Oct)</span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed font-semibold">
                Brings dry continental air originating from Australia. High winds sweep across the southern cliffs (Uluwatu, Bukit) and result in mostly sunny skies and clear ocean swells.
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-3 bg-slate-900/10 border border-slate-900 p-4.5 rounded-2xl">
          <h4 class="font-extrabold text-slate-500 tracking-wider uppercase text-[10px]">Orographic Lift</h4>
          <p class="leading-relaxed">
            As moist winds hit Bali's central ridges, they are forced upward (orographic lift), causing immediate cooling, condensation, and localized cloud bursts. 
          </p>
          <p class="leading-relaxed">
            This explains why central valleys (like Ubud) and mountain ranges (Bedugul) display **noticeable rain coverage (>= 1.0mm/h) of 5.8% to 6.5% annually**, while the southern Bukit plains (Uluwatu) and the sheltered dry northern coast (Singaraja) remain in a rain shadow, dropping to **only 2.5% to 4.1% annual rain time**.
          </p>
        </div>
      </div>

      <!-- TAB CONTENT: DATA SOURCE & CALIBRATION INFO -->
      <div v-if="activeTab === 'help'" class="flex flex-col space-y-5 text-xs text-slate-400 leading-relaxed font-medium">
        <div class="p-5 bg-slate-900/10 rounded-2xl border border-slate-900 flex flex-col space-y-4">
          <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <HelpCircle class="w-4 h-4 text-cyan-400" />
            <span>Grid Layout & Calibration</span>
          </h3>
          
          <div class="space-y-2.5 font-mono text-[10.5px] bg-slate-950 p-4 rounded-xl border border-slate-900">
            <div class="flex justify-between">
              <span class="text-slate-500">Spatial Bounds:</span>
              <span class="text-slate-300">Bali Island Box</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Coarse Weather Grid:</span>
              <span class="text-slate-300">0.05° Grid (194 Stations)</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Dense Elevation Grid:</span>
              <span class="text-emerald-400">0.01° Grid (5,906 Nodes)</span>
            </div>
            <div class="flex justify-between border-b border-slate-900 pb-2 mb-2">
              <span class="text-slate-500">Resolution Mode:</span>
              <span class="text-indigo-400 font-bold">Continuous Raster Downscaling</span>
            </div>
            <div class="flex flex-col space-y-1.5">
              <span class="text-slate-500">Calculated Downscaled Spacing:</span>
              <div class="text-[10px] text-indigo-400 space-y-1 pl-2">
                <div class="flex items-center gap-1.5">
                  <ArrowRight class="w-3 h-3" />
                  <span>Lat Spacing (N-S): ~1,111 meters (1.11 km)</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <ArrowRight class="w-3 h-3" />
                  <span>Lon Spacing (E-W): ~1,099 meters (1.10 km)</span>
                </div>
                <div class="flex items-center gap-1.5 text-slate-500">
                  <ArrowRight class="w-3 h-3" />
                  <span>Area per raster cell: ~1.22 km²</span>
                </div>
              </div>
            </div>
          </div>

          <p class="text-slate-500 text-[11px] leading-relaxed">
            The 194 baseline weather stations are downscaled continuously using a hyper-detailed 1.1 km Digital Elevation Model (DEM) of 5,906 land nodes, reflecting the true mountainous topography, calderas, and microclimates of Bali.
          </p>
        </div>

        <div class="space-y-3 bg-slate-900/10 border border-slate-900 p-5 rounded-2xl">
          <h4 class="font-extrabold text-slate-500 uppercase text-[10px] tracking-wider mb-2">Scientific Data Source</h4>
          <p class="text-[11px]">
            All variables are aggregated over a **5-year climatological baseline (2020–2024)** utilizing reanalysis models and localized physical algorithms.
          </p>
          <div class="space-y-2 pt-2">
            <div class="flex justify-between text-[11px] font-mono border-b border-slate-900 pb-1.5 text-slate-500">
              <span>Primary Engine:</span>
              <span class="text-slate-300">Open-Meteo API</span>
            </div>
            <div class="flex justify-between text-[11px] font-mono border-b border-slate-900 pb-1.5 pt-0.5 text-slate-500">
              <span>Weather Model:</span>
              <span class="text-slate-300">ECMWF ERA5 / ERA5-Land</span>
            </div>
            <div class="flex justify-between text-[11px] font-mono pt-0.5 text-slate-500">
              <span>URL Reference:</span>
              <a href="https://open-meteo.com" target="_blank" class="text-blue-400 hover:underline">open-meteo.com</a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sidebar Footer -->
    <div class="p-4 border-t border-slate-900 text-center text-[9px] text-slate-600 font-extrabold uppercase tracking-wider select-none bg-[#03060f]">
      Made with Vue 3 • Open-Meteo Climatology
    </div>
  </div>
</template>

<style scoped>
.animate-spin-slow {
  animation: spin 16s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Slick scrollbar for sidebar scrollability */
::-webkit-scrollbar {
  width: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #1e293b;
  border-radius: 9999px;
}

::-webkit-scrollbar-thumb:hover {
  background: #334155;
}
</style>
