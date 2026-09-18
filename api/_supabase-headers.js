// ============ Shared Supabase auth headers for the payments functions ======
// Both legacy (service_role JWT, `eyJ…`) and new-model (secret, `sb_secret_…`)
// keys are accepted. The legacy key rides BOTH headers (PostgREST accepts it
// on either); a secret key rides ONLY the `apikey` header — Supabase's new
// platform rejects non-JWTs on `Authorization: Bearer` with "Invalid JWT".
// Kept dependency-free and Vercel-function-compatible (CommonJS-free, plain
// ESM export like the other api files).
//
// The key is NOT treated as secret material here — it just chooses which
// headers are safe to send.

export function supabaseServiceHeaders(serviceKey, extra = {}) {
  const isNewSecret = serviceKey.startsWith('sb_secret_')
  return {
    apikey: serviceKey,
    // A legacy JWT authenticates on either header; a new secret key must
    // never appear on Authorization (it is not a JWT and would be refused).
    ...(isNewSecret ? {} : { authorization: `Bearer ${serviceKey}` }),
    ...extra,
  }
}

/** The anon/publishable key also varies by model — same header rule. */
export function supabaseAnonHeaders(anonKey, extra = {}) {
  return supabaseServiceHeaders(anonKey, extra)
}
