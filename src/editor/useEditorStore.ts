import { computed, reactive, ref, watch } from 'vue'
import { CANVAS_SIZES } from '../core/constants'
import { exportAllFramesPng, exportFramePng } from '../core/exportPng'
import { addCustomColor, pushRecentColor } from '../core/paletteService'
import { compositeLayers } from '../core/pixelGrid'
import { createProject } from '../core/projectFactory'
import { isShapeTool, shapeCellIndices, type ShapeDraft } from '../core/shapes'
import {
  ensureDefaultProject,
  loadPreferences,
  loadProjects,
  removeProject,
  savePreferences,
  saveProjects,
  upsertProject,
} from '../core/storage'
import type { CanvasSize, PixelProject, ShapeFillMode, ToolType } from '../core/types'
import { createAnimationPlayer } from './animationPlayer'
import {
  addFrameToProject,
  addLayerToActiveFrame,
  deleteFrameAt,
  deleteLayerAt,
  toggleLayerVisibility,
  withActiveLayer,
  withCanvasSize,
  withFrameLayers,
} from './projectCommands'
import {
  applyShapeToLayer,
  applyToolAt,
  cancelLineTool,
  type LinePending,
} from './toolController'

const projects = ref<PixelProject[]>(ensureDefaultProject(loadProjects()))
const prefs = reactive(loadPreferences())

const linePending = ref<LinePending | null>(null)
const shapeDraft = ref<ShapeDraft | null>(null)
const isPlaying = ref(false)
const previewFrameIndex = ref<number | null>(null)

const player = createAnimationPlayer({ isPlaying, previewFrameIndex })

function persistProjects() {
  saveProjects(projects.value)
}

function persistPrefs() {
  savePreferences({ ...prefs })
}

const activeProject = computed(() => {
  const id = prefs.activeProjectId
  const found = projects.value.find((p) => p.id === id)
  return found ?? projects.value[0] ?? null
})

function syncActiveProjectId() {
  if (!activeProject.value && projects.value[0]) {
    prefs.activeProjectId = projects.value[0].id
    persistPrefs()
  } else if (activeProject.value && prefs.activeProjectId !== activeProject.value.id) {
    prefs.activeProjectId = activeProject.value.id
    persistPrefs()
  }
}

syncActiveProjectId()

function mutateProject(mutator: (p: PixelProject) => PixelProject) {
  const current = activeProject.value
  if (!current) return
  const updated = { ...mutator(current), updatedAt: Date.now() }
  projects.value = upsertProject(projects.value, updated)
  persistProjects()
}

const canvasSize = computed(() => activeProject.value?.canvasSize ?? 16)

const activeFrame = computed(() => {
  const p = activeProject.value
  if (!p) return null
  const idx = previewFrameIndex.value ?? p.activeFrameIndex
  return p.frames[idx] ?? null
})

const compositePixels = computed(() => {
  const frame = activeFrame.value
  if (!frame) return []
  return compositeLayers(frame.layers, canvasSize.value)
})

/** Uncommitted shape preview cells, kept separate from project pixels. */
const shapePreviewIndices = computed(() => {
  const draft = shapeDraft.value
  return draft ? shapeCellIndices(draft, canvasSize.value) : []
})

function cancelShape() {
  shapeDraft.value = null
}

watch(
  () => prefs.activeProjectId,
  () => {
    linePending.value = null
    cancelShape()
    player.stop()
  },
)

function recordColorUse(color: string) {
  mutateProject((p) => ({
    ...p,
    recentColors: pushRecentColor(p.recentColors, color),
  }))
}

function setActiveColor(color: string) {
  prefs.activeColor = color
  persistPrefs()
  recordColorUse(color)
}

function setTool(tool: ToolType) {
  prefs.activeTool = tool
  if (tool !== 'line') linePending.value = null
  cancelShape()
  persistPrefs()
}

function setShapeFillMode(mode: ShapeFillMode) {
  prefs.shapeFillMode = mode
  persistPrefs()
}

function setCanvasSize(size: CanvasSize) {
  if (!CANVAS_SIZES.includes(size)) return
  cancelShape()
  mutateProject((p) => withCanvasSize(p, size))
}

function onCanvasPointer(x: number, y: number) {
  const p = activeProject.value
  const frame = activeFrame.value
  if (!p || !frame || previewFrameIndex.value !== null) return

  const result = applyToolAt(
    {
      size: p.canvasSize,
      layers: frame.layers,
      activeLayerIndex: p.activeLayerIndex,
      activeColor: prefs.activeColor,
      tool: prefs.activeTool,
      linePending: linePending.value,
    },
    x,
    y,
  )
  if (!result.consumed) return

  linePending.value = result.linePending
  if (result.activeColor) setActiveColor(result.activeColor)

  if (result.layers !== frame.layers) {
    mutateProject((proj) =>
      withFrameLayers(proj, proj.activeFrameIndex, result.layers),
    )
    if (prefs.activeTool === 'brush' || prefs.activeTool === 'bucket' || prefs.activeTool === 'line') {
      recordColorUse(prefs.activeColor)
    }
  }
}

function beginShape(x: number, y: number): boolean {
  const p = activeProject.value
  const frame = activeFrame.value
  const tool = prefs.activeTool
  if (!p || !frame || previewFrameIndex.value !== null || !isShapeTool(tool)) return false
  linePending.value = null
  shapeDraft.value = {
    kind: tool,
    startX: x,
    startY: y,
    endX: x,
    endY: y,
    fillMode: prefs.shapeFillMode,
  }
  return true
}

function updateShape(x: number, y: number) {
  const draft = shapeDraft.value
  if (!draft || (draft.endX === x && draft.endY === y)) return
  shapeDraft.value = { ...draft, endX: x, endY: y }
}

function commitShape() {
  const draft = shapeDraft.value
  if (!draft) return
  shapeDraft.value = null

  const p = activeProject.value
  const frame = activeFrame.value
  if (!p || !frame || previewFrameIndex.value !== null) return

  const layers = applyShapeToLayer(
    frame.layers,
    p.activeLayerIndex,
    p.canvasSize,
    draft,
    prefs.activeColor,
  )
  if (!layers) return

  mutateProject((proj) => withFrameLayers(proj, proj.activeFrameIndex, layers))
  recordColorUse(prefs.activeColor)
}

function setActiveLayer(index: number) {
  cancelShape()
  mutateProject((p) => withActiveLayer(p, index))
}

function toggleLayerVisible(index: number) {
  cancelShape()
  mutateProject((p) => toggleLayerVisibility(p, index))
}

function deleteLayer(index: number) {
  cancelShape()
  mutateProject((p) => deleteLayerAt(p, index))
}

function addLayer() {
  cancelShape()
  mutateProject((p) => addLayerToActiveFrame(p) ?? p)
}

function setActiveFrame(index: number) {
  previewFrameIndex.value = null
  mutateProject((p) => ({ ...p, activeFrameIndex: index }))
  linePending.value = cancelLineTool()
  cancelShape()
}

function addFrame() {
  cancelShape()
  mutateProject((p) => addFrameToProject(p) ?? p)
}

function deleteFrame(index: number) {
  cancelShape()
  mutateProject((p) => deleteFrameAt(p, index))
}

function setFrameDelay(ms: number) {
  const clamped = Math.max(50, Math.min(5000, Math.round(ms)))
  mutateProject((p) => ({ ...p, frameDelayMs: clamped }))
}

function togglePlayback() {
  cancelShape()
  player.toggle(activeProject.value)
}

watch(
  () => activeProject.value?.frameDelayMs,
  (delay) => {
    if (!isPlaying.value || delay === undefined) return
    player.stop()
    player.toggle(activeProject.value)
  },
)

function saveCurrentProject() {
  const p = activeProject.value
  if (!p) return
  projects.value = upsertProject(projects.value, { ...p, updatedAt: Date.now() })
  persistProjects()
}

function createNewProject(name?: string) {
  const project = createProject(name?.trim() || `项目 ${projects.value.length + 1}`)
  projects.value = [...projects.value, project]
  prefs.activeProjectId = project.id
  persistProjects()
  persistPrefs()
  linePending.value = null
  cancelShape()
  player.stop()
}

function loadProject(id: string) {
  prefs.activeProjectId = id
  persistPrefs()
  linePending.value = null
  cancelShape()
  player.stop()
}

function deleteProject(id: string) {
  projects.value = removeProject(projects.value, id)
  if (projects.value.length === 0) {
    const fallback = createProject('未命名项目')
    projects.value = [fallback]
    prefs.activeProjectId = fallback.id
  } else if (prefs.activeProjectId === id) {
    prefs.activeProjectId = projects.value[0]!.id
  }
  persistProjects()
  persistPrefs()
  cancelShape()
  player.stop()
}

function addCustomPaletteColor(color: string) {
  mutateProject((p) => ({
    ...p,
    customColors: addCustomColor(p.customColors, color),
  }))
  setActiveColor(color)
}

function exportCurrentFrame() {
  const p = activeProject.value
  const frame = activeFrame.value
  if (!p || !frame) return
  exportFramePng(frame, p.canvasSize, `${p.name}_当前帧.png`)
}

function exportAllFrames() {
  const p = activeProject.value
  if (!p) return
  exportAllFramesPng(p.frames, p.canvasSize, p.name)
}

let editorStore: ReturnType<typeof buildEditorStore> | null = null

function buildEditorStore() {
  return reactive({
    projects,
    prefs,
    activeProject,
    canvasSize,
    activeFrame,
    compositePixels,
    linePending,
    shapeDraft,
    shapePreviewIndices,
    isPlaying,
    previewFrameIndex,
    setActiveColor,
    setTool,
    setShapeFillMode,
    setCanvasSize,
    onCanvasPointer,
    beginShape,
    updateShape,
    commitShape,
    cancelShape,
    setActiveLayer,
    toggleLayerVisible,
    deleteLayer,
    addLayer,
    setActiveFrame,
    addFrame,
    deleteFrame,
    setFrameDelay,
    togglePlayback,
    stopPlayback: player.stop,
    saveCurrentProject,
    createNewProject,
    loadProject,
    deleteProject,
    addCustomPaletteColor,
    exportCurrentFrame,
    exportAllFrames,
  })
}

export function useEditorStore() {
  if (!editorStore) editorStore = buildEditorStore()
  return editorStore
}
