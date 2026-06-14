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
