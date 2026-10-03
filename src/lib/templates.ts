import type { MessageTemplate, Person, Posting, Profile } from "@/lib/types"

/** The starting set. They are plain and short, and they are yours to edit or replace. */
export const STARTER_TEMPLATES: ReadonlyArray<MessageTemplate> = [
  {
    id: "starter-referral",
    name: "Ask for a referral",
    kind: "Referral request",
    body: "Hi {name},\n\nI am applying for the {job} role at {company} and saw that you work there. Would you be open to referring me, or to a 15-minute call about the team? I can send my CV and a short note you can forward.\n\nThanks either way,\n{me}",
  },
  {
    id: "starter-followup",
    name: "Follow up, no reply yet",
    kind: "Follow-up",
    body: "Hi {name},\n\nFollowing up on my message about the {job} role at {company}. I know things get busy, so no pressure. If it is easier, I can send a two-line summary you can pass on.\n\nThanks,\n{me}",
  },
  {
    id: "starter-thanks",
    name: "Thank you after a call",
    kind: "Thank you",
    body: "Hi {name},\n\nThank you for your time today. It helped me understand the {job} role at {company}, and I have tailored my application with what you told me. I will let you know how it goes.\n\n{me}",
  },
  {
    id: "starter-intro",
    name: "Introduce myself to a recruiter",
    kind: "Introduction",
    body: "Hi {name},\n\nI am {me}, a graduate based in the Netherlands. I saw the {job} role at {company} and it matches my background. Could I send you my CV?\n\nKind regards,\n{me}",
  },
]

export const templatesOf = (profile: Profile): ReadonlyArray<MessageTemplate> => profile.templates ?? STARTER_TEMPLATES

/** A template with the person, company, job and your name put in. Anything unknown is left as a plain word, never as a placeholder. */
export function fillTemplate(body: string, person: Person, job: Posting | null, me: string): string {
  const first = person.name.trim().split(/\s+/)[0] || "there"

  return body
    .replaceAll("{name}", first)
    .replaceAll("{company}", job ? job.employer_display : person.company || "your company")
    .replaceAll("{job}", job ? job.title : "open")
    .replaceAll("{me}", me.trim() || "")
}
