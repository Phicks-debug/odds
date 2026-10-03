import { useMemo } from "react"
import { useData } from "@/lib/data"
import { pct, point, standing, type Standing } from "@/lib/engine"
import type { Posting } from "@/lib/types"

/** How you stand on one job, worked out from your profile. Null until the reference data has loaded. */
export function useFit(post: Posting): Standing | null {
  const data = useData()
  const referral = data.referrals.has(post.id)

  return useMemo(
    () => (data.reference && data.shares ? standing(post, data.profile, data.reference, data.shares, undefined, referral, data.strengthFor(post)) : null),
    [post, data.profile, data.reference, data.shares, referral, data.strengthFor],
  )
}

/**
 * The interview chance, the one number every job has: the higher it is, the better your profile fits. A range of whole percentages. Nothing is
 * a hard gate: what the job asks for and you have not ticked is named in the hover, and ticking it on the job is a recommendation.
 */
export function ChanceCell({ st }: { st: Standing | null }): React.JSX.Element {
  if (!st) {
    return <span className="text-muted-foreground">…</span>
  }
  if (!st.rate) {
    return (
      <span className="text-muted-foreground" title="Too few similar jobs to give a range we would stand behind">
        No estimate
      </span>
    )
  }
  return (
    <span className="font-medium tabular-nums" title={`Estimate ${point(st.rate.mid)} (studies range ${pct(st.rate.low, 1)}–${pct(st.rate.high, 1)}) per application${st.rate.thin ? ". Few postings of this kind to compare with." : ""}${st.failing > 0 ? `. This job also asks for: ${st.gates.filter((g) => g.status === "fail").map((g) => g.name).join(", ")}.` : ""}`}>
      {point(st.rate.mid)}
    </span>
  )
}
