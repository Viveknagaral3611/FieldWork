# Build validation

Validated on Node.js 24.22.3, November 24, 2026.

- `npm test`: **21 passed, 0 failed**.
- Parsed server and browser JavaScript with `node --check`.
- Exercised all main interface templates in a JavaScript DOM harness, including default internship filtering. This checks rendering logic; it is not a browser layout test.
- Started the local HTTP server and exercised profile save, manual role entry, eligibility output, source add/pause/remove, schedule changes, document text import, application notes, JSON export, and protected-route handling through the API.
- Read actual PDF and DOCX fixtures with the bundled document extractors.
- Verified database persistence after close/reopen, application preservation during refresh, cross-source deduplication, pagination, unlisted-job exclusion, source failure preservation, and successful closure handling.

## Environment limits

- A real Greenhouse request was attempted; the development environment returned HTTP 403. Live network collection is implemented against official source documentation and tested with representative API fixtures, but has not been verified end-to-end against external boards in this workspace. Real sources are not preconnected or represented as successfully fetched.
- Chromium is installed, but launch was denied by the execution environment's socket restrictions. Desktop/mobile browser layout, click behavior in a real browser, and accessibility tooling could not be fully checked here. Responsive CSS and accessible labels are included; test them on your own browser after starting the app.
- No public deployment, hosted scheduler, external notification, account creation, or paid API service was configured.

The optional `Fieldwork_Preview.html` is a standalone interactive **sample-data** preview. It supports browsing, filters, sample saves/notes, profile edits, and TXT/Markdown import through browser storage. It does not collect real jobs, schedule background work, or parse PDFs/DOCX; those are features of the full local app.

The discovery update adds tests for profile-derived Adzuna queries, cross-employer results, credential redaction, and automatic starter-board setup. Adzuna live verification requires a user-supplied key.
