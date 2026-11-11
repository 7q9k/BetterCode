import { type ComponentProps } from "solid-js"

// The BetterCode mark: a ringed planet built from a dot grid, echoing the ASCII backdrop on Home.
const PLANET_DOTS = (() => {
  const dots: { x: number; y: number; o: number }[] = []

  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const dx = x - 4
      const dy = y - 4
      const d = Math.sqrt(dx * dx + dy * dy)

      if (d > 4.3) continue
      // Lit from the top left, fading to the bottom right.
      const light = Math.max(0.25, 1 - (dx + dy + 6) / 14)
      dots.push({ x: 2 + x * 1.5, y: 4 + y * 1.5, o: Number(light.toFixed(2)) })
    }
  }

  return dots
})()

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="var(--icon-strong-base)">
        {PLANET_DOTS.map((dot) => (
          <rect x={dot.x - 0.5} y={dot.y - 0.5} width="1" height="1" opacity={dot.o} />
        ))}
      </g>
      <ellipse
        data-slot="logo-logo-mark-shadow"
        cx="8"
        cy="10"
        rx="7.6"
        ry="2.1"
        transform="rotate(-18 8 10)"
        stroke="var(--icon-base)"
        stroke-width="0.9"
      />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="scale(5)" fill="var(--icon-strong-base)">
        {PLANET_DOTS.map((dot) => (
          <rect x={dot.x - 0.5} y={dot.y - 0.5} width="1" height="1" opacity={dot.o} />
        ))}
        <ellipse
          cx="8"
          cy="10"
          rx="7.6"
          ry="2.1"
          transform="rotate(-18 8 10)"
          fill="none"
          stroke="var(--icon-base)"
          stroke-width="0.9"
        />
      </g>
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g transform="translate(0 1) scale(2)">
        {PLANET_DOTS.map((dot) => (
          <rect x={dot.x - 0.5} y={dot.y - 0.5} width="1" height="1" opacity={dot.o} fill="var(--icon-strong-base)" />
        ))}
        <ellipse
          cx="8"
          cy="10"
          rx="7.6"
          ry="2.1"
          transform="rotate(-18 8 10)"
          stroke="var(--icon-base)"
          stroke-width="0.9"
        />
      </g>
      <text
        x="44"
        y="32"
        fill="var(--icon-strong-base)"
        font-size="30"
        letter-spacing="1"
        style={{ "font-family": "var(--font-family-mono)" }}
      >
        better
      </text>
    </svg>
  )
}
