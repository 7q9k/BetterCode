// The agent's visible pointer in a browser tab. Mouse actions glide the real CDP pointer along an eased path instead of
// jumping, and a cursor drawn into the page follows the same path, so the user sees where the agent points, hovers,
// clicks and drags. The cursor lives in a closed shadow root, ignores pointer events and is hidden from accessibility.

export type Point = { readonly x: number; readonly y: number }

/** The fastest and slowest glide, and how much each pixel of distance adds in between. */
const MIN_MS = 220

const MAX_MS = 650

const MS_PER_PX = 0.45

/** About one pointer event per display frame. */
const STEP_MS = 16

/**
 * The points a glide from `from` to `to` passes, one per frame, and how long it takes. The eased curve starts and ends
 * slowly like a hand on a mouse; the page cursor animates with the matching CSS easing over the same duration.
 */
export function glidePath(from: Point, to: Point) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)

  if (distance < 1) return { duration: 0, points: [to] }
  const duration = Math.round(Math.min(MAX_MS, Math.max(MIN_MS, MIN_MS + distance * MS_PER_PX)))
  const steps = Math.max(2, Math.round(duration / STEP_MS))

  const points = Array.from({ length: steps }, (_, index) => {
    const t = ease((index + 1) / steps)

    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  })

  return { duration, points }
}

// Ease-in-out cubic; the page cursor uses the CSS curve below, which tracks it closely.
function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

const EASING = "cubic-bezier(0.65, 0, 0.35, 1)"

/** The page script that owns the cursor; installs it on first use per document and returns its controls. */
const INSTALL = `(() => {
  const key = Symbol.for("bettercode.cursor")
  if (window[key]) return window[key]
  const host = document.createElement("bettercode-cursor")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:strict"
  const root = host.attachShadow({ mode: "closed" })
  root.innerHTML = \`<style>
    :host { all: initial }
    .cursor, .ring { position: fixed; left: 0; top: 0; pointer-events: none; will-change: transform }
    .cursor { width: 22px; height: 24px; transition: transform var(--glide, 0ms) ${EASING}, opacity 160ms ease;
      filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.55)) drop-shadow(0 0 6px rgba(0,0,0,.25)) }
    .cursor.down path { fill: #3a3a3a }
    .ring { width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; border: 2px solid rgba(17,17,17,.85);
      box-shadow: 0 0 0 2px rgba(255,255,255,.9), 0 0 10px rgba(255,255,255,.6); opacity: 0 }
    .ring.on { animation: ring 420ms ease-out }
    @keyframes ring { from { opacity: 1; scale: .35 } to { opacity: 0; scale: 1.35 } }
    .frame { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity 400ms ease;
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.95), inset 0 0 0 3px rgba(0,0,0,.12),
        inset 0 0 18px 4px rgba(255,255,255,.55), inset 0 0 48px 10px rgba(255,255,255,.18) }
    .frame.on { opacity: 1; animation: breathe 2.4s ease-in-out infinite }
    @keyframes breathe { 50% { opacity: .7 } }
  </style><div class="frame"></div><div class="ring"></div><svg class="cursor" viewBox="0 0 22 24" aria-hidden="true">
    <path d="M2.5 1.8 19 12.1l-7.2 1.4-3.6 6.8z" fill="#111" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>
  </svg>\`
  const cursor = root.querySelector(".cursor")
  const ring = root.querySelector(".ring")
  const frame = root.querySelector(".frame")
  let idle = 0
  // The glowing frame marks the page while the agent works in it and fades a few seconds after its last action.
  const active = () => {
    if (!host.isConnected) (document.body ?? document.documentElement).append(host)
    frame.classList.add("on")
    clearTimeout(idle)
    idle = setTimeout(() => frame.classList.remove("on"), 4000)
  }
  const place = (x, y, ms) => {
    active()
    cursor.style.setProperty("--glide", ms + "ms")
    cursor.style.transform = "translate(" + (x - 2.5) + "px," + (y - 1.8) + "px)"
  }
  const api = {
    move: (x, y, ms) => place(x, y, ms),
    jump: (x, y) => { place(x, y, 0); cursor.getBoundingClientRect() },
    down: (pressed) => { active(); cursor.classList.toggle("down", pressed) },
    click: (x, y) => {
      active()
      // Placed with left and top: the ring's scale animation would scale a translate along with it.
      ring.style.left = x + "px"
      ring.style.top = y + "px"
      ring.classList.remove("on")
      ring.getBoundingClientRect()
      ring.classList.add("on")
    },
    hide: (hidden) => { host.style.visibility = hidden ? "hidden" : "visible" },
  }
  Object.defineProperty(window, key, { value: api })
  return api
})()`

/** Hides or shows the cursor around a screenshot, without installing one in a document that never had it. */
export function cursorHidden(hidden: boolean) {
  return `globalThis[Symbol.for("bettercode.cursor")]?.hide(${hidden})`
}

/** A page expression that runs one cursor control, installing the cursor first when the document has none. */
export function cursorCall(method: "move" | "jump" | "down" | "click" | "hide", ...args: Array<number | boolean>) {
  return `${INSTALL}.${method}(${args.map((value) => JSON.stringify(value)).join(",")})`
}
