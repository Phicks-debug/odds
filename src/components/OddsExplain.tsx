import { ChevronDownIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { derive, FACTORS, pct, point, type Standing } from "@/lib/engine"
import { FIT_AVERAGE } from "@/lib/fit"
import { openResearch } from "@/lib/research-link"
import { JOB_PER_INTERVIEW } from "@/lib/odds-kind"
import type { Posting } from "@/lib/types"

/** The little arrow beside a number that opens its explanation. */
/** The parts a fit was judged on, in words, so the sentence says what was really compared. */
function fitNames(parts: ReadonlyArray<{ key: string }>): string {
  const word: Record<string, string> = { skills: "skills", field: "line of work", role: "role", level: "level", strength: "track record" }
  const names = parts.map((p) => word[p.key] ?? p.key)

  return names.length <= 1 ? (names[0] ?? "profile") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export function Caret({ open }: { open: boolean }): React.JSX.Element {
  return <ChevronDownIcon aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
}

function Row({ name, effect, children }: { name: string; effect: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 py-2.5">
      <span className="font-medium">{name}</span>
      <span className="text-right font-medium tabular-nums">{effect}</span>
      <span className="col-span-2 text-[0.8125rem] leading-snug text-muted-foreground">{children}</span>
    </li>
  )
}

function SeeHow({ slug = "interview-odds-base-rates" }: { slug?: string }): React.JSX.Element {
  return (
    <button type="button" onClick={() => openResearch(slug)} className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      <span className="underline underline-offset-4">See how it works</span> <span aria-hidden="true">→</span>
    </button>
  )
}

/**
 * Under the interview chance on a job: where the number comes from, step by step, in plain words, with this job's
 * own figures, and a link to the research report that explains the method.
 */
export function ChancePanel({ post, st }: { post: Posting; st: Standing }): React.JSX.Element {
  const data = useData()
  const base = FACTORS.base[post.cat] ?? FACTORS.base.other
  const profile = data.profile
  const d = derive(profile)
  const referral = data.referrals.has(post.id)
  const r = st.rate

  return (
    <div className="rounded-xl bg-secondary/70 p-4 text-sm sm:p-5">
      <p className="font-semibold">Our interview chance, from research</p>
      <p className="mt-1 text-muted-foreground">
        It is the share of applications like yours that lead to an interview. We start from what published hiring studies measure, then move it for who you are and how well you fit this job.
      </p>

      {st.needsProfile ? (
        <p className="mt-3 rounded-lg bg-background p-3">
          It reads 0% for now because there is nothing of yours to compare with this job. Connect LinkedIn or add your CV on your profile, and it works out yours.
        </p>
      ) : (
        <ol className="mt-3 divide-y">
          <Row name="Where it starts" effect={`${pct(base.low.value, 1)} to ${pct(base.high.value, 1)}`}>
            Of applications to jobs like this, about this many lead to an interview (Ashby 2026, SmartRecruiters 2025).
          </Row>
          {profile.origin !== "dutch" ? (
            <Row name="Applying from abroad" effect="Lower">
              Dutch tests with matched CVs found applicants with a foreign background were called back less often (Thijssen et al. 2019, SCP 2010).
            </Row>
          ) : null}
          {d.internship ? (
            <Row name="An internship on your profile" effect="Higher">
              Belgian graduates with an internship were invited more often (Baert et al. 2021).
            </Row>
          ) : null}
          {referral ? (
            <Row name="A referral here" effect="Higher">
              Referred candidates are interviewed about one and a half times as often (Ashby 2026).
            </Row>
          ) : null}
          {st.fit ? (
            <Row name="How you fit this job" effect={`${Math.round(st.fit.score * 100)}%`}>
              Your {fitNames(st.fit.parts)} against what this posting asks, with must-haves counting most. The average applicant is {Math.round(FIT_AVERAGE * 100)}%. {st.fit.score >= FIT_AVERAGE ? "You are above it, which raises your chance." : "You are below it, which lowers your chance."}
              {st.fit.parts.find((p) => p.key === "strength") ? ` Your track record is counted too: ${st.fit.parts.find((p) => p.key === "strength")!.detail}. How much it counts is our scale, not a measured effect.` : ""}
            </Row>
          ) : null}
          {r ? (
            <Row name="Your chance" effect={`${point(r.low)} to ${point(r.high)}`}>
              A range, because the studies it rests on differ. It describes people like you, not a promise about you.
            </Row>
          ) : null}
        </ol>
      )}
      <SeeHow />
    </div>
  )
}

/** Under the odds on the dashboard and on a job: how the two odds are made from the jobs marked Applied. */
export function OddsPanel(): React.JSX.Element {
  return (
    <div className="rounded-xl bg-secondary/70 p-4 text-sm sm:p-5">
      <p className="font-semibold">Our odds, from research</p>
      <ul className="mt-2 flex flex-col gap-2 text-muted-foreground">
        <li>
          <b className="text-foreground">Interview odds</b> is the chance of at least one interview from the jobs you have marked Applied. Each one adds its own chance, taken from published hiring studies and moved by your profile and fit. Jobs you do not yet meet the requirements for add nothing.
        </li>
        <li>
          <b className="text-foreground">Job odds</b> is the same, times about one in four ({JOB_PER_INTERVIEW.toFixed(2)}): 3.25 interviews per offer and 81% of offers accepted (SmartRecruiters 2025). That share is an average, not yours.
        </li>
        <li>It counts each application on its own, so it is an upper bound. With nothing marked Applied it reads 0%.</li>
      </ul>
      <SeeHow />
    </div>
  )
}
