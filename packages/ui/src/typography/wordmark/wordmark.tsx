import { createUniqueId, type ComponentProps } from "solid-js"

// "bettercode" in the original OpenCode letter style: each letter is a 4-wide grid of 6-unit cells, 7 rows tall
// (an ascender row, five body rows, a descender row). "1" is the letter, "2" its counter, drawn in the weaker shade,
// "0" is empty. The first word is drawn lighter than the second, as "open" and "code" were.
const LETTERS = {
  b: ["1000", "1111", "1001", "1221", "1221", "1111", "0000"],
  e: ["0000", "1111", "1001", "1111", "1222", "1111", "0000"],
  t: ["0100", "1111", "0100", "0122", "0122", "0111", "0000"],
  r: ["0000", "1111", "1220", "1000", "1000", "1000", "0000"],
  c: ["0000", "1111", "1000", "1222", "1222", "1111", "0000"],
  o: ["0000", "1111", "1221", "1221", "1221", "1111", "0000"],
  d: ["0001", "1111", "1001", "1221", "1221", "1111", "0000"],
} satisfies Record<string, readonly string[]>

const WORDS = [
  { text: "better", strong: false },
  { text: "code", strong: true },
]

const CELL = 18.4615

const PITCH = 5 * CELL

const glyph = (letter: string) => Object.entries(LETTERS).find(([key]) => key === letter)?.[1] ?? []

const letters = WORDS.flatMap((word) => [...word.text].map((letter) => ({ rows: glyph(letter), strong: word.strong })))

/** The wordmark's full size, in the units of its viewBox. */
const WIDTH = Math.ceil(letters.length * PITCH - CELL)

const HEIGHT = Math.ceil(7 * CELL)

// One path per letter and shade, each cell a square, so the outline mode can trace every letter.
const PATHS = letters.flatMap(({ rows, strong }, index) => {
  const cells = (value: string) =>
    rows
      .flatMap((row, y) =>
        [...row].map((cell, x) => {
          if (cell !== value) return ""

          const px = (index * PITCH + x * CELL).toFixed(2)
          const py = (y * CELL).toFixed(2)
          const size = CELL.toFixed(2)

          return `M${px} ${py}h${size}v${size}h-${size}Z`
        }),
      )
      .join("")

  return [
    { d: cells("2"), shade: "counter" as const },
    { d: cells("1"), shade: strong ? ("strong" as const) : ("base" as const) },
  ].filter((path) => path.d)
})

const OPACITY = { counter: 0.22, base: 0.62, strong: 1 }

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            {PATHS.map((path) => (
              <path
                pathLength={props.outline ? 1 : undefined}
                d={path.d}
                fill-opacity={props.outline ? undefined : OPACITY[path.shade]}
              />
            ))}
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width={WIDTH} height={HEIGHT}>
          <rect width={WIDTH} height={HEIGHT} fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient
          id={maskGradient}
          x1={WIDTH / 2}
          y1={HEIGHT * 0.53}
          x2={WIDTH / 2}
          y2={HEIGHT}
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
