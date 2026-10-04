/**
 * PKCE and callback plumbing for Supabase-native SSO (Google, LinkedIn).
 * No network and no env here, so unit tests run without a project.
 */

export const OAUTH_CALLBACK_PATH = "/auth/callback"

export type OAuthProvider = "google" | "linkedin_oidc"

export const OAUTH_PROVIDERS: ReadonlyArray<{ id: OAuthProvider; label: string }> = [
  { id: "google", label: "Google" },
  { id: "linkedin_oidc", label: "LinkedIn" },
]

/** True on the path Supabase sends the browser back to after the provider. */
export function isOAuthCallback(pathname: string): boolean {
  return pathname === OAUTH_CALLBACK_PATH || pathname.startsWith(`${OAUTH_CALLBACK_PATH}/`)
}

export type OAuthAnswer = { code: string } | { error: string; description: string | null } | null

/** Reads the provider answer from the callback URL. */
export function parseOAuthCallback(url: string): OAuthAnswer {
  const query = new URL(url).searchParams
  const code = query.get("code")
  if (code) {
    return { code }
  }
  const error = query.get("error")
  if (error) {
    return { error, description: query.get("error_description") }
  }

  return null
}

/** 64 random bytes as unpadded base64url (86 chars, inside the 43-128 the server allows). */
export function newVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(64)))
}

/** S256 challenge for a verifier (RFC 7636). */
export async function challengeOf(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
}

function base64url(bytes: Uint8Array): string {
  let raw = ""
  for (const byte of bytes) {
    raw += String.fromCharCode(byte)
  }

  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
