<template>
  <div ref="element" class="market-price-chart" role="img" :aria-label="`${symbol} locally observed USD prices, ${points.length} observations`"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { createChart, ColorType } from 'lightweight-charts'
const props = defineProps({ points: { type: Array, default: () => [] }, symbol: { type: String, default: '' }, locale: { type: String, default: 'en' } })
const element = ref(null)
let chart, series, resize, theme
function applyTheme() {
  if (!chart || !element.value) return
  // Resolve aliases before handing colors to the canvas renderer.
  const resolve = name => { element.value.style.color = `var(${name})`; return getComputedStyle(element.value).color }
  const accent = resolve('--bz-accent'), text = resolve('--bz-fg-mid'), grid = resolve('--bz-border')
  chart.applyOptions({ layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: text, fontFamily: 'BonzAI Metrics, sans-serif', fontSize: 12 }, grid: { vertLines: { visible: false }, horzLines: { color: grid } }, crosshair: { vertLine: { labelBackgroundColor: resolve('--bz-raised') }, horzLine: { labelBackgroundColor: resolve('--bz-raised') } } })
  series.applyOptions({ lineColor: accent, topColor: accent.replace('rgb(', 'rgba(').replace(')', ', 0.16)'), bottomColor: 'rgba(0,0,0,0)', priceLineVisible: false })
}
function update() {
  if (!chart) return
  const minimum = Math.min(...props.points.map(point => point.value))
  const precision = Math.min(12, Math.max(2, minimum > 0 ? -Math.floor(Math.log10(minimum)) + 3 : 2))
  series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
  chart.applyOptions({ localization: { locale: props.locale } })
  series.setData(props.points)
  chart.timeScale().fitContent()
}
onMounted(() => {
  chart = createChart(element.value, { height: 264, width: element.value.clientWidth, handleScroll: false, handleScale: false, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false } })
  series = chart.addAreaSeries({ lineWidth: 2 })
  applyTheme(); update()
  document.fonts?.load('12px "BonzAI Metrics"').then(() => {
    chart?.applyOptions({ layout: { fontFamily: 'BonzAI Metrics, sans-serif' } })
  }).catch(() => {})
  resize = new ResizeObserver(() => chart?.applyOptions({ width: element.value.clientWidth }))
  resize.observe(element.value)
  theme = new MutationObserver(applyTheme)
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
})
watch(() => [props.points, props.locale], update)
onBeforeUnmount(() => { resize?.disconnect(); theme?.disconnect(); chart?.remove(); chart = null })
</script>

<style scoped>
.market-price-chart { width: 100%; height: 264px; min-width: 0; overflow: hidden; }
</style>
