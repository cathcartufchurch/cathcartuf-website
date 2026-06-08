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
field using the standard email format `Name <email@domain.com>`.

**Symptom:**
```
Request body validation error. See property 'senderAddress'
```

**Fix:**
Use the plain email address only:

```javascript
senderAddress: "donotreply@953990c2-e815-4ff0-b9d1-45cfc48b94ba.azurecomm.net"
```

**Lesson:**
Azure Communication Services `senderAddress` must be a plain email address with
no display name formatting.

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
- [ ] Store secrets as Azure Static Web App environment variables, never in code
- [ ] Test with a Hello World response before adding email logic
- [ ] During debugging, return status 200 from catch blocks to surface errors
- [ ] Restore status 500 for error responses before going to production
- [ ] No `function.json` files — v4 doesn't use them
