import { ANON_KEY, SUPABASE_URL, setAccessToken } from "@/lib/supabase"
import { OAUTH_CALLBACK_PATH, challengeOf, newVerifier, parseOAuthCallback, type OAuthProvider } from "@/lib/pkce"

export interface Session {
  access_token: string
  refresh_token: string
  expires_at: number
  user: { id: string; email: string }
}

const STORE = "careersim.session"

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORE)

    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function keep(session: Session | null): void {
  setAccessToken(session?.access_token ?? null)
  try {
    if (session) {
      window.localStorage.setItem(STORE, JSON.stringify(session))
    } else {
      window.localStorage.removeItem(STORE)
    }
  } catch {
    return
  }
}

interface AuthResponse {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  user?: { id: string; email?: string }
  id?: string
  email?: string
  msg?: string
  error_description?: string
  error?: string
  message?: string
}

async function call(path: string, body: unknown): Promise<AuthResponse> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as AuthResponse
  if (!response.ok) {
    throw new Error(data.error_description ?? data.msg ?? data.message ?? data.error ?? "Sign in failed")
  }

  return data
}

function toSession(data: AuthResponse): Session | null {
  if (!data.access_token || !data.refresh_token) {
    return null
  }
  const id = data.user?.id ?? ""

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user: { id, email: data.user?.email ?? "" },
  }
}

/** Restores the stored session, refreshing it when it is about to expire. */
export async function restoreSession(): Promise<Session | null> {
  const stored = loadSession()
  if (!stored) {
    return null
  }
  if (stored.expires_at - 60 > Math.floor(Date.now() / 1000)) {
    keep(stored)

    return stored
  }
  try {
    const next = toSession(await call("token?grant_type=refresh_token", { refresh_token: stored.refresh_token }))
    keep(next)

    return next
  } catch {
    keep(null)

    return null
  }
}

const VERIFIER_KEY = "careersim.pkce"
const NEXT_KEY = "careersim.oauthNext"

function remember(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    return
  }
}

function recall(key: string): string | null {
  try {
    const value = window.sessionStorage.getItem(key)
    window.sessionStorage.removeItem(key)

    return value
  } catch {
    return null
  }
}

/**
 * Starts SSO (Google, LinkedIn): PKCE challenge up front, provider in the
 * browser, back to /auth/callback. The project answers from its own auth,
 * so the session this returns is native and every policy keeps working.
 */
export async function beginOAuthSignIn(provider: OAuthProvider): Promise<void> {
  const verifier = newVerifier()
  const redirectTo = `${window.location.origin}${OAUTH_CALLBACK_PATH}`
  remember(VERIFIER_KEY, JSON.stringify({ verifier, redirectTo }))
  const params = new URLSearchParams({
    provider,
    redirect_to: redirectTo,
    code_challenge: await challengeOf(verifier),
    code_challenge_method: "S256",
  })
  window.location.assign(`${SUPABASE_URL}/auth/v1/authorize?${params}`)
}

/** Finishes SSO on /auth/callback: trades the provider code for a session. */
export async function completeOAuthSignIn(): Promise<Session> {
  const answer = parseOAuthCallback(window.location.href)
  if (!answer) {
    throw new Error("Sign-in was cancelled.")
  }
  if ("error" in answer) {
    throw new Error(answer.description ?? "Sign-in failed.")
  }
  const stored = recall(VERIFIER_KEY)
  const { verifier } = (stored ? JSON.parse(stored) : {}) as { verifier?: unknown }
  if (typeof verifier !== "string" || !verifier) {
    throw new Error("Sign-in grew stale. Start again.")
  }
  const session = toSession(await call("token?grant_type=pkce", { auth_code: answer.code, code_verifier: verifier }))
  if (!session) {
    throw new Error("Sign in failed")
  }
  keep(session)

  return session
}

/** Remembers where the SSO trip started ("jobs" for a fresh sign-up), across the redirect. */
export function rememberOAuthNext(next: string): void {
  remember(NEXT_KEY, next)
}

/** Reads and clears what rememberOAuthNext stored (null outside an SSO trip). */
export function takeOAuthNext(): string | null {
  return recall(NEXT_KEY)
}

export function signOut(): void {
  keep(null)
}
