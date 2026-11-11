import { Wordmark } from "@opencode/ui/wordmark"

const PRODUCT = "BetterCode"

/**
 * Home's title: the product's wordmark in the blocky letter style of the original OpenCode logo, with a faint mirrored
 * shadow under it that fades out, as if it stood on a polished floor.
 */
export function NewSessionHero() {
  return (
    <h1 data-component="new-session-hero" aria-label={PRODUCT} class="m-0 flex justify-center font-normal">
      <span class="flex flex-col items-center rounded-[32px] px-10 pt-6 pb-2 [background:radial-gradient(ellipse_at_center,rgba(23,23,23,0.9)_45%,rgba(23,23,23,0)_75%)]">
        <Wordmark class="block h-auto w-[min(320px,48vw)] text-v2-text-text-muted" fade={false} muted={false} />
        <span
          aria-hidden="true"
          class="mt-1 block h-[26px] w-[min(320px,48vw)] overflow-hidden opacity-20 blur-[1px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        >
          <Wordmark class="block h-auto w-full -scale-y-100 text-v2-text-text-muted" fade={false} muted={false} />
        </span>
      </span>
    </h1>
  )
}
