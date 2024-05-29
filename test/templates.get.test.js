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

const { Core } = require('@adobe/aio-sdk');
const action = require('../actions/templates/get/index');
const utils = require('../actions/utils');
const { findTemplateByName, getReviewIssueByTemplateName, TEMPLATE_STATUS_IN_VERIFICATION, findTemplateById } = require('../actions/templateRegistry');
const { evaluateEntitlements } = require('../actions/templateEntitlement');
jest.mock('../actions/templateEntitlement');
const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}));
jest.mock('../actions/templateRegistry');

beforeEach(() => {
  jest.clearAllMocks();
  evaluateEntitlements.mockImplementation(jest.fn().mockImplementation((templates, params, logger) => {
    return templates;
  }));
});

process.env = {
  TEMPLATE_REGISTRY_API_URL: 'https://template-registry-api.tbd/apis/v1'
};

const HTTP_METHOD = 'get';

describe('GET templates', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  /**
   * Helper function for testing the success cases.
   * @param {Function} evaluateEntitlementsMockImplementation the mock implementation to be used for {@link evaluateEntitlements}
   */
  async function successTest (evaluateEntitlementsMockImplementation) {
    const orgName = '@adobe';
    const templateName = 'app-builder-template';
    const fullTemplateName = `${orgName}/${templateName}`;
    const template = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d1',
      author: 'Adobe Inc.',
      name: fullTemplateName,
      description: 'A template for testing purposes [1.0.9]',
      latestVersion: '1.0.9',
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
      adobeRecommended: false,
      keywords: [
        'aio',
        'adobeio',
        'app',
        'templates',
        'aio-app-builder-template'
      ],
      status: 'Approved',
      links: {
        npm: 'https://www.npmjs.com/package/@adobe/app-builder-template',
        github: 'https://github.com/adobe/app-builder-template'
      },
      extensions: [
        {
          extensionPointId: 'dx/excshell/1'
        }
      ],
      categories: [
        'action',
        'ui'
      ]
    };
    findTemplateByName.mockReturnValue(template);
    evaluateEntitlements.mockImplementation(evaluateEntitlementsMockImplementation);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      orgName,
      templateName,
      __ow_method: HTTP_METHOD
    });
    const expectedResponse = {
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${fullTemplateName}`
          }
        }
      }
    };
    expect(response).toEqual(expectedResponse);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateByName).toHaveBeenCalledWith({}, fullTemplateName);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"GET templates" executed successfully');
    expect(evaluateEntitlements).toHaveBeenCalledWith([expectedResponse.body], expect.any(Object), mockLoggerInstance);
  }

  // eslint-disable-next-line jest/expect-expect
  test('Successful request, should return 200', async () => {
    await successTest(templates => templates);
    await successTest(() => undefined);
    await successTest(() => []);
  });

  test('Successful request for "InVerification" template, should return 200, and a link to the Review github issue', async () => {
    const templateName = 'app-builder-template';
    const fullTemplateName = templateName;
    const template = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d2',
      name: fullTemplateName,
      status: TEMPLATE_STATUS_IN_VERIFICATION,
      links: {
        npm: 'https://www.npmjs.com/package/@adobe/app-builder-template',
        github: 'https://github.com/adobe/app-builder-template'
      }
    };
    const reviewIssue = `https://github.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues/100`;
    findTemplateByName.mockReturnValue(template);
    getReviewIssueByTemplateName.mockReturnValue(reviewIssue);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      templateName,
      __ow_method: HTTP_METHOD
    });
    const expectedResponse = {
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${fullTemplateName}`
          },
          review: {
            href: reviewIssue,
            description: 'A link to the "Template Review Request" Github issue.'
          }
        }
      }
    };
    expect(response).toEqual(expectedResponse);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateByName).toHaveBeenCalledWith({}, fullTemplateName);
    expect(getReviewIssueByTemplateName).toHaveBeenCalledWith(fullTemplateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"GET templates" executed successfully');
    expect(evaluateEntitlements).toHaveBeenCalledWith([expectedResponse.body], expect.any(Object), mockLoggerInstance);
  });

  test('Successful request for "InVerification" template, should return 200, but no link to github Review issue', async () => {
    const templateName = 'app-builder-template';
    const fullTemplateName = templateName;
    const template = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d2',
      name: fullTemplateName,
      status: TEMPLATE_STATUS_IN_VERIFICATION,
      links: {
        npm: 'https://www.npmjs.com/package/@adobe/app-builder-template',
        github: 'https://github.com/adobe/app-builder-template'
      }
    };
    findTemplateByName.mockReturnValue(template);
    getReviewIssueByTemplateName.mockReturnValue(null);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      templateName,
      __ow_method: HTTP_METHOD
    });
    const expectedResponse = {
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${fullTemplateName}`
          }
        }
      }
    };
    expect(response).toEqual(expectedResponse);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateByName).toHaveBeenCalledWith({}, fullTemplateName);
    expect(getReviewIssueByTemplateName).toHaveBeenCalledWith(fullTemplateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"GET templates" executed successfully');
    expect(evaluateEntitlements).toHaveBeenCalledWith([expectedResponse.body], expect.any(Object), mockLoggerInstance);
  });

  test('Template does not exist, should return 404', async () => {
    const orgName = '@adobe';
    const templateName = 'app-builder-template-none';
    const fullTemplateName = `${orgName}/${templateName}`;
    findTemplateByName.mockReturnValue(null);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      orgName,
      templateName,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateByName).toHaveBeenCalledWith({}, fullTemplateName);
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"GET templates" executed successfully');
    expect(evaluateEntitlements).not.toHaveBeenCalled();
  });

  test('Org name and template name ommitted, should return 404', async () => {
    findTemplateByName.mockReturnValue(null);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(evaluateEntitlements).not.toHaveBeenCalled();
  });

  test('Unsupported HTTP method, should return 405', async () => {
    const orgName = '@adobe';
    const templateName = 'app-builder-template';
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      orgName,
      templateName,
      __ow_method: 'delete'
    });
    expect(response).toEqual({
      error: {
        statusCode: 405,
        body: {
          errors: [
            {
              code: utils.ERR_RC_HTTP_METHOD_NOT_ALLOWED,
              message: 'HTTP "delete" method is unsupported.'
            }
          ]
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateByName).not.toHaveBeenCalledWith();
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"GET templates" executed successfully');
    expect(evaluateEntitlements).not.toHaveBeenCalled();
  });

  test('Incorrect response, should return 500', async () => {
    const orgName = '@adobe';
    const templateName = 'app-builder-template';
    const fullTemplateName = `${orgName}/${templateName}`;
    const template = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d3',
      name: fullTemplateName,
      links: {
        npm: 'https://www.npmjs.com/package/@adobe/app-builder-template',
        github: 'https://github.com/adobe/app-builder-template'
      }
    };
    const expectedInputTemplate = {
      ...template,
      _links: {
        self: {
          href: 'https://template-registry-api.tbd/apis/v1/templates/@adobe/app-builder-template'
        }
      }
    };
    findTemplateByName.mockReturnValue(template);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      orgName,
      templateName,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      error: {
        statusCode: 500,
        body: {
          errors: [
            {
              code: utils.ERR_RC_SERVER_ERROR,
              message: 'Response invalid\n  at: body\n    One or more required properties missing: status'
            }
          ]
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateByName).toHaveBeenCalledWith({}, fullTemplateName);
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"GET templates" executed successfully');
    expect(mockLoggerInstance.error).toHaveBeenCalledWith(new Error('Response invalid\n  at: body\n    One or more required properties missing: status'));
    expect(evaluateEntitlements).toHaveBeenCalledWith([expectedInputTemplate], expect.any(Object), mockLoggerInstance);
  });

  test('TemplateId Scenario : Successful request, should return 200', async () => {
    const orgName = '@adobe';
    const templateName = 'app-builder-template';
    const fullTemplateName = `${orgName}/${templateName}`;
    const templateId = '56bf8211-d92d-44ef-b98b-6ee89812e1d1';
    const template = {
      id: templateId,
      author: 'Adobe Inc.',
      name: fullTemplateName,
      description: 'A template for testing purposes [1.0.9]',
      latestVersion: '1.0.9',
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
      adobeRecommended: false,
      keywords: [
        'aio',
        'adobeio',
        'app',
        'templates',
        'aio-app-builder-template'
      ],
      status: 'Approved',
      links: {
        npm: 'https://www.npmjs.com/package/@adobe/app-builder-template',
        github: 'https://github.com/adobe/app-builder-template'
      },
      extensions: [
        {
          extensionPointId: 'dx/excshell/1'
        }
      ],
      categories: [
        'action',
        'ui'
      ]
    };
    findTemplateById.mockReturnValue(template);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      templateId,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateId}`
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"GET templates" executed successfully');
  });

  test('TemplateId Scenario : Successful request for "InVerification" template, should return 200, and a link to the Review github issue', async () => {
    const templateName = 'app-builder-template';
    const fullTemplateName = templateName;
    const templateId = '56bf8211-d92d-44ef-b98b-6ee89812e1d2';
    const template = {
      id: templateId,
      name: fullTemplateName,
      status: TEMPLATE_STATUS_IN_VERIFICATION,
      links: {
        npm: 'https://www.npmjs.com/package/@adobe/app-builder-template',
        github: 'https://github.com/adobe/app-builder-template'
      }
    };
    const reviewIssue = `https://github.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues/100`;
    findTemplateById.mockReturnValue(template);
    getReviewIssueByTemplateName.mockReturnValue(reviewIssue);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      templateId,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateId}`
          },
          review: {
            href: reviewIssue,
            description: 'A link to the "Template Review Request" Github issue.'
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(getReviewIssueByTemplateName).toHaveBeenCalledWith(fullTemplateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"GET templates" executed successfully');
  });

  test('TemplateId Scenario : Successful request for "InVerification" template, should return 200, but no link to github Review issue', async () => {
    const templateName = 'app-builder-template';
    const fullTemplateName = templateName;
    const templateId = '56bf8211-d92d-44ef-b98b-6ee89812e1d2';
    const template = {
      id: templateId,
      name: fullTemplateName,
      status: TEMPLATE_STATUS_IN_VERIFICATION,
      links: {
        npm: 'https://www.npmjs.com/package/@adobe/app-builder-template',
        github: 'https://github.com/adobe/app-builder-template'
      }
    };
    findTemplateById.mockReturnValue(template);
    getReviewIssueByTemplateName.mockReturnValue(null);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      templateId,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateId}`
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(getReviewIssueByTemplateName).toHaveBeenCalledWith(fullTemplateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"GET templates" executed successfully');
  });

  test('TemplateId Scenario : Template does not exist, should return 404', async () => {
    const templateId = 'fake-template-id';
    findTemplateById.mockReturnValue(null);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      templateId,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"GET templates" executed successfully');
  });

  // eslint-disable-next-line jest/no-focused-tests
  test('TemplateId Scenario : TemplateId cannot be Null, should return 404', async () => {
    const templateId = null;
    findTemplateById.mockReturnValue(null);
    const response = await action.main({
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      templateId: null,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "GET templates"');
    expect(findTemplateById).not.toHaveBeenCalledWith({}, templateId);
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"GET templates" executed successfully');
  });
});
