import { For, createSignal, onCleanup } from "solid-js"
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

/** Home greeting: a small status line and a large headline with one highlighted word. */
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
    <div data-component="new-session-hero" class="flex flex-col items-center gap-4 text-center">
      <div class="flex h-5 items-center gap-2 font-mono text-[13px] leading-[var(--line-height-compact)] tracking-[0.02em] text-v2-text-text-muted">
        <span class="size-1.5 rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.45)]" />
        <span>{language.t(`home.greeting.${part()}`)}</span>
      </div>
      <h1 class="text-[clamp(28px,4.2vw,46px)] font-[380] leading-[1.15] tracking-[-0.03em] text-v2-text-text-base">
        {headline().before}
        <span class="bg-[linear-gradient(90deg,#ffffff,#a3a3a3_55%,#e5e5e5)] bg-clip-text text-transparent">
          {headline().word}
        </span>
        {headline().after}
      </h1>
    </div>
  )
}

// Each chip starts one of the planning workflows (interview → plan → dag → verify).
const SUGGESTIONS = ["interview", "plan", "dag", "verify"] as const

/** Quick-start chips under the composer; each fills the prompt with a starter. */
export function NewSessionSuggestions(props: { onSelect: (text: string) => void }) {
  const language = useLanguage()

  return (
    <div
      role="group"
      aria-label={language.t("home.suggestions.label")}
      class="mt-2 flex flex-wrap items-center justify-center gap-2"
    >
      <For each={SUGGESTIONS}>
        {(id) => (
          <button
            type="button"
            class="h-8 rounded-full border border-v2-border-border-base bg-[rgba(10,10,10,0.6)] px-3.5 font-mono text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted backdrop-blur-sm transition-[border-color,color,background-color] duration-150 hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.06)] hover:text-v2-text-text-base focus-visible:border-v2-border-border-focus focus-visible:outline-none"
            onClick={() => props.onSelect(language.t(`home.suggestion.${id}.prompt`))}
          >
            {language.t(`home.suggestion.${id}`)}
          </button>
        )}
      </For>
    </div>
  )
}
