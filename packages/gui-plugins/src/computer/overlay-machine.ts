/**
 * The computer-use overlay: hidden, or shown while an agent controls the desktop. Each activity shows it (or keeps it
 * shown) and moves the drawn cursor; it hides when the agent ends or after a quiet spell, so a session that stops
 * without saying so never leaves the frame up.
 */

/** How long the overlay stays up after the last activity. */
export const QUIET_MS = 6000

export type OverlayActivity = {
  readonly action: "screenshot" | "move" | "click" | "drag" | "scroll" | "type" | "key" | "end"
  readonly x?: number
  readonly y?: number
  readonly durationMs?: number
}

export type OverlayState =
  | { readonly type: "hidden"; readonly attempt: number }
  | { readonly type: "shown"; readonly attempt: number }
  | { readonly type: "disposed" }

export type OverlayEvent =
  | { readonly type: "activity"; readonly activity: OverlayActivity }
  | { readonly type: "quiet"; readonly attempt: number }
  | { readonly type: "disposed" }

export type OverlayEffect =
  | { readonly type: "show" }
  | { readonly type: "hide" }
  | { readonly type: "pointer"; readonly activity: OverlayActivity }
  /** Restarts the quiet timer under `attempt`; a timer of an older attempt is stale. */
  | { readonly type: "quiet.arm"; readonly attempt: number; readonly ms: number }
  | { readonly type: "quiet.cancel" }

export type OverlayTransition = { readonly state: OverlayState; readonly effects: readonly OverlayEffect[] }

export function createOverlayState(): OverlayState {
  return { type: "hidden", attempt: 0 }
}

export function transitionOverlay(state: OverlayState, event: OverlayEvent): OverlayTransition {
  if (state.type === "disposed") return { state, effects: [] }

  if (event.type === "disposed") return { state: { type: "disposed" }, effects: [{ type: "quiet.cancel" }, { type: "hide" }] }

  if (event.type === "quiet") {
    if (state.type !== "shown" || event.attempt !== state.attempt) return { state, effects: [] }

    return { state: { type: "hidden", attempt: state.attempt }, effects: [{ type: "hide" }] }
  }

  if (event.activity.action === "end") {
    if (state.type !== "shown") return { state, effects: [] }

    return { state: { type: "hidden", attempt: state.attempt }, effects: [{ type: "quiet.cancel" }, { type: "hide" }] }
  }

  const attempt = state.attempt + 1

  return {
    state: { type: "shown", attempt },
    effects: [
      ...(state.type === "hidden" ? [{ type: "show" } as const] : []),
      { type: "pointer", activity: event.activity },
      { type: "quiet.arm", attempt, ms: QUIET_MS + (event.activity.durationMs ?? 0) },
    ],
  }
}
