import { UploadIcon } from "@/components/icons"
import { useMemo, useRef, useState } from "react"
import { JobRow } from "@/components/JobBoard"
import { STEPS, stepOf } from "@/components/PipelineBoard"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { sortJobs } from "@/lib/sort"
import { useViewConfig } from "@/lib/views"
import { parseCsv } from "@/lib/csv"
import { readJobs } from "@/lib/import"
import type { Posting } from "@/lib/types"

const TEMPLATE = "Title,Company,Location,Link,Pay,Contact,Deadline\nFinancial Analyst,ING,Amsterdam,https://example.com/job,,Sanne de Vries,2026-11-15\n"

interface TrackerProps {
  posts: ReadonlyArray<Posting>
  onOpen: (post: Posting) => void
}

/**
 * The jobs you kept, as the same rows the job list uses: logo, title, company,
 * place, posted. Status, pay, fit and your own properties are inside each job.
 */
export function Tracker({ posts, onOpen }: TrackerProps): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const view = useViewConfig("table")

  const sorted = useMemo(() => {
    if (!view.config.sortKey) {
      return posts
    }
    const key = view.config.sortKey
    const extra = (post: Posting): string | number | null => {
      if (key === "status") {
        const step = stepOf(data, post)

        return STEPS.findIndex((c) => c.step === step)
      }
      if (key.startsWith("p:")) {
        return profile.notes[post.id]?.[key.slice(2)] || null
      }

      return null
    }

    return sortJobs(posts, key, view.config.sortDir, { reference: data.reference, shares: data.shares, profile, referrals: data.referrals }, extra)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, view.config.sortKey, view.config.sortDir, profile, data.applications, data.reference, data.shares, data.referrals])

  return (
    <div className="@container overflow-hidden rounded-xl border bg-card">
      <ul>
        {sorted.map((post) => (
          <li key={post.id} className="relative after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px after:bg-border last:after:hidden @2xl:after:left-6">
            <JobRow post={post} onOpen={() => onOpen(post)} status />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Bring your own list: a spreadsheet saved as CSV, or one posting pasted in. */
export function AddJobs(): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const file = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<boolean>(false)
  const [message, setMessage] = useState<string | null>(null)
  const [one, setOne] = useState({ title: "", company: "", place: "", link: "", text: "" })

  function finish(rows: Array<Record<string, string>>): void {
    const result = readJobs(rows, data.postings.filter((p) => !p.local))
    const same = (a: Posting, b: Posting): boolean => a.title.toLowerCase() === b.title.toLowerCase() && a.employer_display.toLowerCase() === b.employer_display.toLowerCase()
    const mine = data.postings.filter((p) => p.local)
    const duplicates = result.jobs.filter((j) => mine.some((m) => same(m, j.post))).length
    result.jobs = result.jobs.filter((j) => !mine.some((m) => same(m, j.post)))
    if (result.jobs.length === 0) {
      setMessage(duplicates ? "Those jobs are already in your tracker." : "No jobs found. Each row needs a title and a company.")

      return
    }
    data.addLocalPostings(result.jobs.map((j) => j.post))
    const notes = { ...profile.notes }
    for (const job of result.jobs) {
      data.setSaved(job.post.id, true)
      if (Object.keys(job.extras).length) {
        notes[job.post.id] = job.extras
      }
    }
    data.setProfile({ ...profile, columns: [...profile.columns, ...result.columns.filter((c) => !profile.columns.includes(c))], notes })
    setMessage(
      `Added ${result.jobs.length} job${result.jobs.length === 1 ? "" : "s"}.` +
        (result.columns.length ? ` ${result.columns.join(", ")} became ${result.columns.length === 1 ? "a property" : "properties"}.` : "") +
        (duplicates ? ` ${duplicates} already in your tracker.` : "") +
        (result.skipped ? ` ${result.skipped} row${result.skipped === 1 ? " was" : "s were"} skipped for having no title or company.` : ""),
    )
  }

  function upload(files: FileList | null): void {
    const first = files?.[0]
    if (!first) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => finish(parseCsv(String(reader.result)))
    reader.readAsText(first)
    if (file.current) {
      file.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" onClick={() => setOpen(!open)} className="w-fit cursor-pointer" aria-expanded={open}>
        <UploadIcon className="size-4" aria-hidden="true" /> Add your own jobs
      </Button>
      {open ? (
        <div className="grid gap-5 rounded-xl border bg-card p-4 sm:p-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="font-heading text-lg font-medium">Upload a list</h3>
            <p className="text-sm text-muted-foreground">
              A spreadsheet saved as CSV. We read Title, Company, Location, Link and Pay. Any other column becomes a property of yours. Jobs from employers we already know get their sponsor status.
            </p>
            <input ref={file} type="file" accept=".csv,text/csv" aria-label="Upload a CSV of jobs" onChange={(e) => upload(e.target.files)} className="text-sm" />
            <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="my-jobs-template.csv" className="w-fit text-sm font-medium text-primary underline">
              Download a template
            </a>
          </div>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              finish([{ Title: one.title, Company: one.company, Location: one.place, Link: one.link, Description: one.text }])
              setOne({ title: "", company: "", place: "", link: "", text: "" })
            }}
          >
            <h3 className="font-heading text-lg font-medium">Or paste one posting</h3>
            {(["title", "company", "place", "link"] as const).map((k) => (
              <input
                key={k}
                aria-label={k === "place" ? "Location" : k[0].toUpperCase() + k.slice(1)}
                placeholder={k === "place" ? "Location" : k[0].toUpperCase() + k.slice(1)}
                value={one[k]}
                onChange={(e) => setOne({ ...one, [k]: e.target.value })}
                className="h-9 rounded-lg border bg-background px-3 text-sm"
              />
            ))}
            <textarea
              aria-label="The posting text"
              placeholder="Paste the posting text. We read years asked, Dutch, degree and skills from it."
              value={one.text}
              onChange={(e) => setOne({ ...one, text: e.target.value })}
              className="min-h-24 rounded-lg border bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={!one.title.trim() || !one.company.trim()} className="w-fit cursor-pointer">
              Add to tracker
            </Button>
          </form>
          {message ? (
            <p role="status" className="text-sm font-medium md:col-span-2">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
