import { getCurrentWindow } from "@tauri-apps/api/window"

// Electron draws Windows' caption buttons natively over the title bar (titleBarOverlay); the app's title bar leaves
// them 138 px at the top right (packages/app/src/shell/titlebar/titlebar.tsx). A Tauri window without decorations has
// none, so these are drawn in that space: three 46 x 44 buttons with the Windows 11 glyphs and hover colors.

const glyphs = {
  minimize: '<path d="M0.5 5.5h10" />',
  maximize: '<rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />',
  restore: '<rect x="0.5" y="2.5" width="7" height="7" rx="0.5" /><path d="M2.5 2.5V1a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H8" />',
  close: '<path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />',
}

const style = `
:host { position: fixed; top: 0; right: 0; z-index: 2147483647; display: flex; height: var(--height); }
button {
  all: unset; display: grid; place-items: center; width: var(--width); height: 100%;
  color: var(--symbol); transition: background-color 80ms linear;
}
button:hover { background: var(--hover); }
button:active { background: var(--press); }
button.close:hover { background: #c42b1c; color: #fff; }
button.close:active { background: #c4314b; color: #fff; }
svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1; overflow: visible; }
`

const host = document.createElement("div")

let zoom = 1

let mode: "light" | "dark" = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

export function mountWindowControls() {
  const shadow = host.attachShadow({ mode: "closed" })
  const current = getCurrentWindow()
  const button = (name: keyof typeof glyphs, label: string, action: () => Promise<unknown>) => {
    const element = document.createElement("button")
    element.className = name
    element.title = label
    element.setAttribute("aria-label", label)
    element.innerHTML = `<svg viewBox="0 0 10 10">${glyphs[name]}</svg>`
    element.addEventListener("click", () => void action())

    return element
  }
  const maximize = button("maximize", "Maximize", () => current.toggleMaximize())
  const sheet = document.createElement("style")
  sheet.textContent = style
  shadow.append(sheet, button("minimize", "Minimize", () => current.minimize()), maximize, button("close", "Close", () => current.close()))

  const sync = async () => {
    const maximized = await current.isMaximized()
    maximize.innerHTML = `<svg viewBox="0 0 10 10">${maximized ? glyphs.restore : glyphs.maximize}</svg>`
    maximize.title = maximized ? "Restore" : "Maximize"
    maximize.setAttribute("aria-label", maximize.title)
  }

  void current.onResized(() => void sync())
  void sync()
  paint()
  const attach = () => document.body.append(host)

  if (document.body) attach()
  else document.addEventListener("DOMContentLoaded", attach, { once: true })
}

/** The page zoom, so the buttons keep their native size as the page scales, like Electron's overlay. */
export function setWindowControlsZoom(factor: number) {
  zoom = factor
  paint()
}

/** The title bar's light or dark appearance, from the renderer's `setTitlebar`. */
export function setWindowControlsMode(next: "light" | "dark") {
  mode = next
  paint()
}

function paint() {
  const dark = mode === "dark"
  host.style.setProperty("--width", `${46 / zoom}px`)
  host.style.setProperty("--height", `${Math.max(44, 44 * zoom) / zoom}px`)
  host.style.setProperty("--symbol", dark ? "#ffffff" : "#000000")
  host.style.setProperty("--hover", dark ? "rgba(255, 255, 255, 0.0605)" : "rgba(0, 0, 0, 0.0373)")
  host.style.setProperty("--press", dark ? "rgba(255, 255, 255, 0.0419)" : "rgba(0, 0, 0, 0.0241)")
}
