/**
 * The page each overlay window shows: a white glowing frame along the display's edges and the agent's cursor. It is
 * click-through and hidden from screen capture, so it never blocks the user or shows up in the agent's screenshots.
 * `window.agent(point)` moves the cursor; a point off this display hides it here.
 */
export const OVERLAY_PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
  .frame {
    position: fixed; inset: 0; pointer-events: none; border-radius: 10px;
    border: 3px solid rgba(255, 255, 255, 0.95);
    box-shadow: inset 0 0 28px 6px rgba(255, 255, 255, 0.45), inset 0 0 4px 1px rgba(255, 255, 255, 0.9);
    opacity: 0; animation: frame-in 420ms ease-out forwards, frame-pulse 2.6s 420ms ease-in-out infinite;
  }
  @keyframes frame-in { from { opacity: 0; transform: scale(1.01); } to { opacity: 1; transform: none; } }
  @keyframes frame-pulse {
    0%, 100% { box-shadow: inset 0 0 28px 6px rgba(255, 255, 255, 0.45), inset 0 0 4px 1px rgba(255, 255, 255, 0.9); }
    50% { box-shadow: inset 0 0 40px 10px rgba(255, 255, 255, 0.65), inset 0 0 6px 2px rgba(255, 255, 255, 1); }
  }
  .cursor {
    position: fixed; left: 0; top: 0; pointer-events: none; opacity: 0;
    transition-property: transform, opacity; transition-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.9)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  }
  .cursor.on { opacity: 1; }
  .cursor svg { display: block; width: 26px; height: 26px; margin: -2px 0 0 -2px; }
  .label {
    position: absolute; left: 22px; top: 22px; padding: 3px 8px; border-radius: 999px; white-space: nowrap;
    background: rgba(255, 255, 255, 0.96); color: #111; font: 600 11px/14px system-ui, sans-serif;
  }
  .ring {
    position: absolute; left: -16px; top: -16px; width: 32px; height: 32px; border-radius: 999px;
    border: 2px solid rgba(255, 255, 255, 0.95); opacity: 0;
  }
  .ring.go { animation: ring 520ms ease-out; }
  @keyframes ring { from { opacity: 1; transform: scale(0.3); } to { opacity: 0; transform: scale(1.6); } }
  .typing .label::after { content: " ⌨"; }
</style>
</head>
<body>
<div class="frame"></div>
<div class="cursor" id="cursor">
  <svg viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.6 14.8 L10.6 21.4 L13.4 20.2 L10.4 13.7 L16.6 13.6 Z" fill="#ffffff" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/></svg>
  <div class="ring" id="ring"></div>
  <div class="label">BetterCode</div>
</div>
<script>
  const cursor = document.getElementById("cursor")
  const ring = document.getElementById("ring")
  window.agent = (point) => {
    if (!point) { cursor.classList.remove("on"); return }
    cursor.style.transitionDuration = (point.ms || 0) + "ms, 200ms"
    cursor.style.transform = "translate(" + point.x + "px, " + point.y + "px)"
    cursor.classList.add("on")
    cursor.classList.toggle("typing", point.action === "type" || point.action === "key")
    if (point.action === "click" || point.action === "drag" || point.action === "scroll") {
      ring.classList.remove("go")
      void ring.offsetWidth
      ring.classList.add("go")
    }
  }
</script>
</body>
</html>`
