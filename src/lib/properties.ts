import type { Choice } from "@/components/ViewSettings"

/**
 * The properties every job has, in one order, under one set of names, whichever
 * view shows them. Your own properties follow, named "p:" and then what you called them.
 */
export const STANDARD_PROPERTIES: ReadonlyArray<Choice> = [
  { key: "status", label: "Status" },
  { key: "chance", label: "Interview chance" },
  { key: "pay", label: "Pay" },
  { key: "location", label: "Location" },
  { key: "level", label: "Level" },
  { key: "industry", label: "Industry" },
  { key: "language", label: "Language" },
  { key: "sponsor", label: "Sponsor" },
  { key: "contact", label: "Contact" },
]

/** What a view can be sorted by. The board sorts within each step, so Status is not offered there. */
export const STANDARD_SORTS: ReadonlyArray<Choice> = [
  { key: "title", label: "Job title" },
  { key: "company", label: "Company" },
  { key: "newest", label: "Date posted" },
  { key: "chance", label: "Interview chance" },
  { key: "pay", label: "Pay" },
  { key: "location", label: "Location" },
  { key: "level", label: "Level" },
  { key: "industry", label: "Industry" },
  { key: "language", label: "Language" },
  { key: "sponsor", label: "Sponsor" },
  { key: "status", label: "Status" },
]
