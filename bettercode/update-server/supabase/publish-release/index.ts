// Records a BetterCode release in the `releases` table, which feeds the desktop app's updates on
// bettercode.vercel.app. Only the release workflow calls it, with the publish token (GitHub secret
// BETTERCODE_PUBLISH_TOKEN) in `x-publish-token`; this holds only the token's SHA-256. Files must be assets of
// 7q9k/BetterCode's GitHub releases, so even a leaked token cannot point updates at other downloads.
//
// POST { version, channel?, notes?, published?, files: [{ platform, kind, file_name, sha512, size }] }
import { createClient } from "jsr:@supabase/supabase-js@2"

const TOKEN_SHA256 = "6d1b20693d4b115cfad38c3bee8476f4e65d6d578f63f39a1854134c231919ba"

const PLATFORMS = ["windows-x64", "darwin-arm64", "darwin-x64", "linux-x64"]

const KINDS = ["installer", "appimage", "deb", "rpm", "app"]

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  if (!(await authorized(request.headers.get("x-publish-token") ?? ""))) return json({ error: "Unauthorized" }, 401)

  const body = await request.json().catch(() => undefined)
  const problem = invalid(body)

  if (problem) return json({ error: problem }, 400)

  const channel = body.channel ?? "latest"
  const rows = body.files.map((file: Record<string, unknown>) => ({
    version: body.version,
    channel,
    platform: file.platform,
    kind: file.kind,
    file_name: file.file_name,
    url: `https://github.com/7q9k/BetterCode/releases/download/v${body.version}/${file.file_name}`,
    sha512: file.sha512,
    size: file.size,
    notes: body.notes ?? null,
    published: body.published ?? true,
  }))

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const { error } = await supabase.from("releases").upsert(rows, { onConflict: "channel,version,platform,kind" })

  if (error) return json({ error: error.message }, 500)

  return json({ version: body.version, channel, files: rows.length })
})

async function authorized(token: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")

  // Compares every character, so the time taken says nothing about how much of the token matched.
  return hex.length === TOKEN_SHA256.length && [...hex].reduce((same, char, index) => same & (char === TOKEN_SHA256[index] ? 1 : 0), 1) === 1
}

function invalid(body: Record<string, unknown> | undefined) {
  if (!body || typeof body !== "object") return "Expected a JSON body"

  if (typeof body.version !== "string" || !/^\d+\.\d+\.\d+$/.test(body.version)) return "version must look like 1.2.3"

  if (body.channel !== undefined && (typeof body.channel !== "string" || !/^[a-z0-9-]{1,32}$/.test(body.channel)))
    return "Invalid channel"

  if (!Array.isArray(body.files) || body.files.length === 0) return "files must be a non-empty array"

  const bad = body.files.find(
    (file) =>
      !PLATFORMS.includes(file?.platform) ||
      !KINDS.includes(file?.kind) ||
      typeof file?.file_name !== "string" ||
      !/^bettercode-desktop-[A-Za-z0-9._-]+$/.test(file.file_name) ||
      typeof file?.sha512 !== "string" ||
      !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512) ||
      !Number.isInteger(file?.size) ||
      file.size <= 0,
  )

  if (bad) return `Invalid file entry: ${JSON.stringify(bad).slice(0, 200)}`
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
}
