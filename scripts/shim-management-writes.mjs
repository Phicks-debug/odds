// Lets the Jev fill scripts (jev-fill.mjs, jev-family.mjs, jev-fill2.mjs) run without the service-role key.
//   - Reads go to the public API as they are, narrowed by ONLY_FILTER (for example "ats=eq.magnet.me&first_seen=gte.2026-10-03"), so only those rows are read.
//   - A PATCH to /rest/v1/postings?id=eq.<id> is turned into one UPDATE sent through the Supabase Management API, typed by the table itself.
// Use it as a preload, with the keys in the environment only (never in a file):
//   SB_URL=https://<ref>.supabase.co SB_KEY=<anon key> TYPESAFE_API_KEY=... SUPABASE_ACCESS_TOKEN=sbp_... ONLY_FILTER='ats=eq.magnet.me&first_seen=gte.2026-10-03' \
//     node --import ./scripts/shim-management-writes.mjs scripts/jev-fill.mjs
const realFetch = globalThis.fetch
const PAT = process.env.SUPABASE_ACCESS_TOKEN
const ONLY = process.env.ONLY_FILTER ?? ""
const REF = (process.env.SB_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!PAT || !REF) throw new Error("Set SUPABASE_ACCESS_TOKEN and SB_URL")

async function query(sql) {
  // The Management API throttles (429) when many updates arrive at once: wait and try again, up to 7 times.
  for (let i = 0; i < 7; i++) {
    const res = await realFetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" },
      body: JSON.stringify({ query: sql }),
    })
    if (res.ok) return
    if (res.status === 429 && i < 6) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i))
      continue
    }
    throw new Error(`management api ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url
  const method = (init.method ?? "GET").toUpperCase()
  if (url.includes("/rest/v1/postings")) {
    if (method === "GET" && ONLY) return realFetch(url + (url.includes("?") ? "&" : "?") + ONLY, init)
    if (method === "PATCH") {
      const id = decodeURIComponent((url.match(/[?&]id=eq\.([^&]+)/) ?? [])[1] ?? "")
      if (!/^[A-Za-z0-9_]+$/.test(id)) throw new Error(`refusing to write: odd id "${id}"`)
      const patch = JSON.parse(init.body)
      const cols = Object.keys(patch)
      if (!cols.length || cols.some((c) => !/^[a-z_]+$/.test(c))) throw new Error("refusing to write: odd column names")
      const json = JSON.stringify(patch)
      if (json.includes("$j$")) throw new Error("refusing to write: unexpected text in the values")
      await query(`update public.postings set ${cols.map((c) => `${c} = r.${c}`).join(", ")} from jsonb_populate_record(null::public.postings, $j$${json}$j$::jsonb) r where public.postings.id = '${id}';`)
      return new Response(null, { status: 204 })
    }
  }
  return realFetch(input, init)
}
