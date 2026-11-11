import { Show, useContext } from "solid-js"
import { useI18n } from "@opencode/ui/context/i18n"
import { IconButton } from "@opencode/ui/icon-button"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { PlatformContext } from "@/runtime/platform/platform"
import { createDictation } from "./dictation"

/**
 * The composer's microphone. A press starts recording, the next one stops it and puts the transcribed text at the
 * caret. While it records, the ring follows the input level; while the text is recognized, a short status shows.
 */
export function DictationButton(props: { onText: (text: string) => void }) {
  const i18n = useI18n()
  // Desktop asks the system for microphone access first (macOS); the web relies on the browser's own prompt.
  const platform = useContext(PlatformContext)
  const dictation = createDictation({ requestMicrophone: platform?.requestMicrophone, onText: props.onText })
  const view = dictation.view

  const status = () => {
    const loading = view().loading

    if (loading !== undefined) return i18n.t("ui.promptInput.dictate.loading", { percent: Math.round(loading) })

    if (view().transcribing) return i18n.t("ui.promptInput.dictate.transcribing")

    if (view().error === "microphone") return i18n.t("ui.promptInput.dictate.microphone")

    if (view().error === "transcription") return i18n.t("ui.promptInput.dictate.failed")

    return undefined
  }

  const label = () => i18n.t(view().recording ? "ui.promptInput.dictate.stop" : "ui.promptInput.dictate")

  return (
    <div data-component="composer-dictation" class="me-1 flex items-center gap-1">
      <Show when={status()}>
        {(text) => (
          <span class="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-v2-text-text-faint" role="status">
            <Show when={view().transcribing}>
              <Loader class="size-3.5" />
            </Show>
            {text()}
          </span>
        )}
      </Show>
      <Show when={view().recording}>
        <Tooltip placement="top" value={i18n.t("ui.promptInput.dictate.cancel")}>
          <IconButton
            data-action="composer-dictation-cancel"
            size="small"
            variant="ghost-muted"
            aria-label={i18n.t("ui.promptInput.dictate.cancel")}
            icon={<Icon name="close" />}
            onClick={dictation.cancel}
          />
        </Tooltip>
      </Show>
      <Tooltip placement="top" value={label()}>
        <IconButton
          data-action="composer-dictate"
          size="small"
          variant={view().recording ? "contrast" : "ghost-muted"}
          aria-label={label()}
          aria-pressed={view().recording}
          disabled={view().busy}
          class="transition-shadow duration-100"
          style={{
            "box-shadow": view().recording
              ? `0 0 0 ${(2 + dictation.level() * 7).toFixed(1)}px color-mix(in srgb, var(--v2-text-text-base) ${Math.round(12 + dictation.level() * 18)}%, transparent)`
              : undefined,
          }}
          icon={<MicrophoneIcon />}
          onClick={dictation.toggle}
        />
      </Tooltip>
    </div>
  )
}

function MicrophoneIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <rect x="7.25" y="2.75" width="5.5" height="9.5" rx="2.75" />
      <path d="M4.75 9.5a5.25 5.25 0 0 0 10.5 0M10 14.75v2.5" stroke-linecap="round" />
    </svg>
  )
}
