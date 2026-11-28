import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const migration = read('supabase/migrations/20261128_creator_profile_claims.sql')
const schema = read('supabase/schema.sql')
const contracts = read('supabase/tests/creator_claims_contract.test.sql')

describe('Creator claim database contract', () => {
  it('keeps the migration and schema bootstrap aligned', () => {
    expect(schema.endsWith(migration)).toBe(true)
  })

  it('runs the contract on a local SQL database', async () => {
    const db = new PGlite()
    try {
      // Simulate the hosted Auth helpers with synthetic accounts only.
      await db.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        create schema auth;
        create table auth.users(
          id uuid primary key, instance_id uuid, aud text, role text, email text,
          encrypted_password text, email_confirmed_at timestamptz, updated_at timestamptz,
          raw_user_meta_data jsonb not null default '{}'::jsonb,
          raw_app_meta_data jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        );
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
        $$;
        create function auth.jwt() returns jsonb language sql stable as $$
          select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
        $$;
        grant usage on schema auth, public to anon, authenticated, service_role;
        alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
        alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
        create publication supabase_realtime;
      `)
      await db.exec(schema)
      await db.exec(migration)
      await db.exec(contracts)
    } finally {
      await db.close()
    }
  }, 60_000)
})
