# Running the service locally

Run the Template Registry API on your machine with `aio app dev` and point the
E2E suite at it, so you can iterate on changes without deploying.

Locally the service runs against the **stage MongoDB** (if required then you can create a local DB and point service to it using MONGODB_URI), and
the E2E suite talks to the local dev server instead of the deployed API Gateway.

## Prerequisites

- Node.js (see `.nvmrc`/`package.json` for the version) and `npm install` run once.
- [Adobe I/O CLI](https://developer.adobe.com/app-builder/docs/guides/runtime_guides/tools/cli-install/) (`aio`) installed and authenticated (`aio login`), with the App Builder app configured for this repo.

## Stage secrets

The local setup needs stage values for MongoDB, IMS, and a few registry settings.
Ask a team member for access to the internal secrets store for this service if
you don't already have it.

## 1. Configure the root `.env`

`aio app dev` reads the **root** `.env` (not `e2e/.env`). Copy `.env.example` to
`.env` and fill in these values for local dev:

| Variable | Value for local dev |
|---|---|
| `MONGODB_URI` | stage cluster URI (from the secrets store), local dev uses the stage DB |
| `MONGODB_NAME` | stage DB name (from the secrets store), e.g. the stage cluster's database |
| `IMS_URL` | stage IMS host|
| `IMS_CLIENT_ID` / `IMS_CLIENT_SECRET` / `IMS_AUTH_CODE` / `IMS_SCOPES` | stage IMS creds (from the secrets store), used to validate tokens |
| `TEMPLATE_REGISTRY_ORG` / `TEMPLATE_REGISTRY_REPOSITORY` / `TEMPLATE_REGISTRY_API_URL` | stage values (from the secrets store) |

## 2. Create the dev-only OpenAPI spec symlinks

The actions load the OpenAPI spec with `Enforcer('./template-registry-api.json')`.
On deploy the `include:` directive bundles that file next to each action, but
`aio app dev` does not — so the spec must be resolvable from each action folder.
Create gitignored symlinks (one-time):

```bash
for d in list get post put delete install; do
  ln -sf ../../../template-registry-api.json "actions/templates/$d/template-registry-api.json"
done
```

These are ignored by `.gitignore` (`actions/templates/*/template-registry-api.json`)
and must not be committed. On deploy, `include:` handles the real bundling.

## 3. Start the local dev server

```bash
aio app dev
```

It serves the actions over HTTPS at `https://localhost:9080` (with a self-signed
dev cert) and exposes each action as a raw web action, e.g.
`https://localhost:9080/api/v1/web/template-registry-api/templates-list`.

## 4. Run the E2E suite against local

In a second terminal:

```bash
E2E_TARGET=local npm run e2e
```

That single flag switches the suite to local mode. See [`e2e/README.md`](../e2e/README.md) for the E2E env vars (`e2e/.env`)

### What `E2E_TARGET=local` does

- **Routes to raw web actions.** The deployed API Gateway maps REST paths
  (`GET /templates`, `GET /templates/{id}`) to actions; `aio app dev` has no
  gateway, so the suite calls `templates-list`, `templates-get`, etc. and passes
  `templateId` as a query param.
- **Trusts the dev cert.** A dedicated undici dispatcher trusts the self-signed
  cert for these requests only (real environments keep full TLS verification).
- **Skips the performance/concurrency tests.** `aio app dev` is a single-process
  dev server that mutates global `process.env`/`cwd` per request, so it cannot
  serve concurrent load (requests fail with `400`/`ECONNRESET`, and the server
  can crash). Those tests run only against the deployed environment.

### Optional overrides

| Variable | Purpose |
|---|---|
| `E2E_LOCAL_URL` | Override the dev server base URL (default `https://localhost:9080/api/v1/web/template-registry-api`). |
