import { Section } from "@/components/JobPersonal"
import { ageText } from "@/components/Tag"
import { useData } from "@/lib/data"
import { formatPlace } from "@/lib/format"
import type { Posting } from "@/lib/types"

/** Other jobs at the same employer, last on the page. Each opens in the same panel. */
export function MoreAtEmployer({ post, onOpenJob }: { post: Posting; onOpenJob?: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const others = data.postings.filter((p) => p.employer === post.employer && p.id !== post.id)
  if (others.length === 0) {
    return null
  }

  return (
    <Section title={`More jobs at ${post.employer_display}`}>
      <ul className="divide-y border-y">
        {others.slice(0, 5).map((p) => (
          <li key={p.id}>
            <button type="button" disabled={!onOpenJob} onClick={() => onOpenJob?.(p)} className="flex w-full cursor-pointer items-baseline justify-between gap-4 py-3 text-left transition-colors duration-150 hover:text-primary disabled:cursor-default">
              <span className="min-w-0 truncate font-medium">{p.title}</span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {formatPlace(p.region)} · {ageText(p).replace("Posted ", "")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {others.length > 5 ? <p className="mt-2 text-sm text-muted-foreground">and {others.length - 5} more</p> : null}
    </Section>
  )
}
