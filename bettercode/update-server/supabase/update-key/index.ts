// Hands the update key to the release workflow, which builds it into the official desktop app. The app sends it with
// every update check, and bettercode.vercel.app answers only requests that carry it, so builds made elsewhere get no
// updates from this server. The key lives in `app_secrets`, which only the service role can read; callers prove
// themselves with the publish token (GitHub secret BETTERCODE_PUBLISH_TOKEN), as for publish-release.
import { createClient } from "jsr:@supabase/supabase-js@2"

const TOKEN_SHA256 = "6d1b20693d4b115cfad38c3bee8476f4e65d6d578f63f39a1854134c231919ba"

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  if (!(await authorized(request.headers.get("x-publish-token") ?? ""))) return json({ error: "Unauthorized" }, 401)

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const { data, error } = await supabase.from("app_secrets").select("value").eq("name", "update_key").single()

  if (error || !data) return json({ error: "No update key" }, 500)

  return json({ key: data.value })
})

async function authorized(token: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")

  // Compares every character, so the time taken says nothing about how much of the token matched.
  return hex.length === TOKEN_SHA256.length && [...hex].reduce((same, char, index) => same & (char === TOKEN_SHA256[index] ? 1 : 0), 1) === 1
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
}
