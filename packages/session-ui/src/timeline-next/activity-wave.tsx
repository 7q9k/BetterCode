import { waveLevels, type WaveMode } from "@opencode/util/activity-wave"
import { prefersReducedMotion } from "@opencode/ui/motion"
import { onCleanup, onMount } from "solid-js"

/** Bars in the wave, and how long one loop of it takes. */
const BARS = 26

const LOOP_MS = 4000

const FRAME_MS = 1000 / 60

/**
 * The working indicator beside the status line: an audio wave (the same one the terminal UI draws with bar glyphs) as
 * rounded bars with smooth heights, brighter where a bar is taller. It is drawn on a canvas, so a frame is one shape per
 * bar and no layout; it pauses in hidden windows and stands still under reduced motion.
 */
export function ActivityWave(props: { mode: WaveMode }) {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const context = canvas.getContext("2d")

    if (!context) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.scale(ratio, ratio)
    const pitch = width / BARS
    const bar = Math.max(1.5, pitch * 0.55)
    const start = performance.now()
    // The theme can change while the wave runs; the color is read again about once a second.
    const color = { value: getComputedStyle(canvas).color, read: 0 }
    const clock = { frame: 0, last: 0 }

    const draw = (time: number) => {
      if (time - color.read > 1000) {
        color.value = getComputedStyle(canvas).color
        color.read = time
      }

      context.clearRect(0, 0, width, height)
      context.fillStyle = color.value

      waveLevels(BARS, (2 * Math.PI * (time - start)) / LOOP_MS, props.mode).forEach((level, index) => {
        const tall = Math.max(bar, level * height)
        context.globalAlpha = 0.28 + level * 0.72
        context.beginPath()
        context.roundRect(index * pitch + (pitch - bar) / 2, (height - tall) / 2, bar, tall, bar / 2)
        context.fill()
      })
      context.globalAlpha = 1
    }

    const tick = (time: number) => {
      clock.frame = requestAnimationFrame(tick)

      if (document.hidden || time - clock.last < FRAME_MS - 1) return
      clock.last = time
      draw(time)
    }

    if (prefersReducedMotion()) draw(start + LOOP_MS / 3)
    else clock.frame = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(clock.frame))
  })

  return <canvas ref={canvas} aria-hidden="true" data-component="activity-wave" />
}
