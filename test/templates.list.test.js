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
const { getTemplates } = require('../actions/templateRegistry');

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
jest.mock('../actions/templateRegistry');


beforeEach(() => {
  jest.clearAllMocks();
});

process.env = {
  TEMPLATE_REGISTRY_ORG: 'adobe',
  'TEMPLATE_REGISTRY_REPOSITORY': 'aio-templates',
  TEMPLATE_REGISTRY_API_URL: 'https://template-registry-api.tbd/apis/v1'
};

const HTTP_METHOD = 'get';

describe.skip('LIST templates', () => {

  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test.only('Successful LIST request without filters, should return 200', async () => {
    const orgName = '@adobe';
    const templateName = 'app-builder-template';
    const templates = [
      {
        '_links': {
          'self': {
            'href': 'https://template-registry-api.tbd/apis/v1/templates/@author/app-builder-template-1'
          }
        },
        'adobeRecommended': false,
        'author': 'Adobe Inc.',
        'categories': [
          'action',
          'ui'
        ],
        'description': 'A template for testing purposes',
        'extensions': [
          {
            'extensionPointId': 'dx/excshell/1'
          }
        ],
        'id': 'd1dc1000-f32e-4172-a0ec-9b2f3ef6ac47',
        'keywords': [
          'aio',
          'adobeio',
          'app',
          'templates',
          'aio-app-builder-template'
        ],
        'latestVersion': '1.0.0',
        'links': {
          'github': 'https://github.com/author/app-builder-template-1',
          'npm': 'https://www.npmjs.com/package/@author/app-builder-template-1'
        },
        'name': '@author/app-builder-template-1',
        'publishDate': '2022-05-01T03:50:39.658Z',
        'apis': [
          {
            'code': 'AnalyticsSDK',
            'credentials': 'OAuth'
          },
          {
            'code': 'CampaignStandard'
          },
          {
            'code': 'Runtime'
          },
          {
            'code': 'Events',
            'hooks': [
              {
                'postdeploy': 'some command'
              }
            ]
          },
          {
            'code': 'Mesh',
            'endpoints': [
              {
                'my-action': 'https://some-action.com/action'
              }
            ]
          }
        ],
        'status': 'Approved',
        'runtime': true
      },
      {
        '_links': {
          'self': {
            'href': 'https://template-registry-api.tbd/apis/v1/templates/@author/app-builder-template-2'
          }
        },
        'adobeRecommended': true,
        'author': 'Adobe Inc.',
        'categories': [
          'events'
        ],
        'description': 'A template for testing purposes',
        'extensions': [
          {
            'extensionPointId': 'dx/asset-compute/worker/1'
          }
        ],
        'id': 'd1dc1000-f32e-4172-a0ec-9b2f3ef6cc48',
        'keywords': [
          'aio',
          'adobeio',
          'app',
          'templates',
          'aio-app-builder-template'
        ],
        'latestVersion': '1.0.1',
        'links': {
          'github': 'https://github.com/author/app-builder-template-2',
          'npm': 'https://www.npmjs.com/package/@author/app-builder-template-2'
        },
        'name': '@author/app-builder-template-2',
        'publishDate': '2022-05-01T03:50:39.658Z',
        'apis': [
          {
            'code': 'Events',
            'hooks': [
              {
                'postdeploy': 'some command'
              }
            ]
          },
          {
            'code': 'Mesh',
            'endpoints': [
              {
                'my-action': 'https://some-action.com/action'
              }
            ]
          }
        ],
        'status': 'Approved',
        'runtime': true,
        'event': {}
      },
      {
        '_links': {
          'self': {
            'href': 'https://template-registry-api.tbd/apis/v1/templates/@author/app-builder-template-3'
          }
        },
        'adobeRecommended': true,
        'author': 'Adobe Inc.',
        'categories': [
          'ui'
        ],
        'description': 'A template for testing purposes',
        'id': 'd1dc1000-f32e-4172-a0ec-9b2f3ef6ac48',
        'keywords': [
          'aio',
          'adobeio',
          'app',
          'templates',
          'aio-app-builder-template'
        ],
        'latestVersion': '1.0.1',
        'links': {
          'github': 'https://github.com/author/app-builder-template-3',
          'npm': 'https://www.npmjs.com/package/@author/app-builder-template-3'
        },
        'name': '@author/app-builder-template-3',
        'publishDate': '2022-05-01T03:50:39.658Z',
        'apis': [
          {
            'code': 'CampaignStandard'
          }
        ],
        'status': 'Approved',
        'runtime': false
      },
      {
        '_links': {
          'review': {
            'description': 'A link to the "Template Review Request" Github issue.',
            'href': 'https://github.com/adobe/aio-template-submission/issues/4'
          },
          'self': {
            'href': 'https://template-registry-api.tbd/apis/v1/templates/@author/app-builder-template-4'
          }
        },
        'id': 'd1dc1000-f32e-4172-a0ec-9b2f4ef6cc48',
        'name': '@author/app-builder-template-4',
        'status': 'InVerification',
        'links': {
          'npm': 'https://www.npmjs.com/package/@author/app-builder-template-4',
          'github': 'https://github.com/author/app-builder-template-4'
        }
      },
      {
        '_links': {
          'review': {
            'description': 'A link to the "Template Review Request" Github issue.',
            'href': 'https://github.com/adobe/aio-template-submission/issues/5'
          },
          'self': {
            'href': 'https://template-registry-api.tbd/apis/v1/templates/@author/app-builder-template-5'
          }
        },
        'id': 'd1dc1000-f32e-4172-a0ac-9b2f3ef6ac48',
        'name': '@author/app-builder-template-5',
        'status': 'Rejected',
        'links': {
          'npm': 'https://www.npmjs.com/package/@author/app-builder-template-5',
          'github': 'https://github.com/author/app-builder-template-5'
        }
      },
      {
        '_links': {
          'self': {
            'href': 'https://template-registry-api.tbd/apis/v1/templates/@author/app-builder-template-6'
          }
        },
        'adobeRecommended': false,
        'author': 'Adobe Inc.',
        'categories': [
          'ui',
          'helper-template'
        ],
        'description': 'A template for testing purposes',
        'id': 'd1nc1000-f32e-4472-a3ec-9b2f3ef6ac48',
        'keywords': [
          'aio',
          'adobeio',
          'app',
          'templates',
          'aio-app-builder-template'
        ],
        'latestVersion': '1.0.1',
        'links': {
          'npm': 'https://www.npmjs.com/package/@author/app-builder-template-6',
          'github': 'https://github.com/author/app-builder-template-6'
        },
        'name': '@author/app-builder-template-6',
        'publishDate': '2022-06-11T04:50:39.658Z',
        'extensions': [
          {
            'extensionPointId': 'dx/asset-compute/worker/1'
          }
        ],
        'status': 'Approved',
        'runtime': true
      }];
    getTemplates.mockReturnValue(templates);

    const response = await action.main(
      {
        'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
        'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
        'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
        'orgName': orgName,
        'templateName': templateName,
        '__ow_method': HTTP_METHOD
      }
    );

    // expect(response).toEqual(require(__dirname + '/fixtures/list/response.full.json'));
    expect(response).toEqual({});
    expect(getTemplates).toHaveBeenCalledTimes(1);
    expect(getTemplates).toHaveBeenCalledWith({});
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
