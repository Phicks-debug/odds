import { useData } from "@/lib/data"
import type { ViewConfig, ViewName } from "@/lib/types"

const EMPTY: ViewConfig = { hidden: [], sortKey: "", sortDir: "desc" }
/** What each view starts with. The board's cards are small, so they start without the long-tail properties. */
const START: Record<ViewName, ViewConfig> = { table: EMPTY, people: EMPTY, peopleBoard: EMPTY, board: { hidden: ["industry", "language", "sponsor"], sortKey: "", sortDir: "desc" } }

/** One view's settings and the ways to change them. Stored with the profile, so they follow the person. */
export function useViewConfig(view: ViewName): { config: ViewConfig; show: (key: string) => boolean; update: (patch: Partial<ViewConfig>) => void; reset: () => void } {
  const data = useData()
  const config = { ...START[view], ...data.profile.views?.[view] }

  return {
    config,
    show: (key) => !config.hidden.includes(key),
    update: (patch) => data.setProfile({ ...data.profile, views: { ...data.profile.views, [view]: { ...config, ...patch } } }),
    reset: () => data.setProfile({ ...data.profile, views: { ...data.profile.views, [view]: START[view] } }),
  }
}
