import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { completeOAuthSignIn, takeOAuthNext } from "@/lib/auth"
import { useData } from "@/lib/data"

interface OAuthCallbackProps {
  onDone: (next: "account" | "jobs" | "signin") => void
}

/** Landing spot for the /auth/callback redirect: trades the provider code for a session, then hands back control. */
export function OAuthCallback({ onDone }: OAuthCallbackProps): React.JSX.Element {
  const data = useData()
  const ran = useRef<boolean>(false)

  useEffect(() => {
    // Guarded: the data object changes identity, and StrictMode remounts in dev.
    if (ran.current) {
      return
    }
    ran.current = true
    const run = async (): Promise<void> => {
      try {
        data.setSession(await completeOAuthSignIn())
        onDone(takeOAuthNext() === "jobs" ? "jobs" : "account")
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "Sign-in failed.")
        onDone("signin")
      }
    }
    void run()
  }, [data, onDone])

  return <p className="py-20 text-center text-muted-foreground">Signing you in…</p>
}
