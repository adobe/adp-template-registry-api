# E2E Tests

## Requirements

1. Copy `.env.example` to `.env` in the `e2e` directory
2. Set the required variables in `.env` (see below)

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `TEMPLATE_REGISTRY_API_URL` | Yes | Base URL of the Template Registry API |
| `IMS_URL` | Yes | IMS host URL (e.g. `https://ims-na1.adobelogin.com`) |
| `E2E_TARGET` | No | Target mode: unset or `stage` uses stage IMS for token generation; `prod` uses production IMS; `local` targets a local API and uses stage IMS. |
| `IMS_CLIENT_ID` | Yes | IMS client ID — always required (used to validate the access token) |
| `ACCESS_TOKEN` | No* | Pre-generated IMS access token. If set, the IMS auth variables below are not needed. |
| `IMS_AUTH_CODE` | No* | IMS auth code — required when `ACCESS_TOKEN` is not set |
| `IMS_CLIENT_SECRET` | No* | IMS client secret — required when `ACCESS_TOKEN` is not set |
| `IMS_SCOPES` | No* | Space-separated IMS scopes — required when `ACCESS_TOKEN` is not set |
| `E2E_LOCAL_URL` | No | Base URL of the local server when `E2E_TARGET=local` (default `https://localhost:9080/api/v1/web/template-registry-api`) |
| `E2E_ORG_NAME_ROUTES` | No | Set to `true` to run the `GET`/`DELETE /templates/{orgName}/{templateName}` tests against a deployed API. They always run with `E2E_TARGET=local`. The deployed gateway does not currently route these paths. |
| `E2E_INSTALL_ORG_ID` | No† | Developer Console org ID to install a template into |
| `E2E_INSTALL_ACCESS_TOKEN` | No† | IMS **user** access token with permission to create projects in `E2E_INSTALL_ORG_ID` (Console rejects service tokens) |
| `E2E_INSTALL_API_CODE` | No† | API (SDK) code the org is entitled to, e.g. one usable with an OAuth server-to-server credential |

\* Either `ACCESS_TOKEN` **or** all three IMS auth variables (`IMS_AUTH_CODE`, `IMS_CLIENT_SECRET`, `IMS_SCOPES`) must be provided. The test suite will print a clear error for each missing variable and abort before any tests run.

† Opt-in. The successful `POST /install/{templateId}` test runs only when all three `E2E_INSTALL_*` variables are set. It creates a real Developer Console project and deletes it afterwards. The install error-path tests always run.

## Run

```
npm run e2e
```
By default the suite targets the deployed API (`TEMPLATE_REGISTRY_API_URL`) and uses stage IMS for token generation. Use `E2E_TARGET=prod` to use production IMS, or `E2E_TARGET=local` to run against a local server.
### Smoke subset

Tests whose `describe` name contains `@smoke` form the smoke suite. They must stay production-safe, because they are intended to run against Production. Run only them with:

```
npm run test:smoke
```

`test:smoke` accepts the same environment variables as `npm run e2e`. In CI, the `e2e-tests` job in [deploy-api.yml](../.github/workflows/deploy-api.yml) runs the full suite after each deploy to **Stage**, and posts a Slack alert (`SLACK_WEBHOOK` secret) when the tests fail.

> **Note:** No tests currently run against Production. The scheduled Smoke Tests workflow had been disabled in all environments (reason unknown), so tests are not run against Production yet. After observing the Stage runs for a while, we plan to add Production (e.g. the `@smoke` subset) to the post-deploy job.

## Logging

Every upstream call made during a run is logged with its details and response:

- **HTTP calls through the global `fetch`** (all Template Registry API calls, and IMS token validation from `actions/ims.js`): method, URL, request headers and body, then status, response headers and duration.
- **Library calls with their own HTTP client** (IMS `getAccessToken`, Developer Console `deleteProject`): call parameters, then the outcome (e.g. HTTP status) or error and duration.

Response bodies are never logged. Tokens, client secrets, auth codes and `Authorization` header values are masked as `<redacted>`.

## Test overview

The tests cover:

| Endpoint | Covered |
|---|---|
| `POST /templates` | create, 409 duplicate name, 400 missing name, 401 missing/invalid token |
| `GET /templates` | unfiltered, `names`, `statuses` (incl. `!` negation), `apis`, `adobeRecommended`, `orderBy`, console-template visibility for unauthenticated callers, 400 invalid filter, 401 invalid token |
| `GET /templates/{templateId}` | read with and without token, 404, 400 invalid id |
| `PUT /templates/{templateId}` | update, 404, 400 invalid id, 401 missing token |
| `DELETE /templates/{templateId}` | delete, 404, 400 invalid id, 401 missing token |
| `GET`/`DELETE /templates/{orgName}/{templateName}` | read, delete, 404 (local target or `E2E_ORG_NAME_ROUTES=true` only) |
| `POST /install/{templateId}` | 401, 400 invalid body, 400 invalid id, 404; successful install is opt-in (see †) |

The console template lifecycle (`@smoke`) and concurrency/performance checks are also included.
