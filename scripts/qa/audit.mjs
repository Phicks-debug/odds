import { chromium } from "/Users/ad/careerapp2/node_modules/playwright-core/index.mjs"
const browser = await chromium.launch()
const profile = { permit: "orientation_year", birth: 1999, abroad: 20, origin: "non_eu", dutch: "basic", salary: "", tailor: false, cv: "Financial analyst with IFRS and Excel", positions: [{ Title: "Financial Analyst", "Company Name": "Vietcombank", Location: "Hanoi, Vietnam", "Started On": "Mar 2021", "Finished On": "Aug 2023", Description: "Excel, IFRS reporting" }], education: [{ "School Name": "Erasmus University Rotterdam", "Degree Name": "MSc Finance" }], skills: [{ Name: "Excel" }], languages: [], occ: "", onboarded: true, columns: [], columnTypes: {}, notes: {}, people: [], views: {}, templates: null, name: "Linh Tran", headline: "", place: "", about: "", avatar: "" }
const problems = []
for (const [name, w, h] of [["phone", 390, 844], ["ipad", 820, 1100], ["desktop", 1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript((p) => { localStorage.setItem("careersim.profile", JSON.stringify(p)); localStorage.setItem("careersim.saved", JSON.stringify(["p1279", "p1101", "p1230"])) }, profile)
  const page = await ctx.newPage()
  page.on("pageerror", (e) => problems.push(`${name} PAGEERROR ${e.message}`))
  page.on("console", (m) => { if (m.type() === "error") problems.push(`${name} console: ${m.text().slice(0, 140)}`) })
  await page.goto("http://localhost:5175/")
  await page.waitForSelector("text=job search", { timeout: 30000 })
  await page.waitForTimeout(800)
  const check = async (label) => {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    if (sw > w + 1) problems.push(`${name} ${label}: sideways overflow ${sw} > ${w}`)
  }
  await check("dashboard")
  await page.getByRole("button", { name: /Start looking/ }).click()
  await page.waitForSelector("text=Jobs that fit you")
  await check("jobs list")
  await page.locator("ul > li button[class*='after:absolute']").first().click()
  await page.waitForSelector("[role=dialog]")
  await page.waitForTimeout(600)
  const dw = await page.locator("[role=dialog]").evaluate((d) => d.scrollWidth - d.clientWidth)
  if (dw > 1) problems.push(`${name} job panel: overflow ${dw}`)
  await ctx.close()
}
console.log(problems.length ? problems.join("\n") : "no overflow or console errors")
await browser.close()
