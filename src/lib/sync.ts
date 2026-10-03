import { useEffect, useEffectEvent } from "react"

/** Coming back to a tab fires both focus and visibilitychange; this folds them into one read. */
const RETURN_GAP_MS = 1000

/**
 * Runs `onReturn` each time this tab is looked at again: switching back to it,
 * unlocking the phone, clicking into the window. Another device may have
 * swiped or saved answers in the meantime, and nothing pushes that here, so
 * this is when the screen reads the account again.
 */
export function useOnReturn(onReturn: () => void): void {
  const handleReturn = useEffectEvent(onReturn)

  useEffect(() => {
    let last = 0

    function handle(): void {
      if (document.visibilityState !== "visible" || Date.now() - last < RETURN_GAP_MS) {
        return
      }

      last = Date.now()
      handleReturn()
    }

    window.addEventListener("focus", handle)
    document.addEventListener("visibilitychange", handle)

    return () => {
      window.removeEventListener("focus", handle)
      document.removeEventListener("visibilitychange", handle)
    }
  }, [])
}
