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

const { expect, describe, test, beforeEach } = require('@jest/globals');
const { Core } = require('@adobe/aio-sdk');
const action = require('../actions/templates/list/index');
const utils = require('../actions/utils');
const nock = require('nock');

process.env = {
  TEMPLATE_REGISTRY_API_URL: 'https://template-registry-api.tbd/apis/v1'
};

const mockLoggerInstance = { 'info': jest.fn(), 'debug': jest.fn(), 'error': jest.fn() };

Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => ({
  'Core': {
    'Logger': jest.fn()
  }
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LIST templates', () => {

  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test('Successful LIST request without filters, should return 200', async () => {
    nock('https://api.github.com/repos')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues?state=open&labels=add-template&sort=updated-desc`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/response.github.issues.json');

    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.full.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful simple filtering by one field, should return 200', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'categories': 'action,ui'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.simple-filter.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful simple filtering by one field with value exclusion, should return 200', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'categories': 'ui,!helper-template'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.simple-filter.exclusion-filter.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful simple filtering by one field value exclusion only, should return 200', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'categories': '!helper-template'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.exclusion-filter.only.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful complex filtering by multiple fields, should return 200', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'categories': '|events,ui,action',
        'adobeRecommended': 'true',
        'apis': 'Events',
        'names': '@author/app-builder-template-2'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.complex-filter.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful complex filtering by multiple fields with value exclusion, should return 200', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'categories': '!events,ui,action',
        'adobeRecommended': 'true',
        'apis': 'Events',
        'names': '@author/app-builder-template-2'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.complex-filter.exclusion-filter.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('No templates matching filters, should return 200', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'categories': 'events,ui,action',
        'adobeRecommended': 'true',
        'apis': 'CampaignStandard',
        'names': '@author/app-builder-template-2'
      }
    );
    expect(response).toEqual({
      'statusCode': 200,
      'body': {
        '_links': {
          'self': {
            'href': 'https://template-registry-api.tbd/apis/v1/templates?names=@author/app-builder-template-2&categories=events,ui,action&apis=CampaignStandard&adobeRecommended=true'
          }
        },
        'items': []
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful sorting by names in descending order, should return 200', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'orderBy': 'names desc'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.orderBy.names.desc.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Successful sorting by multiple properties, should return 200', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry2.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'orderBy': 'statuses, adobeRecommended, publishDate desc'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.orderBy.multiple.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Unsupported HTTP method, should return 405', async () => {
    const response = await action.main({
      '__ow_method': 'post'
    });
    expect(response).toEqual({
      'error': {
        'statusCode': 405,
        'body': {
          'errors': [
            {
              'code': utils.ERR_RC_HTTP_METHOD_NOT_ALLOWED,
              'message': 'HTTP "post" method is unsupported.'
            }
          ]
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Filtering by "*", should return templates that have a query param property set', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'extensions': '*'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.filter-value-any.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Empty filters (?extensions=), should return templates that do not have a query param property set', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'extensions': ''
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.filter-value-none-extensions.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Empty filters (?runtime=), should return templates that do not have a query param property set', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'runtime': ''
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.filter-value-none-runtime.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });

  test('Support of the "events" filtering that only supports empty and any filters for now', async () => {
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .replyWithFile(200, __dirname + '/fixtures/list/registry.json');

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        '__ow_method': 'get',
        'events': '*'
      }
    );

    expect(response).toEqual(require(__dirname + '/fixtures/list/response.filter-value-any-events.json'));
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "LIST templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"LIST templates" executed successfully');
  });
});
