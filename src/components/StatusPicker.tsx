import { ChevronDownIcon } from "@/components/icons"
import { STEPS, moveJob, stepOf, type Step } from "@/components/PipelineBoard"
import { useFit } from "@/components/FitCells"
import { useData } from "@/lib/data"
import type { Posting } from "@/lib/types"

/**
 * Where this job stands in your search, set from the job itself: not saved,
 * saved, applied, interview, offer or closed. Marking it Applied is what counts
 * it in your odds; there is no separate button for that.
 */
export function StatusPicker({ post, fit, onLocked }: { post: Posting; fit: string; onLocked?: () => void }): React.JSX.Element {
  const data = useData()
  const app = data.applications.find((a) => a.posting_id === post.id)
  const tracked = data.saved.has(post.id) || Boolean(app)
  const value: Step | "none" = tracked ? stepOf(data, post) : "none"

  function change(next: Step | "none"): void {
    if (onLocked) {
      onLocked()

      return
    }
    if (next === "none") {
      data.setSaved(post.id, false)
      if (app) {
        data.removeApplication(app.id).catch(() => undefined)
      }

      return
    }
    moveJob(data, post, next, fit).catch(() => undefined)
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      Status
      <select
        value={value}
        onChange={(e) => change(e.target.value as Step | "none")}
        className="h-10 cursor-pointer rounded-lg border bg-card px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent"
      >
        <option value="none">Not saved</option>
        {STEPS.map((c) => (
          <option key={c.step} value={c.step}>
            {c.title}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The dot beside a status: grey while only kept, black once applied, orange at an interview, green at an offer, faint once closed. */
const DOT: Record<string, string> = {
  none: "bg-border",
  saved: "bg-muted-foreground",
  applied: "bg-foreground",
  interview: "bg-brand",
  offer: "bg-good-foreground",
  rejected: "bg-muted-foreground/40",
}

/** The same status, small enough for a row of your list, so you change it without opening the job. A pill showing the step; the real select sits invisibly on top so it stays a native, keyboard-friendly control. */
export function RowStatus({ post }: { post: Posting }): React.JSX.Element {
  const st = useFit(post)
  const fit = st ? (st.failing === 0 ? "met every requirement" : st.failing === 1 ? "missing one requirement" : "missing several requirements") : ""
  const data = useData()
  const app = data.applications.find((a) => a.posting_id === post.id)
  const tracked = data.saved.has(post.id) || Boolean(app)
  const value: Step | "none" = tracked ? stepOf(data, post) : "none"
  const label = value === "none" ? "Not saved" : (STEPS.find((c) => c.step === value)?.title ?? "Saved")

  return (
    <span className="relative z-10 inline-flex h-9 w-32 items-center gap-2 rounded-full border bg-card pr-8 pl-3 text-sm font-medium transition-colors duration-150 focus-within:ring-3 focus-within:ring-ring/50 hover:border-foreground/40 hover:bg-accent">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[value] ?? DOT.saved}`} />
      <span className="truncate">{label}</span>
      <ChevronDownIcon className="pointer-events-none absolute right-3 size-3.5 text-muted-foreground" aria-hidden="true" />
      <select
        aria-label={`Status of ${post.title}`}
        value={value}
        onChange={(e) => {
          const next = e.target.value as Step | "none"
          if (next === "none") {
            data.setSaved(post.id, false)
            if (app) data.removeApplication(app.id).catch(() => undefined)
          } else {
            moveJob(data, post, next, fit).catch(() => undefined)
          }
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        <option value="none">Not saved</option>
        {STEPS.map((c) => (
          <option key={c.step} value={c.step}>
            {c.title}
          </option>
        ))}
      </select>
    </span>
  )
}
