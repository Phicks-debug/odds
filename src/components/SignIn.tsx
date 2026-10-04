import { useState } from "react"
import { Button } from "@/components/ui/button"
import { beginOAuthSignIn } from "@/lib/auth"
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/pkce"

interface SignInProps {
  onCancel: () => void
  onSignedIn: () => void
}

/** The way back into an account: SSO only, then the saved profile comes down with it. */
export function SignIn({ onCancel, onSignedIn }: SignInProps): React.JSX.Element {
  const [busy, setBusy] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Leaves for the provider; the way back lands on /auth/callback, which signs in.
  async function start(provider: OAuthProvider): Promise<void> {
    setBusy(provider)
    setError(null)
    try {
      await beginOAuthSignIn(provider)
      onSignedIn()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.")
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 py-8 md:my-auto md:flex-none md:border md:bg-card md:p-10">
      <button type="button" onClick={onCancel} className="cursor-pointer self-start text-sm font-medium text-primary">
        &larr; Back
      </button>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back.</h1>
      <div className="flex flex-col gap-2">
        {OAUTH_PROVIDERS.map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => start(provider.id)}
            className="w-full cursor-pointer disabled:cursor-not-allowed"
          >
            {busy === provider.id ? "Leaving…" : `Continue with ${provider.label}`}
          </Button>
        ))}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
      <Button type="button" variant="ghost" onClick={onCancel} className="w-full cursor-pointer text-muted-foreground">
        No account yet? Start
      </Button>
    </div>
  )
}
