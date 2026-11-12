import { Renderable, RGBA, type OptimizedBuffer, type RenderableOptions, type RenderContext } from "@opentui/core"
import { extend } from "@opentui/solid"
import type { SessionMessageInfo } from "@opencode/client"

// The desktop app's ASCII scene (packages/app/src/new-session/ascii-backdrop.tsx), drawn cell by cell in the terminal.
// "home" is the start screen: a turning ringed planet with a moon, twinkling stars, the odd shooting star and a drifting
// landscape along the bottom. "ground" is the session's share: the landscape alone, which wakes up while the model works.
// Brightness maps onto this ramp from faint to dense.
const RAMP = " .'`:;ot%SX8#@"

// The scene redraws at most this often; the frame buffer keeps the last frame in between.
const FRAME_MS = 1000 / 20

const STAR_DENSITY = 0.016

const SHOOTING_PERIOD = 7

const SHOOTING_LIFE = 1.4

// How fast the ground eases from one activity into the next, per second.
const GROUND_EASE = 2.5

const GROUND_GLYPHS = "abcdefghijklmnopqrstuvwxyz{}()[];=<>/+-*&|.:_"

const WRITING_TRAIL = 42

const GROUND_STRATA = ".,:;-=+"

// Terminal cells are about twice as tall as they are wide; the geometry works in half-height units so circles stay round.
const ASPECT = 2

const SPACE = 32

/** What the model is doing now, for the ground's animation. */
export type SceneActivity = "idle" | "thinking" | "writing" | "tool"

/**
 * Reads the model's current activity from a session: idle when it is not running, otherwise what the newest part of the
 * newest assistant message is. Between steps, or before the first part streams, the model is thinking.
 */
export function sceneActivity(working: boolean, messages: readonly SessionMessageInfo[]): SceneActivity {
  if (!working) return "idle"
  const last = messages.findLast((message) => message.type === "assistant")
  if (last?.type !== "assistant" || last.time.completed !== undefined) return "thinking"
  const part = last.content.at(-1)
  if (part?.type === "text") return "writing"
  if (part?.type === "tool") return "tool"
  return "thinking"
}

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function surface(lon: number, lat: number) {
  return (
    0.5 +
    0.22 * Math.sin(lat * 7.0 + Math.sin(lon * 2.0) * 1.3) +
    0.16 * Math.sin(lon * 3.0 + lat * 4.0) * Math.cos(lat * 2.5) +
    0.12 * Math.sin(lon * 9.0 - lat * 5.0)
  )
}

// The landscape's height in rows from the bottom at a column, as rolling ridges in two layers.
function ridge(col: number, shift: number, far: boolean) {
  const x = col + shift
  return far
    ? 7 + 2.6 * Math.sin(x * 0.045) + 1.6 * Math.sin(x * 0.11 + 1.7) + 0.8 * Math.sin(x * 0.27)
    : 3.5 + 1.8 * Math.sin(x * 0.07 + 0.6) + 1.1 * Math.sin(x * 0.19 + 2.2) + 0.5 * Math.sin(x * 0.41)
}

function crest(slope: number) {
  if (slope > 0.45) return "/"
  if (slope < -0.45) return "\\"
  return Math.abs(slope) < 0.15 ? "_" : "-"
}

const level = (value: number) =>
  RAMP[Math.min(RAMP.length - 1, Math.floor(Math.max(0, Math.min(1, value)) * (RAMP.length - 1)))] ?? " "

type Options = RenderableOptions<AsciiSceneRenderable> & {
  variant?: "home" | "ground"
  animate?: boolean
  activity?: SceneActivity
  background?: RGBA
  foreground?: RGBA
}

/**
 * Draws into its own frame buffer, like the Go upsell art: a frame is plain typed-array writes plus one blit. The home
 * scene stays live while animations are on; the ground is live only while the model works or the scene eases back.
 */
export class AsciiSceneRenderable extends Renderable {
  private readonly variant: "home" | "ground"
  private _animate: boolean
  private _activity: SceneActivity
  private _background = RGBA.fromInts(20, 20, 20)
  private _foreground = RGBA.fromInts(230, 230, 230)
  private readonly color = RGBA.fromInts(0, 0, 0)
  private readonly scene = { thinking: 0, writing: 0, tool: 0, shift: 0 }
  private elapsed = 0
  private sinceDraw = Infinity
  private drawnKey = ""

  constructor(ctx: RenderContext, options: Options = {}) {
    const variant = options.variant ?? "home"
    const animate = options.animate ?? true
    const activity = options.activity ?? "idle"
    super(ctx, { ...options, buffered: true, live: animate && (variant === "home" || activity !== "idle") })
    this.variant = variant
    this._animate = animate
    this._activity = activity
    // A still home scene shows the moment the desktop app's reduced-motion frame shows.
    this.elapsed = animate ? 0 : 12_000
    if (options.background) this._background = options.background
    if (options.foreground) this._foreground = options.foreground
  }

  set animate(value: boolean) {
    if (value === this._animate) return
    this._animate = value
    this.syncLive()
    this.redraw()
  }

  set activity(value: SceneActivity) {
    if (value === this._activity) return
    this._activity = value
    this.syncLive()
  }

  set background(value: RGBA) {
    this._background = value
    this.redraw()
  }

  set foreground(value: RGBA) {
    this._foreground = value
    this.redraw()
  }

  private syncLive() {
    const easing = this.scene.thinking + this.scene.writing + this.scene.tool > 0.01
    this.live = this._animate && (this.variant === "home" || this._activity !== "idle" || easing)
  }

  private redraw() {
    this.drawnKey = ""
    this.sinceDraw = Infinity
    this.requestRender()
  }

  protected override onUpdate(deltaTime: number) {
    if (!this._animate) return
    this.elapsed += deltaTime
    this.sinceDraw += deltaTime
    if (this.variant !== "ground") return
    const dt = Math.min(0.1, deltaTime / 1000)
    const ease = Math.min(1, dt * GROUND_EASE)
    const scene = this.scene
    scene.thinking += ((this._activity === "thinking" ? 1 : 0) - scene.thinking) * ease
    scene.writing += ((this._activity === "writing" ? 1 : 0) - scene.writing) * ease
    scene.tool += ((this._activity === "tool" ? 1 : 0) - scene.tool) * ease
    scene.shift += dt * (scene.thinking * 0.4 + scene.writing * 0.9 + scene.tool * 3.2)
    // Back at rest: draw the still ground once more and stop the frame loop until the model works again.
    if (this._activity === "idle" && scene.thinking + scene.writing + scene.tool < 0.01) {
      scene.thinking = 0
      scene.writing = 0
      scene.tool = 0
      this.live = false
      this.redraw()
    }
  }

  protected override destroySelf() {
    this.live = false
    super.destroySelf()
  }

  protected override renderSelf(buffer: OptimizedBuffer) {
    const width = this.width
    const height = this.height
    if (!this.visible || this.isDestroyed || width <= 0 || height <= 0) return
    if (buffer !== this.frameBuffer) return
    const key = `${width}x${height}`
    const live = this.live
    if (live && this.sinceDraw < FRAME_MS && key === this.drawnKey) return
    if (!live && key === this.drawnKey) return
    this.sinceDraw = 0
    const t = this.elapsed / 1000
    const background = this._background
    const foreground = this._foreground
    const color = this.color

    buffer.withBuffers((cells) => {
      const stride = cells.width
      const rows = Math.min(height, cells.height)
      const cols = Math.min(width, stride)
      const put = (x: number, y: number, char: string, intensity: number) => {
        const cell = y * stride + x
        const amount = Math.max(0, Math.min(1, intensity))
        color.r = background.r + (foreground.r - background.r) * amount
        color.g = background.g + (foreground.g - background.g) * amount
        color.b = background.b + (foreground.b - background.b) * amount
        color.a = 1
        cells.char[cell] = amount <= 0.01 ? SPACE : (char.codePointAt(0) ?? SPACE)
        cells.attributes[cell] = 0
        for (let channel = 0; channel < 4; channel++) {
          cells.fg[cell * 4 + channel] = color.buffer[channel]!
          cells.bg[cell * 4 + channel] = background.buffer[channel]!
        }
      }
      if (this.variant === "home") drawHome(cols, rows, t, put)
      else drawGround(cols, rows, t, this.scene, put)
    })
    this.drawnKey = key
  }
}

type Put = (x: number, y: number, char: string, intensity: number) => void

function drawHome(cols: number, rows: number, t: number, put: Put) {
  const width = cols
  const height = rows * ASPECT
  const spin = t * 0.08
  const radius = Math.min(width * 0.26, height * 0.38)
  const cx = width * 0.72
  const cy = height * 0.3
  const tilt = -0.32
  const cosTilt = Math.cos(tilt)
  const sinTilt = Math.sin(tilt)
  const light = [-0.55, -0.6, 0.58] as const
  const orbit = t * 0.12
  const moon = {
    x: cx + Math.cos(orbit) * radius * 2.35,
    y: cy + Math.sin(orbit) * radius * 0.55,
    r: Math.max(1.2, radius * 0.16),
    front: Math.sin(orbit) > 0,
  }
  const drift = t * 1.6
  const cycle = t % SHOOTING_PERIOD
  const shooting =
    cycle < SHOOTING_LIFE
      ? {
          age: cycle / SHOOTING_LIFE,
          x0: width * (0.35 + hash(Math.floor(t / SHOOTING_PERIOD), 3) * 0.6),
          y0: height * (0.05 + hash(Math.floor(t / SHOOTING_PERIOD), 7) * 0.25),
        }
      : undefined

  for (let row = 0; row < rows; row++) {
    const py = (row + 0.5) * ASPECT
    const fromBottom = rows - 1 - row
    for (let col = 0; col < cols; col++) {
      const px = col + 0.5
      // Keep the logo and prompt readable: everything fades toward the middle of the screen.
      const fx = (px - width * 0.5) / (width * 0.34)
      const fy = (py - height * 0.47) / (height * 0.3)
      const fade = 0.1 + Math.min(1, Math.pow(Math.sqrt(fx * fx + fy * fy), 2.2)) * 0.9
      const near = ridge(col, drift * 0.6, false)
      const far = ridge(col, drift * 0.25, true)

      if (fromBottom < near) {
        const depth = (near - fromBottom) / near
        const grain = hash(col + Math.floor(drift * 0.6), row)
        put(col, row, level(0.35 + depth * 0.45 + grain * 0.15), (0.16 + depth * 0.3) * fade * 0.78)
        continue
      }
      if (fromBottom < far) {
        const grain = hash(col + Math.floor(drift * 0.25), row * 3)
        put(col, row, grain < 0.55 ? level(0.18 + grain * 0.3) : " ", 0.12 * fade * 0.67)
        continue
      }
      if (fromBottom < far + 0.9) {
        put(col, row, fromBottom < far + 0.45 ? "_" : ".", 0.16 * fade * 0.75)
        continue
      }

      const x = (px - cx) / radius
      const y = (py - cy) / radius
      const rx = x * cosTilt - y * sinTilt
      const ry = x * sinTilt + y * cosTilt
      const ringR = Math.sqrt(rx * rx + (ry / 0.24) * (ry / 0.24))
      const onRing = ringR > 1.32 && ringR < 1.95 && !(ringR > 1.62 && ringR < 1.68)
      const d2 = x * x + y * y
      const mx = (px - moon.x) / moon.r
      const my = (py - moon.y) / moon.r
      const m2 = mx * mx + my * my

      if (m2 < 1 && (moon.front || d2 >= 1)) {
        const mz = Math.sqrt(1 - m2)
        const shade = Math.max(0, mx * light[0] + my * light[1] + mz * light[2])
        put(col, row, level(0.2 + shade * 0.7), (0.25 + shade * 0.5) * fade * 0.92)
        continue
      }
      if (d2 < 1 && !(onRing && ry > 0)) {
        const z = Math.sqrt(1 - d2)
        const lon = Math.atan2(x, z) + spin
        const lat = Math.asin(Math.max(-1, Math.min(1, y)))
        const lambert = Math.max(0, x * light[0] + y * light[1] + z * light[2])
        const shadow = Math.abs(ry + 0.08) < 0.06 ? 0.45 : 1
        const value = (lambert * 0.75 + surface(lon, lat) * 0.35) * shadow * (0.35 + z * 0.65)
        put(col, row, level(value), (0.12 + value * 0.6) * fade * ((255 - (0.5 + x * 0.35) * 90) / 255))
        continue
      }
      if (onRing) {
        const band = 0.55 + 0.25 * Math.sin(ringR * 38) + 0.2 * Math.sin(Math.atan2(ry, rx) * 3 + t * 0.4)
        const value = band * (ry > 0 ? 0.85 : 0.55)
        put(col, row, level(value), (0.1 + value * 0.5) * fade * 0.86)
        continue
      }
      if (shooting) {
        const travel = shooting.age * width * 0.5
        const hx = shooting.x0 - travel
        const hy = shooting.y0 + travel * 0.42
        const along = (px - hx) / (width * 0.12)
        const across = Math.abs(py - hy - (px - hx) * -0.42)
        if (along > 0 && along < 1 && across < ASPECT * 0.6) {
          const strength = (1 - along) * (1 - shooting.age * 0.6)
          put(col, row, along < 0.06 ? "*" : along < 0.4 ? "=" : "-", 0.6 * strength * fade)
          continue
        }
      }

      const seed = hash(col, row)
      const halo = Math.max(0, 1 - Math.abs(Math.sqrt(d2) - 1.05) * 3)
      if (seed < STAR_DENSITY) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * 1.5 + seed * 900)
        put(col, row, seed < STAR_DENSITY * 0.15 ? "+" : twinkle > 0.8 ? "*" : ".", (0.14 + 0.3 * twinkle) * fade * 0.92)
        continue
      }
      put(col, row, halo > 0 && seed < 0.05 + halo * 0.25 ? level(halo * 0.22) : " ", (0.1 + halo * 0.12) * fade * 0.78)
    }
  }
}

function drawGround(
  cols: number,
  rows: number,
  t: number,
  scene: { thinking: number; writing: number; tool: number; shift: number },
  put: Put,
) {
  const think = scene.thinking
  const write = scene.writing
  const tool = scene.tool
  const energy = Math.min(1, think + write + tool)
  const nearShift = scene.shift * 0.6
  const farShift = scene.shift * 0.25
  const cursor = (t * 16) % (cols + WRITING_TRAIL)
  const pass = Math.floor((t * 16) / (cols + WRITING_TRAIL))
  // The terminal draws far fewer, larger glyphs than the desktop canvas, so the same scene needs more contrast.
  const boost = 2.4
  // The ridges were shaped for a strip of about nine rows; a shorter strip scales them down.
  const scale = Math.min(1, rows / 9)

  for (let row = 0; row < rows; row++) {
    const fromBottom = rows - 1 - row
    // Fades in from the top of the strip so it has no hard edge.
    const rise = Math.min(1, (row + 1) / (rows * 0.6))
    for (let col = 0; col < cols; col++) {
      const near = ridge(col, nearShift, false) * scale
      const far = ridge(col, farShift, true) * scale
      const grain = hash(col + Math.round(nearShift), row)
      const breath = think * (0.5 + 0.5 * Math.sin(t * 1.6 - col * 0.06))
      const lap = (((col - t * 38) % 90) + 90) % 90
      const pulse = tool * Math.max(0, 1 - Math.abs(lap - 45) / 4)

      if (fromBottom < near) {
        const below = near - fromBottom
        if (below < 1) {
          const slope = (ridge(col + 1, nearShift, false) - ridge(col - 1, nearShift, false)) * scale
          const glow = 1 + energy * 0.9 + breath * 1.8 + pulse * 5
          put(col, row, pulse > 0.45 ? "=" : crest(slope), Math.min(0.5, 0.075 * glow) * rise * boost)
          continue
        }
        const band = 0.5 + 0.5 * Math.sin(below * 1.25 + Math.sin((col + nearShift) * 0.07) * 1.6)
        const alpha = (0.05 - below * 0.0035) * (1 + energy * 0.6 + breath * 1.1) + pulse * 0.05
        put(
          col,
          row,
          grain < 0.62 - below * 0.055 ? (GROUND_STRATA[Math.floor(band * (GROUND_STRATA.length - 1))] ?? ".") : " ",
          alpha * rise * boost,
        )
        continue
      }

      const above = fromBottom - near
      if (write > 0.02 && above < 1) {
        const behind = cursor - col
        if (behind >= 0 && behind < WRITING_TRAIL) {
          const glyph = GROUND_GLYPHS[Math.floor(hash(col, pass * 31) * GROUND_GLYPHS.length)] ?? "."
          const head = behind < 1
          const blink = Math.sin(t * 9) > 0 ? "|" : "_"
          put(col, row, head ? blink : glyph, write * (head ? 0.5 : 0.3 * (1 - behind / WRITING_TRAIL)) * rise * boost)
          continue
        }
      }
      if (think > 0.02) {
        const source = col - Math.round(Math.sin(t * 0.9 + col * 0.3) * 1.5 * ((above + 1) / 10))
        if (hash(source, 17) < 0.08) {
          const seed = hash(source, 29)
          const climb = (t * (0.07 + seed * 0.09) + seed * 7) % 1
          if (Math.abs(above - climb * (rows - near)) < 0.5) {
            put(col, row, climb < 0.25 ? "o" : climb < 0.6 ? "°" : climb < 0.85 ? "." : "'", think * 0.3 * (1 - climb) * rise * boost)
            continue
          }
        }
      }
      if (tool > 0.02 && above < 4) {
        const spark = hash(col, Math.floor(t * 8) + row * 13)
        const nearPulse = Math.max(0, 1 - Math.abs(lap - 45) / 10)
        if (spark < tool * (0.006 + nearPulse * 0.08)) {
          put(col, row, spark < 0.01 ? "*" : above < 1.5 ? "+" : "'", tool * (0.34 - above * 0.06) * rise * boost)
          continue
        }
      }
      if (fromBottom < far) {
        put(col, row, grain < 0.5 ? "." : " ", 0.04 * (1 + energy * 0.5) * rise * boost)
        continue
      }
      if (fromBottom < far + 0.9) {
        put(col, row, "_", 0.05 * (1 + energy * 0.5) * rise * boost)
        continue
      }
      const twinkle = energy * (0.5 + 0.5 * Math.sin(t * 2 + grain * 900))
      put(col, row, grain < 0.012 ? (grain < 0.003 ? "+" : ".") : " ", (0.08 + twinkle * 0.1) * rise * boost)
    }
  }
}

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    ascii_scene: typeof AsciiSceneRenderable
  }
}

extend({ ascii_scene: AsciiSceneRenderable })
