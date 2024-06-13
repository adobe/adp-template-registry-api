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

`npm test`

## Functional Testing

To functionally test the API, developers can import the Template Registry collection [template-registry-collection.json](https://github.com/adobe/adp-template-registry-api/blob/main/template-registry-api.json) into [Insomnia](https://insomnia.rest/) (or any API tooling forked from Insomnia).

## Contributing

Contributions are welcomed! Read the [Contributing Guide](CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
