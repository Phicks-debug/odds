import { useMemo, useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import { Caret, OddsPanel } from "@/components/OddsExplain"
import { Section } from "@/components/JobPersonal"
import { stepOf } from "@/components/PipelineBoard"
import { useData } from "@/lib/data"
import { NO_WHAT_IF, point, standing, type Standing } from "@/lib/engine"
import { JOB_PER_INTERVIEW } from "@/lib/odds-kind"
import type { Posting } from "@/lib/types"

/** The chance of at least one interview from several applications, each counted on its own terms. */
const together = (rates: number[]): number => 1 - rates.reduce((left, p) => left * (1 - p), 1)

interface Contribution {
  post: Posting
  low: number
  mid: number
  high: number
}

interface Meter {
  low: number
  mid: number
  high: number
  /** One entry per logged application that could be scored. */
  contributions: Contribution[]
}

/**
 * The interview odds. Every job you log as applied adds its own estimated
 * chance; together they read as the chance of at least one interview. A job
 * that cannot be scored (a requirement is missing, or too few similar postings)
 * adds nothing.
 */
export function useMeter(excluding?: string, kind: "interview" | "job" = "interview"): Meter {
  const data = useData()
  const scale = kind === "job" ? JOB_PER_INTERVIEW : 1
  const applications = data.applications
  const byId = data.byId
  const profile = data.profile
  const reference = data.reference
  const shares = data.shares
  const referrals = data.referrals
  const strengthFor = data.strengthFor

  return useMemo((): Meter => {
    const contributions: Contribution[] = []
    if (reference && shares) {
      for (const app of applications) {
        const post = byId.get(app.posting_id)
        if (!post || post.id === excluding) {
          continue
        }
        const st = standing(post, profile, reference, shares, NO_WHAT_IF, referrals.has(post.id), strengthFor(post))
        if (st.rate && !st.rate.thin) {
          contributions.push({ post: post, low: st.rate.low * scale, mid: st.rate.mid * scale, high: st.rate.high * scale })
        }
      }
    }

    return { low: together(contributions.map((c): number => c.low)), mid: together(contributions.map((c): number => c.mid)), high: together(contributions.map((c): number => c.high)), contributions: contributions }
  }, [applications, byId, profile, reference, shares, referrals, strengthFor, excluding, scale])
}

const SEGMENTS = 10

/**
 * The odds as ten cells that fill like a charge: the low figure solid, the stretch
 * up to the high figure lighter. Milestones at a quarter, a half and three
 * quarters are marked underneath.
 */
export function OddsBar({ low, high, label, tone = "brand" }: { low: number; high: number; label: string; tone?: "brand" | "ink" }): React.JSX.Element {
  const solid = tone === "ink" ? "bg-foreground" : "bg-brand"
  const soft = tone === "ink" ? "bg-foreground/25" : "bg-brand/30"

  return (
    <div role="img" aria-label={label} className="flex flex-col">
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const at = (x: number): number => Math.min(1, Math.max(0, (x * 100 - i * (100 / SEGMENTS)) / (100 / SEGMENTS)))

          return (
            <div key={i} className="relative h-3.5 overflow-hidden rounded-[3px] bg-secondary">
              <div className={`absolute inset-y-0 left-0 ${soft} transition-[width] duration-700 ease-out`} style={{ width: `${at(high) * 100}%` }} />
              <div className={`absolute inset-y-0 left-0 ${solid} transition-[width] duration-700 ease-out`} style={{ width: `${at(low) * 100}%` }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const range = (low: number, high: number): string => {
  const a = Math.round(low * 100)
  const b = Math.max(a, Math.round(high * 100))

  return a === b ? `${a}%` : `${a}–${b}%`
}


/** The logos of the companies behind the number, each one counted. */
function Contributors({ items }: { items: Contribution[] }): React.JSX.Element | null {
  if (items.length === 0) {
    return null
  }

  return (
    <ul aria-label="Jobs counted" className="flex items-center -space-x-1.5">
      {items.slice(0, 5).map((c) => (
        <li key={c.post.id} title={`${c.post.employer_display}: ${point(c.mid)}`} className="flex size-7 items-center justify-center rounded-full border bg-card">
          <CompanyLogo employer={c.post.employer} name={c.post.employer_display} size={18} wide={1} url={c.post.url} />
        </li>
      ))}
      {items.length > 5 ? <li className="flex size-7 items-center justify-center rounded-full border bg-secondary text-[0.6875rem] font-medium">+{items.length - 5}</li> : null}
    </ul>
  )
}

/** One kind of odds: its name, the figure, the bar. */
function OddsRow({ title, mid, tone = "brand", aside, note }: { title: string; mid: number; tone?: "brand" | "ink"; aside?: React.ReactNode; note?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1 text-sm font-medium">
          {title}
          {aside}
        </p>
        <p className="text-lg font-semibold tabular-nums">{mid === 0 ? "0%" : point(mid)}</p>
      </div>
      <OddsBar low={mid} high={mid} tone={tone} label={`${title} ${mid === 0 ? "0%" : point(mid)}`} />
      {note ? <p className="text-[0.8125rem] text-muted-foreground tabular-nums">{note}</p> : null}
    </div>
  )
}

/**
 * The top of the dashboard: where the search stands as four counts, and the two
 * odds that follow from the jobs marked Applied. Nothing to switch; both are shown.
 */
export function SearchSummary(): React.JSX.Element {
  const data = useData()
  const [open, setOpen] = useState<boolean>(false)
  const interview = useMeter()
  const job = useMeter(undefined, "job")
  const applied = new Set(data.applications.map((a) => a.posting_id))
  const saved = data.postings.filter((p) => data.saved.has(p.id) && !applied.has(p.id)).length
  const count = (...stages: string[]): number => data.applications.filter((a) => stages.includes(a.stage)).length
  const stats: Array<[string, number]> = [
    ["Saved", saved],
    ["Applied", count("applied")],
    ["Interviews", count("interview")],
    ["Offers", count("offer", "hired")],
  ]

  return (
    <section aria-label="Your search" className="grid overflow-hidden rounded-xl border bg-secondary/30 lg:grid-cols-[1fr_1.15fr]">
      <dl className="grid grid-cols-4 divide-x">
        {stats.map(([label, n]) => (
          <div key={label} className="flex flex-col justify-center gap-1 px-3 py-4 sm:px-5">
            <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{n}</dd>
            <dt className="text-sm text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-4 border-t bg-card p-4 sm:p-5 lg:border-t-0 lg:border-l">
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-expanded={open} aria-controls="odds-explained" onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold">
            <span className="underline decoration-dotted underline-offset-4">Your odds</span>
            <Caret open={open} />
          </button>
          <Contributors items={interview.contributions} />
        </div>
        {open ? (
          <div id="odds-explained">
            <OddsPanel />
          </div>
        ) : null}
        <OddsRow title="Interview odds" mid={interview.mid} />
        <OddsRow title="Job odds" mid={job.mid} tone="ink" />
      </div>
    </section>
  )
}

/** On a job: both odds now, and what they would become with this job. Marking it Applied, above, is what counts it. */
export function MeterSection({ post, st }: { post: Posting; st: Standing }): React.JSX.Element {
  const data = useData()
  const [open, setOpen] = useState<boolean>(false)
  const applied = data.applications.some((a) => a.posting_id === post.id) && stepOf(data, post) !== "saved"
  const rate = st.rate && !st.rate.thin ? st.rate : null
  const others = { interview: useMeter(post.id, "interview"), job: useMeter(post.id, "job") }

  const row = (kind: "interview" | "job"): React.JSX.Element => {
    const scale = kind === "job" ? JOB_PER_INTERVIEW : 1
    const before = others[kind]
    const withThis = rate ? together([before.mid, rate.mid * scale]) : null
    const now = applied && withThis !== null ? withThis : before.mid
    const gain = withThis !== null ? 100 * (withThis - before.mid) : null

    return (
      <OddsRow
        key={kind}
        title={kind === "job" ? "Job odds" : "Interview odds"}
        mid={now}
        tone={kind === "job" ? "ink" : "brand"}
        note={applied ? "Counting this job" : withThis !== null && gain !== null ? `With this job ${point(withThis)} (+${gain.toFixed(1)})` : "Too few similar jobs to score this one"}
      />
    )
  }

  return (
    <Section
      title="Your odds"
      aside={
        <button type="button" aria-expanded={open} aria-controls="odds-explained-job" onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          How it works <Caret open={open} />
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        {open ? (
          <div id="odds-explained-job">
            <OddsPanel />
          </div>
        ) : null}
        {row("interview")}
        {row("job")}
      </div>
    </Section>
  )
}
