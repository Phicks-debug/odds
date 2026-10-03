import { BuildingsIcon } from "@/components/icons"
import { sourceOf, type JobSource } from "@/lib/sources"
import type { Posting } from "@/lib/types"

/** Where this job was found. A job found in several places lists every one. */
export function sourcesOf(post: Posting): JobSource[] {
  if (post.local) {
    return []
  }

  return post.sources && post.sources.length > 0 ? post.sources : [sourceOf(post)]
}

/** The platforms that have a logo of their own, saved in public/sources. Most are vector files, so they stay sharp at any size. */
const LOGO: Record<string, string> = {
  LinkedIn: "linkedin.com.svg",
  "Magnet.me": "magnet.me.svg",
  AcademicTransfer: "academictransfer.com.png",
  Indeed: "indeed.com.svg",
  Glassdoor: "glassdoor.com.svg",
  Monster: "monsterboard.nl.svg",
  Jobbird: "jobbird.com.svg",
}

/** Marks drawn as a bare shape with no square of their own. They sit on a white rounded tile so they read on any background. */
const GLYPH = new Set(["Indeed", "Glassdoor", "Monster"])

/** A platform's logo, small and square. Without one, a plain building mark stands for the employer's own site. */
export function SourceLogo({ name, size = 18 }: { name: string; size?: number }): React.JSX.Element {
  const file = LOGO[name]
  if (!file) {
    return <BuildingsIcon weight="bold" aria-hidden="true" style={{ width: size, height: size }} className="shrink-0 text-muted-foreground" />
  }
  const glyph = GLYPH.has(name)
  const pad = glyph ? Math.round(size * 0.18) : 0

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] ${glyph ? "bg-white" : ""}`} style={{ width: size, height: size, padding: pad }}>
      <img src={`/sources/${file}`} alt="" width={size - pad * 2} height={size - pad * 2} className="size-full object-contain" />
    </span>
  )
}

const unique = (post: Posting): string[] => [...new Set(sourcesOf(post).map((s) => s.name))]

/** The sources as small logos under the bookmark, in the same place on every row. Not links: the whole row opens the job. */
export function SourceCorner({ post }: { post: Posting }): React.JSX.Element | null {
  const names = unique(post)
  if (names.length === 0) {
    return null
  }

  return (
    <span className="pointer-events-none flex h-5 items-center justify-center gap-1" role="img" aria-label={`Found on ${names.join(", ")}`}>
      {names.map((name) => (
        <span key={name} title={name} className="flex">
          <SourceLogo name={name} size={16} />
        </span>
      ))}
    </span>
  )
}

/**
 * The way into the job: one Apply button to the posting that leads to the application (the employer's own page where we have it,
 * since sources are ranked that way), and any other place the job was found as plain links beside it. The button names where it
 * leads, so nobody is surprised by landing on a job board.
 */
export function SourceLinks({ post }: { post: Posting }): React.JSX.Element | null {
  // One entry per platform: two postings of the same job on LinkedIn show as one LinkedIn link.
  const sources = sourcesOf(post).filter((s, i, all) => all.findIndex((x) => x.name === s.name) === i)
  if (sources.length === 0) {
    return null
  }
  const main = sources.find((s) => s.url)
  const others = sources.filter((s) => s !== main)

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
      {main ? (
        <>
          <a
            href={main.url as string}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Apply on ${main.name} (opens in a new tab)`}
            className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white transition-colors duration-150 outline-none hover:bg-blue-700 focus-visible:ring-3 focus-visible:ring-blue-600/40 active:translate-y-px"
          >
            Apply
          </a>
          <span>on {main.name}</span>
        </>
      ) : (
        <span>Found on {sources.map((s) => s.name).join(", ")}</span>
      )}
      {main && others.length > 0 ? (
        <span>
          also on{" "}
          {others.map((s, i) => (
            <span key={`${s.ats}-${i}`}>
              {i > 0 ? ", " : ""}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
                  {s.name}
                </a>
              ) : (
                s.name
              )}
            </span>
          ))}
        </span>
      ) : null}
    </p>
  )
}
