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

const DEV_OUT = "careersim.devSignedOut"

/**
 * Local development only: signs in with the account named in .env.local (VITE_DEV_EMAIL and VITE_DEV_PASSWORD), so
 * testing needs no form. Vite removes this branch from a production build. Signing out stays signed out until the tab closes.
 */
async function devSignIn(): Promise<Session | null> {
  if (!import.meta.env.DEV) {
    return null
  }
  const email = import.meta.env.VITE_DEV_EMAIL as string | undefined
  const password = import.meta.env.VITE_DEV_PASSWORD as string | undefined
  try {
    if (!email || !password || window.sessionStorage.getItem(DEV_OUT)) {
      return null
    }
    const session = toSession(await call("token?grant_type=password", { email, password }))
    keep(session)

    return session
  } catch {
    return null
  }
}

/** Restores the stored session, refreshing it when it is about to expire. */
export async function restoreSession(): Promise<Session | null> {
  const stored = loadSession()
  if (!stored) {
    return devSignIn()
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

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const session = toSession(await call("token?grant_type=password", { email, password }))
  if (!session) {
    throw new Error("Sign in failed")
  }
  keep(session)
  try {
    window.sessionStorage.removeItem(DEV_OUT)
  } catch {
    // nothing to clear
  }

  return session
}

/** Returns the session, or null when the project wants the email confirmed first. */
export async function signUp(email: string, password: string): Promise<Session | null> {
  const session = toSession(await call("signup", { email, password }))
  keep(session)

  return session
}

/** Signs in with the one-time token the verify-shoo bridge hands back. Same session shape as every other door. */
export async function signInWithTokenHash(tokenHash: string): Promise<Session> {
  const session = toSession(await call("verify", { type: "magiclink", token_hash: tokenHash }))
  if (!session) {
    throw new Error("Sign in failed")
  }
  keep(session)
  try {
    window.sessionStorage.removeItem(DEV_OUT)
  } catch {
    // nothing to clear
  }

  return session
}

export function signOut(): void {
  keep(null)
  try {
    window.sessionStorage.setItem(DEV_OUT, "1")
  } catch {
    return
  }
}
