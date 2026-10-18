# Vercel handoff: connect the live site to Supabase and the phone line

**For:** whoever owns the `usc-dual-hacks` project on Vercel.
**Time:** about 5 minutes.

## Why

The live site (https://usc-dual-hacks.vercel.app) has no environment variables set. Its health
check reports `"mode": "memory"` and every variable `"set": false`. Because of that, it:

- shows built-in practice data instead of the Supabase houses
- shows an empty **Incoming calls** panel and "Phone line not connected"
- never changes colour when someone calls the line
- still accepts the old default sign-in codes

The code on `main` is ready. Only the settings are missing. The same code works on localhost with
these 8 variables set.

## Steps

1. **Get the values from Adrian.** He'll send you a file called `vercel-board.env` privately. It
   has database keys in it, so don't paste it into Slack, the repo, or a GitHub issue.
2. **Open Vercel → `usc-dual-hacks` → Settings → Environment Variables.**
3. **Add all 8, each set to the Production environment.** Vercel accepts the whole file at once:
   paste its contents into the first Key field and it fills in every row.

   | Variable | What it's for |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | where the house data lives |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the browser's public Supabase key |
   | `SUPABASE_SERVICE_ROLE_KEY` | server-side writes, such as officer taps and Reset |
   | `SUPABASE_JWT_SECRET` | signs the token that keeps resident names behind the sign-in code |
   | `AUTH_SECRET` | signs the sign-in cookie |
   | `OFFICER_PASSCODE` | officer sign-in code |
   | `DISPATCH_PASSCODE` | dispatch sign-in code |
   | `NEXT_PUBLIC_TELEPHONY_URL` | the Railway server: the live call feed and instant colour changes |

4. **Redeploy:** Deployments → the latest one → ⋯ → **Redeploy**. You need a redeploy because the
   `NEXT_PUBLIC_` values are built into the page; saving the variables alone doesn't change the
   running site.

## Check it worked

1. **Open https://usc-dual-hacks.vercel.app/api/health.** You should see `"mode": "supabase"`
   and every variable `"set": true`.
2. **Sign in at `/dispatch`** with the dispatch code from the file. The old `5150` should stop
   working.
3. **Check the header.** It should say **Records live** and **Phone line live**.
4. **Check the map.** It should show one green, one red, one orange and one yellow house. Adrian
   sets these with `npm run demo-colors`. Every other house should be grey.
5. **Call (213) 752-2494** and say something like *"My aunt Ruth Adams at 16800 Bollinger Drive
   texted me she got out."* The call should appear under **Incoming calls**, and the house should
   turn yellow about a second after you say it.

If any step fails, send Adrian the output of `/api/health`.
