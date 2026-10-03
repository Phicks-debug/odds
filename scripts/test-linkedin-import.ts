/**
 * Reads one real LinkedIn profile through the same Apify actor the backend uses, maps it exactly as the backend does,
 * and prints what the app would make of it, so you can check it against the profile on screen:
 *   APIFY_TOKEN=... bun scripts/test-linkedin-import.ts https://www.linkedin.com/in/your-name
 * The token is read from the environment and is never written anywhere. One profile costs about $0.004.
 */
import { isUsable, normaliseProfile } from "../supabase/functions/_shared/linkedin-profile"
import { derive } from "../src/lib/engine"
import { mergeLinkedIn } from "../src/lib/linkedin-merge"
import { DEFAULT_PROFILE } from "../src/lib/types"

const url = process.argv[2] ?? ""
const token = process.env.APIFY_TOKEN
if (!/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9%_-]{3,100}\/?(\?.*)?$/.test(url) || !token) {
  console.error("Usage: APIFY_TOKEN=... bun scripts/test-linkedin-import.ts https://www.linkedin.com/in/your-name")
  process.exit(2)
}

const res = await fetch(`https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/run-sync-get-dataset-items?token=${token}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ profileScraperMode: "Profile details no email ($4 per 1k)", queries: [url] }),
})
if (!res.ok) {
  console.error(`The scraper answered ${res.status}`)
  process.exit(1)
}
const items = (await res.json()) as unknown[]
const item = items.find(isUsable)
if (!item) {
  console.error("No usable profile came back. Is it public?", JSON.stringify(items).slice(0, 300))
  process.exit(1)
}

const raw = item as Record<string, unknown[]>
const li = normaliseProfile(item as Record<string, unknown>)
console.log(`Read: ${li.name} · ${li.headline}\nPlace: ${li.place}\n`)
console.log(`Roles (${li.positions.length} of ${raw.experience?.length ?? 0} on the profile):`)
for (const p of li.positions) console.log(`  ${p["Started On"] || "?"} – ${p["Finished On"] || "now"}  ${p.Title} @ ${p["Company Name"]}${p.Location ? ` (${p.Location})` : ""}`)
console.log(`\nEducation (${li.education.length} of ${raw.education?.length ?? 0}):`)
for (const e of li.education) console.log(`  ${e["Start Date"] || "?"} – ${e["End Date"] || "?"}  ${e["School Name"]}: ${e["Degree Name"]}`)
console.log(`\nSkills (${li.skills.length} of ${raw.skills?.length ?? 0}): ${li.skills.map((s) => s.Name).join(", ")}`)
console.log(`Languages: ${li.languages.map((l) => `${l.Name} (${l.Proficiency})`).join(", ")}`)
console.log(`\nExtra text kept for reading skills (${li.cv.length} characters):\n${li.cv.slice(0, 600)}`)

const d = derive(mergeLinkedIn({ ...DEFAULT_PROFILE, positions: [], education: [], skills: [], languages: [], cv: "" }, li))
console.log(`\nThe app reads this as: ${d.years.toFixed(1)} years of work, degree ${d.degree}${d.dutchDegree ? " (Dutch school)" : ""}, internship ${d.internship ? "yes" : "no"}, ${d.skills.size} skills found: ${[...d.skills].slice(0, 25).join(", ")}`)

// Anything on the profile that did not come across.
for (const key of ["experience", "education", "skills", "languages"] as const) {
  const mapped = { experience: li.positions, education: li.education, skills: li.skills, languages: li.languages }[key].length
  const had = raw[key]?.length ?? 0
  if (mapped < had) console.log(`Note: ${had - mapped} of ${had} ${key} entries were left out (empty or repeated).`)
}
