// The desktop app's update feed (electron-updater's "generic" provider). The app asks
// /update/<channel>/desktop/latest.yml (Windows), latest-mac.yml or latest-linux.yml; this answers from the newest
// published release in Supabase. The files themselves are GitHub release assets.

const SUPABASE_URL = "https://anndpsqsihuohtmjisvx.supabase.co"

// The publishable key only reads published releases (row level security in the `releases` table).
const SUPABASE_KEY = "sb_publishable_2qKH38LZWgOYMompciD5wQ_s4ov1SfX"

const FEEDS = {
  "latest.yml": [{ platform: "windows-x64", kind: "installer" }],
  "latest-mac.yml": [
    { platform: "darwin-arm64", kind: "app" },
    { platform: "darwin-x64", kind: "app" },
  ],
  "latest-linux.yml": [
    { platform: "linux-x64", kind: "appimage" },
    { platform: "linux-x64", kind: "deb" },
    { platform: "linux-x64", kind: "rpm" },
  ],
}

export async function GET(request) {
  const url = new URL(request.url)
  const channel = url.searchParams.get("channel") ?? "latest"
  const file = url.searchParams.get("file") ?? ""
  const feed = FEEDS[file]

  if (!feed || !/^[a-z0-9-]{1,32}$/.test(channel)) return new Response("Not found", { status: 404 })

  const rows = await releases(channel, [...new Set(feed.map((item) => item.platform))])
  const version = newest(rows.map((row) => row.version))

  if (!version) return new Response("No published release", { status: 404 })

  const files = feed
    .map((item) => rows.find((row) => row.version === version && row.platform === item.platform && row.kind === item.kind))
    .filter(Boolean)

  if (files.length === 0) return new Response("No published release", { status: 404 })

  return new Response(manifest(version, files), {
    headers: { "content-type": "text/yaml; charset=utf-8", "cache-control": "public, max-age=60" },
  })
}

export async function releases(channel, platforms) {
  const query = new URLSearchParams({
    select: "version,platform,kind,file_name,url,sha512,size,released_at,notes",
    channel: `eq.${channel}`,
    published: "eq.true",
    platform: `in.(${platforms.join(",")})`,
    order: "released_at.desc",
    limit: "200",
  })
  const response = await fetch(`${SUPABASE_URL}/rest/v1/releases?${query}`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
  })

  if (!response.ok) throw new Error(`Supabase answered ${response.status}`)

  return response.json()
}

/** The highest `major.minor.patch` version. */
export function newest(versions) {
  const parts = (version) => version.split(".").map((part) => Number.parseInt(part, 10) || 0)

  return versions.reduce((best, version) => {
    if (!best) return version
    const [a, b] = [parts(version), parts(best)]
    const order = a.map((value, index) => value - (b[index] ?? 0)).find((difference) => difference !== 0) ?? 0

    return order > 0 ? version : best
  }, undefined)
}

function manifest(version, files) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
  const lines = [`version: ${quote(version)}`, "files:"]

  files.forEach((file) => {
    lines.push(`  - url: ${quote(file.url)}`, `    sha512: ${quote(file.sha512)}`, `    size: ${file.size}`)
  })
  lines.push(
    `path: ${quote(files[0].url)}`,
    `sha512: ${quote(files[0].sha512)}`,
    `releaseDate: ${quote(files[0].released_at)}`,
  )

  return lines.join("\n") + "\n"
}
