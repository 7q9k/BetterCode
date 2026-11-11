import { prefersReducedMotion } from "@opencode/ui/motion"
import { onCleanup, onMount } from "solid-js"

// One ASCII scene for Home: a slowly turning ringed planet drawn from characters, with a sparse star field.
// Brightness maps onto this ramp from faint to dense.
const RAMP = " .'`:;ot%SX8#@"

const CELL_HEIGHT = 15

const FRAME_MS = 1000 / 24

const STAR_DENSITY = 0.012

// Monochrome: bright white on the lit edge, cool grey on the far side.
const LIT = [255, 255, 255] as const

const SHADE = [150, 150, 150] as const

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

export function AsciiBackdrop() {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const context = canvas.getContext("2d")

    if (!context) return

    const font = getComputedStyle(canvas).getPropertyValue("--font-family-mono").trim()
    const reduced = prefersReducedMotion()
    const layout = { width: 0, height: 0, cols: 0, rows: 0, cellWidth: 0, dpr: 1 }
    let frame = 0
    let last = 0
    let start = performance.now()

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

    const draw = (time: number) => {
      const { width, height, cols, rows, cellWidth } = layout
      context.clearRect(0, 0, width, height)

      if (!cols || !rows) return

      const t = (time - start) / 1000
      const spin = t * 0.08
      // The planet sits up and to the right so it frames the hero instead of sitting under it.
      const radius = Math.min(width * 0.24, height * 0.36)
      const cx = width * 0.7
      const cy = height * 0.32
      const tilt = -0.32
      const cosTilt = Math.cos(tilt)
      const sinTilt = Math.sin(tilt)
      const light = [-0.55, -0.6, 0.58]

      for (let row = 0; row < rows; row++) {
        const py = row * CELL_HEIGHT + CELL_HEIGHT / 2

        for (let col = 0; col < cols; col++) {
          const px = col * cellWidth + cellWidth / 2
          const x = (px - cx) / radius
          const y = (py - cy) / radius
          let value = -1

          // Ring: an ellipse in the tilted plane, drawn in front of the planet only on its near half.
          const rx = x * cosTilt - y * sinTilt
          const ry = x * sinTilt + y * cosTilt
          const ringR = Math.sqrt(rx * rx + (ry / 0.24) * (ry / 0.24))
          const onRing = ringR > 1.32 && ringR < 1.95 && !(ringR > 1.62 && ringR < 1.68)
          const d2 = x * x + y * y

          if (d2 < 1) {
            const z = Math.sqrt(1 - d2)
            const behindRing = onRing && ry > 0

            if (!behindRing) {
              // Rotate around the vertical axis for the texture lookup.
              const lon = Math.atan2(x, z) + spin
              const lat = Math.asin(Math.max(-1, Math.min(1, y)))
              const lambert = Math.max(0, x * light[0] + y * light[1] + z * light[2])
              const tex = surface(lon, lat)
              // The ring casts a soft shadow band across the planet.
              const shadow = Math.abs(ry + 0.08) < 0.06 ? 0.45 : 1
              value = (lambert * 0.75 + tex * 0.35) * shadow * (0.35 + z * 0.65)
            }
          }

          if (value < 0 && onRing) {
            const band = 0.55 + 0.25 * Math.sin(ringR * 38) + 0.2 * Math.sin(Math.atan2(ry, rx) * 3 + t * 0.4)
            value = band * (ry > 0 ? 0.85 : 0.55)
          }

          if (value < 0) {
            // Sparse twinkling stars, plus a faint dust halo around the planet.
            const seed = hash(col, row)
            const halo = Math.max(0, 1 - Math.abs(Math.sqrt(d2) - 1.05) * 3)

            if (seed < STAR_DENSITY) value = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.5 + seed * 900))
            else if (halo > 0 && seed < 0.05 + halo * 0.25) value = halo * 0.22
            else continue
          }

          const level = Math.max(0, Math.min(1, value))
          const index = Math.min(RAMP.length - 1, Math.floor(level * (RAMP.length - 1)))
          const char = RAMP[index]

          if (char === " ") continue

          // Fade the area behind the composer so the prompt stays readable.
          // The hero and composer sit between 30% and 75% of the panel's height.
          const fx = (px - width * 0.5) / (width * 0.36)
          const fy = (py - height * 0.48) / (height * 0.34)
          const focus = Math.min(1, Math.pow(Math.sqrt(fx * fx + fy * fy), 2.2))
          const mix = Math.max(0, Math.min(1, 0.5 + x * 0.35))
          const r = Math.round(LIT[0] + (SHADE[0] - LIT[0]) * mix)
          const g = Math.round(LIT[1] + (SHADE[1] - LIT[1]) * mix)
          const b = Math.round(LIT[2] + (SHADE[2] - LIT[2]) * mix)
          const alpha = (0.1 + level * 0.5) * (0.06 + focus * 0.94)
          context.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
          context.fillText(char, px, py)
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
      <div class="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px]" />
      <canvas ref={canvas} class="absolute inset-0 size-full" />
      <div class="absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_40%,rgba(10,10,10,0.7)_100%)]" />
    </div>
  )
}
