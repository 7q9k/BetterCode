import { prefersReducedMotion } from "@opencode/ui/motion"
import { onCleanup, onMount } from "solid-js"

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
      ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.floor(Math.max(0, Math.min(1, value)) * (ASCII_RAMP.length - 1)))] ??
      " "

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
            put(seed < STAR_DENSITY * 0.15 ? "+" : twinkle > 0.8 ? "*" : ".", px, py, (0.14 + 0.3 * twinkle) * fade, 235)
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
    <div aria-hidden="true" data-component="ascii-backdrop" class="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvas} class="absolute inset-0 size-full" />
      <div class="absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_45%,rgba(17,17,17,0.55)_100%)]" />
    </div>
  )
}

const GROUND_HEIGHT = 260

// Rows the landscape is lifted by, so its ridge shows above the composer that covers the bottom of the session.
const GROUND_LIFT = 7

/**
 * The coding view's share of the ASCII scene: the landscape along the bottom of the session, behind the composer, with
 * a few stars above it. It is drawn once per size, never animates, and stays faint so the timeline above reads clearly.
 */
export function AsciiGround() {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const context = canvas.getContext("2d")

    if (!context) return

    const font = getComputedStyle(canvas).getPropertyValue("--font-family-mono").trim()

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, rect.width, rect.height)
      context.font = `${CELL_HEIGHT - 3}px ${font}`
      context.textBaseline = "middle"
      context.textAlign = "center"
      const cellWidth = Math.max(7, context.measureText("M").width + 1)
      const cols = Math.ceil(rect.width / cellWidth)
      const rows = Math.ceil(rect.height / CELL_HEIGHT)

      const put = (char: string, col: number, row: number, alpha: number) => {
        if (char === " ") return

        context.fillStyle = `rgba(220,220,220,${alpha.toFixed(3)})`
        context.fillText(char, col * cellWidth + cellWidth / 2, row * CELL_HEIGHT + CELL_HEIGHT / 2)
      }

      for (let row = 0; row < rows; row++) {
        const fromBottom = rows - 1 - row - GROUND_LIFT
        // Fades in from the top of the strip so it has no hard edge.
        const rise = Math.min(1, row / (rows * 0.6))

        for (let col = 0; col < cols; col++) {
          const near = ridge(col, 0, false)
          const far = ridge(col, 0, true)
          const grain = hash(col, row)

          if (fromBottom < near) {
            const depth = (near - fromBottom) / near
            const index = Math.min(ASCII_RAMP.length - 1, Math.floor((0.3 + depth * 0.45 + grain * 0.15) * (ASCII_RAMP.length - 1)))
            put(ASCII_RAMP[index] ?? " ", col, row, (0.025 + depth * 0.045) * rise)
          } else if (fromBottom < far) {
            if (grain < 0.5) put(".", col, row, 0.04 * rise)
          } else if (fromBottom < far + 0.9) {
            put("_", col, row, 0.05 * rise)
          } else if (grain < 0.012) {
            put(grain < 0.003 ? "+" : ".", col, row, 0.08 * rise)
          }
        }
      }
    }

    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    draw()
    onCleanup(() => observer.disconnect())
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
