# E2E Tests

## Requirements

1. Copy `.env.example` to `.env` in the `e2e` directory
2. Set the required variables in `.env` (see below)

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `TEMPLATE_REGISTRY_API_URL` | Yes | Base URL of the Template Registry API |
| `IMS_URL` | Yes | IMS host URL (e.g. `https://ims-na1.adobelogin.com`) |
| `IMS_CLIENT_ID` | Yes | IMS client ID — always required (used to validate the access token) |
| `ACCESS_TOKEN` | No* | Pre-generated IMS access token. If set, the IMS auth variables below are not needed. |
| `IMS_AUTH_CODE` | No* | IMS auth code — required when `ACCESS_TOKEN` is not set |
| `IMS_CLIENT_SECRET` | No* | IMS client secret — required when `ACCESS_TOKEN` is not set |
| `IMS_SCOPES` | No* | Space-separated IMS scopes — required when `ACCESS_TOKEN` is not set |

\* Either `ACCESS_TOKEN` **or** all three IMS auth variables (`IMS_AUTH_CODE`, `IMS_CLIENT_SECRET`, `IMS_SCOPES`) must be provided. The test suite will print a clear error for each missing variable and abort before any tests run.

## Run

```
npm run e2e
```

## Test overview

The tests cover:

- Template Registry API CRUD Operations (create, read, update, delete)
- Console template lifecycle
- Concurrent template operations and basic performance benchmarking
