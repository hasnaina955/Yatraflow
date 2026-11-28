# Creator profile claims

The master admin can import one or more trip files and create a private claim link. The recipient can read a preview before sign-in. An account takes ownership only after the recipient confirms the claim. Publish a trip after the claim, not before it.

## Release steps

1. Run the SQL contract tests on a local or standby database. Do not use live accounts for these tests.
2. Apply `supabase/migrations/20261128_creator_profile_claims.sql` before the app release.
3. Check that the migration is present. Use `npm run check:migrations` with the credentials of the target project.
4. Deploy the app to the standby environment. Check the claim page with a test account.
5. In Supabase, open Authentication, then URL Configuration. Add `https://www.yatraflow.in/claim/*` and `http://localhost:5173/claim/*` to Redirect URLs. Add the standby host if it sends confirmation emails.
6. Use the server-only `SUPABASE_SERVICE_ROLE_KEY`, the public `SUPABASE_ANON_KEY` and the project URL. Set `PUBLIC_ORIGIN` if the deployment must use a different origin.
7. Check a new account with email confirmation, an existing account, an expired link and a revoked link. Check that the new owner can open and edit each trip, and that an account cannot claim a second time.
8. Check the generic link card in a chat preview and the claim page in a phone browser and Instagram WebView.
9. Review the release and get approval before promotion to production.

The private claim page must not enter the service worker cache. The claim token must not be sent to analytics or to the feedback form. The generic link card gives no creator or trip data.

Do not transfer a trip with a publication record. Use the existing publication and payment workflows for those trips.

Until #1079 ships, revoke expired invitations by hand in the admin panel.

## Existing patterns

- [Supabase Auth](https://github.com/supabase/auth) (MIT) supplies account sign-in, email confirmation and the admin user API. Keep account creation there.
- [Supabase JS](https://github.com/supabase/supabase-js) (MIT) supplies the browser auth session and redirect support. Keep the existing client.
- The shipped YatraFlow join link has a public card and a separate member action. Use the same separation for creator claims, but use a new claim token and ownership action.

No upstream code was copied.
