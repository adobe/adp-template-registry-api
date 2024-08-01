/*
Copyright 2022 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
const path = require('node:path');
const { Core } = require('@adobe/aio-sdk');
const action = require('../actions/templates/list/index');
const utils = require('../actions/utils');
const nock = require('nock');
const { getTemplates, getReviewIssueByTemplateName } = require('../actions/templateRegistry');
const { validateAccessToken, isValidServiceToken } = require('../actions/ims');

process.env = {
  TEMPLATE_REGISTRY_ORG: 'adobe',
  TEMPLATE_REGISTRY_REPOSITORY: 'aio-templates',
  TEMPLATE_REGISTRY_API_URL: 'https://template-registry-api.tbd/apis/v1'
};

const reviewIssue = `https://github.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues/100`;

const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };

Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}));
jest.mock('@adobe/aio-metrics-client');
jest.mock('../actions/templateRegistry', () => {
  const originalModule = jest.requireActual('../actions/templateRegistry');
  return {
    ...originalModule,
    getReviewIssueByTemplateName: jest.fn(),
    getTemplates: jest.fn()
  };
});
jest.mock('../actions/ims');

beforeEach(() => {
  jest.clearAllMocks();
  getReviewIssueByTemplateName.mockReturnValue(reviewIssue);
});

const orgName = '@adobe';
const templateName = 'app-builder-template';
const HTTP_METHOD = 'get';
const templates = [{
  _links: {
    self: {
      href: 'https://template-registry-api.tbd/apis/v1/templates/@author/app-builder-template-1'
    }
  },
  adobeRecommended: false,
  author: 'Adobe Inc.',
  categories: [
    'action',
    'ui'
  ],
  description: 'A template for testing purposes',
  extensions: [
    {
      extensionPointId: 'dx/excshell/1'
    }
  ],
  id: 'd1dc1000-f32e-4172-a0ec-9b2f3ef6ac47',
  keywords: [
    'aio',
    'adobeio',
    'app',
    'templates',
    'aio-app-builder-template'
  ],
  latestVersion: '1.0.0',
  links: {
    github: 'https://github.com/author/app-builder-template-1',
    npm: 'https://www.npmjs.com/package/@author/app-builder-template-1'
  },
  name: '@author/app-builder-template-1',
  publishDate: '2022-05-01T03:50:39.658Z',
  apis: [
    {
      code: 'AnalyticsSDK',
      credentials: 'OAuth'
    },
    {
      code: 'CampaignStandard'
    },
    {
      code: 'Runtime'
    },
    {
      code: 'Events',
      hooks: [
        {
          postdeploy: 'some command'
        }
      ]
    },
    {
      code: 'Mesh',
      endpoints: [
        {
          'my-action': 'https://some-action.com/action'
        }
      ]
    }
  ],
  status: 'Approved',
  runtime: true
}];

describe('LIST templates', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test('Successful LIST request without filters, should return 200', async () => {
    getTemplates.mockReturnValue(templates);
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD
      }
    );

    expect(response).toEqual({
      statusCode: 200,
      body: {
        _links: {
          self: {
            href: 'https://template-registry-api.tbd/apis/v1/templates'
          }
        },
        items: templates
      }
    });
    expect(getTemplates).toHaveBeenCalledTimes(1);
    expect(getTemplates).toHaveBeenCalledWith({});
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful simple filtering by one field, should return 200', async () => {
    getTemplates.mockReturnValue(templates);
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        categories: 'action,ui',
        orgName,
        templateName,
        __ow_method: HTTP_METHOD
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.simple-filter.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful simple filtering by one field with value exclusion, should return 200', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        categories: 'ui,!helper-template',
        orgName,
        templateName,
        __ow_method: HTTP_METHOD
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.simple-filter.exclusion-filter.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful simple filtering by one field value exclusion only, should return 200', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD,
        categories: '!helper-template'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.exclusion-filter.only.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful complex filtering by multiple fields, should return 200', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD,
        categories: '|events,ui,action',
        adobeRecommended: 'true',
        apis: 'Events',
        names: '@author/app-builder-template-2'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.complex-filter.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful complex filtering by multiple fields with value exclusion, should return 200', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD,
        categories: '!events,ui,action',
        adobeRecommended: 'true',
        apis: 'Events',
        names: '@author/app-builder-template-2'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.complex-filter.exclusion-filter.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('No templates matching filters, should return 200', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD,
        categories: 'events,ui,action',
        adobeRecommended: 'true',
        apis: 'CampaignStandard',
        names: '@author/app-builder-template-2'
      }
    );
    expect(response).toEqual({
      statusCode: 200,
      body: {
        _links: {
          self: {
            href: 'https://template-registry-api.tbd/apis/v1/templates?names=@author/app-builder-template-2&categories=events,ui,action&apis=CampaignStandard&adobeRecommended=true'
          }
        },
        items: []
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful sorting by names in ascending order (Default), should return 200', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD,
        orderBy: 'names'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.orderBy.names.asc.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful sorting by names in descending order, should return 200', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD,
        orderBy: 'names desc'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.orderBy.names.desc.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful sorting by multiple properties, should return 200', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry2.json')));

    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, path.join(__dirname, '/fixtures/list/registry2.json'));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        orderBy: 'statuses, adobeRecommended, publishDate desc'
      }
    );
    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.orderBy.multiple.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Unsupported HTTP method, should return 405', async () => {
    const response = await action.main({
      __ow_method: 'post'
    });
    expect(response).toEqual({
      error: {
        statusCode: 405,
        body: {
          errors: [
            {
              code: utils.ERR_RC_HTTP_METHOD_NOT_ALLOWED,
              message: 'HTTP "post" method is unsupported.'
            }
          ]
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Filtering by "*", should return templates that have a query param property set', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD,
        extensions: '*'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.filter-value-any.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Empty filters (?extensions=), should return templates that do not have a query param property set', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD,
        extensions: ''
      }
    );
    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.filter-value-none-extensions.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Empty filters (?runtime=), should return templates that do not have a query param property set', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        runtime: ''
      }
    );
    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.filter-value-none-runtime.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Support of the "events" filtering that only supports empty and any filters for now', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        events: '*'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.filter-value-any-events.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Support of the "events" filtering, not empty or any filters', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        events: 'test'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.filter-value-test-events.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Openapi schema validation fails on empty names param', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        names: ''
      }
    );

    expect(response).toEqual({
      error: {
        statusCode: 400,
        body: {
          errors: [
            {
              code: utils.ERR_RC_INCORRECT_REQUEST,
              message: 'Request has one or more errors => In query parameters => at: names => Unable to parse value => Empty value not allowed'
            }
          ]
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
  });

  test('Openapi schema response validation fails on bad response', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry-bad-response.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get'
      }
    );

    expect(response).toEqual({
      error: {
        statusCode: 500,
        body: {
          errors: [
            {
              code: utils.ERR_RC_SERVER_ERROR,
              message: 'An error occurred, please try again later.'
            }
          ]
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
  });

  test('Using the not operator with non-array field', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        statuses: '!Approved'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.not-approved.json')));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
  });

  test('Get review issues but no issue exists', async () => {
    getReviewIssueByTemplateName.mockReturnValue(null);

    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry.json')));
    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        orgName,
        templateName,
        __ow_method: HTTP_METHOD
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.full.no-review-issues.json')));
  });

  test('Should throw an error on invalid access token', async () => {
    const err = 'Provided IMS access token is invalid. Reason: bad_signature';
    validateAccessToken.mockImplementation(() => {
      throw new Error(err);
    });

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        __ow_headers: {
          authorization: 'Bearer dummy-token'
        }
      }
    );

    expect(response).toEqual(
      {
        error: {
          statusCode: 401,
          body: {
            errors: [
              {
                code: utils.ERR_RC_INVALID_IMS_ACCESS_TOKEN,
                message: err
              }
            ]
          }
        }
      }
    );
  });

  test('Should only return app builder templates with no token', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry-with-dev-console.json')));
    validateAccessToken.mockImplementation(() => true);
    isValidServiceToken.mockImplementation(() => false);

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get'
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.only-app-builder-templates.json')));
  });

  test('Should only return app builder templates with user token', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry-with-dev-console.json')));
    validateAccessToken.mockImplementation(() => true);
    isValidServiceToken.mockImplementation(() => false);

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        __ow_headers: {
          authorization: 'Bearer dummy-token'
        }
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.only-app-builder-templates.json')));
  });

  test('Should return console templates when service token present', async () => {
    getTemplates.mockReturnValue(require(path.join(__dirname, '/fixtures/list/registry-with-dev-console.json')));
    validateAccessToken.mockImplementation(() => true);
    isValidServiceToken.mockImplementation(() => true);

    const response = await action.main(
      {
        TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
        TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
        TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
        __ow_method: 'get',
        __ow_headers: {
          authorization: 'Bearer dummy-token'
        }
      }
    );

    expect(response).toEqual(require(path.join(__dirname, '/fixtures/list/response.with-dev-console-templates.json')));
  });
});
