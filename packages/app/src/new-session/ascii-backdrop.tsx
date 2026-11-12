import { prefersReducedMotion } from "@opencode/ui/motion"
import { createEffect, onCleanup, onMount } from "solid-js"
import type { SessionMessageInfo } from "@opencode/client/promise"

// The ASCII scene behind Home: a turning ringed planet with a moon, a drifting landscape along the bottom, twinkling
// stars and the odd shooting star. Brightness maps onto this ramp from faint to dense.
export const ASCII_RAMP = " .'`:;ot%SX8#@"

const CELL_HEIGHT = 15

const FRAME_MS = 1000 / 24

const STAR_DENSITY = 0.016

// A shooting star crosses every few seconds and lives this long.
const SHOOTING_PERIOD = 7

const SHOOTING_LIFE = 1.4

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453

  return s - Math.floor(s)
}

// Cheap smooth noise on the sphere surface (longitude, latitude) for bands and continents.
function surface(lon: number, lat: number) {
  return (
    0.5 +
    0.22 * Math.sin(lat * 7.0 + Math.sin(lon * 2.0) * 1.3) +
    0.16 * Math.sin(lon * 3.0 + lat * 4.0) * Math.cos(lat * 2.5) +
    0.12 * Math.sin(lon * 9.0 - lat * 5.0)
  )
}

// The landscape's height (in rows from the bottom) at a column, as rolling ridges in two layers.
function ridge(col: number, shift: number, far: boolean) {
  const x = col + shift

  return far
    ? 7 + 2.6 * Math.sin(x * 0.045) + 1.6 * Math.sin(x * 0.11 + 1.7) + 0.8 * Math.sin(x * 0.27)
    : 3.5 + 1.8 * Math.sin(x * 0.07 + 0.6) + 1.1 * Math.sin(x * 0.19 + 2.2) + 0.5 * Math.sin(x * 0.41)
}

export function AsciiBackdrop() {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const context = canvas.getContext("2d")

    if (!context) return

    const font = getComputedStyle(canvas).getPropertyValue("--font-family-mono").trim()
    const reduced = prefersReducedMotion()
    const layout = { width: 0, height: 0, cols: 0, rows: 0, cellWidth: 0, dpr: 1 }
    const start = performance.now()
    let frame = 0
    let last = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      layout.dpr = Math.min(window.devicePixelRatio || 1, 2)
      layout.width = rect.width
      layout.height = rect.height
      canvas.width = Math.round(rect.width * layout.dpr)
      canvas.height = Math.round(rect.height * layout.dpr)
      context.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0)
      context.font = `${CELL_HEIGHT - 3}px ${font}`
      context.textBaseline = "middle"
      context.textAlign = "center"
      layout.cellWidth = Math.max(7, context.measureText("M").width + 1)
      layout.cols = Math.ceil(rect.width / layout.cellWidth)
      layout.rows = Math.ceil(rect.height / CELL_HEIGHT)
    }

    const put = (char: string, px: number, py: number, alpha: number, grey: number) => {
      if (char === " " || alpha <= 0.01) return

      context.fillStyle = `rgba(${grey},${grey},${grey},${alpha.toFixed(3)})`
      context.fillText(char, px, py)
    }

    const level = (value: number) =>
      ASCII_RAMP[
        Math.min(ASCII_RAMP.length - 1, Math.floor(Math.max(0, Math.min(1, value)) * (ASCII_RAMP.length - 1)))
      ] ?? " "

    const draw = (time: number) => {
      const { width, height, cols, rows, cellWidth } = layout
      context.clearRect(0, 0, width, height)

      if (!cols || !rows) return

      const t = (time - start) / 1000
      const spin = t * 0.08
      // The planet sits up and to the right so it frames the headline instead of sitting under it.
      const radius = Math.min(width * 0.26, height * 0.38)
      const cx = width * 0.72
      const cy = height * 0.3
      const tilt = -0.32
      const cosTilt = Math.cos(tilt)
      const sinTilt = Math.sin(tilt)
      const light = [-0.55, -0.6, 0.58]
      // The moon circles the planet on a flattened orbit, passing behind it.
      const orbit = t * 0.12

      const moon = {
        x: cx + Math.cos(orbit) * radius * 2.35,
        y: cy + Math.sin(orbit) * radius * 0.55,
        r: radius * 0.16,
        front: Math.sin(orbit) > 0,
      }

      const drift = t * 1.6
      // The current shooting star, from the top right toward the bottom left, if one is crossing.
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
        const py = row * CELL_HEIGHT + CELL_HEIGHT / 2
        const fromBottom = rows - 1 - row

        for (let col = 0; col < cols; col++) {
          const px = col * cellWidth + cellWidth / 2
          // Keep the headline and prompt readable: everything fades toward the middle of the screen.
          const fx = (px - width * 0.5) / (width * 0.34)
          const fy = (py - height * 0.47) / (height * 0.3)
          const focus = Math.min(1, Math.pow(Math.sqrt(fx * fx + fy * fy), 2.2))
          const fade = 0.1 + focus * 0.9

          // Landscape: a far ridge of light dust and a near ridge of dense ground, drifting slowly.
          const near = ridge(col, drift * 0.6, false)
          const far = ridge(col, drift * 0.25, true)

          if (fromBottom < near) {
            const depth = (near - fromBottom) / near
            const grain = hash(col + Math.floor(drift * 0.6), row)
            put(level(0.35 + depth * 0.45 + grain * 0.15), px, py, (0.16 + depth * 0.3) * fade, 200)

            continue
          }

          if (fromBottom < far) {
            const grain = hash(col + Math.floor(drift * 0.25), row * 3)

            if (grain < 0.55) put(level(0.18 + grain * 0.3), px, py, 0.12 * fade, 170)

            continue
          }

          if (fromBottom < far + 0.9) {
            put(fromBottom < far + 0.45 ? "_" : ".", px, py, 0.16 * fade, 190)

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
          const moonHere = m2 < 1 && (moon.front || d2 >= 1)

          if (moonHere) {
            const mz = Math.sqrt(1 - m2)
            const shade = Math.max(0, mx * light[0] + my * light[1] + mz * light[2])
            put(level(0.2 + shade * 0.7), px, py, (0.25 + shade * 0.5) * fade, 235)

            continue
          }

          if (d2 < 1 && !(onRing && ry > 0)) {
            const z = Math.sqrt(1 - d2)
            const lon = Math.atan2(x, z) + spin
            const lat = Math.asin(Math.max(-1, Math.min(1, y)))
            const lambert = Math.max(0, x * light[0] + y * light[1] + z * light[2])
            // The ring casts a soft shadow band across the planet.
            const shadow = Math.abs(ry + 0.08) < 0.06 ? 0.45 : 1
            const value = (lambert * 0.75 + surface(lon, lat) * 0.35) * shadow * (0.35 + z * 0.65)
            put(level(value), px, py, (0.12 + value * 0.6) * fade, Math.round(255 - (0.5 + x * 0.35) * 90))

            continue
          }

          if (onRing) {
            const band = 0.55 + 0.25 * Math.sin(ringR * 38) + 0.2 * Math.sin(Math.atan2(ry, rx) * 3 + t * 0.4)
            const value = band * (ry > 0 ? 0.85 : 0.55)
            put(level(value), px, py, (0.1 + value * 0.5) * fade, 220)

            continue
          }

          if (shooting) {
            // Distance along and across the streak's path; the head is bright, the tail thins out.
            const travel = shooting.age * width * 0.5
            const hx = shooting.x0 - travel
            const hy = shooting.y0 + travel * 0.42
            const along = (px - hx) / (width * 0.12)
            const across = Math.abs(py - hy - (px - hx) * -0.42)

            if (along > 0 && along < 1 && across < CELL_HEIGHT * 0.6) {
              const strength = (1 - along) * (1 - shooting.age * 0.6)
              put(along < 0.06 ? "*" : along < 0.4 ? "=" : "-", px, py, 0.6 * strength * fade, 255)

              continue
            }
          }

          // Twinkling stars, and a faint dust halo around the planet.
          const seed = hash(col, row)
          const halo = Math.max(0, 1 - Math.abs(Math.sqrt(d2) - 1.05) * 3)

          if (seed < STAR_DENSITY) {
            const twinkle = 0.5 + 0.5 * Math.sin(t * 1.5 + seed * 900)
            put(
              seed < STAR_DENSITY * 0.15 ? "+" : twinkle > 0.8 ? "*" : ".",
              px,
              py,
              (0.14 + 0.3 * twinkle) * fade,
              235,
            )
          } else if (halo > 0 && seed < 0.05 + halo * 0.25) {
            put(level(halo * 0.22), px, py, (0.1 + halo * 0.12) * fade, 200)
          }
        }
      }
    }

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop)

      if (document.hidden || time - last < FRAME_MS) return

      last = time
      draw(time)
    }

    const observer = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })

    observer.observe(canvas)
    resize()

    if (reduced) draw(start + 12_000)
    else frame = requestAnimationFrame(loop)

    onCleanup(() => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    })
  })

  return (
    <div
      aria-hidden="true"
      data-component="ascii-backdrop"
      class="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <canvas ref={canvas} class="absolute inset-0 size-full" />
      <div class="absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_45%,rgba(17,17,17,0.55)_100%)]" />
    </div>
  )
}

const GROUND_HEIGHT = 260

// Rows the landscape is lifted by, so its ridge shows above the composer that covers the bottom of the session.
const GROUND_LIFT = 7

// How fast the scene eases from one activity into the next, per second.
const GROUND_EASE = 2.5

// Characters the writing cursor leaves along the horizon, as if it typed code into the landscape.
const GROUND_GLYPHS = "abcdefghijklmnopqrstuvwxyz{}()[];=<>/+-*&|.:_"

// How many columns the writing cursor's trail stays lit behind it.
const WRITING_TRAIL = 42

// The ground's strata, from loose to packed. The ground thins out with depth instead of filling in, so the strip
// under the composer stays a soft texture rather than a solid wall of dense glyphs.
const GROUND_STRATA = ".,:;-=+"

// The crest glyph for a ridge's slope across one column.
function crest(slope: number) {
  if (slope > 0.45) return "/"

  if (slope < -0.45) return "\\"

  return Math.abs(slope) < 0.15 ? "_" : "-"
}

/** What the model is doing now, for the ground's animation. */
export type GroundActivity = "idle" | "thinking" | "writing" | "tool"

/**
 * Reads the model's current activity from a session: idle when it is not running, otherwise what the newest part of the
 * newest assistant message is. Between steps, or before the first part streams, the model is thinking.
 */
export function groundActivity(working: boolean, messages: readonly SessionMessageInfo[]): GroundActivity {
  if (!working) return "idle"

  const last = messages.findLast((message) => message.type === "assistant")

  if (last?.type !== "assistant" || last.time.completed !== undefined) return "thinking"

  const part = last.content.at(-1)

  if (part?.type === "text") return "writing"

  if (part?.type === "tool") return "tool"

  return "thinking"
}

/**
 * The coding view's share of the ASCII scene: the landscape along the bottom of the session, behind the composer, with
 * a few stars above it. It stays still and faint while the model is idle and comes alive while it works: thoughts rise
 * from the ridge while it thinks, a cursor writes along the horizon while it writes, and the ground drifts and throws
 * sparks while it runs tools. One activity eases into the next, and reduced motion keeps it still.
 */
export function AsciiGround(props: { activity: GroundActivity }) {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const context = canvas.getContext("2d")

    if (!context) return

    const font = getComputedStyle(canvas).getPropertyValue("--font-family-mono").trim()
    const reduced = prefersReducedMotion()
    const layout = { width: 0, height: 0, cols: 0, rows: 0, cellWidth: 0 }
    // How much of each activity shows now, eased toward the current one, and how far the ridges have drifted.
    const scene = { thinking: 0, writing: 0, tool: 0, shift: 0 }
    const clock = { frame: 0, last: 0, running: false }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.font = `${CELL_HEIGHT - 3}px ${font}`
      context.textBaseline = "middle"
      context.textAlign = "center"
      layout.width = rect.width
      layout.height = rect.height
      layout.cellWidth = Math.max(7, context.measureText("M").width + 1)
      layout.cols = Math.ceil(rect.width / layout.cellWidth)
      layout.rows = Math.ceil(rect.height / CELL_HEIGHT)
    }

    const put = (char: string, col: number, row: number, alpha: number) => {
      if (char === " " || alpha <= 0.004) return

      context.fillStyle = `rgba(220,220,220,${Math.min(1, alpha).toFixed(3)})`
      context.fillText(char, col * layout.cellWidth + layout.cellWidth / 2, row * CELL_HEIGHT + CELL_HEIGHT / 2)
    }

    const draw = (t: number) => {
      const { cols, rows } = layout
      context.clearRect(0, 0, layout.width, layout.height)
      const think = scene.thinking
      const write = scene.writing
      const tool = scene.tool
      const energy = Math.min(1, think + write + tool)
      const nearShift = scene.shift * 0.6
      const farShift = scene.shift * 0.25
      // The writing cursor runs left to right along the horizon and starts over past the right edge.
      const cursor = (t * 16) % (cols + WRITING_TRAIL)
      const pass = Math.floor((t * 16) / (cols + WRITING_TRAIL))

      for (let row = 0; row < rows; row++) {
        const fromBottom = rows - 1 - row - GROUND_LIFT
        // Fades in from the top of the strip so it has no hard edge, and out again toward the bottom, where the
        // composer covers the ground anyway.
        const rise = Math.min(1, row / (rows * 0.6)) * Math.min(1, 0.35 + (fromBottom + GROUND_LIFT) / (GROUND_LIFT + 4))

        for (let col = 0; col < cols; col++) {
          const near = ridge(col, nearShift, false)
          const far = ridge(col, farShift, true)
          const grain = hash(col + Math.round(nearShift), row)
          // Thinking breathes along the ridge as a slow wave; tools send a bright pulse racing along it.
          const breath = think * (0.5 + 0.5 * Math.sin(t * 1.6 - col * 0.06))
          const lap = (((col - t * 38) % 90) + 90) % 90
          const pulse = tool * Math.max(0, 1 - Math.abs(lap - 45) / 4)

          if (fromBottom < near) {
            const below = near - fromBottom

            // The crest: a contour line that follows the ridge's slope.
            if (below < 1) {
              const slope = ridge(col + 1, nearShift, false) - ridge(col - 1, nearShift, false)
              const glow = 1 + energy * 0.9 + breath * 1.8 + pulse * 5

              put(pulse > 0.45 ? "=" : crest(slope), col, row, Math.min(0.5, 0.075 * glow) * rise)

              continue
            }

            // Strata under the crest: bands that follow the ridge, thinning out with depth.
            const band = 0.5 + 0.5 * Math.sin(below * 1.25 + Math.sin((col + nearShift) * 0.07) * 1.6)
            const density = 0.62 - below * 0.055

            if (grain < density) {
              const char = GROUND_STRATA[Math.floor(band * (GROUND_STRATA.length - 1))] ?? "."
              const alpha = (0.05 - below * 0.0035) * (1 + energy * 0.6 + breath * 1.1) + pulse * 0.05
              put(char, col, row, alpha * rise)
            }

            continue
          }

          const above = fromBottom - near

          // Writing: the row just above the near ridge fills with code as the cursor passes, then fades behind it.
          if (write > 0.02 && above < 1) {
            const behind = cursor - col

            if (behind >= 0 && behind < WRITING_TRAIL) {
              const glyph = GROUND_GLYPHS[Math.floor(hash(col, pass * 31) * GROUND_GLYPHS.length)] ?? "."
              const head = behind < 1
              const blink = Math.sin(t * 9) > 0 ? "|" : "_"
              put(head ? blink : glyph, col, row, write * (head ? 0.5 : 0.3 * (1 - behind / WRITING_TRAIL)) * rise)

              continue
            }
          }

          // Thinking: thoughts rise from the ridge and sway as they climb, growing smaller and fainter. Each column
          // carries one, drawn where its sway puts it, so a thought drifts sideways across columns as it rises.
          if (think > 0.02) {
            const source = col - Math.round(Math.sin(t * 0.9 + col * 0.3) * 1.5 * ((above + 1) / 10))

            if (hash(source, 17) < 0.08) {
              const seed = hash(source, 29)
              const climb = (t * (0.07 + seed * 0.09) + seed * 7) % 1
              const height = climb * (rows - GROUND_LIFT - near)

              if (Math.abs(above - height) < 0.5) {
                put(climb < 0.25 ? "o" : climb < 0.6 ? "°" : climb < 0.85 ? "." : "'", col, row, think * 0.3 * (1 - climb) * rise)

                continue
              }
            }
          }

          // Tools: sparks fly up where the pulse passes and fall back within a few frames.
          if (tool > 0.02 && above < 4) {
            const spark = hash(col, Math.floor(t * 8) + row * 13)
            const nearPulse = Math.max(0, 1 - Math.abs(lap - 45) / 10)

            if (spark < tool * (0.006 + nearPulse * 0.08)) {
              put(spark < 0.01 ? "*" : above < 1.5 ? "+" : "'", col, row, tool * (0.34 - above * 0.06) * rise)

              continue
            }
          }

          if (fromBottom < far) {
            if (grain < 0.5) put(".", col, row, 0.04 * (1 + energy * 0.5) * rise)
          } else if (fromBottom < far + 0.9) {
            put("_", col, row, 0.05 * (1 + energy * 0.5) * rise)
          } else if (grain < 0.012) {
            const twinkle = energy * (0.5 + 0.5 * Math.sin(t * 2 + grain * 900))
            put(grain < 0.003 ? "+" : ".", col, row, (0.08 + twinkle * 0.1) * rise)
          }
        }
      }
    }

    const tick = (time: number) => {
      clock.frame = requestAnimationFrame(tick)

      if (document.hidden || time - clock.last < FRAME_MS) return

      const dt = Math.min(0.1, (time - clock.last) / 1000)
      clock.last = time
      const ease = Math.min(1, dt * GROUND_EASE)
      scene.thinking += ((props.activity === "thinking" ? 1 : 0) - scene.thinking) * ease
      scene.writing += ((props.activity === "writing" ? 1 : 0) - scene.writing) * ease
      scene.tool += ((props.activity === "tool" ? 1 : 0) - scene.tool) * ease
      scene.shift += dt * (scene.thinking * 0.4 + scene.writing * 0.9 + scene.tool * 3.2)
      draw(time / 1000)

      // Back at rest: draw the still scene once and stop the loop until the model works again.
      if (props.activity === "idle" && scene.thinking + scene.writing + scene.tool < 0.01) {
        cancelAnimationFrame(clock.frame)
        clock.running = false
        scene.thinking = 0
        scene.writing = 0
        scene.tool = 0
        draw(time / 1000)
      }
    }

    createEffect(() => {
      if (props.activity === "idle" || reduced || clock.running) return

      clock.running = true
      clock.last = performance.now()
      clock.frame = requestAnimationFrame(tick)
    })

    const observer = new ResizeObserver(() => {
      resize()
      draw(performance.now() / 1000)
    })

    observer.observe(canvas)
    resize()
    draw(performance.now() / 1000)
    onCleanup(() => {
      cancelAnimationFrame(clock.frame)
      observer.disconnect()
    })
  })

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-component="ascii-ground"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-[1] w-full"
      style={{ height: `${GROUND_HEIGHT}px` }}
    />
  )
}
