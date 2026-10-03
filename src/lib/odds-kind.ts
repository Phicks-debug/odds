import { useSyncExternalStore } from "react"

export type OddsKind = "interview" | "job"

/**
 * Of the interviews a job gives, about one in four ends in an offer that is
 * accepted: 3.25 interviews per offer, and 81% of offers accepted. Both figures
 * are from SmartRecruiters 2025 and are not personal to the reader.
 */
export const JOB_PER_INTERVIEW = 0.81 / 3.25

const KEY = "careersim.oddsKind"
const listeners = new Set<() => void>()

function read(): OddsKind {
  try {
    return window.localStorage.getItem(KEY) === "job" ? "job" : "interview"
  } catch {
    return "interview"
  }
}

/** Interview odds or job odds, remembered on this device and shared by every meter on the page. */
export function useOddsKind(): [OddsKind, (kind: OddsKind) => void] {
  const kind = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)

      return () => listeners.delete(onChange)
    },
    read,
  )

  return [
    kind,
    (next) => {
      try {
        window.localStorage.setItem(KEY, next)
      } catch {
        // Not remembered, still changes for this visit through the listeners below.
      }
      listeners.forEach((notify) => notify())
    },
  ]
}
