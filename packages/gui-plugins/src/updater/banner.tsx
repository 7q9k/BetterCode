import { Button } from "@opencode/ui/button"

/**
 * The "New BetterCode update available" banner: a card centered under the title bar while an update waits to be
 * installed or downloaded. The window renders it through the `window.bottom` slot, fixed to the top.
 */
export function UpdateBanner(props: {
  title: string
  message: string
  action: string
  later: string
  busy: boolean
  onRun: () => void
  onLater: () => void
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-component="update-banner"
      style={{
        position: "fixed",
        top: "52px",
        left: "50%",
        transform: "translateX(-50%)",
        "z-index": "60",
        width: "min(560px, calc(100vw - 32px))",
        display: "flex",
        "align-items": "center",
        gap: "16px",
        padding: "12px 12px 12px 16px",
        background: "var(--v2-background-bg-base)",
        color: "var(--v2-text-text-base)",
        border: "1px solid var(--v2-border-border-base)",
        "border-radius": "12px",
        "box-shadow": "0 12px 32px rgba(0, 0, 0, 0.28)",
      }}
    >
      <div style={{ flex: "1", "min-width": "0" }}>
        <div style={{ "font-weight": "600", "font-size": "13px" }}>{props.title}</div>
        <div style={{ color: "var(--v2-text-text-muted)", "font-size": "12px", "margin-top": "2px" }}>
          {props.message}
        </div>
      </div>
      <Button type="button" variant="neutral" size="small" onClick={() => props.onLater()}>
        {props.later}
      </Button>
      <Button type="button" variant="contrast" size="small" disabled={props.busy} onClick={() => props.onRun()}>
        {props.action}
      </Button>
    </div>
  )
}
