// The newest published release as JSON, for the download page and scripts: /api/latest?channel=latest
import { newest, releases } from "./update.js"

const PLATFORMS = ["windows-x64", "darwin-arm64", "darwin-x64", "linux-x64"]

export async function GET(request) {
  const channel = new URL(request.url).searchParams.get("channel") ?? "latest"

  if (!/^[a-z0-9-]{1,32}$/.test(channel)) return Response.json({ error: "Unknown channel" }, { status: 404 })

  const rows = await releases(channel, PLATFORMS)
  const version = newest(rows.map((row) => row.version))

  if (!version) return Response.json({ error: "No published release" }, { status: 404 })

  const files = rows
    .filter((row) => row.version === version)
    .map((row) => ({ platform: row.platform, kind: row.kind, name: row.file_name, url: row.url, size: row.size }))

  return Response.json(
    { version, notes: rows.find((row) => row.version === version)?.notes ?? null, files },
    { headers: { "cache-control": "public, max-age=60" } },
  )
}
