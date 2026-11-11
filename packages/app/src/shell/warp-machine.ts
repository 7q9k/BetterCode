/** The start-screen → session transition: idle, or one run playing. A request while one plays restarts it. */
export type WarpState = { readonly type: "idle" } | { readonly type: "playing"; readonly run: number }

export type WarpEvent =
  | { readonly type: "requested"; readonly reduced: boolean }
  | { readonly type: "finished"; readonly run: number }

export const IDLE_WARP: WarpState = { type: "idle" }

export function transitionWarp(state: WarpState, event: WarpEvent): WarpState {
  if (event.type === "requested") {
    if (event.reduced) return state

    return { type: "playing", run: state.type === "playing" ? state.run + 1 : 1 }
  }

  // A finish from an earlier run must not end the one that restarted it.
  if (state.type !== "playing" || state.run !== event.run) return state

  return IDLE_WARP
}
