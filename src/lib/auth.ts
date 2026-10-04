import { ANON_KEY, SUPABASE_URL, setAccessToken } from "@/lib/supabase"

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

/** Signs in with the one-time token the verify-shoo bridge hands back. Same session shape as every other door. */
export async function signInWithTokenHash(tokenHash: string): Promise<Session> {
  const session = toSession(await call("verify", { type: "magiclink", token_hash: tokenHash }))
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
