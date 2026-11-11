import { createUniqueId, type ComponentProps } from "solid-js"
import { Wordmark } from "../typography/wordmark/wordmark"

// The BetterCode mark: the wordmark's "b" in the original OpenCode block-letter style ("1" letter, "2" counter in the
// weaker shade), standing on a polished floor that mirrors it and fades out, like the wordmark on Home. The app icon
// draws the same letter.
const B = ["1000", "1111", "1001", "1221", "1221", "1111"]

const CELL = 5

// The letter is centred in a 40×40 box: 20×30 of letter, then a 1-unit gap and the reflection's first 4 units.
const SIZE = 40

const LEFT = (SIZE - 4 * CELL) / 2

const TOP = (SIZE - 6 * CELL) / 2

const FLOOR = TOP + 6 * CELL + 1

const cells = (value: string, mirror: boolean) =>
  B.flatMap((row, y) =>
    [...row].map((cell, x) => {
      if (cell !== value) return ""

      const top = mirror ? FLOOR + (5 - y) * CELL : TOP + y * CELL

      return `M${LEFT + x * CELL} ${top}h${CELL}v${CELL}h-${CELL}Z`
    }),
  ).join("")

const LETTER = { strong: cells("1", false), counter: cells("2", false) }

const REFLECTION = { strong: cells("1", true), counter: cells("2", true) }

function Letter(props: { class?: string; component: string; ref?: ComponentProps<"svg">["ref"] }) {
  const fade = createUniqueId()
  const mask = createUniqueId()

  return (
    <svg
      ref={props.ref}
      data-component={props.component}
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={fade} x1="0" y1={FLOOR} x2="0" y2={SIZE} gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="white" stop-opacity="1" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
        <mask id={mask}>
          <rect x="0" y={FLOOR} width={SIZE} height={SIZE - FLOOR} fill={`url(#${fade})`} />
        </mask>
      </defs>
      <g fill="var(--icon-strong-base)" mask={`url(#${mask})`} opacity="0.3">
        <path d={REFLECTION.counter} opacity="0.22" />
        <path d={REFLECTION.strong} />
      </g>
      <g fill="var(--icon-strong-base)">
        <path d={LETTER.counter} opacity="0.22" />
        <path d={LETTER.strong} />
      </g>
    </svg>
  )
}

export const Mark = (props: { class?: string }) => <Letter component="logo-mark" class={props.class} />

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => (
  <Letter component="logo-splash" class={props.class} ref={props.ref} />
)

/** The full logo: the "bettercode" wordmark. */
export const Logo = (props: { class?: string }) => <Wordmark class={props.class} fade={false} muted={false} />
