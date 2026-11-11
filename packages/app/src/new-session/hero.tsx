import { createSignal, onCleanup } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"

type DayPart = "morning" | "afternoon" | "evening" | "night"

function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning"

  if (hour >= 12 && hour < 18) return "afternoon"

  if (hour >= 18 && hour < 23) return "evening"

  return "night"
}

// Splits the translated headline around its {{word}} placeholder so the word can carry the accent gradient.
const MARK = "\u0000"

/** Home headline with one highlighted word, matched to the time of day. */
export function NewSessionHero() {
  const language = useLanguage()
  const [part, setPart] = createSignal(dayPart(new Date().getHours()))
  const timer = setInterval(() => setPart(dayPart(new Date().getHours())), 60_000)
  onCleanup(() => clearInterval(timer))

  const headline = () => {
    const [before = "", after = ""] = language.t(`home.headline.${part()}`, { word: MARK }).split(MARK)

    return { before, after, word: language.t("home.headline.word") }
  }

  return (
    <h1
      data-component="new-session-hero"
      class="text-center text-[clamp(28px,4.2vw,46px)] font-[380] leading-[1.15] tracking-[-0.03em] text-v2-text-text-base"
    >
      {headline().before}
      <span class="bg-[linear-gradient(90deg,#ffffff,#a3a3a3_55%,#e5e5e5)] bg-clip-text text-transparent">
        {headline().word}
      </span>
      {headline().after}
    </h1>
  )
}
