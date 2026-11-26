# Fieldwork

A private, local research-careers website for internships and full-time roles. Internships are the default, with a separate full-time section and an editable Summer 2027 target. It is a working local application, with a SQLite database, job-board connectors, document text extraction, profile matching, and application tracking.

## Start on Windows

1. Install **Node.js 24 LTS** from [nodejs.org](https://nodejs.org/). Restart your terminal after installation if needed.
2. Extract the entire ZIP into a permanent folder, for example `D:\Projects\Fieldwork`.
3. Double-click **start-windows.bat**.
4. Open **http://localhost:3000** in your browser. Keep the command window open while using the app and for automatic collection.

There is no `npm install` step. The app uses Node's built-in HTTP server and SQLite; its PDF reader is bundled with its license. You can alternatively open a terminal in this folder and run:

```sh
npm start
```

For a quick look before installing Node, open **Fieldwork_Preview.html** in your browser. It is a self-contained sample-data preview. It is separate from the real app and does not run live collection. Its sample notes and profile edits are saved only in that browser and do not transfer to the real app automatically.

macOS/Linux: install Node.js 24, open this folder in a terminal, run the same command, and visit localhost:3000. If port 3000 is occupied, set `PORT` to an available port before starting (PowerShell: `$env:PORT=3001; npm start`).

## Start with your profile

- The optional Sample workspace uses **clearly labeled fictional sample roles**. No sample role is a verified vacancy or has an application link.
- Open **Your profile** and review the starter skills and research areas. They reflect preliminary research context, not a reviewed CV.
- Import one or several **PDF, DOCX, TXT, or Markdown** documents, up to 10 MB each. You can use your resume, full CV, and project descriptions.
- Review extracted text and select suggested skills and interests. Suggestions are added to a **draft**; select **Save profile** to persist them and update rankings.
- Add specialist skills manually using the comma-separated skills field. Known terms are recognized automatically; this version does not use a language model or train an ML model.
- Scanned/image-only PDFs need OCR first. Password-protected PDFs and legacy `.doc` files are not supported.

Fieldwork reads documents locally and saves the profile you approve. To retain extracted résumé text, select the checkbox before saving. The search provider receives job search terms only.

## Accounts and privacy

Create an account when you first open Fieldwork. The first account on an upgraded local installation inherits the existing profile, settings, and saved jobs. Each additional account starts with a new workspace. Account databases and password hashes stay under the ignored data folder. Back up the entire data folder to preserve these workspaces.

After importing a résumé, review the suggested skills and areas and save the profile. Under **Your profile**, use the optional keyword field to add job titles or skills outside the built-in list. If Adzuna is configured, the search uses those keywords and recognized skills to discover internships and full-time roles. Each account has its own profile, application tracking, source settings, and search results.

This app still runs at localhost. For use over the internet it needs a hosted backend with HTTPS, production account management and persistent private storage.

## Get real listings

The app starts in **Live workspace** on a fresh install. If yours opens in Sample workspace, switch to Live workspace using the top bar.

1. Click **Search now**. Ten starter employer boards and Jobicy’s U.S.-eligible remote feed are installed automatically in new and existing workspaces. They require no credentials. Employer boards link to their own listings. Jobicy links open the original Jobicy listing. Its feed covers recent remote postings, and leaving the feed does not prove an opening closed.
2. For broader U.S. discovery, request an application ID and key from [Adzuna](https://developer.adzuna.com/) and enter them once in **Sources & updates → Search across employers**. Select **Search now** again.
3. Update your research areas and skills under **Your profile**. The discovery panel shows the generated keywords. Each run requests up to 35 recently indexed U.S. listings per query. The app sends predefined search terms, while your CV text and application notes stay local. API credentials are kept in the local database and excluded from JSON exports.

Adzuna results can include universities and national labs when indexed. The feed provides excerpts, so these results always require eligibility review. Check the full posting via the Adzuna link. A result falling out of the latest search does not verify that it closed. Direct employer boards provide more complete availability and description data where available.

Optional employer boards can still be added under **Sources & updates**. You can also add individual postings from sources outside this coverage. The Organizations page provides research targets, not assertions of current vacancies or F-1 acceptance. If a posting does not identify its employment type, it appears under **Roles to classify**.

To upgrade from the first version, stop the app, extract the new ZIP, and copy your existing `data` folder into the newly extracted `fieldwork` folder before starting it. Your profile, application notes, and any connected boards carry over.

## Search the public web

On **Internships** or **Full-time roles**, select **Search Google** to open a standard Google results page. FieldWork previews the query and uses the search box or selected research focus first, then falls back to your saved job titles, research areas, or skills. It also uses the role type and applicable date, location, and organization filters. Google receives the displayed query. The results open in a new tab and do not enter FieldWork automatically.

## Connect Chrome

The **Connect Chrome** button under the search box can search a public Greenhouse, Lever, or Ashby board. Paste its URL for a search without an extension, or install the Chrome companion once.

1. Get the repository onto the PC that runs Chrome. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the `chrome-extension` folder.
2. Run FieldWork and sign in. Open a supported employer board or job posting in Chrome. Click **FieldWork Career Board Search** from the extensions menu.
3. Use `http://localhost:3000` for a local app or paste your HTTPS forwarded address for Codespaces. Click **Find matches**.

The companion sends the board address to FieldWork. FieldWork searches the employer's public feed and ranks job titles against your saved skills and research areas. Select a title to open the original job page. You can refine the list by role type or keyword. For an opening you discover on Jobright, open the employer’s application page. If it’s on Greenhouse, Lever, or Ashby, use that page’s URL in **Connect Chrome**. For other sites, use **Add a role** and enter the individual job’s details and URL. Connect Chrome does not search Jobright or LinkedIn results pages.

## Eligibility screening

The app extracts evidence from each job's description. It uses three labels:

- **CPT acceptance stated:** explicit F-1/CPT acceptance wording was detected, without a detected conflicting restriction.
- **Eligibility to verify:** information is missing or requires review, including export-control, clearance, sponsorship, and site-access conditions.
- **Eligibility conflict:** an explicit detected requirement conflicts with the stated F-1 profile, such as U.S.-citizens-only or a CPT exclusion.

Explicit conflicts and undergraduate-only roles are hidden in the default internship search. You can change these filters. Unknown season/year internships remain visible by default and are labeled as needing date verification. You can exclude them for a stricter Summer 2027 view.

Screening is conservative keyword analysis, not a legal determination or an exhaustive evaluation of a posting. Always inspect the quoted wording and original posting. National-lab rules vary by program and project; no entire laboratory is labeled eligible. Employer acceptance, work authorization for a specific role, future sponsorship, and site access are separate. Confirm your own authorization with [ASU ISSC](https://issc.asu.edu/f-1j-1-students/employment/f1-cpt).

## Ranking

The displayed research-fit percentage is a ranking aid, not a probability of eligibility, interview, or hiring. It assigns 17 points per shared research-area tag and up to 35 points for recognized matching skills, capped at 100. Open a role to see matching terms. It does not evaluate every requirement or infer that you possess an unlisted qualification. Adding skills to the profile changes rankings immediately after saving.

## Daily collection

Sources can refresh every 6, 12, or 24 hours. The default is 24 hours. A running app checks whether an update is due once a minute. After a restart, an overdue refresh runs shortly after startup. Your computer must be awake and online. This is not an already-hosted scheduled service.

A complete successful employer-board fetch updates listings, preserves their first-discovered date and application notes, and marks missing entries inactive. Failed, malformed, and incomplete fetches preserve previous listings. Exact canonical URLs are deduplicated across sources; near-duplicate postings with different URLs may remain. Closed roles remain in Saved/Applications. Greenhouse's update date is deliberately not presented as an original posting date.

For Windows Task Scheduler, you may create a daily task whose program is `refresh-windows.bat` and whose "Start in" folder is this extracted project folder. This runs collection without the website being open, but the PC must still be available. Avoid running this one-off refresh at the same time as a manual refresh.

Command-line refresh:

```sh
npm run refresh
```

## Applications and backups

Click a live role title to open its application link in a new tab. For Adzuna results, the link opens the listing on Adzuna. Use the arrow on the role card to open details, save notes, and set New, Saved, Applied, Interview, Offer, Rejected, or Dismissed. Opening the original application link does not automatically mark a role Applied. Demo and real activity are separate.

Your complete persistent workspace is in `data/fieldwork.sqlite`. Stop the app before copying the entire `data` folder to back it up or move computers. Keep this folder private; it can contain CV text and application notes. The **Export workspace** button also produces a readable JSON export; automatic import of that JSON is not implemented in this release. The distributed ZIP contains no database or test user's personal information.

## Portfolio integration and hosting

The source separates the browser interface (`public/`) from collection, matching, documents, and storage (`src/`). This makes it practical to keep the job search as an independent app and link to it from a future portfolio page or a `jobs.yourdomain.com` subdomain.

This version intentionally listens only on your PC's loopback address and accepts local hostnames. It has no user-account system and is **not ready for public hosting**. Before deploying, add authentication, secure sessions, deployment-specific origin handling, HTTPS through the hosting platform, durable storage/backups, and an external scheduler. A public portfolio can display a sample-data demo while CV text and application history stay private. SQLite is appropriate for this single-user local version; PostgreSQL can replace the storage module when hosted concurrency or multiple users justify it.

The original proposal suggested Next.js/PostgreSQL. The first implementation uses plain JavaScript and Node/SQLite to run without package downloads or a database installation. It preserves the same functional separation and can later be migrated without changing the core collection/matching concepts.

## Verification

```sh
npm test
```

Tests cover eligibility negation and restrictions, source failures and closure handling, pagination, unlisted jobs, deduplication, preserved notes, profile matching, document boundaries, local API workflows, cross-origin write rejection, host validation, and private-file isolation. Browser rendering and live source access can require capabilities unavailable in a restricted development environment; see `VALIDATION.md` for the checks performed on this build.

## Source documentation

- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever public Postings API](https://github.com/lever/postings-api)
- [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Node.js SQLite](https://nodejs.org/api/sqlite.html)

PDF text extraction uses Mozilla PDF.js 5.6.205, Apache-2.0, bundled in `vendor/` with its original license. It is the only third-party runtime component.
