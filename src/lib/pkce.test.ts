import { describe, expect, test } from "bun:test"
import { challengeOf, isOAuthCallback, newVerifier, OAUTH_CALLBACK_PATH, parseOAuthCallback } from "@/lib/pkce"

describe("isOAuthCallback", () => {
  test("matches the callback path only", () => {
    expect(isOAuthCallback(OAUTH_CALLBACK_PATH)).toBe(true)
    expect(isOAuthCallback(`${OAUTH_CALLBACK_PATH}/`)).toBe(true)
    expect(isOAuthCallback("/")).toBe(false)
    expect(isOAuthCallback("/job/p123")).toBe(false)
    expect(isOAuthCallback("/auth/callbackx")).toBe(false)
  })
})

describe("parseOAuthCallback", () => {
  test("reads the provider code", () => {
    expect(parseOAuthCallback("https://x.example/auth/callback?code=abc")).toEqual({ code: "abc" })
  })

  test("reads provider errors and empty callbacks", () => {
    expect(parseOAuthCallback("https://x.example/auth/callback?error=access_denied&error_description=nope")).toEqual({
      error: "access_denied",
      description: "nope",
    })
    expect(parseOAuthCallback("https://x.example/auth/callback")).toBeNull()
  })
})

describe("pkce", () => {
  test("challenge matches the RFC 7636 verifier (challenge checked against openssl)", async () => {
    await expect(challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  })

  test("verifiers are url-safe and long enough", () => {
    for (let i = 0; i < 3; i++) {
      expect(newVerifier()).toMatch(/^[A-Za-z0-9_-]{86}$/)
    }
  })
})
