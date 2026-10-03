import { chromium } from "/Users/ad/careerapp2/node_modules/playwright-core/index.mjs"
const browser = await chromium.launch()
const errs=[]
const profile = { permit: "orientation_year", birth: 1999, abroad: 20, origin: "non_eu", dutch: "none", salary: "", tailor: false, cv: "Financial analyst with IFRS and Excel", positions: [{ Title: "Financial Analyst", "Company Name": "Vietcombank", Location: "Hanoi, Vietnam", "Started On": "Mar 2021", "Finished On": "Aug 2023", Description: "Excel, IFRS reporting" }], education: [{ "School Name": "Erasmus University Rotterdam", "Degree Name": "MSc Finance" }], skills: [{ Name: "Excel" }], languages: [], occ: "", onboarded: true, columns: [], columnTypes: {}, notes: {}, people: [], views: {}, templates: null, name: "", headline: "", place: "", about: "", avatar: "" }
for (const [tag,w,h,idx] of [["a",1280,1000,0],["b",1280,1000,2],["m",390,844,0]]) {
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
await ctx.addInitScript((p) => { localStorage.setItem("careersim.profile", JSON.stringify(p)); localStorage.setItem("careersim.saved", JSON.stringify(["p1279", "p1101", "p1230"])) }, profile)
const page = await ctx.newPage()
page.on("pageerror", (e) => errs.push(e.message))
await page.goto("http://localhost:5175/")
await page.waitForSelector("text=job search", { timeout: 30000 })
await page.locator("ul li button.cursor-pointer").nth(idx).click()
await page.waitForTimeout(1800)
await page.locator("h3", { hasText: "Career path" }).scrollIntoViewIfNeeded()
await page.evaluate(() => window.scrollBy?.(0, 0))
await page.screenshot({ path: `shots/c-${tag}.png` })
await ctx.close()
}
console.log(errs)
await browser.close()
