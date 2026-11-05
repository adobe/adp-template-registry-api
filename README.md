<!--
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
-->

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) 


# Template Registry API

## OpenAPI Schema
Template Registry API follows OpenAPI 2.0 Specification.

See [Template Registry API Schema](https://opensource.adobe.com/adp-template-registry-api/) for more details on this RESTful API.

# Getting started

## Installation

```bash
$ git clone git@github.com:adobe/adp-template-registry-api.git
$ cd adp-template-registry-api
$ npm install
```

## Populate .env

Copy the root `.env.example` to a new `.env` file and fill out all the fields

## Deploy service and APIs

```bash
$ aio app deploy
$ aio runtime api create /v1 --config-file=template-registry-api.json
```

The output of the second command should provide you with the base URL for calling your service

> Note: It can take up to five minutes for the API configuration to be fully setup and ready for use

## Run Unit Tests

This repo has several types of automated tests, each backed by a CI workflow under [.github/workflows](.github/workflows):

| Test type | How to run locally | Purpose | CI workflow |
|---|---|---|---|
| **Unit tests** | `npm test` (lint + `npm run unit-tests`) | Fast, isolated tests (mocked I/O) covering business logic, request/response handling, IMS auth, and utilities. 100% coverage (statements, branches, functions, lines) of `actions/**` is enforced — the run fails below it. Gate every change before merge. | [`node.js.yml`](.github/workflows/node.js.yml) runs on every push/PR to `main`; [`daily.yml`](.github/workflows/daily.yml) reruns the full unit suite nightly (`npm install` + tests) to catch drift from upstream dependency changes. |
| **Smoke tests** | `npm run test:smoke` (requires live env vars, see [`e2e/README.md`](e2e/README.md)) | The subset of the E2E suite tagged `@smoke` in its `describe` name: a production-safe health check of the full console template create → read → list → update → delete lifecycle against the **real, deployed** API. Requests/responses are logged for traceability. | Not run in CI yet. The scheduled Smoke Tests workflow had been disabled in all environments (reason unknown), so tests are not run against Production for now. This will be revisited after observing the Stage e2e runs. |
| **End-to-end (E2E) tests** | `npm run e2e` (point at a running local or deployed instance, see [`e2e/README.md`](e2e/README.md)) | Broader black-box API tests (in [`e2e/e2e.js`](e2e/e2e.js)) covering CRUD flows, validation, error handling, and performance, run against any reachable environment. | [`deploy-api.yml`](.github/workflows/deploy-api.yml) runs the full suite against Stage after every deploy to Stage (i.e. on each merge to `main`) and posts a Slack alert on failure. |

Other workflows in this repo are operational rather than test suites: [`deploy-api.yml`](.github/workflows/deploy-api.yml) deploys the service/APIs to Stage or Production, and [`dev-mongo-keepalive.yml`](.github/workflows/dev-mongo-keepalive.yml) periodically pings the Dev MongoDB instance to keep it from being paused due to inactivity.

## Functional Testing

To functionally test the API, developers can import the Template Registry collection [template-registry-collection.json](https://github.com/adobe/adp-template-registry-api/blob/main/template-registry-collection.json) into [Insomnia](https://insomnia.rest/) (or any API tooling forked from Insomnia).

## Contributing

Contributions are welcomed! Read the [Contributing Guide](CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
