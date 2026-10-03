import { useState } from "react"

/**
 * An open/closed switch that is kept in the browser, for panels with an X: close one and it stays closed on the next visit until it is
 * opened again from its link; someone who has never touched it gets `firstTime`. Storage can be blocked, and then it still works for the visit.
 */
export function useRemembered(key: string, firstTime: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(key)

      return saved === "1" ? true : saved === "0" ? false : firstTime
    } catch {
      return firstTime
    }
  })

  return [
    open,
    (next) => {
      setOpen(next)
      try {
        localStorage.setItem(key, next ? "1" : "0")
      } catch {
        // Not remembered, but the panel still opens and closes.
      }
    },
  ]
}
