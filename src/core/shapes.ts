import { indexFor } from './pixelGrid'
import type { ShapeFillMode, ShapeKind, ToolType } from './types'

export interface ShapeDraft {
  kind: ShapeKind
  startX: number
  startY: number
  endX: number
  endY: number
  fillMode: ShapeFillMode
}

export function isShapeTool(tool: ToolType): tool is ShapeKind {
  return tool === 'rectangle' || tool === 'circle'
}

interface ShapeBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
}

function boundsOf(draft: ShapeDraft): ShapeBounds {
  const minX = Math.min(draft.startX, draft.endX)
  const maxX = Math.max(draft.startX, draft.endX)
  const minY = Math.min(draft.startY, draft.endY)
  const maxY = Math.max(draft.startY, draft.endY)
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

interface ClippedRange {
  startX: number
  endX: number
  startY: number
  endY: number
}

function clippedRange(bounds: ShapeBounds, size: number): ClippedRange | null {
  const startX = Math.max(0, bounds.minX)
  const endX = Math.min(size - 1, bounds.maxX)
  const startY = Math.max(0, bounds.minY)
  const endY = Math.min(size - 1, bounds.maxY)
  if (startX > endX || startY > endY) return null
  return { startX, endX, startY, endY }
}

function rectangleIndices(
  bounds: ShapeBounds,
  range: ClippedRange,
  size: number,
  fillMode: ShapeFillMode,
): number[] {
  const indices: number[] = []
  for (let y = range.startY; y <= range.endY; y++) {
    for (let x = range.startX; x <= range.endX; x++) {
      const onBorder =
        x === bounds.minX || x === bounds.maxX || y === bounds.minY || y === bounds.maxY
      if (fillMode === 'filled' || onBorder) indices.push(indexFor(x, y, size))
    }
  }
  return indices
}

/**
 * Indices of every grid cell covered by the shape. The shape is computed over
 * the full dragged range and only cells that fall inside the canvas are
 * returned, so preview and commit always use exactly the same cells.
 */
export function shapeCellIndices(draft: ShapeDraft, size: number): number[] {
  const bounds = boundsOf(draft)
  const range = clippedRange(bounds, size)
  if (!range) return []

  if (draft.kind === 'rectangle') {
    return rectangleIndices(bounds, range, size, draft.fillMode)
  }

  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const radiusX = bounds.width / 2
  const radiusY = bounds.height / 2

  const inside = (x: number, y: number) => {
    const dx = (x - centerX) / radiusX
    const dy = (y - centerY) / radiusY
    return dx * dx + dy * dy <= 1
  }

  const indices: number[] = []
  for (let y = range.startY; y <= range.endY; y++) {
    for (let x = range.startX; x <= range.endX; x++) {
      if (!inside(x, y)) continue
      if (
        draft.fillMode === 'filled' ||
        !inside(x + 1, y) ||
        !inside(x - 1, y) ||
        !inside(x, y + 1) ||
        !inside(x, y - 1)
      ) {
        indices.push(indexFor(x, y, size))
      }
    }
  }
  return indices
}
