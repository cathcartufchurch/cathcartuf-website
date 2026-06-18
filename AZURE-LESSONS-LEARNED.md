# Cathcart UF Website — Azure Migration: Lessons Learned
Generated: June 2026

---

## Overview

This document records the issues encountered and lessons learned during the migration of the
Cathcart UF website from Netlify to Azure Static Web Apps, including the setup of Azure
Functions for contact and prayer request form handling.

---

## Issue 1 — Wrong app_location in Workflow

**Problem:**
The Azure portal defaulted to `/admin` as the app location when creating the Static Web App,
which pointed to the Decap CMS folder instead of the site root.

**Symptom:**
The site displayed the Decap CMS login screen instead of the actual website.

**Fix:**
Set `app_location: "/"` in the GitHub Actions workflow YAML.

**Lesson:**
For a plain static HTML site, always set `app_location: "/"`. Never trust the Azure portal
defaults — check the workflow YAML immediately after creation.

---

## Issue 2 — OIDC Authentication Steps in Workflow

**Problem:**
The auto-generated workflow included OIDC/npm install steps which made Azure think the
site was a Node.js project and attempted to build it.

**Symptom:**
```
Error: Could not detect the language from repo.
Version '22.x.x' of platform 'nodejs' is not installed.
```

**Fix:**
Remove all OIDC and npm install steps from the workflow. Use a simplified YAML:

```yaml
name: Azure Static Web Apps CI/CD

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - main

jobs:
  build_and_deploy_job:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build and Deploy Job
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: true
          lfs: false
      - name: Build And Deploy
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_... }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/"
          api_location: "api"
          output_location: ""

  close_pull_request_job:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    name: Close Pull Request Job
    steps:
      - name: Close Pull Request
        id: closepullrequest
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_... }}
          action: "close"
```

**Lesson:**
For a plain static HTML site, the workflow should be as simple as possible — just checkout
and deploy, nothing else.

---

## Issue 3 — Token Regeneration Bug in Azure Portal

**Problem:**
The Azure portal had a bug preventing deployment token regeneration via the UI.

**Symptom:**
```
HTTP 415 UnsupportedMediaType
Reset Static Site Api Key — Failed
```

**Fix:**
Delete and recreate the Static Web App resource entirely. This generates a fresh token
automatically.

**Lesson:**
This is a known Azure portal bug. Don't waste time trying to fix it through the UI —
delete and recreate the resource. The site files are safe in GitHub so nothing is lost.

---

## Issue 4 — Missing api_location in Workflow

**Problem:**
The `api_location` was left blank so Azure didn't detect the Azure Functions folder.

**Symptom:**
```
No Api directory specified. Azure Functions will not be created.
```

**Fix:**
Set `api_location: "api"` in the workflow YAML.

**Lesson:**
Always set `api_location: "api"` in the workflow YAML when using Azure Functions.
Check the deployment logs for this message to confirm functions are being detected.

---

## Issue 5 — Azure Functions v3 vs v4 Programming Model

**Problem:**
The functions were written using the v3 programming model but the runtime deployed
by Azure Static Web Apps is v4, which uses a completely different model.

**Symptom:**
All function calls returned HTTP 500 with empty response bodies, even trivial
Hello World functions.

**v3 (incorrect) approach:**
- Uses `function.json` files in each function subdirectory
- Uses `module.exports = async function(context, req)`
- Uses `context.res` to set the response

**v4 (correct) approach:**
- No `function.json` files needed
- Uses `app.http()` to register functions
- Uses `return` to send the response
- Uses `jsonBody` instead of `body` for JSON responses

**Fix:**
Rewrite all functions using the v4 model. Example:

```javascript
const { app } = require('@azure/functions');

app.http('contact', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        return {
            status: 200,
            jsonBody: { message: "Hello World" }
        };
    }
});
```

**Lesson:**
Always check which version of the Azure Functions runtime is in use before writing
any function code. Azure Static Web Apps uses v4. Never use `function.json` files
or `context.res` with v4.

---

## Issue 6 — package.json main Field Required

**Problem:**
Without a `main` field in `api/package.json`, Azure Functions v4 only discovered
the first function and missed others.

**Symptom:**
Contact form worked but prayer form returned 404.

**Fix:**
Add `"main": "index.js"` to `api/package.json` and put all functions in a single
`api/index.js` file.

**Correct `api/package.json`:**
```json
{
  "name": "cathcartuf-api",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@azure/functions": "^4.0.0",
    "@azure/communication-email": "^1.0.0"
  }
}
```

**Lesson:**
Always include `"main": "index.js"` in `api/package.json` and register all functions
in that single file. This ensures Azure Functions v4 discovers all functions reliably.

---

## Issue 7 — Empty Response Bodies Making Debugging Impossible

**Problem:**
When functions crashed, they returned completely empty response bodies rather than
error messages, making it impossible to see what was going wrong.

**Symptom:**
```
SyntaxError: Unexpected end of JSON input
```

**Fix:**
During debugging, always return status 200 from both success and error paths, and
include the full error message in the response body. This ensures you always get
a readable response back regardless of what went wrong:

```javascript
} catch (error) {
    return {
        status: 200,
        jsonBody: { error: error.message }
    };
}
```

Also update the HTML to show raw response text during debugging:

```javascript
const rawText = await response.text();
statusDiv.textContent = 'Response: ' + rawText;
```

Once debugging is complete, restore status 500 for errors.

**Lesson:**
Never use generic error messages in HTML during development. Always surface the
actual error. Return status 200 from catch blocks temporarily if needed to force
a readable response.

---

## Issue 8 — Wrong Method Name: send vs beginSend

**Problem:**
`@azure/communication-email` v1.0.0 uses `client.beginSend()` not `client.send()`.
The send operation is a long-running async polling operation, not a simple call.

**Symptom:**
```
TypeError: client.send is not a function
```

**Fix:**
Use `beginSend()` with `pollUntilDone()`:

```javascript
const poller = await client.beginSend(emailMessage);
const result = await poller.pollUntilDone();
```

**Lesson:**
Always check the SDK documentation for the correct method names. Never assume
method names from older versions or other SDKs.

---

## Issue 9 — Display Name in senderAddress Not Supported

**Problem:**
Azure Communication Services does not support display names in the `senderAddress`
field using the standard email format `Name <email@domain.com>`. The `senderDisplayName`
field is also not supported in `@azure/communication-email` v1.0.0 — it is silently
ignored.

**Symptom:**
Inline display name format causes:
```
Request body validation error. See property 'senderAddress'
```
`senderDisplayName` as a separate field causes no error but has no effect — the From
field in the received email shows only the email address.

**Fix:**
Use the plain email address only, with a meaningful local part (e.g. `DoNotReply`
with capital letters as configured in the domain settings):

```javascript
senderAddress: "DoNotReply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net"
```

**Lesson:**
Azure Communication Services `senderAddress` must be a plain email address with
no display name formatting. `senderDisplayName` is not supported in v1.0.0.
The capitalisation of the local part (before the @) must match exactly what was
configured when the sending domain was set up.

---

## Issue 11 — top-level require Causes Silent Function Crashes

**Problem:**
Placing `require('@azure/communication-email')` at the top of `api/index.js` (outside
the handler function) caused the entire function to crash on module load with an empty
response body — before the handler even ran, so the try/catch never fired.

**Symptom:**
```
Response: (empty)
```
Even a Hello World function returned empty when the top-level require was present.

**Fix:**
Move `require('@azure/communication-email')` inside the handler function:

```javascript
app.http('contact', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const { EmailClient } = require('@azure/communication-email');
            // ... rest of handler
        }
    }
});
```

**Lesson:**
Always place `require('@azure/communication-email')` inside the handler function,
not at the top of the file. Top-level requires cause silent failures with empty
500 responses.

---

## Issue 12 — Ionos Rejecting Emails from Its Own Subdomain

**Problem:**
When using `mail.cathcartuf.org.uk` as the sending domain (a subdomain of the Ionos-hosted
`cathcartuf.org.uk`), Ionos rejected all incoming emails silently — nothing arrived in
the inbox or spam folder.

**Symptom:**
- Function reported success (`Succeeded`)
- Gmail recipients received emails correctly
- `@cathcartuf.org.uk` recipients received nothing — not even in spam

**Cause:**
Ionos applies same-domain spoofing protection — it blocks emails that appear to come
from its own domain via a third-party sender (Azure Communication Services).

**Fix:**
Revert to the Azure-managed `azurecomm.net` sending domain, which Ionos does not block:

```javascript
senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net"
```

**Lesson:**
When your email is hosted by the same provider as your DNS (e.g. Ionos), do not use
a subdomain of your main domain as the sending address for third-party email services.
Use the Azure-managed `azurecomm.net` domain instead. This can be revisited if email
is migrated to Microsoft 365 in future.

---

## Issue 10 — Application Insights Not Available

**Problem:**
Application Insights is not included in the Microsoft nonprofit Azure grant, which
severely limited our ability to see function logs and debug errors.

**Symptom:**
Application Insights could not be saved or enabled — it kept reverting to off.

**Workaround:**
Use the debugging techniques described in Issue 7 above — return 200 from catch
blocks and surface error messages in the HTML response during development.

**Lesson:**
Don't rely on Application Insights being available under the nonprofit grant.
Build good error handling and debug output into functions from the start.

---

## Correct Final Structure

```
repo-root/
├── api/
│   ├── index.js        ← all functions registered here
│   ├── host.json
│   └── package.json
├── assets/
├── admin/
├── contact.html
├── prayer.html
└── ... other HTML files
```

**`api/host.json`:**
```json
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

**`api/package.json`:**
```json
{
  "name": "cathcartuf-api",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@azure/functions": "^4.0.0",
    "@azure/communication-email": "^1.0.0"
  }
}
```

---

## Quick Reference Checklist for Future Azure Functions

When adding a new Azure Function to this project:

- [ ] Add the function using `app.http()` in `api/index.js`
- [ ] Use `jsonBody` not `body` for JSON responses
- [ ] Use `return` not `context.res` for responses
- [ ] Use `client.beginSend()` + `pollUntilDone()` for email sending
- [ ] Use plain email address only in `senderAddress` (no display names)
- [ ] Place `require('@azure/communication-email')` inside the handler, not at top level
- [ ] Use `azurecomm.net` sending domain — do not use a subdomain of your Ionos domain
- [ ] Match capitalisation of `senderAddress` exactly to domain configuration
- [ ] Store secrets as Azure Static Web App environment variables, never in code
- [ ] Test with a Hello World response before adding email logic
- [ ] During debugging, return status 200 from catch blocks to surface errors
- [ ] Restore status 500 for error responses before going to production
- [ ] No `function.json` files — v4 doesn't use them

---

## Eleventy Setup — Issues and Lessons Learned

---

## Issue 13 — Oryx Double-Building Eleventy

**Problem:**
When Eleventy is added to the project, Azure's Oryx build system detects the `package.json`
and automatically runs `npm run build`, which outputs to `_site/`. Azure then looks for the
app inside `_site/_site/` — a double-nested folder that doesn't exist.

**Symptom:**
```
Try to validate location at: '.../app/_site'.
The app build failed to produce artifact folder: '_site/'.
```

**Fix:**
Add manual build steps to the workflow and skip Oryx with `skip_app_build: true`:

```yaml
      - uses: actions/checkout@v4
        with:
          submodules: true
          lfs: false
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Build with Eleventy
        run: npm run build
      - name: Build And Deploy
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_... }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "_site"
          api_location: "api"
          output_location: ""
          skip_app_build: true
```

Key settings:
- `app_location: "_site"` — points Azure at the pre-built output
- `output_location: ""` — no further build needed
- `skip_app_build: true` — prevents Oryx from running again

**Lesson:**
When using Eleventy with Azure Static Web Apps, always build manually in the workflow
and skip Oryx. Never let Oryx and your manual build run together — they will conflict.

---

## Issue 14 — Eleventy Processing Documentation Files

**Problem:**
Eleventy tried to process `AZURE-LESSONS-LEARNED.md` as a template and failed because
the file contains `${{ }}` syntax from GitHub Actions workflow examples.

**Symptom:**
```
[11ty] Having trouble rendering liquid template ./AZURE-LESSONS-LEARNED.md
expected "|" before filter
```

**Fix:**
Add documentation files to Eleventy's ignore list in `eleventy.config.js`:

```javascript
eleventyConfig.ignores.add("AZURE-LESSONS-LEARNED.md");
eleventyConfig.ignores.add("README.md");
eleventyConfig.ignores.add("_backups/**");
```

**Lesson:**
Any markdown file at the repo root will be processed by Eleventy unless explicitly
ignored. Always add documentation and backup files to the ignores list.

---

## Issue 15 — Windows Folder Name Case Sensitivity

**Problem:**
Windows is case-insensitive and capitalises folder names when created (e.g. `News`,
`Events`, `Sermons`). GitHub Actions runs on Linux which is case-sensitive. The
collection paths in `eleventy.config.js` use lowercase (`_data/news`) which don't
match the capitalised folders on Linux, so collections return empty arrays.

**Symptom:**
- Collections work correctly on `localhost` (Windows)
- Collections return empty on the live site (Linux)
- HTML comments present in page source but no content between them

**Fix:**
Always create folders in lowercase. If a folder was created with capitals on Windows,
rename it via the GitHub web interface (which runs on Linux and handles case renames
correctly). The two-step rename trick on Windows:
1. Rename `News` → `news-temp`
2. Rename `news-temp` → `news`

Or use `git config core.ignorecase false` and `git rm -r --cached` to force Git to
recognise the case change.

**Lesson:**
Always verify folder names are lowercase in GitHub after creating them on Windows.
This applies to all folders referenced by code — `_data/news/`, `_data/events/`,
`_data/sermons/` etc. Linux and Windows treat `News` and `news` as different folders.

---

## Issue 16 — Eleventy Collections Not Finding YAML Files

**Problem:**
Using relative paths (`"./_data/news"`) in collection definitions worked locally but
failed on GitHub Actions because the working directory resolves differently.

**Fix:**
Use `__dirname` for reliable path resolution regardless of where the build runs:

```javascript
eleventyConfig.addCollection("news", function () {
    const fs = require("fs");
    const yaml = require("js-yaml");
    const path = require("path");
    const dir = path.join(__dirname, "_data/news");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(file => file.endsWith(".yaml"))
        .map(file => yaml.load(
            fs.readFileSync(path.join(dir, file), "utf8")
        ));
});
```

**Lesson:**
Always use `path.join(__dirname, ...)` for file paths in `eleventy.config.js`.
This ensures paths resolve correctly regardless of the build environment.

---

## Issue 17 — Sorting Events by Human-Readable Time Strings

**Problem:**
Event times are stored as human-readable strings (`"8:30am"`, `"10:30am"`) for
display purposes. Sorting these alphabetically fails because `"10"` sorts before
`"8"` lexicographically.

**Fix:**
Add a `parseTime` helper function that converts human-readable time strings to
minutes for reliable numeric sorting:

```javascript
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d+)(?::(\d+))?(am|pm)?/i);
    if (!match) return 0;
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2] || 0);
    const period = (match[3] || "am").toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes;
}
```

Use separate `startTime` and `endTime` fields in YAML (not a combined `time` field)
for clean display and reliable sorting:

```yaml
startTime: "8:30am"
endTime: "10am"
```

**Lesson:**
Never try to sort human-readable time strings alphabetically. Always store times in
a machine-parseable format for sorting, or use a helper function to parse them first.

---

## Correct Final Structure (Eleventy)

```
repo-root/
├── _data/
│   ├── events/         ← one YAML file per event (lowercase!)
│   ├── news/           ← one YAML file per news item (lowercase!)
│   └── sermons/        ← one YAML file per sermon (lowercase!)
├── _includes/
│   └── base.njk        ← single nav/header/footer template
├── _site/              ← Eleventy build output (gitignored)
├── _backups/           ← original HTML files (gitignored by Eleventy)
├── api/
│   ├── index.js        ← all Azure Functions
│   ├── host.json
│   └── package.json
├── assets/             ← CSS, images, fonts
├── admin/              ← CMS admin interface
├── contact/
│   └── index.njk
├── events/
│   └── index.njk
├── ... other page folders
├── eleventy.config.js
├── package.json        ← root package.json with Eleventy as devDependency
├── package-lock.json
└── .gitignore
```

**`.gitignore`:**
```
node_modules/
_site/
```

**Root `package.json` scripts:**
```json
"scripts": {
    "build": "eleventy",
    "build:azure": "eleventy"
}
```

---

## Quick Reference Checklist for Eleventy Setup

- [ ] Install Eleventy as devDependency: `npm install --save-dev @11ty/eleventy`
- [ ] Install js-yaml: `npm install --save-dev js-yaml`
- [ ] Install marked: `npm install --save-dev marked`
- [ ] Add `node_modules/` and `_site/` to `.gitignore`
- [ ] Create `eleventy.config.js` with passthrough copies, ignores, filters and collections
- [ ] Add documentation files to Eleventy ignores list
- [ ] Create `_includes/base.njk` with nav/header/footer template
- [ ] Use `__dirname` for all file paths in collections
- [ ] Always create `_data/` subfolders in lowercase
- [ ] Verify folder names are lowercase in GitHub after creating on Windows
- [ ] Use `skip_app_build: true` in workflow with `app_location: "_site"`
- [ ] Use `startTime`/`endTime` fields (not `time`) for reliable event sorting
- [ ] Test locally with `npx eleventy --serve` before pushing

## Eleventy Watch Page — Issues and Lessons Learned

---

## Issue 18 — YouTube Thumbnail Façade Pattern

**Problem:**
Loading all YouTube iframes simultaneously on the Watch page caused slow page loads
— like opening 16 YouTube tabs at once in the browser.

**Fix:**
Use a thumbnail façade — show a static YouTube thumbnail image with a play button
overlay. Only load the actual iframe when the user clicks. JavaScript in
`assets/js/watch.js` handles the swap.

**YouTube thumbnail URL pattern:**
https://img.youtube.com/vi/[VIDEO_ID]/maxresdefault.jpg
Use `hqdefault.jpg` as fallback via onerror for older videos without maxresdefault.

**Lesson:**
Always use the façade pattern for pages with multiple video embeds.

---

## Issue 19 — YouTube ID Extraction Filter

**Problem:**
Editors paste full YouTube URLs. The embed and thumbnail both need just the video ID.

**Fix:**
A `youtubeId` filter in `eleventy.config.js` extracts the ID from any YouTube URL format:

```javascript
eleventyConfig.addFilter("youtubeId", function (url) {
    if (!url) return "";
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : "";
});
```

Handles both:
- `https://www.youtube.com/watch?v=Buz2nbdTc6s`
- `https://youtu.be/Buz2nbdTc6s`

**Lesson:**
Store full URLs in YAML for editor convenience. Extract IDs in the template.

---

## Issue 20 — Series Colours Lookup

**Problem:**
Repeating the series colour in every YAML file would be error-prone and hard to update.

**Fix:**
Store series colours once in `_data/watch/series.yaml` as a name-to-colour map.
A `seriesColours` collection builds a lookup object in `eleventy.config.js`:

```javascript
eleventyConfig.addCollection("seriesColours", function () {
    const series = yaml.load(fs.readFileSync(file, "utf8"));
    const lookup = {};
    series.forEach(s => { lookup[s.name] = s.colour; });
    return lookup;
});
```

Use in templates as: `collections.seriesColours[service.series]`

**Lesson:**
Store reference data (colours, categories) in a single YAML file.
Never repeat the same value across multiple content files.

---

## Watch Page Quick Reference Checklist

- [ ] One YAML file per service in `_data/watch/` (lowercase folder name)
- [ ] Store full YouTube URL in YAML — filter extracts ID automatically
- [ ] Series colours defined once in `_data/watch/series.yaml`
- [ ] Thumbnail façade in `assets/js/watch.js` — linked from `watch.njk`
- [ ] Watch CSS in `style.css` under section 20b
- [ ] Placeholder YAML files need filling in before go-live
- [ ] Filter out entries with no YouTube URL using `if (!service.youtube) return false`

---

## Issue 21 — Mobile Navigation: Hamburger Menu

**What was built:**
A mobile hamburger menu for the site navigation, consisting of three files working together:

- `assets/js/nav.js` — handles the toggle behaviour
- `_includes/base.njk` — adds the hamburger button element and loads the script
- `assets/css/style.css` — defines the mobile styles in section 21

**How it works:**

CSS and JavaScript play different roles — like a set of folding doors and the person who opens them. The CSS defines what the nav looks like in each state (open/closed). The JavaScript listens for taps and flips the relevant CSS classes on and off.

Three behaviours are implemented in `nav.js`:
1. Tapping the hamburger button toggles the whole nav open/closed via `.nav-open` on `#nav-list`
2. Tapping a parent link (Meetings, Prayer, Church Life) toggles its submenu via `.submenu-open`
3. Tapping any leaf link (a real destination) closes the whole nav automatically

**Key principle — JS detects mobile by checking CSS, not pixels:**

```javascript
function isMobileNav() {
    return window.getComputedStyle(hamburger).display !== "none";
}
```

This means the breakpoint is defined once in CSS only — no magic pixel numbers duplicated in JS.

---

**Problem encountered: `position: static` applying on desktop**

**Symptom:**
Submenus pushed page content down on desktop instead of floating over it. Mouse cursor landed on the wrong nav item after a submenu closed.

**Cause:**
The mobile `nav ul li ul` block (with `position: static`) was placed outside the `@media (max-width: 600px)` wrapper, so it applied to all screen sizes and overrode the `position: absolute` rule in section 4a.

**Fix:**
Ensure all mobile nav rules are inside the `@media` block, not before or after it.

**Lesson:**
Any rule that should only apply on mobile must be inside the `@media` block. A rule outside it applies everywhere regardless of screen width.

---

**Problem encountered: Inconsistent behaviour when testing with a narrowed desktop window**

**Symptom:**
Nav behaved inconsistently — some submenus stayed open, others collapsed unexpectedly. Behaviour differed between Chrome and Opera.

**Cause:**
Manually narrowing a desktop browser window to below 600px puts the browser in a "grey zone" where both the mobile CSS and desktop hover CSS are partially active simultaneously. This is not a real use case — no genuine visitor browses a desktop site in a sub-600px window.

**Fix:**
None needed. Use proper mobile emulation (F12 → phone/tablet icon in Chrome DevTools) or test on a real mobile device. Never use a narrowed desktop window as a substitute for mobile testing.

**Lesson:**
Always test mobile behaviour using Chrome DevTools device emulation (F12 → phone/tablet icon) or a real device. A narrowed desktop window is not a valid mobile test environment.

---

## Mobile Navigation Quick Reference Checklist

- [ ] Hamburger button added to `<nav>` in `base.njk` with `id="nav-hamburger"` and `aria-expanded="false"`
- [ ] `id="nav-list"` added to the main `<ul>` in `base.njk`
- [ ] `<script src="/assets/js/nav.js"></script>` added just before `</body>` in `base.njk`
- [ ] `#nav-hamburger { display: none; }` added **outside** the `@media` block in `style.css`
- [ ] All mobile nav rules inside `@media (max-width: 600px)` — never outside it
- [ ] `nav ul` has `display: none` on mobile, `display: flex` when `.nav-open` is present
- [ ] `nav ul li ul` has `display: none` on mobile, `display: flex` when `.submenu-open` is present
- [ ] Test using Chrome DevTools device emulation (F12 → phone/tablet icon), not a narrowed desktop window
- [ ] Test on a real mobile device once deployed to `test.cathcartuf.org.uk`

---

## Sveltia CMS Setup — Issues and Lessons Learned

---

## Issue 22 — Static CMS Config Can't Read Dynamic Data

**Problem:**
`admin/config.yml` is a static file read once when the CMS loads in the browser. It
cannot dynamically read data from other files at runtime — for example, reading series
names from `_data/series/series.yaml` to populate a dropdown. Any dropdown options
must be hardcoded in the config file, which means they go stale when the underlying
data changes.

**Fix:**
Convert `admin/config.yml` into an Eleventy template: rename it to `admin/config.njk`
and add front matter with a permalink pointing back to `config.yml`:

```njk
---
permalink: /admin/config.yml
eleventyExcludeFromCollections: true
---
backend:
  name: github
  ...
```

Eleventy processes the template at build time and writes the output to
`_site/admin/config.yml`. This is like a mail merge — Eleventy fills in the blanks
from live data before the CMS ever sees the file. The CMS still receives a plain
`config.yml`, but it's been generated fresh with the current series list on every build.

**Consequence:**
The `admin/` folder must be removed from `addPassthroughCopy` in `eleventy.config.js`
— otherwise Eleventy copies `config.njk` unchanged instead of processing it.

**Lesson:**
Git-based CMS config files are static by default. If any part of the config needs to
reflect live data (dropdowns, option lists), convert the config to an Eleventy template.
Remove `admin/` from passthrough copies when doing so.

---

## Issue 23 — Nunjucks Interprets CMS Slug Patterns as Template Variables

**Problem:**
Sveltia CMS uses `{{year}}-{{month}}-{{day}}-{{slug}}` as the filename slug pattern.
When `config.yml` is converted to a Nunjucks template (`config.njk`), Nunjucks
interprets these `{{ }}` blocks as template variables, tries to evaluate them, and
outputs empty strings — like a mail merge template that can't find the fields it's
looking for.

**Symptom:**
The generated `config.yml` showed `slug: "---"` instead of
`slug: "{{year}}-{{month}}-{{day}}-{{slug}}"`.

**Fix:**
Wrap each slug line in `{% raw %}` and `{% endraw %}` tags to tell Nunjucks "do not
process this — output it exactly as written":

```njk
slug: "{% raw %}{{year}}-{{month}}-{{day}}-{{slug}}{% endraw %}"
```

**Lesson:**
Any `{{ }}` syntax in a Nunjucks template that is not intended as a Nunjucks variable
must be wrapped in `{% raw %}...{% endraw %}`. This applies to any CMS slug pattern
or other framework-specific template syntax that shares Nunjucks' double-brace notation.

---

## Issue 24 — Eleventy Collection Name Clashing with Global Data

**Problem:**
Eleventy automatically exposes files in `_data/` as global data variables. A folder
called `_data/watch/` containing `series.yaml` would normally be accessible as
`watch.series` in templates. However, a custom collection named `watch` was already
defined in `eleventy.config.js`, and this overrides the global data variable of the
same name. The global data becomes inaccessible.

**Symptom:**
`{{ watch | dump }}` in `config.njk` output nothing — the `watch` variable was empty
even though `_data/watch/series.yaml` existed.

**Fix:**
Use `addGlobalData` to explicitly expose the series data under a unique name that
doesn't clash with any collection:

```javascript
eleventyConfig.addGlobalData("seriesOptions", function () {
    const fs = require("fs");
    const yaml = require("js-yaml");
    const path = require("path");
    const file = path.join(__dirname, "_data/series/series.yaml");
    if (!fs.existsSync(file)) return [];
    return yaml.load(fs.readFileSync(file, "utf8")).series || [];
});
```

Then reference it in `config.njk` as `seriesOptions`.

**Lesson:**
Never name a custom collection the same as a `_data/` subfolder. If a clash exists,
use `addGlobalData` with a unique name to expose the data explicitly. Global data
registered via `addGlobalData` is also available earlier in the build cycle than
custom collections, making it more reliable for use in templates like `config.njk`.

---

## Issue 25 — series.yaml Structure Must Have a Wrapper Key for Sveltia CMS

**Problem:**
`_data/series/series.yaml` was originally a plain array:

```yaml
- name: "Acts"
  colour: "#2563eb"
- name: "Philippians"
  colour: "#7c3aed"
```

Sveltia CMS's `files:` collection type expects the file to have a named top-level key
matching the field name defined in the config. Without it, the CMS loads the Series
collection but shows blank entries.

**Fix:**
Add a top-level `series:` wrapper key to `series.yaml`:

```yaml
series:
  - name: "Acts"
    colour: "#2563eb"
  - name: "Philippians"
    colour: "#7c3aed"
```

Update all three places in `eleventy.config.js` that read this file to extract the
nested array:

```javascript
yaml.load(fs.readFileSync(file, "utf8")).series || []
```

**Lesson:**
When using Sveltia CMS's `files:` collection type to manage a YAML file, the file
must have a top-level key matching the field name defined in `config.njk`. A plain
array at the root level will load without errors but display blank fields in the CMS.

---

## Issue 26 — Sveltia CMS Widget and Collection Type Differences from Decap CMS

**Problem:**
Sveltia CMS does not support all of Decap CMS's widget types and collection syntax
identically. Two specific differences caused errors on load.

**Difference 1 — Date widget deprecated:**
Sveltia CMS does not support `widget: date`. Use `widget: datetime` with `type: date`
instead:

```yaml
# Decap (incorrect for Sveltia):
- { name: date, widget: date, format: YYYY-MM-DD }

# Sveltia (correct):
- { name: date, widget: datetime, type: date, format: YYYY-MM-DD }
```

**Difference 2 — Single-file collections use `files:` not `file:`:**
A collection that manages a single file (like `series.yaml`) uses the `files:` key
(plural) with the file definition nested one level deeper:

```yaml
# Incorrect:
- name: series
  file: _data/series/series.yaml
  fields: [...]

# Correct:
- name: series
  files:
    - name: series
      label: Series
      file: _data/series/series.yaml
      fields: [...]
```

**Lesson:**
When migrating from Decap CMS to Sveltia CMS, check for deprecated widget types and
collection syntax differences. The Sveltia CMS documentation is the authoritative
source — do not assume identical syntax.

---

## Issue 27 — GitHub OAuth Callback URL Must Match Exactly

**Problem:**
The GitHub OAuth App was registered with a callback URL of
`https://test.cathcartuf.org.uk/api/auth/callback` (slash before `callback`).
The Azure Function was named `auth-callback` (hyphen before `callback`), producing
a URL of `https://test.cathcartuf.org.uk/api/auth-callback`. GitHub rejected the
mismatch and returned a 404 page.

**Symptom:**
After completing GitHub login, the browser landed on GitHub's own 404 page rather
than returning to the CMS.

**Fix:**
Update the Authorization callback URL in the GitHub OAuth App settings to match the
Azure Function URL exactly:
```
https://test.cathcartuf.org.uk/api/auth-callback
```

**Lesson:**
The GitHub OAuth App callback URL and the Azure Function endpoint URL must be
character-for-character identical — including hyphens vs slashes. Check both
the GitHub OAuth App settings and the function name in `api/index.js` when
debugging OAuth redirect failures.

---

## Issue 28 — Azure Environment Variable Names Must Match Code Exactly

**Problem:**
The OAuth client ID and secret were stored in Azure Static Web App environment
variables as `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`. The
initial function code used `process.env.GITHUB_CLIENT_ID` and
`process.env.GITHUB_CLIENT_SECRET` (without `_OAUTH_`). The variables resolved
to `undefined`, which was passed directly to GitHub in the OAuth redirect URL.

**Symptom:**
The GitHub OAuth redirect URL contained `client_id=undefined`, which GitHub
rejected with a 404 page immediately on clicking Login.

**Fix:**
Update the function code to use the exact variable names configured in Azure:

```javascript
const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
// ...
client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
```

**Lesson:**
Azure environment variable names are case-sensitive and must match `process.env`
references in code character for character. When OAuth produces `undefined` values,
the first thing to check is the environment variable names in both the Azure portal
and the function code.

---

## Issue 29 — series.yaml Must Live Outside _data/watch/ to Avoid CMS Contamination

**Problem:**
`series.yaml` was originally stored in `_data/watch/` alongside the individual watch
service YAML files. The Sveltia CMS Watch collection reads all YAML files in that
folder, so `series.yaml` appeared as an entry in the Watch list — like a filing
cabinet index card appearing in a search alongside all the actual files.

A `filter:` was added to `config.njk` to exclude it, but this did not work reliably
in Sveltia CMS.

**Fix:**
Move `series.yaml` to its own dedicated folder: `_data/series/series.yaml`. Update
all three path references in `eleventy.config.js` (`seriesColours`, `seriesList`,
`seriesOptions`) and the `file:` path in `admin/config.njk`.

The Watch collection then only contains actual service entries, and the `filter:`
can be removed entirely.

**Lesson:**
Reference data files (like series definitions, category lists) should never share
a folder with content files managed by the CMS. Give them their own `_data/`
subfolder. This is cleaner than using CMS filters to exclude them, and prevents
accidental deletion by editors.

---

## Sveltia CMS — Correct Final Structure

```
repo-root/
├── _data/
│   ├── events/             ← one YAML file per event
│   ├── news/               ← one YAML file per news item
│   ├── series/
│   │   └── series.yaml     ← series names and colours (managed via CMS)
│   └── watch/              ← one YAML file per service recording
├── _includes/
│   └── base.njk
├── admin/
│   ├── index.html          ← loads Sveltia CMS from CDN
│   └── config.njk          ← Eleventy template → outputs _site/admin/config.yml
├── api/
│   └── index.js            ← contact, prayer, auth, auth-callback functions
└── eleventy.config.js
```

**Key points:**
- `admin/` is NOT in `addPassthroughCopy` — Eleventy processes `config.njk` as a template
- `series.yaml` is in `_data/series/` not `_data/watch/`
- `seriesOptions` global data (not `seriesList` collection) feeds the Watch series dropdown

---

## Sveltia CMS Quick Reference Checklist

**Initial setup:**
- [ ] Replace `admin/index.html` with Sveltia CDN script tag
- [ ] Rename `admin/config.yml` → `admin/config.njk`
- [ ] Add front matter with `permalink: /admin/config.yml` and `eleventyExcludeFromCollections: true`
- [ ] Remove `admin/` from `addPassthroughCopy` in `eleventy.config.js`
- [ ] Register GitHub OAuth App with callback URL matching the Azure Function endpoint exactly
- [ ] Store OAuth credentials in Azure as environment variables; match names exactly in `process.env`
- [ ] Add `auth` and `auth-callback` functions to `api/index.js`

**Config file:**
- [ ] Use `widget: datetime` with `type: date` — not `widget: date`
- [ ] Use `files:` (plural) for single-file collections, with file definition nested inside
- [ ] Wrap CMS slug patterns in `{% raw %}...{% endraw %}` to prevent Nunjucks processing them
- [ ] Use `addGlobalData` (not `addCollection`) to expose data for use in `config.njk`
- [ ] Never name a custom collection the same as a `_data/` subfolder

**Series management:**
- [ ] `series.yaml` lives in `_data/series/` — not in `_data/watch/`
- [ ] `series.yaml` uses a top-level `series:` wrapper key (not a plain array)
- [ ] All three `eleventy.config.js` readers extract `.series` from the loaded YAML
- [ ] `seriesOptions` global data populates the Watch series dropdown in `config.njk`
- [ ] When a new series is added via CMS → site rebuilds → dropdown updates automatically

**Production cutover:**
- [ ] Update `base_url` in `config.njk` from `test.cathcartuf.org.uk` to `cathcartuf.org.uk`
- [ ] Update `redirectUri` in `auth` function to `cathcartuf.org.uk`
- [ ] Update GitHub OAuth App callback URL to match
---

## Google Calendar Integration — Issues and Lessons Learned

---

## Issue 30 — Porting PHP Google Calendar Integration to Azure Functions

**Problem:**
The existing WordPress calendar used a PHP plugin to authenticate with Google Calendar
via a Service Account and return events to FullCalendar. PHP ran server-side, so the
private key was never exposed to the browser. A static Azure site has no PHP — the
private key cannot be in the browser (anyone with DevTools could read it), so the
authentication must move to an Azure Function.

**Solution:**
Create an Azure Function called `calendar` that replicates the PHP logic in Node.js:
1. Reads credentials from an Azure environment variable
2. Signs a JWT using Node.js's built-in `crypto` module — no extra npm packages needed
3. Exchanges the JWT for a Google access token
4. Calls the Google Calendar API and returns events as JSON
5. The static page calls `/api/calendar` and passes the result to FullCalendar

Think of it like a secure window between the browser and Google — the browser asks
the function "what events are there?", the function goes to Google with the private
key, gets the answer, and passes it back. The key never crosses to the browser side.

**Credentials storage:**
The Google Service Account JSON file must never be committed to GitHub. Store the
entire JSON file contents as a single Azure Static Web App environment variable:

| Variable | Value |
|---|---|
| `GOOGLE_CALENDAR_CREDENTIALS` | Entire contents of the JSON credentials file |
| `GOOGLE_CALENDAR_ID` | The calendar ID (e.g. `cathcartuftech@gmail.com`) |

**Key function code pattern:**
```javascript
const crypto = require('crypto');
const credentials = JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS);

function base64urlEncode(input) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return buf.toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Build JWT header and claim
const header  = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim   = base64urlEncode(JSON.stringify({
    iss:   credentials.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now
}));

// Sign with private key using built-in crypto — no extra packages needed
const signer    = crypto.createSign('SHA256');
signer.update(`${header}.${claim}`);
const signature = base64urlEncode(signer.sign(credentials.private_key));
```

**Lesson:**
The PHP JWT signing logic ports directly to Node.js using the built-in `crypto`
module — no additional npm packages required. Store credentials as an Azure
environment variable, never in the repo. Always test the `/api/calendar` endpoint
directly in the browser before testing the full calendar page — a JSON array of
events confirms authentication is working before FullCalendar is involved.

---

## Issue 31 — Google Calendar API: singleEvents Required for Recurring Events

**Problem:**
The Google Calendar API `orderBy=startTime` parameter only works when
`singleEvents=true` is also set. Removing `singleEvents=true` (or setting it to
`false`) while keeping `orderBy=startTime` causes the API to return HTTP 500.

Additionally, without `singleEvents=true`, recurring events are not expanded into
individual instances. If a recurring event was created with a start date outside
your query's `timeMin`/`timeMax` range (e.g. a weekly Sunday service created in
2020 queried from 6 months ago), Google won't find any matching instances and
returns no results for that event.

Think of it like asking a library catalogue "show me all copies of this book borrowed
this year." Without expanding the catalogue to show individual loans, it only looks
at the original acquisition date — which is outside the range — and finds nothing.

**Symptom:**
- Removing `singleEvents=true` caused HTTP 500 from the Google Calendar API
- Calendar appeared to work but recurring events were missing entirely

**Fix:**
Always use `singleEvents=true` when querying with a date range. Use a `maxResults`
value large enough to cover the full date range — the WordPress version used 750,
which covers 18 months of weekly recurring events comfortably:

```javascript
`?timeMin=${timeMin}&timeMax=${timeMax}&orderBy=startTime&singleEvents=true&maxResults=750`
```

**Date range:**
Use 6 months back and 1 year forward to match the WordPress behaviour:

```javascript
const timeMin = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
```

**Lesson:**
`singleEvents=true` is required whenever querying Google Calendar with a date range
that may not include the original creation date of a recurring event. Never remove
it. The `maxResults` default of 100 is too low for a calendar with weekly recurring
events — use 750 or higher. Always verify the WordPress/original version's API
parameters before changing them.

---

## Issue 32 — Eleventy layout: vs Nunjucks {% extends %}

**Problem:**
A new page (`calendar.njk`) was created using Nunjucks block inheritance
(`{% extends %}` and `{% block content %}`). The site's `base.njk` template uses
Eleventy's layout system (`{{ content | safe }}`), not Nunjucks block inheritance.
The two systems are incompatible — like posting a letter to the wrong address
format. Nunjucks looked for `{% block %}` definitions in `base.njk`, found none,
and produced empty output. The page rendered with the site header and footer
intact but a completely blank content area.

**Symptom:**
- Header and footer rendered correctly
- Content area completely blank
- Browser Network tab showed no requests being made
- Page source showed no `<script>` or `<link>` tags in the content area

**Fix:**
Use Eleventy's `layout:` front matter instead of `{% extends %}`, and remove
`{% block %}` wrappers. The content renders directly without a wrapping `<main>`
tag (since `base.njk` already provides this via `{{ content | safe }}`):

```njk
---
title: Calendar
layout: base.njk
---
<div class="container">
    <h1>Calendar</h1>
    ...
</div>
```

Note: `layout: base.njk` not `layout: _includes/base.njk` — Eleventy automatically
looks in the `_includes/` folder specified in `eleventy.config.js`, so the path
prefix is not needed.

**Lesson:**
Check how existing pages reference their layout before creating a new page. All
pages on this site use `layout: base.njk` in front matter. Never use
`{% extends %}` unless `base.njk` has matching `{% block %}` definitions.
The `{% extends %}` approach requires both sides to agree on block names — it
is a Nunjucks feature, not an Eleventy feature.

---

## Issue 33 — seriesColours Lookup Fails Due to Folder Name Typo

**Problem:**
The `seriesColours` collection in `eleventy.config.js` reads `series.yaml` from
`_data/series/`. A typo in the folder name meant Eleventy could not find the file,
so `seriesColours` returned an empty object. The Watch page rendered all service
entries correctly but with no colour coding on the series badges or left border.

**Symptom:**
- Watch page entries displayed correctly
- All series badges and borders showed the default grey (`#6b7280`) fallback colour
- No errors in the Eleventy build output — an empty object is valid, just unhelpful

**Fix:**
Correct the folder name to `series` (lowercase). Verify by running
`npx eleventy --serve` locally and checking the Watch page.

**Lesson:**
Colour lookup failures are silent — Eleventy builds without errors because an
empty object is valid. If series colours are missing on the Watch page, check
the `_data/series/` folder name matches exactly what `eleventy.config.js` expects.
Remember that folder names are case-sensitive on Linux (GitHub Actions) but not
on Windows (local development) — always verify in the GitHub file browser after
creating or renaming folders.

---

## Google Calendar Quick Reference Checklist

**Google Cloud setup (per environment — do once for WordPress, once for Azure):**
- [ ] Create Google Cloud project at `console.cloud.google.com`
- [ ] Enable Google Calendar API under APIs & Services → Library
- [ ] Create Service Account under APIs & Services → Credentials
- [ ] Download JSON credentials file — store securely, never commit to GitHub
- [ ] Share the Google Calendar with the service account email (See all event details)
- [ ] Note the Calendar ID from Calendar Settings → Integrate calendar

**Azure setup:**
- [ ] Store full JSON credentials file contents in Azure env var `GOOGLE_CALENDAR_CREDENTIALS`
- [ ] Store calendar ID in Azure env var `GOOGLE_CALENDAR_ID`
- [ ] Add `calendar` function to `api/index.js`
- [ ] Create `calendar.njk` at repo root using `layout: base.njk`
- [ ] Test `/api/calendar` endpoint directly before testing the full page
- [ ] Confirm `singleEvents=true` and `orderBy=startTime` are both present in the API URL
- [ ] Use `maxResults=750` — default 100 is too low for weekly recurring events
- [ ] Use 6 months back / 1 year forward as the date range

**Production:**
- [ ] Create a separate Azure-specific Google service account (clean separation from WordPress)
- [ ] Update `GOOGLE_CALENDAR_CREDENTIALS` in Azure with new JSON
- [ ] Decommission WordPress service account once WordPress site is retired