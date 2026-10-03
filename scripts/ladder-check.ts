// Prints the career-path steps for several very different jobs, to see whether they differ. Usage: bun scripts/ladder-check.ts
import { ladderStats } from "../src/lib/ladder"
import { fetchPostings } from "../src/lib/jobs"

const posts = await fetchPostings()
const pick = (re: RegExp) => posts.find((p) => re.test(p.title))!
const samples = [/Copywriting Intern/i, /Financial Analyst/i, /Software Engineer/i, /Data Scientist/i, /Accountant/i, /PhD/i, /Risk/i, /Mechanical|Process Engineer/i]
for (const re of samples) {
  const job = pick(re)
  if (!job) continue
  const sig = ladderStats(posts, job).map((s) => `${s.level[0]}:${s.years ?? "-"}y/${s.pay ?? "-"}/${s.open}/${s.roles[0] ?? "-"}`).join("  ")
  console.log(job.title.slice(0, 34).padEnd(34), sig)
}
