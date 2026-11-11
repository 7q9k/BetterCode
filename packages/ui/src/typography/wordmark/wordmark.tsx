import { createUniqueId, type ComponentProps } from "solid-js"

// "0x539" in the blocky pixel style: each glyph is a 4×5 bitmap of square cells.
const UNIT = 18.4615

const TOP = 18

const GLYPHS = [
  ["1111", "1001", "1001", "1001", "1111"],
  ["0000", "1001", "0110", "0110", "1001"],
  ["1111", "1000", "1111", "0001", "1111"],
  ["1111", "0001", "0111", "0001", "1111"],
  ["1111", "1001", "1111", "0001", "1111"],
]

const GLYPH_WIDTH = 4 * UNIT

const GAP = 1.5 * UNIT

const LEFT = (720 - (GLYPHS.length * GLYPH_WIDTH + (GLYPHS.length - 1) * GAP)) / 2

const PATHS = GLYPHS.map((rows, index) => {
  const x0 = LEFT + index * (GLYPH_WIDTH + GAP)

  return rows
    .flatMap((row, y) =>
      [...row].map((cell, x) => {
        if (cell !== "1") return ""
        const px = (x0 + x * UNIT).toFixed(2)
        const py = (TOP + y * UNIT).toFixed(2)
        const u = UNIT.toFixed(2)

        return `M${px} ${py}h${u}v${u}h-${u}Z`
      }),
    )
    .join("")
})

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
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
            {PATHS.map((d) => (
              <path pathLength={props.outline ? 1 : undefined} d={d} />
            ))}
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="129">
          <rect width="720" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="360" y1="68" x2="360" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
