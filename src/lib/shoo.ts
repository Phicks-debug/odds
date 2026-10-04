import { ANON_KEY, SUPABASE_URL } from "@/lib/supabase"
import { signInWithTokenHash, type Session } from "@/lib/auth"
import { SHOO_CALLBACK_PATH, isShooCallback, tokenHashOf } from "@/lib/shoo-url"
import type { ShooAuthClient } from "@shoojs/auth"

export { SHOO_CALLBACK_PATH, isShooCallback }
const NEXT_KEY = "careersim.shooNext"

/**
 * Google sign-in through Shoo (shoo.dev): a free Google-OAuth broker with no
 * signup and no keys. It is one more door, not a replacement: email and
 * password keep working, and the Supabase session stays the authority, so
 * every row-level policy keeps working unchanged. The bridge edge function
 * (supabase/functions/verify-shoo) turns the Shoo token into a Supabase
 * session; this file never trusts the browser token on its own.
 */

let client: ShooAuthClient | null = null

async function shoo(): Promise<ShooAuthClient> {
  if (!client) {
    // Lazy so pages that never touch sign-in never load the SDK.
    const { createShooAuth } = await import("@shoojs/auth")
    // PII on: the bridge links accounts by verified email, so sign-in asks
    // for it once on Shoo's consent screen.
    client = createShooAuth({ callbackPath: SHOO_CALLBACK_PATH, requestPii: true })
  }

  return client
}

/** Leaves the page for Google; Shoo sends the browser back to /auth/callback. */
export async function beginShooSignIn(): Promise<void> {
  await (await shoo()).startSignIn()
}

interface BridgeReply {
  action_link?: string
  error?: string
}

async function bridgeActionLink(idToken: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-shoo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ idToken }),
  })
  if (res.status === 404 && !res.headers.get("content-type")?.includes("json")) {
    throw new Error("Google sign-in is not switched on yet.")
  }
  const body = (await res.json().catch(() => ({}))) as BridgeReply
  if (!res.ok || !body.action_link) {
    throw new Error(body.error ?? "Google sign-in failed.")
  }

  return body.action_link
}

/** Runs on /auth/callback: trades the Shoo code for a Supabase session. */
export async function completeShooSignIn(): Promise<Session> {
  const auth = await shoo()
  const out = await auth.finishSignIn({ clearCallbackParams: true, redirectAfter: false })
  const idToken = out?.id_token
  if (!idToken) {
    throw new Error("Google sign-in was cancelled.")
  }
  const tokenHash = tokenHashOf(await bridgeActionLink(idToken))
  auth.clearIdentity()
  if (!tokenHash) {
    throw new Error("Could not open your account.")
  }

  return signInWithTokenHash(tokenHash)
}

/** Remembers where the Shoo trip started ("jobs" for a fresh sign-up), across the redirect. */
export function rememberShooNext(next: string): void {
  try {
    window.sessionStorage.setItem(NEXT_KEY, next)
  } catch {
    return
  }
}

/** Reads and clears what rememberShooNext stored (null outside a Shoo trip). */
export function takeShooNext(): string | null {
  try {
    const next = window.sessionStorage.getItem(NEXT_KEY)
    window.sessionStorage.removeItem(NEXT_KEY)

    return next
  } catch {
    return null
  }
}
