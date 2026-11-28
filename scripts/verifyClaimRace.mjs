// Optional staging or local check. Creates one real redemption from a disposable
// test fixture: never run against production data or a creator's private link.
// Usage: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_TOKEN_HASH,
// USER_A_ID, and USER_B_ID, then run:
//   node scripts/verifyClaimRace.mjs --disposable-fixture
import { createClient } from '@supabase/supabase-js'

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_TOKEN_HASH, USER_A_ID, USER_B_ID } = process.env
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  if (!process.argv.includes('--disposable-fixture') || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY
    || !/^[a-f0-9]{64}$/.test(TEST_TOKEN_HASH || '')
    || !uuid.test(USER_A_ID || '') || !uuid.test(USER_B_ID || '') || USER_A_ID === USER_B_ID) {
    console.error('Use an isolated test database and two distinct fixture accounts. Set all five environment values and --disposable-fixture.')
    process.exitCode = 1
    return
  }

  const client = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })
  const [r1, r2] = await Promise.all([
    client().rpc('redeem_creator_claim', { p_token_hash: TEST_TOKEN_HASH, p_claimer_id: USER_A_ID }),
    client().rpc('redeem_creator_claim', { p_token_hash: TEST_TOKEN_HASH, p_claimer_id: USER_B_ID }),
  ])
  const successes = [r1, r2].filter((r) => !r.error && Array.isArray(r.data?.moved_trip_ids))
  const failures = [r1, r2].filter((r) => r.error?.message === 'claim_already_redeemed')
  const final = await client().rpc('get_creator_claim_preview', { p_token_hash: TEST_TOKEN_HASH })

  if (successes.length !== 1 || failures.length !== 1 || final.error
    || final.data?.status !== 'claimed' || final.data?.trips !== undefined) {
    console.error('RACE CHECK FAILED:', { successfulCalls: successes.length, blockedCalls: failures.length })
    process.exitCode = 1
    return
  }
  console.log('RACE CHECK PASSED: one claim, one refusal, and no trip data in the used preview.')
}

await main()
