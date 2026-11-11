import { createSignal, onCleanup } from "solid-js"

/**
 * The content width of an element, kept current with a ResizeObserver, so a picture can lay itself out for the room it
 * has at any window size. Zero until the element is attached. Call under an owner; the observer ends with it.
 */
export function createWidth() {
  const [width, setWidth] = createSignal(0)

  const observer = new ResizeObserver((entries) => {
    const next = Math.floor(entries.at(-1)?.contentRect.width ?? 0)

    if (next !== width()) setWidth(next)
  })

  onCleanup(() => observer.disconnect())

  return {
    width,
    ref: (element: HTMLElement) => observer.observe(element),
  }
}
