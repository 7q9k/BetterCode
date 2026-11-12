interface ImportMetaEnv {
  readonly OPENCODE_CHANNEL: string
  readonly OPENCODE_VERSION?: string
  /** Set only in official release builds; see electron.vite.config.ts. */
  readonly BETTERCODE_UPDATE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
