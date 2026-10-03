/**
 * Checks whether an Apify actor can tell us if a LinkedIn posting is still open. Reads 10 of our own LinkedIn
 * postings (6 old, 4 new) and prints what the actor says about each, so we can see how a closed job shows up:
 *   APIFY_TOKEN=... bun scripts/test-linkedin-validate.ts
 * Costs about $0.01 (the actor charges about $1 per 1,000 pages).
 */
const token = process.env.APIFY_TOKEN
if (!token) {
  console.error("Usage: APIFY_TOKEN=... bun scripts/test-linkedin-validate.ts")
  process.exit(1)
}
const urls: string[] = await Bun.file(new URL("./linkedin-check-urls.json", import.meta.url)).json()
const res = await fetch(`https://api.apify.com/v2/acts/scrapingmonkey~linkedin-job-details-scraper/run-sync-get-dataset-items?token=${token}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ inputList: urls }),
})
console.log("HTTP", res.status)
const items = (await res.json()) as Array<Record<string, unknown>>
console.log(`${items.length} rows back for ${urls.length} urls\n`)
for (const it of items) {
  const pick = Object.fromEntries(Object.entries(it).filter(([k]) => /status|url|input|title|closing|closed|posted|applicant|error/i.test(k)))
  console.log(JSON.stringify(pick))
}
