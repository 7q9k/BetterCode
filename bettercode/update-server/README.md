# BetterCode update server

The desktop app's updates and the download page at **bettercode.vercel.app**.

| Part | Where | What it does |
| --- | --- | --- |
| `releases` table | Supabase project `bettercode` | One row per desktop file of a release: version, platform, GitHub download URL, SHA-512, size, `published`. Anyone may read published rows; only the publish function writes. |
| `supabase/publish-release` | Supabase Edge Function | Called by the `bettercode-release` workflow with the `BETTERCODE_PUBLISH_TOKEN` secret; records the release. It only accepts files of this repository's GitHub releases. |
| `api/update.js` | Vercel | `/update/<channel>/desktop/latest.yml`, `latest-mac.yml`, `latest-linux.yml`: the electron-updater feed for the newest published release. |
| `api/latest.js`, `public/` | Vercel | `/api/latest` as JSON and the download page. |

## Pushing an update

1. Run the **bettercode-release** workflow with the new version. It builds, publishes the GitHub release and registers the desktop files.
2. With **announce** on (the default), every desktop app sees the update within ten minutes, downloads it, and shows "New BetterCode update available". Windows and Linux install it on restart; macOS opens the download, since its builds are not signed.
3. To hold an update back, run the workflow with announce off and later set `published = true` for that version in the Supabase table editor. Setting it back to `false` withdraws a release; the feed then offers the newest version still published.

## Deploying

```bash
cd bettercode/update-server
vercel deploy --prod
```

The edge function is deployed with the Supabase CLI or dashboard from `supabase/publish-release/index.ts`.
