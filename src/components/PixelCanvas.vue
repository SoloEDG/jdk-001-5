<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isShapeTool } from '../core/shapes'
import { useEditorStore } from '../editor/useEditorStore'

const store = useEditorStore()
const gridRef = ref<HTMLElement | null>(null)

const displaySize = computed(() => {
  const size = store.canvasSize
  const cell = Math.floor(Math.min(512 / size, 24))
  return { size, cell, px: size * cell }
})

const previewCells = computed(() => new Set(store.shapePreviewIndices))

function onCellClick(x: number, y: number) {
  if (store.isPlaying) return
  if (isShapeTool(store.prefs.activeTool)) return
  store.onCanvasPointer(x, y)
}

function cellFromPointer(event: PointerEvent) {
  const grid = gridRef.value
  if (!grid) return { x: 0, y: 0 }
  const rect = grid.getBoundingClientRect()
  const style = getComputedStyle(grid)
  const borderLeft = parseFloat(style.borderLeftWidth) || 0
  const borderTop = parseFloat(style.borderTopWidth) || 0
  const cell = displaySize.value.cell
  return {
    x: Math.floor((event.clientX - rect.left - borderLeft) / cell),
    y: Math.floor((event.clientY - rect.top - borderTop) / cell),
  }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || store.isPlaying || store.previewFrameIndex !== null) return
  if (!isShapeTool(store.prefs.activeTool)) return

  const { x, y } = cellFromPointer(event)
  if (!store.beginShape(x, y)) return

  event.preventDefault()
  gridRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!store.shapeDraft) return
  event.preventDefault()
  const { x, y } = cellFromPointer(event)
  store.updateShape(x, y)
}

function onPointerUp(event: PointerEvent) {
  if (!store.shapeDraft) return
  const { x, y } = cellFromPointer(event)
  store.updateShape(x, y)
  store.commitShape()
  if (gridRef.value?.hasPointerCapture(event.pointerId)) {
    gridRef.value.releasePointerCapture(event.pointerId)
  }
}

function onPointerCancel() {
  store.cancelShape()
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && store.shapeDraft) {
    store.cancelShape()
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

function cellStyle(index: number) {
  const size = displaySize.value.size
  const x = index % size
  const y = Math.floor(index / size)
  const checker = (x + y) % 2 === 0 ? '#2a2d35' : '#24272e'
  const color = store.compositePixels[index]
  const style: Record<string, string> = {
    backgroundColor: color ?? checker,
  }

  if (previewCells.value.has(index)) {
    style.backgroundColor = store.prefs.activeColor
    style.backgroundImage =
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 2px, rgba(0,0,0,0.22) 2px 4px)'
    style.border = '1px dashed rgba(255,255,255,0.9)'
  }

  return style
}
</script>

<template>
  <main class="canvas-area">
    <div class="canvas-meta">
      <span>{{ store.canvasSize }}×{{ store.canvasSize }}</span>
      <span v-if="store.isPlaying" class="badge playing">动画预览中</span>
      <span v-else-if="store.previewFrameIndex !== null" class="badge">预览帧</span>
    </div>
    <div
      ref="gridRef"
      class="pixel-grid"
      :style="{
        gridTemplateColumns: `repeat(${displaySize.size}, ${displaySize.cell}px)`,
        width: `${displaySize.px}px`,
        height: `${displaySize.px}px`,
      }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @lostpointercapture="onPointerCancel"
    >
      <button
        v-for="(_, index) in store.compositePixels"
        :key="index"
        type="button"
        class="pixel-cell"
        :style="cellStyle(index)"
        :aria-label="`像素 ${index}`"
        @click="onCellClick(index % displaySize.size, Math.floor(index / displaySize.size))"
      />
    </div>
  </main>
</template>
