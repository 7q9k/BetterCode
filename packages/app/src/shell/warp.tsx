import { prefersReducedMotion } from "@opencode/ui/motion"
import { createSignal, onCleanup, onMount, Show, untrack } from "solid-js"
import { ASCII_RAMP } from "@/new-session/ascii-backdrop"
import { IDLE_WARP, transitionWarp, type WarpEvent } from "./warp-machine"

const DURATION_MS = 1000

const PARTICLES = 520

// One app-wide transition: the start screen asks for it when it sends, the overlay in the app root plays it.
const [warp, setWarp] = createSignal(IDLE_WARP)

const dispatch = (event: WarpEvent) => untrack(() => setWarp(transitionWarp(warp(), event)))

/** Plays the start-screen → session transition, unless the user prefers reduced motion. */
export function requestWarp() {
  dispatch({ type: "requested", reduced: prefersReducedMotion() })
}

/**
 * The ASCII warp over the whole window: characters stream out from the centre and speed up, while the screen behind
 * fades from the start screen's background into the session. It never takes input.
 */
export function WarpOverlay() {
  return (
    <Show when={warp().type === "playing" && warp()} keyed>
      {(state) => <WarpCanvas onDone={() => dispatch({ type: "finished", run: state.type === "playing" ? state.run : 0 })} />}
    </Show>
  )
}

function WarpCanvas(props: { onDone: () => void }) {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const context = canvas.getContext("2d")

    if (!context) return props.onDone()

    const font = getComputedStyle(canvas).getPropertyValue("--font-family-mono").trim()
    const background = getComputedStyle(canvas).getPropertyValue("--v2-background-bg-deep").trim() || "#171717"
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.textAlign = "center"
    context.textBaseline = "middle"

    // Each particle has a direction, a start distance and a speed; distance grows with the square of time.
    const reach = Math.hypot(width, height) / 2

    const particles = Array.from({ length: PARTICLES }, (_, index) => {
      const angle = (index / PARTICLES) * Math.PI * 2 + Math.sin(index * 12.9898) * 0.6
      const seed = Math.abs(Math.sin(index * 78.233) * 43758.5453) % 1

      return {
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        start: seed * reach * 0.35,
        speed: 0.6 + seed * 1.4,
        char: ASCII_RAMP[1 + Math.floor(seed * (ASCII_RAMP.length - 1))] ?? ".",
      }
    })

    const begin = performance.now()
    let frame = 0

    const draw = (time: number) => {
      const p = Math.min(1, (time - begin) / DURATION_MS)
      const ease = p * p
      context.clearRect(0, 0, width, height)
      // The start screen's background holds, then fades out to reveal the session.
      context.globalAlpha = Math.max(0, 1 - Math.max(0, p - 0.35) / 0.65)
      context.fillStyle = background
      context.fillRect(0, 0, width, height)
      context.globalAlpha = 1

      particles.forEach((particle) => {
        const distance = particle.start + ease * particle.speed * reach * 1.4
        const x = width / 2 + particle.dx * distance
        const y = height / 2 + particle.dy * distance * 0.75
        const near = Math.min(1, distance / reach)
        const size = 10 + near * 14
        const alpha = Math.sin(Math.PI * Math.min(1, p * 1.15)) * (0.25 + near * 0.6)

        if (alpha <= 0.01) return

        context.font = `${Math.round(size)}px ${font}`
        context.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
        // A short streak behind fast particles reads as motion.
        context.fillText(particle.char, x, y)

        if (near > 0.4) context.fillText(near > 0.7 ? "-" : ".", x - particle.dx * size, y - particle.dy * size * 0.75)
      })

      // A bright core that collapses as the jump starts.
      const core = Math.max(0, 1 - p * 3)

      if (core > 0) {
        context.font = `${Math.round(18 + core * 30)}px ${font}`
        context.fillStyle = `rgba(255,255,255,${(core * 0.8).toFixed(3)})`
        context.fillText("@", width / 2, height / 2)
      }

      if (p < 1) frame = requestAnimationFrame(draw)
      else props.onDone()
    }

    frame = requestAnimationFrame(draw)
    onCleanup(() => cancelAnimationFrame(frame))
  })

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-component="warp-overlay"
      class="pointer-events-none fixed inset-0 z-[1000] size-full"
    />
  )
}
