export type CanvasSize = 16 | 32 | 64

export type Pixel = string | null

export type ShapeKind = 'rectangle' | 'circle'
export type ShapeFillMode = 'outline' | 'filled'

export type ToolType =
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'eyedropper'
  | 'line'
  | ShapeKind

export interface Layer {
  id: string
  name: string
  visible: boolean
  pixels: Pixel[]
}

export interface Frame {
  id: string
  name: string
  layers: Layer[]
}

export interface PixelProject {
  id: string
  name: string
  canvasSize: CanvasSize
  frames: Frame[]
  activeFrameIndex: number
  activeLayerIndex: number
  frameDelayMs: number
  recentColors: string[]
  customColors: string[]
  updatedAt: number
}

export interface EditorPreferences {
  activeColor: string
  activeTool: ToolType
  shapeFillMode: ShapeFillMode
  activeProjectId: string | null
}
