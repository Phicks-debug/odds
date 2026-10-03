import { useMemo, useState } from "react"
import { JobDrawer } from "@/components/JobBoard"
import { JobFilters } from "@/components/JobFilters"
import { JobGallery } from "@/components/JobGallery"
import { BoardIcon, BookmarkIcon, ChevronDownIcon, PeopleIcon, TableIcon } from "@/components/icons"
import { SearchSummary } from "@/components/InterviewMeter"
import type { ViewName } from "@/lib/types"
import { PeopleView } from "@/components/People"
import { choicesFor, ViewControls } from "@/components/ViewSettings"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PipelineBoard } from "@/components/PipelineBoard"
import { AddJobs, Tracker } from "@/components/Tracker"
import { Button } from "@/components/ui/button"
import { JobListSkeleton } from "@/components/Skeleton"
import { useData } from "@/lib/data"
import { FilterBus } from "@/lib/filter-bus"
import { NO_FILTERS, activeCount, applyFilters, type JobFilters as Filters } from "@/lib/filters"
import type { Posting } from "@/lib/types"

interface AccountProps {
  /** True in the job list, false on the account's own page. */
  looking: boolean
  onEdit: () => void
  onStartLooking: () => void
  onStopLooking: () => void
}

/**
 * The account's own page: the jobs you kept, where you applied, and what we
 * read from you. The big button goes to the jobs that fit.
 */
export function Account({ looking, onStartLooking, onStopLooking }: AccountProps): React.JSX.Element {
  const data = useData()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [revisit, setRevisit] = useState<Posting | null>(null)
  const [subject, setSubject] = useState<Subject>(() => remembered("subject", ["jobs", "people"], "jobs"))
  const [layouts, setLayouts] = useState<Record<Subject, Layout>>(() => ({ jobs: remembered("layout-jobs", ["list", "board"], "list"), people: remembered("layout-people", ["list", "board"], "list") }))
  const layout = layouts[subject]
  // The view's own settings (sort, properties) are kept per subject and per layout.
  const view: ViewName = subject === "jobs" ? (layout === "board" ? "board" : "table") : layout === "board" ? "peopleBoard" : "people"
  const choose = (next: Subject): void => {
    setSubject(next)
    remember("subject", next)
  }
  const chooseLayout = (next: Layout): void => {
    setLayouts((now) => ({ ...now, [subject]: next }))
    remember(`layout-${subject}`, next)
  }

  const kept = useMemo(() => {
    const applied = new Set(data.applications.map((a) => a.posting_id))

    return data.postings.filter((post) => data.saved.has(post.id) || applied.has(post.id))
  }, [data.postings, data.saved, data.applications])
  const shown = applyFilters(kept, filters, { signals: data.signals, reference: data.reference })
  // How many jobs are in the pool: one plain number, the same one the job list counts from, not a personal subset of it.
  const pool = data.postings.length

  if (data.status === "loading") {
    return <JobListSkeleton />
  }

  if (looking) {
    return (
      <div className="flex w-full flex-1 flex-col gap-5">
        <div className="flex flex-1 flex-col">
          <JobGallery />
        </div>
        <div className="sticky bottom-0 z-20 -mx-5 border-t bg-background px-5 py-3 sm:-mx-6 sm:px-6">
          <Button variant="ghost" onClick={onStopLooking} className="mx-auto block w-full max-w-sm cursor-pointer">
            Back to your list
          </Button>
        </div>
      </div>
    )
  }

  return (
    <FilterBus value={(patch) => setFilters((f) => ({ ...f, ...patch }))}>
    <div className="flex w-full flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col gap-8">
        <h1 className="text-2xl font-semibold tracking-tight">{data.profile.name.trim() ? `${data.profile.name.trim().split(" ")[0]}'s job search` : "Your job search"}</h1>

        <SearchSummary />

        <section aria-label="Your jobs" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SubjectSwitch subject={subject} onChange={choose} />
              <LayoutMenu subject={subject} layout={layout} onChange={chooseLayout} />
              <ViewControls view={view} {...choicesFor(view, data.profile.columns)} properties={subject === "people" ? choicesFor(view, data.profile.columns).properties : []} />
            </div>
            {subject === "people" ? null : <AddJobs />}
          </div>

          {subject === "people" ? (
            <PeopleView onOpen={setRevisit} layout={layout} />
          ) : layout === "board" ? (
            <PipelineBoard onOpen={setRevisit} />
          ) : (
            <>
              {kept.length > 0 ? (
                <div className="hidden lg:block">
                  <JobFilters filters={filters} onChange={setFilters} />
                </div>
              ) : null}
              {shown.length > 0 ? (
                <Tracker posts={shown} onOpen={setRevisit} />
              ) : (
                kept.length > 0 && activeCount(filters) > 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing here fits these filters.</p>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-secondary/30 px-6 py-14 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-card text-brand shadow-sm">
                      <BookmarkIcon weight="fill" className="size-6" aria-hidden="true" />
                    </span>
                    <p className="text-lg font-semibold tracking-tight">Nothing saved yet</p>
                    <p className="max-w-sm text-sm text-muted-foreground">Press the bookmark on a job and it lands here with its pay, your fit and your odds. You can also add a list of your own.</p>
                  </div>
                )
              )}
            </>
          )}
          <p className={`text-sm text-muted-foreground ${subject === "people" ? "hidden" : ""}`}>
            {data.applications.length === 0
              ? "Move a job to Applied when you apply. Your results are the only way the chance estimate becomes a measured number."
              : `${data.applications.length} logged, ${data.applications.filter((a) => a.stage === "interview" || a.stage === "offer" || a.stage === "hired").length} reached an interview or beyond. A rate of your own replaces the estimate at 30 logged outcomes for one kind of job.`}
          </p>
        </section>
      </div>

      {revisit ? (
        <JobDrawer post={revisit} onClose={() => setRevisit(null)} onSwitch={setRevisit} />
      ) : null}

      {/* A list of eighteen kept jobs is 2,400 pixels long, and the way to see
          more was at the bottom of it. */}
      <div className="sticky bottom-0 z-20 -mx-5 border-t bg-background px-5 py-3 sm:-mx-6 sm:px-6">
        <Button size="lg" onClick={onStartLooking} title={pool > 0 ? `${pool.toLocaleString()} jobs in the job pool` : undefined} className="mx-auto flex w-full max-w-sm cursor-pointer">
          Start looking
          {/* The size of the job pool, so the button and the list speak about the same set. */}
          {pool > 0 ? <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">{pool.toLocaleString()}</span> : null}
        </Button>
      </div>
    </div>
    </FilterBus>
  )
}

type Subject = "jobs" | "people"
type Layout = "list" | "board"

/** A choice kept in the browser so the page opens the way it was left. Without storage it simply starts at the default. */
function remembered<T extends string>(key: string, allowed: ReadonlyArray<T>, fallback: T): T {
  try {
    const value = localStorage.getItem(`odds:tracker-${key}`)

    return allowed.find((a) => a === value) ?? fallback
  } catch {
    return fallback
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(`odds:tracker-${key}`, value)
  } catch {
    // Not remembered; the choice still works for this visit.
  }
}

/** Jobs or People: two sides of the same search, each with its own list and board. */
function SubjectSwitch({ subject, onChange }: { subject: Subject; onChange: (next: Subject) => void }): React.JSX.Element {
  const items = [
    { value: "jobs", label: "Jobs", Icon: BookmarkIcon },
    { value: "people", label: "People", Icon: PeopleIcon },
  ] as const

  return (
    <div role="tablist" aria-label="Show" className="flex h-10 items-center rounded-lg border bg-card p-0.5">
      {items.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={subject === value}
          onClick={() => onChange(value)}
          className={`flex h-full cursor-pointer items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-150 ${subject === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

const LAYOUTS = {
  jobs: [
    { value: "list", label: "List", hint: "Every job you kept, one line each", Icon: TableIcon },
    { value: "board", label: "Board", hint: "Jobs by step, from saved to offer", Icon: BoardIcon },
  ],
  people: [
    { value: "list", label: "List", hint: "Who you know, by company and job", Icon: TableIcon },
    { value: "board", label: "Board", hint: "People by step, from to contact to met", Icon: BoardIcon },
  ],
} as const

/** List or board, for whichever of jobs or people is showing. */
function LayoutMenu({ subject, layout, onChange }: { subject: Subject; layout: Layout; onChange: (next: Layout) => void }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const options = LAYOUTS[subject]
  const current = options.find((v) => v.value === layout) ?? options[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-accent">
        <current.Icon className="size-4" aria-hidden="true" />
        {current.label}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-0.5 p-1.5">
        {options.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-pressed={v.value === layout}
            onClick={() => {
              onChange(v.value)
              setOpen(false)
            }}
            className={`flex cursor-pointer items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-150 hover:bg-accent ${v.value === layout ? "bg-accent" : ""}`}
          >
            <v.Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{v.label}</span>
              <span className="text-[0.8125rem] text-muted-foreground">{v.hint}</span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
