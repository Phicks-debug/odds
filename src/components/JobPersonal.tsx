import { skillLabel } from "@/lib/skills"
import { CircleHelpIcon } from "@/components/icons"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/bits"
import { Hint } from "@/components/Hint"
import { Caret, ChancePanel } from "@/components/OddsExplain"
import { ReferralLink } from "@/components/People"
import { Section } from "@/components/Section"
import { TIERS, TIER_LABEL, type Requirement, type Tier } from "@/lib/requirements"
import { standardise, standardNames, standardTiers } from "@/lib/standard"

export { Section }
import { useData } from "@/lib/data"
import { ladderStats, poolOf, rungOf } from "@/lib/ladder"
import { derive, eur, isInternship, levelOf, type Level, payChoicesOf, netMonth, pct, point, standing, thresholdLines, type Standing, type WhatIf, NO_WHAT_IF } from "@/lib/engine"
import { EXAMPLE_PROFILE } from "@/lib/example"
import { DUTCH_OPTIONS } from "@/lib/journey"
import { allowanceNote, allowanceOf, payMid, payOf, TRAINEE_NOTE, type AllowanceSource } from "@/lib/spec"
import { useApplyFilter } from "@/lib/filter-bus"
import { industryOf } from "@/lib/industries"
import type { PayChoices, PermitRoute, Posting, Transition } from "@/lib/types"

/** The same four, as they read inside a sentence. */
const MISSING_WORDS: Record<string, string> = { Permit: "a high enough salary", Degree: "the degree", "Minimum years": "enough experience", Dutch: "Dutch", Language: "the language", Student: "student status" }

/** A small "?" that opens the working behind a figure, so the page can say less and lose nothing. */
function Info({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)

  return (
    <div className="mt-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <CircleHelpIcon className="size-4" aria-hidden="true" /> {label}
      </button>
      {open ? <div className="mt-2 rounded-xl bg-secondary/70 p-4 text-sm leading-relaxed">{children}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------- the two numbers at the top

/** What you keep each month after tax at this job's pay, with and without health insurance. Null when there is no pay to work from. */
function keepOf(post: Posting, data: ReturnType<typeof useData>): { net: number; afterInsurance: number; basis: "Stated" | "Typical" } | null {
  const ref = data.reference
  const mid = ref ? payMid(post, ref) : null
  if (!ref || !mid) {
    return null
  }
  const c = payChoicesOf(data.profile)
  const net = netMonth(mid.month * 12, c.ruling, c.masterFloor, ref.tax).net

  return { net, afterInsurance: net - ref.tax.health_insurance_2026.average_premium_month, basis: mid.basis }
}

/**
 * The two numbers this product exists to give: your chance of an interview and
 * what you would keep each month. They lead every job, and they move when you
 * tick a recommendation below.
 */
export function UspStrip({ post, st, base, active }: { post: Posting; st: Standing; base: Standing; active: boolean }): React.JSX.Element {
  const data = useData()
  const [open, setOpen] = useState<boolean>(false)
  const keep = keepOf(post, data)
  const r = st.rate
  const chance = r && !r.thin ? point(r.mid) : st.needsProfile ? "0%" : null
  const was = active && base.rate && !base.rate.thin ? point(base.rate.mid) : null
  const missing = st.gates.filter((g) => g.status === "fail").map((g) => MISSING_WORDS[g.name])
  const studentGate = st.gates.find((g) => g.name === "Student")

  return (
    <div className="flex flex-col gap-2">
      <section aria-label="Your numbers" className="grid overflow-hidden rounded-xl border sm:grid-cols-2">
        <div className="flex flex-col gap-1 p-4 sm:p-5">
          <p className="text-[0.8125rem] text-muted-foreground">Interview chance</p>
          {chance !== null ? (
            <>
              <button type="button" aria-expanded={open} aria-controls="chance-explained" onClick={() => setOpen(!open)} className="group flex w-fit cursor-pointer items-center gap-2 text-left">
                <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums underline decoration-dotted decoration-1 underline-offset-[6px] group-hover:decoration-solid">{chance}</span>
                <Caret open={open} />
              </button>
              <p className="text-sm text-muted-foreground">
                {st.needsProfile ? "Add your CV or connect LinkedIn" : <>get an interview{was ? <span className="text-foreground"> · was {was}</span> : null}</>}
              </p>
              {st.failing > 0 ? (
                <p className="text-sm text-muted-foreground">
                  This job also asks for {missing.join(" and ")}.{studentGate?.status === "fail" ? ` ${studentGate.why.replace(/^the posting /, "It ")}.` : ""} Tick a recommendation below to count it.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Too few similar jobs to give a range we would stand behind.</p>
          )}
        </div>
        <div className="flex flex-col gap-1 border-t p-4 sm:border-t-0 sm:border-l sm:p-5">
          <p className="text-[0.8125rem] text-muted-foreground">You keep</p>
          {keep ? (
            <>
              <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{eur(keep.net)}</p>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                a month after tax
                <Hint label="About what you keep">
                  At the {keep.basis === "Stated" ? "pay the employer states" : "typical pay for this kind of job"}, with 2026 tax and credits{" "}
                  and the 30% ruling if you qualify. {eur(keep.afterInsurance)} after an average health insurance premium. Pension is not included.
                </Hint>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{isInternship(post) ? "An internship allowance is not a salary, so there is no tax figure." : "There is no pay figure for this job to work from."}</p>
          )}
        </div>
      </section>
      {open ? (
        <div id="chance-explained">
          <ChancePanel post={post} st={st} />
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- what to put on your CV

interface FitProps {
  post: Posting
  st: Standing
  /** The lines of the posting that say what it asks for, each with how much it insists. Empty when the posting has no such part. */
  requirements: Requirement[]
}

/** What each tier means, in the posting's own terms. */
/** The more a posting insists, the more orange: a rail on the card, a tint on the chips. */
const TIER_CHIP: Record<Tier, string> = {
  must: "border border-brand/60 bg-brand/15 text-foreground",
  strong: "border border-brand/35 bg-brand/[0.07] text-foreground",
  optional: "border border-transparent bg-secondary text-foreground",
  nice: "border border-dashed bg-transparent text-muted-foreground",
}
const TIER_RAIL: Record<Tier, string> = { must: "border-l-brand", strong: "border-l-brand/50", optional: "border-l-muted-foreground/30", nice: "border-l-border" }

const TIER_NOTE: Record<Tier, string> = {
  must: "the posting insists on these",
  strong: "it says these clearly help",
  optional: "preferred, a small help",
  nice: "mentioned, barely counts",
}

type Kind = "skills" | "experience" | "education" | "language" | "qualities" | "conditions"
const KIND_LABEL: Record<Kind, string> = { skills: "Skills and tools", experience: "Experience", education: "Education", language: "Language", qualities: "Qualities", conditions: "Conditions" }
const KINDS: Kind[] = ["skills", "experience", "education", "language", "qualities", "conditions"]

/**
 * What to put on your CV for this job. Not a score, and nothing judged from your profile: only what the posting
 * asks for, sorted by how much it insists (Jev's reading of the posting) and shown the same way on every job, in a
 * fixed vocabulary (see standard.ts). If you have a thing, say so on your CV in these words.
 */
export function FitCard({ post, requirements }: FitProps): React.JSX.Element {
  const tiers = standardTiers(requirements, TIERS).map(({ tier, std }) => ({ tier, std, rows: KINDS.filter((k) => std[k].length > 0) }))
  const unread = standardise(requirements).unread
  // A posting with no requirements part still names things: those are listed without a tier.
  const mentioned = requirements.length === 0 ? standardNames(post.skills ?? []) : []

  return (
    <Section title="What to put on your CV">
      <div className="flex flex-col gap-7">
        <p className="text-sm text-muted-foreground">
          What this job asks for, most important first, in the same words for every job. Whatever of it is true for you, put on your CV in these words, near the top.
        </p>

        {tiers.map(({ tier, std, rows }) => (
          <div key={tier} className={`rounded-xl border border-l-4 bg-card p-4 ${TIER_RAIL[tier]}`}>
            <p className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-base font-semibold">{TIER_LABEL[tier]}</span>
              <span className="text-xs text-muted-foreground">{TIER_NOTE[tier]}</span>
            </p>
            <dl className="flex flex-col gap-3">
              {rows.map((kind) => (
                <div key={kind} className="grid gap-1.5 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
                  <dt className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{KIND_LABEL[kind]}</dt>
                  <dd>
                    <ul className="flex flex-wrap gap-1.5">
                      {std[kind].map((t) => (
                        <li key={t} className={`rounded-md px-3 py-1 text-sm ${TIER_CHIP[tier]}`}>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        {unread > 0 ? <p className="text-sm text-muted-foreground">{unread === 1 ? "One more line" : `${unread} more lines`} in the posting say something beyond this list. They are in the description below.</p> : null}

        {mentioned.length > 0 ? (
          <div className="flex flex-col">
            <p className="mb-2 text-sm font-medium">What it mentions</p>
            <ul className="flex flex-wrap gap-2 border-y py-3">
              {mentioned.map((t) => (
                <li key={t} className="rounded-md bg-secondary px-2.5 py-1 text-sm font-medium">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tiers.length === 0 && mentioned.length === 0 ? <p className="text-sm text-muted-foreground">This posting does not list what it asks for. Read the description below, and use its words.</p> : null}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- recommendations

interface Rec {
  key: string
  title: string
  reason: string
  source: string
  /** A few words on what ticking it does, shown beside the title. */
  badge: string
  /** True when ticking it changes the percentage, false when it closes a gap only. */
  moves: boolean
  on: boolean
  /** True when a person on the People table already settles it, so the box cannot be unticked here. */
  fixed?: boolean
  /** Shown under the line, outside the tick box, for a control that belongs to it. */
  extra?: React.ReactNode
  toggle: () => void
}

/**
 * What you could do about this job: a tick box, what it is worth in a few words,
 * and a "?" for the reason and where the figure comes from. Tick one and the
 * numbers at the top move. Ticking "someone at the company" is a fact about you and stays.
 */
export function Recommendations({ post, base, whatIf, setWhatIf }: { post: Posting; base: Standing; whatIf: WhatIf; setWhatIf: (w: WhatIf) => void }): React.JSX.Element | null {
  const data = useData()
  const ref = data.reference!
  const shares = data.shares!
  const referral = data.referrals.has(post.id)
  const d = derive(data.profile)
  const active = whatIf.dutch || whatIf.degree || whatIf.student || whatIf.years > 0 || whatIf.skills.length > 0 || whatIf.tailor !== null
  const failed = (name: string): boolean => base.gates.find((g) => g.name === name)?.status === "fail"
  const [open, setOpen] = useState<string | null>(null)

  /** What one change is worth on its own, measured from where you stand now, in a few words. */
  function worth(change: Partial<WhatIf>, asReferral = false): string {
    const alt = standing(post, data.profile, ref, shares, { ...NO_WHAT_IF, ...change }, asReferral || referral, data.strengthFor(post))
    if (base.rate && alt.rate && !base.rate.thin && !alt.rate.thin) {
      const was = point(base.rate.mid)
      const now = point(alt.rate.mid)
      if (was !== now) {
        return `→ ${now}`
      }
    }
    if (alt.failing < base.failing) {
      return "Closes a gap"
    }

    return base.failing > 0 ? "Counts later" : "No change"
  }


  const recs: Rec[] = []
  if (failed("Dutch")) {
    recs.push({ key: "dutch", title: "Learn Dutch", reason: `This job requires Dutch and yours is ${DUTCH_OPTIONS.find((o) => o.value === data.profile.dutch)?.label.replace(/ \(.*/, "").toLowerCase()}. Professional level meets it.`, source: "Posting and your profile", badge: worth({ dutch: true }), moves: true, on: whatIf.dutch, toggle: () => setWhatIf({ ...whatIf, dutch: !whatIf.dutch }) })
  }
  if (failed("Degree")) {
    recs.push({ key: "degree", title: post.degree_asked === "bachelor" ? "Finish a bachelor's" : post.degree_asked === "phd" ? "Get a PhD" : "Finish a master's", reason: `The posting asks for a ${post.degree_asked}'s degree and yours is ${d.degree === "unknown" ? "not on your profile" : d.degree}.`, source: "Posting and your profile", badge: worth({ degree: true }), moves: true, on: whatIf.degree, toggle: () => setWhatIf({ ...whatIf, degree: !whatIf.degree }) })
  }
  if (failed("Minimum years")) {
    const need = Math.max(1, Math.ceil((post.years_min ?? 1) - d.years))
    recs.push({ key: "years", title: need === 1 ? "Add a year of experience" : `Add ${need} years of experience`, reason: `It asks for ${post.years_min}+ years and you have ${d.years.toFixed(1)}.`, source: "Posting and your profile", badge: worth({ years: need }), moves: true, on: whatIf.years > 0, toggle: () => setWhatIf({ ...whatIf, years: whatIf.years > 0 ? 0 : need }) })
  }
  if (failed("Student")) {
    recs.push({ key: "student", title: "I am a student", reason: "The posting asks for a current student and your profile says you are not studying (or has no current study). If you are enrolled now, tick this to see the job as it counts for you, then say so in your profile so every job knows.", source: "Posting and your profile", badge: worth({ student: true }), moves: true, on: whatIf.student, toggle: () => setWhatIf({ ...whatIf, student: !whatIf.student }) })
  }
  const person = data.people.find((p) => p.jobId === post.id && p.status === "Referred")
  recs.push({
    key: "referral",
    title: "Get a referral",
    reason: person ? `${person.name} has referred you for this job. People who are referred get an interview about one and a half times as often.` : "People who are referred get an interview about one and a half times as often.",
    source: "Ashby 2026, all countries",
    badge: person || referral ? "Counted" : worth({}, true),
    moves: true,
    on: referral,
    fixed: Boolean(person),
    extra: <ReferralLink post={post} />,
    toggle: () => data.toggleReferral(post.id),
  })
  {
    recs.push({ key: "tailor", title: "Tailor your CV", reason: "Tailored applications did better in a US test. It is the weakest evidence we use, so it only raises the top of the range.", source: "ResumeGo 2020", badge: worth({ tailor: true }), moves: true, on: whatIf.tailor === true, toggle: () => setWhatIf({ ...whatIf, tailor: whatIf.tailor === true ? null : true }) })
  }
  const tierRank = (skill: string): number => { const t = post.tiers?.[skill]; const i = t ? TIERS.indexOf(t) : -1; return i < 0 ? TIERS.length : i }
  for (const m of base.checklist.filter((c) => !c.have).sort((a, b) => tierRank(a.skill) - tierRank(b.skill) || (b.share ?? 0) - (a.share ?? 0)).slice(0, 3)) {
    const on = whatIf.skills.includes(m.skill)
    recs.push({
      key: `skill-${m.skill}`,
      title: `Learn ${skillLabel(m.skill)}`,
      reason: `${m.share != null ? `Mentioned in ${pct(m.share)} of similar postings. ` : ""}Having more of the skills a posting lists raises the estimate. The size is scaled from one US study and partly our assumption, so treat it as a guide.`,
      source: "Posting",
      badge: worth({ skills: [m.skill] }),
      moves: true,
      on,
      toggle: () => setWhatIf({ ...whatIf, skills: on ? whatIf.skills.filter((s) => s !== m.skill) : [...whatIf.skills, m.skill] }),
    })
  }

  return (
    <Section
      title="Recommendations"
      aside={
        active ? (
          <button type="button" onClick={() => setWhatIf(NO_WHAT_IF)} className="cursor-pointer text-sm font-medium text-primary underline">
            Untick all
          </button>
        ) : (
          <Hint label="How recommendations work" align="right">
            Tick what you could do. The numbers at the top move, and each line has a reason and its source behind the question mark.
          </Hint>
        )
      }
    >
      <ul className="divide-y border-y">
        {recs.map((r) => (
          <li key={r.key}>
            <div className="flex items-center gap-3 py-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={r.on} disabled={r.fixed} onChange={r.toggle} className="size-4 shrink-0" />
                <span className="min-w-0 font-medium">{r.title}</span>
              </label>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[0.8125rem] font-medium tabular-nums ${r.on && r.moves ? "bg-good text-good-foreground" : "bg-secondary text-secondary-foreground"}`}>{r.badge}</span>
              <button
                type="button"
                aria-label={`Why: ${r.title}`}
                aria-expanded={open === r.key}
                onClick={() => setOpen(open === r.key ? null : r.key)}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
              >
                <CircleHelpIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
            {open === r.key ? (
              <p className="-mt-1 pb-3 pl-7 text-sm text-muted-foreground">
                {r.reason} <span className="whitespace-nowrap">Source: {r.source}.</span>
              </p>
            ) : null}
            {r.extra}
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------- the locked version

/**
 * The same three blocks, blurred, for someone who has not signed in: the page
 * looks the same for everyone and the part that is about you is one step away.
 * The figures behind the blur are placeholders, not anyone's numbers.
 */
export function LockedPersonal({ onUnlock }: { onUnlock: () => void }): React.JSX.Element {
  const data = useData()
  const bar = (w: string): React.JSX.Element => <span className={`block h-3 rounded bg-foreground/15 ${w}`} />

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none flex flex-col gap-8 opacity-70 blur-[7px] select-none">
        <section className="grid overflow-hidden rounded-xl border sm:grid-cols-2">
          <div className="flex flex-col gap-1 p-5">
            <p className="text-[0.8125rem] text-muted-foreground">Interview chance</p>
            <p className="text-3xl font-semibold tabular-nums">6%</p>
            {bar("w-48")}
          </div>
          <div className="flex flex-col gap-1 border-t p-5 sm:border-t-0 sm:border-l">
            <p className="text-[0.8125rem] text-muted-foreground">You keep</p>
            <p className="text-3xl font-semibold tabular-nums">€4.212</p>
            {bar("w-40")}
          </div>
        </section>
        <section className="border-t pt-6">
          <h2 className="mb-4 text-lg font-semibold">Does it fit your CV?</h2>
          <div className="flex flex-col gap-4">
            {["w-64", "w-52", "w-72"].map((w) => (
              <div key={w} className="flex items-start gap-3">
                <span className="size-6 shrink-0 rounded-full bg-good" />
                <div className="flex flex-col gap-2">
                  {bar(w)}
                  {bar("w-40")}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="border-t pt-6">
          <h2 className="mb-4 text-lg font-semibold">Recommendations</h2>
          <div className="flex flex-col gap-4">
            {["w-60", "w-72", "w-56"].map((w) => (
              <div key={w} className="flex items-start gap-3">
                <span className="mt-1 size-4 shrink-0 rounded border" />
                <div className="flex flex-col gap-2">
                  {bar(w)}
                  {bar("w-64")}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="absolute inset-x-0 top-6 flex justify-center px-4">
        <div className="flex max-w-sm flex-col items-start gap-3 rounded-xl border bg-card p-5 shadow-lg">
          <h2 className="text-lg font-semibold tracking-tight">Sign in to unlock your numbers</h2>
          <p className="text-sm text-muted-foreground">Your chance of an interview, what you keep after tax, how your CV fits, and what to do to improve it.</p>
          <Button onClick={onUnlock} className="cursor-pointer">
            Sign in to unlock
          </Button>
          <button type="button" onClick={() => {
              data.setProfile(EXAMPLE_PROFILE)
              window.dispatchEvent(new Event("careersim:show-jobs"))
            }} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Or look around with an example profile
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- pay

export function PayCard({ post, st, onPick }: { post: Posting; st: Standing; onPick?: () => void }): React.JSX.Element | null {
  const data = useData()
  const ref = data.reference!
  const view = st.band

  const allowance = payOf(post, ref)
  if (!view || (isInternship(post) && !allowance.text)) {
    // No pay band for this kind of job: the section is still here, with the employer's own figure when there is one.
    return (
      <Section title="Pay and career path">
        {allowance.text ? (
          <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
            {allowance.text}
            <span className="text-base font-normal text-muted-foreground">{allowance.perHour ? "an hour" : "a month"}</span>
            {allowance.source ? <Hint label="About this pay">{allowance.basis === "Allowance" ? allowanceNote(allowance.source as AllowanceSource) : `${allowance.source}, before tax.`}</Hint> : null}
          </p>
        ) : null}
        <CareerPath post={post} st={st} onPick={onPick} />
      </Section>
    )
  }
  if (allowance.perHour) {
    return (
      <Section title="Pay and career path">
        <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {allowance.text}
          <span className="text-base font-normal text-muted-foreground">an hour</span>
          <Hint label="About this pay">Stated by the employer, before tax. A monthly figure depends on how many hours you work, so none is worked out.</Hint>
        </p>
        <CareerPath post={post} st={st} onPick={onPick} />
      </Section>
    )
  }
  if (allowance.source === "Typical traineeship pay") {
    return (
      <Section title="Pay and career path">
        <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {allowance.text}
          <span className="text-base font-normal text-muted-foreground">a month, typical for a traineeship</span>
          <Hint label="About this pay">{TRAINEE_NOTE}</Hint>
        </p>
        <CareerPath post={post} st={st} onPick={onPick} />
      </Section>
    )
  }
  if (allowance.basis === "Allowance") {
    // An internship pays an allowance, not a salary: the pay bands, tax and permit rows would all be for a job it is not.
    return (
      <Section title="Pay and career path">
        <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {allowance.text}
          <span className="text-base font-normal text-muted-foreground">a month</span>
          <Hint label="About this allowance">
            {allowanceNote(allowance.source as AllowanceSource)} Ask the employer what this one pays.
          </Hint>
        </p>
        <CareerPath post={post} st={st} onPick={onPick} />
      </Section>
    )
  }

  const p25 = Math.round(view.grossMonth.p25 / 10) * 10
  const p50 = Math.round(view.grossMonth.p50 / 10) * 10
  const p75 = Math.round(view.grossMonth.p75 / 10) * 10

  return (
    <Section title="Pay and career path">
      <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
        {eur(p25)} – {eur(p75)}
        <span className="text-base font-normal text-muted-foreground">a month for this kind of job across employers (Statistics Netherlands, 2024), not this posting&apos;s own pay</span>
        <Hint label="About this pay">
          Before tax, for this kind of job across employers (Statistics Netherlands, 2024). The middle of the range is {eur(p50)}.
        </Hint>
      </p>

      <CareerPath post={post} st={st} onPick={onPick} />

      <Info label="Sources">
        <ul className="space-y-1.5">
          <li>
            <b>Pay</b> · Statistics Netherlands 2024, {view.band.label}, {view.band.employees_k}k employees, with holiday allowance
          </li>
          {view.ageAdjustedP50 ? (
            <li>
              <b>Your age</b> · {view.ageBand?.replace(" tot ", "–").replace(" jaar", "")}: middle {eur(view.ageAdjustedP50)}
            </li>
          ) : null}
          <li>
            <b>Tax</b> · Belastingdienst 2026, pension not included{derive(data.profile).rulingEligible ? "" : ", no 30% ruling for you"}
          </li>
          <li>
            <b>Permit</b> · IND 2026 thresholds
          </li>
          <li>
            <b>Sponsor</b> · {post.ind_sponsor ? `on the IND register as "${post.ind_sponsor_name}"` : "not on the IND register"}
          </li>
        </ul>
        <ul className="mt-3 border-t">
          {thresholdLines(view, data.profile, ref).map((t) => (
            <li key={t.label} className="flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0">
              <span>{t.yours ? <b>{t.label} (yours)</b> : t.label}</span>
              <Pill tone={t.clears ? "ok" : "bad"}>{t.clears ? "Clear" : "Short"} by {eur(Math.abs(t.gap))}</Pill>
            </li>
          ))}
        </ul>
      </Info>

    </Section>
  )
}

/**
 * The occupation the next-step data is filed under, only when the job's own title says it. The data covers five occupations
 * (Flemish careers, JobHop), so a job in a neighbouring pay group is not that occupation, and an internship or working-student job
 * is not a career spell at all: for those nothing is shown rather than another occupation's moves.
 */
const TRANSITION_TITLES: ReadonlyArray<[string, RegExp]> = [
  ["DATA ANALYST", /\bdata analyst/i],
  ["FINANCIAL ANALYST", /\b(financial|finance) analyst/i],
  ["BUSINESS ANALYST", /\bbusiness analyst/i],
  ["ACCOUNTANT", /\baccountant\b/i],
  ["SOFTWARE DEVELOPER", /\bsoftware (developer|engineer)/i],
]
export function transitionKeyOf(post: Posting): string | undefined {
  if (isInternship(post)) return undefined
  const title = post.title_clean ?? post.title

  return TRANSITION_TITLES.find(([, re]) => re.test(title))?.[0]
}

interface LevelPay {
  /** Gross a month. */
  v: number
  /** True when no posting states it and the figure is the typical pay for this kind of work. */
  typical: boolean
  /** Set when the employer states an hourly rate: shown as written, with no monthly or tax figure. */
  hourly?: string
  /** Set for an internship allowance, which is not a salary. */
  allowance?: { text: string; source: AllowanceSource }
  /** The employer's own range, as written. */
  text?: string
}

/** What a monthly pay becomes: tax, then health insurance, a month and a year. */
function TakeHome({ month, typical, totals, premium, threshold, ruling }: { month: number; typical: boolean; totals: { gross: number; netM: number; free: number }; premium: number; threshold: number | null; ruling: boolean }): React.JSX.Element {
  const row = (label: string, m: number, strong = false, minus = false): React.JSX.Element => (
    <div className={`grid grid-cols-[minmax(0,1fr)_5.5rem_6rem] items-baseline gap-x-3 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="text-right tabular-nums">{minus ? "−" : ""}{eur(Math.abs(m))}</dd>
      <dd className="text-right tabular-nums">{minus ? "−" : ""}{eur(Math.abs(m) * 12)}</dd>
    </div>
  )
  // The typical figure includes the 8% holiday pay; the visa minimum does not, so it is compared like for like.
  const gap = threshold != null ? (typical ? month / 1.08 : month) - threshold : null

  return (
    <div className="mt-3 min-w-0 rounded-lg bg-secondary/50 p-3 text-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6rem] gap-x-3 text-xs text-muted-foreground">
        <span />
        <span className="text-right">a month</span>
        <span className="text-right">a year</span>
      </div>
      <dl className="divide-y">
        {row("Pay before tax", totals.gross)}
        {row("Income tax", totals.gross - totals.netM, false, true)}
        {row("What you get", totals.netM, true)}
        {row("Health insurance", premium, false, true)}
        {row("What is left", totals.netM - premium, true)}
      </dl>
      {gap != null && threshold != null ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          Your visa needs {eur(threshold)} a month
          <Pill tone={gap >= 0 ? "ok" : "bad"}>{gap >= 0 ? "This is enough" : "This is not enough"}</Pill>
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Dutch tax for 2026, no pension.{ruling ? ` 30% of the pay is tax-free${totals.free > 0 ? "" : ""}.` : ""}
        {typical ? " The pay is what this kind of work typically pays, not a posted salary." : ""}
      </p>
    </div>
  )
}

/** Same colour for roles with about the same share: a new group starts where the next role falls below 80% of the one before it. */
const MOVE_COLORS = ["bg-brand", "bg-primary", "bg-muted-foreground/60", "bg-brand/40"]

/**
 * Where people in this job went next, as columns: the share sits on top of each, roles that are about equally common share a colour, and
 * pressing one says what we know about that role: how many moved there and what the postings we hold for it look like.
 */
function NextMoves({ transition, postings, onPick }: { transition: Transition; postings: ReadonlyArray<Posting>; onPick?: () => void }): React.JSX.Element {
  const apply = useApplyFilter()
  const [picked, setPicked] = useState<number | null>(null)
  const top5 = transition.top.slice(0, 5)
  const biggest = Math.max(1, ...top5.map(([, n]) => n))
  const covered = top5.reduce((sum, [, n]) => sum + n, 0) / transition.with_next
  const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)
  const group: number[] = []
  top5.forEach(([, n], i) => group.push(i === 0 ? 0 : n / top5[i - 1][1] < 0.8 ? group[i - 1] + 1 : group[i - 1]))
  const colorOf = (i: number): string => MOVE_COLORS[Math.min(group[i], MOVE_COLORS.length - 1)]
  const share = (n: number): string => pct(n / transition.with_next, 1)

  const sel = picked !== null ? top5[picked] : null
  const open = useMemo(() => {
    if (!sel) return null
    const words = sel[0].toLowerCase().split(/\s+/).filter(Boolean)
    const hits = postings.filter((q) => {
      const t = (q.title_clean ?? q.title).toLowerCase()
      return words.every((w) => t.includes(w))
    })
    const years = hits.map((q) => q.years_min).filter((y): y is number => y != null).sort((a, b) => a - b)
    const levels = new Map<string, number>()
    for (const q of hits) levels.set(levelOf(q), (levels.get(levelOf(q)) ?? 0) + 1)
    const common = [...levels.entries()].sort((a, b) => b[1] - a[1])[0]

    return { n: hits.length, years: years.length >= 3 ? years[Math.floor(years.length / 2)] : null, common: common ? { level: common[0], n: common[1] } : null }
  }, [sel, postings])

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 className="flex items-center gap-2 text-base font-semibold">
          Where people in this job went next
          <Hint label="About these moves">
            Real careers of people in Flanders (JobHop data), written by the people themselves, so titles can be noisy and the Dutch market may differ. People moved to many different roles: these five make up {pct(covered, 0)} of all moves.
          </Hint>
        </h4>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">people stay about {(transition.tenure_q_median / 4).toFixed(1)} years</span>
      </div>
      <ol className="mt-5 grid grid-cols-5 gap-2 sm:gap-3">
        {top5.map(([role, count], i) => (
          <li key={role} className="min-w-0">
            <button type="button" aria-pressed={picked === i} onClick={() => setPicked(picked === i ? null : i)} className={`flex w-full cursor-pointer flex-col items-center rounded-lg px-1 pt-1 pb-2 text-center transition-colors hover:bg-secondary/60 ${picked === i ? "bg-secondary" : ""}`}>
              <div className="flex h-36 w-full flex-col items-center justify-end gap-1">
                <span className="text-sm font-semibold tabular-nums">{share(count)}</span>
                <div className={`w-full rounded-t-md ${colorOf(i)}`} style={{ height: `${Math.max(8, (count / biggest) * 108)}px` }} />
              </div>
              <span className="mt-1.5 w-full break-words text-xs leading-tight">{cap(role)}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">Same colour means about the same share. Press a role for more.</p>

      {sel && open ? (
        <div className="mt-3 rounded-lg border bg-background p-4 text-sm">
          <p className="text-base font-semibold">{cap(sel[0])}</p>
          <p className="mt-1">{share(sel[1])} of the people who left this job went on to this role.</p>
          {open.n > 0 ? (
            <>
              <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Open now</dt>
                <dd className="font-medium">{open.n} {open.n === 1 ? "job" : "jobs"} on odds</dd>
                {open.common ? (
                  <>
                    <dt className="text-muted-foreground">Usual level</dt>
                    <dd className="font-medium">{open.common.level}</dd>
                  </>
                ) : null}
                {open.years !== null ? (
                  <>
                    <dt className="text-muted-foreground">Asks for</dt>
                    <dd className="font-medium">{open.years}+ years of experience</dd>
                  </>
                ) : null}
              </dl>
              {apply ? (
                <button type="button" onClick={() => { apply({ query: sel[0] }); onPick?.() }} className="mt-3 cursor-pointer rounded-full border px-3 py-1 font-medium transition-colors hover:border-foreground">
                  See these jobs →
                </button>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">No open job with this title on odds right now.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The ladder every job sits on, from entry to director, read from the postings
 * we hold: what each rung asks in years, what it states in pay, how many are open.
 * This job is the dark step; the orange ring is where the years you enter put you.
 */
function CareerPath({ post, st, onPick }: { post: Posting; st: Standing; onPick?: () => void }): React.JSX.Element {
  const data = useData()
  const apply = useApplyFilter()
  const industry = industryOf(post)
  const ref = data.reference!
  const view = st.band
  const d = derive(data.profile)
  const [openRow, setOpenRow] = useState<string | null>(null)
  // What you tick decides the figures, for every job, and is kept as you change it. The profile only sets where each box starts.
  const choices = payChoicesOf(data.profile)
  const { ruling, masterFloor, route } = choices
  const choose = (patch: Partial<PayChoices>): void => data.setProfile({ ...data.profile, payChoices: { ...choices, ...patch } })
  const under30Master = masterFloor
  const premium = ref.tax.health_insurance_2026.average_premium_month
  const routes = ref.tax.ind_hsm_thresholds_h2_2026_monthly_excl_holiday
  const threshold = route === "eu" ? null : route === "orientation_year" ? routes.reduced_orientation_year : route === "hsm_under_30" ? routes.under_30 : routes.age_30_plus
  const stats = useMemo(() => ladderStats(data.postings, post), [data.postings, post])
  const pool = useMemo(() => poolOf(data.postings, post), [data.postings, post])
  const here = rungOf(levelOf(post))
  const hereIdx = stats.findIndex((x) => x.level === here)
  const now = payMid(post, ref)
  const key = transitionKeyOf(post)
  const transition = key ? ref.transitions[key] : undefined
  const cagr = view ? Number(view.band.cagr_2019_2024 ?? 0) : 0
  // Where this job can lead: the steps above it, each with the titles that sit there, how much longer it usually takes, and what it pays.
  const steps = stats.filter((_, i) => i > hereIdx && stats[i].open > 0)
    // Where postings state too little pay at a step, the occupation's own CBS spread stands in: its lower quarter for Entry, the middle for Mid, the upper quarter for Senior. The occupation is this job's, else the commonest one in postings like it.
  const groups = new Map<string, number>()
  for (const q of pool.posts) if (q.cbs_group) groups.set(q.cbs_group, (groups.get(q.cbs_group) ?? 0) + 1)
  const group = post.cbs_group ?? [...groups.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
  const spread = group ? ref.bands[group] : null
  const monthly = (hourly: unknown): number => Math.round((Number(hourly) * 2080 * 1.08) / 12 / 50) * 50
  const estimate = (level: string): number | null => (!spread ? null : level === "Entry" ? monthly(spread.p25_hourly) : level === "Mid" ? monthly(spread.p50_hourly) : level === "Senior" ? monthly(spread.p75_hourly) : null)
  // An internship does not go on for years, so there is no "same job, staying put" pay to show.
  const checkpoints = view && !isInternship(post)
    ? [2, 5, 10].map((y) => {
        const grow = (1 + cagr) ** y
        const round = (n: number): number => Math.round((n * grow) / 10) * 10

        return { y, low: round(view.grossMonth.p25), high: round(view.grossMonth.p75), kept: netMonth(round(view.grossMonth.p50) * 12, ruling, masterFloor && (d.age ?? 99) + y < 30, ref.tax).net }
      })
    : []

  return (
    <div className="mt-6 flex flex-col gap-5 border-t pt-5">
      {(() => {
        // Settings-list pattern: what it is and what it does on the left, the switch on the right, and a segmented control for the one-of-four choice.
        const Row = ({ title, hint, on, set }: { title: string; hint: string; on: boolean; set: (v: boolean) => void }): React.JSX.Element => (
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{hint}</p>
            </div>
            <button type="button" role="switch" aria-checked={on} aria-label={title} onClick={() => set(!on)} className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}>
              <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : ""}`} />
            </button>
          </div>
        )
        const ROUTES: Array<[PermitRoute, string, string]> = [["eu", "EU/EEA", "no visa"], ["orientation_year", "Orientation", "year"], ["hsm_under_30", "Skilled worker", "under 30"], ["hsm_30_plus", "Skilled worker", "30 or older"]]

        return (
          <section aria-label="Count for me" className="rounded-xl border bg-card px-4 pt-3 pb-4">
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Count for me</h4>
            <div className="divide-y">
              <Row title="30% ruling" hint={ruling ? "30% of your pay is tax-free" : "Tax on all of your pay"} on={ruling} set={(v) => choose({ ruling: v })} />
              <Row title="Master's degree, under 30" hint="The ruling needs a lower salary" on={masterFloor} set={(v) => choose({ masterFloor: v })} />
              <div className="py-3">
                <p className="font-medium">Visa</p>
                <div role="radiogroup" aria-label="My visa" className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1 sm:grid-cols-4">
                  {ROUTES.map(([value, top, bottom]) => (
                    <button key={value} type="button" role="radio" aria-checked={route === value} onClick={() => choose({ route: value })} className={`cursor-pointer rounded-lg px-2 py-2 text-center leading-tight transition-colors ${route === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
                      <span className="block text-sm font-semibold">{top}</span>
                      <span className={`block text-xs ${route === value ? "opacity-80" : ""}`}>{bottom}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{threshold === null ? "No salary minimum." : `Your visa needs ${eur(threshold)} a month.`}</p>
              </div>
            </div>
            {!d.rulingEligible && ruling ? <p className="text-xs text-muted-foreground">Your answers say you may not qualify for the 30% ruling ({data.profile.abroad} of the last 24 months abroad, 16 needed). Only an employer and the tax office can confirm it.</p> : null}
          </section>
        )
      })()}

      <h3 className="flex items-center gap-2 text-base font-semibold">
        This line of work, level by level
        <Hint label="Where this comes from">
          Read from the {pool.posts.length.toLocaleString()} postings we hold in {pool.name}, the same line of work as this job: example titles at each level, the years those postings ask for, and the pay they state where six or more do. Where fewer state it, the figure marked &quot;typical&quot; is what people in this kind of work earn at that level, from Statistics Netherlands (CBS, 2024). It covers workers of every age, so it reads high for first jobs. Without a figure, too few postings or statistics were available. An internship allowance is not a salary, so it is not compared with these. This is what the market asks and pays at each level, not a path from this job: nothing here says this job leads to those.
        </Hint>
      </h3>

      {/* One row per level in this line of work: what postings at that level ask and pay. Not a path: nothing here says this job leads to those. */}
      {(() => {
        const money = (level: string, stated: number | null): LevelPay | null => (stated !== null ? { v: stated, typical: false } : estimate(level) !== null ? { v: estimate(level)!, typical: true } : null)
        const po = payOf(post, ref)
        const here0: LevelPay | null =
          po.perHour ? { v: 0, typical: false, hourly: po.text ?? "" } :
          po.basis === "Allowance" ? (() => { const a = allowanceOf(post); return { v: (a.low + a.high) / 2, typical: false, allowance: { text: po.text ?? "", source: po.source as AllowanceSource } } })()
          : now ? { v: Math.round(now.month / 10) * 10, typical: now.basis !== "Stated", text: po.basis === "Stated" || po.source === "Typical traineeship pay" ? po.text ?? undefined : undefined } : null
        const rowsAll: Array<{ level: string; years: number | null; open: number; roles: string[]; pay: LevelPay | null; mine: boolean }> = [
          { level: here ?? "This job", years: null, open: 0, roles: [], pay: here0, mine: true },
          ...steps.map((r) => ({ level: r.level, years: r.years, open: r.open, roles: r.roles, pay: money(r.level, r.pay), mine: false })),
        ]
        const top = Math.max(1, ...rowsAll.map((r) => r.pay?.v ?? 0))
        const taxTotals = (month: number): { gross: number; netM: number; free: number } => {
          const n = netMonth(month * 12, ruling, under30Master, ref.tax)

          return { gross: month, netM: n.net, free: n.freeShare }
        }

        return (
          <>
          <ol className="flex flex-col gap-2">
            {rowsAll.map((r) => {
              const id = r.level + String(r.mine)
              const isOpen = openRow === id
              // The bold outline marks the level you are looking at: this job until you open another. The "this job" tag stays where it is.
              const selected = openRow !== null ? isOpen : r.mine
              const label = r.pay ? (r.pay.hourly ? `${r.pay.hourly} an hour` : r.pay.allowance ? `${r.pay.allowance.text} / month` : `${r.pay.typical ? "about " : ""}${r.pay.text ?? eur(r.pay.v)} / month`) : null

              return (
                <li key={id} className={`rounded-xl border bg-card p-4 transition-colors ${selected ? "border-foreground/80" : ""}`}>
                  <button type="button" disabled={!r.pay || Boolean(r.pay.hourly)} aria-expanded={isOpen} onClick={() => setOpenRow(isOpen ? null : id)} className={`block w-full text-left ${r.pay ? "cursor-pointer" : ""}`}>
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex items-center gap-2 text-base font-semibold">
                        {r.level}
                        {r.mine ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">this job</span> : null}
                      </span>
                      {r.years !== null ? <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">{Math.round(r.years)}+ years asked</span> : r.mine ? null : <span className="text-xs text-muted-foreground">years not stated</span>}
                    </span>
                    <span className="mt-3 flex items-center gap-3">
                      <span className="h-2 flex-1 rounded-full bg-secondary" aria-hidden="true">
                        {r.pay ? <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(3, (r.pay.v / top) * 100)}%` }} /> : null}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-right text-sm tabular-nums">
                        {label ? (
                          <>
                            <span className="font-semibold">{label}</span>
                            {r.pay?.allowance ? <span className="text-muted-foreground"> · allowance</span> : r.pay?.typical ? <span className="text-muted-foreground"> · typical</span> : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">No pay figure</span>
                        )}
                      </span>
                    </span>
                    {r.pay && !r.pay.hourly ? <span className="mt-2 block text-xs font-medium text-muted-foreground">{isOpen ? "Hide what you keep ▴" : "What you keep after tax ▾"}</span> : null}
                  </button>

                  {isOpen && r.pay ? (
                    r.pay.allowance ? (
                      <p className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">An allowance is not a salary, so there is no tax figure and no insurance figure to work out. {allowanceNote(r.pay.allowance.source)}</p>
                    ) : (
                      <TakeHome month={r.pay.v} typical={r.pay.typical} totals={taxTotals(r.pay.v)} premium={premium} threshold={r.level === "Internship" ? null : threshold} ruling={ruling} />
                    )
                  ) : null}

                  {r.mine ? (
                    <p className="mt-2 text-sm text-muted-foreground">{post.title_clean ?? post.title}{r.pay ? ` · ${r.pay.allowance ? "allowance named by " + (r.pay.allowance.source === "Allowance stated in the posting" ? "the employer" : "similar postings") : r.pay.typical ? "typical pay for this kind of job" : "pay stated by the employer"}` : ""}</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{r.roles.length > 0 ? `e.g. ${r.roles.slice(0, 3).join(", ")}` : ""}</p>
                      {apply ? (
                        <button
                          type="button"
                          onClick={() => {
                            apply({ level: [r.level as Level], ...(industry ? { industry: [industry] } : {}) })
                            onPick?.()
                          }}
                          className="shrink-0 cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition-colors hover:border-foreground"
                        >
                          {r.open} open {r.open === 1 ? "job" : "jobs"} →
                        </button>
                      ) : null}
                    </div>
                  )}
                </li>
              )
            })}
            {steps.length === 0 ? <li className="text-sm text-muted-foreground">No higher level with open postings in this line of work.</li> : null}
          </ol>
          <p className="-mt-3 text-xs text-muted-foreground">Bar length is the pay a month before tax, on one scale for every level. Colour means nothing here. &ldquo;Typical&rdquo; marks a figure that is not from postings.</p>
          </>
        )
      })()}


      {checkpoints.length > 0 ? (
        <div>
          <h4 className="mb-1 flex items-center gap-2 text-sm font-medium">
            The same job, staying put
            <Hint label="About this figure">
              Typical pay for this job across employers (Statistics Netherlands, 2024), grown {pct(cagr, 1)} a year, the occupation&apos;s own pay growth for 2019 to 2024, before inflation, with no promotion.
            </Hint>
          </h4>
          <dl className="divide-y border-y">
            {checkpoints.map((c) => (
              <div key={c.y} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
                <dt className="text-muted-foreground">In {c.y} years</dt>
                <dd className="font-semibold tabular-nums">
                  {eur(c.low)} – {eur(c.high)} <span className="text-sm font-normal text-muted-foreground">a month · you keep {eur(c.kept)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {transition ? <NextMoves transition={transition} postings={data.postings} onPick={onPick} /> : null}
    </div>
  )
}
