# Supabase database types

## What the file is

[`src/types/database.generated.ts`](../src/types/database.generated.ts) holds TypeScript types. The Supabase type generator made them from the live project's `public` schema on 2026-11-12.

The file declares 17 tables and 41 functions. The functions include every RPC that the app calls. The file is type-only. It adds no code to the app bundle.

## Current use

Nothing imports the file yet. The app's Supabase client does not use these types. The app still writes its row shapes by hand. A later change types the client and the row shapes.

## How to regenerate

Use one of two ways.

1. In the Supabase dashboard, open the project's TypeScript type generator. Select the `public` schema and copy the output.
2. Run the Supabase CLI:

   ```bash
   supabase gen types typescript --project-id <project-ref> --schema public
   ```

   The command needs a login. Run `supabase login` first, or set the access token in your shell for that one command. Never commit a token. Never write a token into a file in the repository.

Write the output to a file outside the repository. Then copy it below the four-line header in `src/types/database.generated.ts`. Update the generation date in the header. Replace the whole body with the new output. Do not edit the body by hand.

## Drift

The file reflects the live schema on its generation date. The file goes out of date when a migration is applied. It also goes out of date when the schema changes and the file is not regenerated.

Regenerate after each schema change that the app depends on. Read the diff before you commit it.

## Generated types do not validate rows

The generated types describe the shape that the database returns. They do not check a row at run time. A row from the network can differ from these types. So can an API route response or a row from an older deployed version.

Keep the run-time checks on rows. For example, `src/lib/tripRow.ts` checks rows before the app uses them.

## Test

`tests/database-types.test.ts` checks two things. The file keeps its header. Every table and RPC name that the app queries is declared in the file. The test does not check column types.
