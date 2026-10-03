// Tries Jev on a real posting's requirements against a sample CV. Usage: TYPESAFE_API_KEY=... node scripts/jev-test.mjs
const key = process.env.TYPESAFE_API_KEY
if (!key) { console.error("Set TYPESAFE_API_KEY in the environment."); process.exit(1) }
const cv = `MSc Finance, Erasmus University Rotterdam (2024). Financial analyst intern at a Dutch bank: built Excel models, SQL queries for monthly reporting, IFRS accounting reviews. Fluent English, basic Dutch.`
const requirements = ["Excel", "SQL", "Python", "IFRS", "communication skills", "fluent Dutch", "2+ years of experience"]
const questions = Object.fromEntries(requirements.map((r, i) => [`r${i}`, { type: "noul", instructions: `Does this CV show that the person has the following requirement? Requirement: ${r}`, criteria: { true: "The CV names it, or clearly shows work or study that uses it", false: "The CV does not show it" } }]))
const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ state: cv, model: "jev-latest", questions }) })
const out = await res.json()
console.log(res.status, out.model, out.usage)
requirements.forEach((r, i) => console.log(r.padEnd(24), out.answers?.[`r${i}`]?.noul))
