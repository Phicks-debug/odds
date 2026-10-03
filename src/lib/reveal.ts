import { useEffect, useRef, useState } from "react"

/**
 * True once the element has scrolled into view, and stays true: a card that
 * rose in once should not sink back out and rise again on every pass. Where
 * IntersectionObserver is missing (or the page is a test runner that never
 * scrolls) it is true from the start, so nothing is ever hidden for good.
 */
export function useRevealed<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [shown, setShown] = useState<boolean>(
    () => typeof IntersectionObserver === "undefined",
  )

  useEffect(() => {
    const node = ref.current
    if (!node || shown) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    )
    observer.observe(node)

    return () => observer.disconnect()
  }, [shown])

  return [ref, shown]
}
