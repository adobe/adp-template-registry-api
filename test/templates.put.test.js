/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { Core } = require('@adobe/aio-sdk');
const { generateAccessToken } = require('../actions/ims');
const utils = require('../actions/utils');
const { fetchUrl, updateTemplate, findTemplateById } = require('../actions/templateRegistry');
const action = require('../actions/templates/put/index');
const consoleSDK = require('@adobe/aio-lib-console');

const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => {
  return {
    Core: {
      Logger: jest.fn().mockReturnValue({ info: jest.fn(), debug: jest.fn(), error: jest.fn() })
    }
  };
});
jest.mock('@adobe/aio-lib-console');
const mockConsoleSDKInstance = {
  getProjectInstallConfig: jest.fn()
};
consoleSDK.init.mockResolvedValue(mockConsoleSDKInstance);
jest.mock('../actions/ims');
jest.mock('../actions/templateRegistry');
jest.mock('@heyputer/kv.js');

process.env = {
  TEMPLATE_REGISTRY_API_URL: 'https://template-registry-api.tbd/apis/v1'
};

beforeEach(() => {
  jest.clearAllMocks();
});

const HTTP_METHOD = 'put';
const PUT_PARAM_ID = 'templateId';
const PUT_PARAM_LINKS = 'links';
const PUT_PARAM_LINKS_GITHUB = 'github';
const TEMPLATE_ID = 'fake-template-id';
const TEMPLATE_NAME = '@adobe/app-builder-template';
const TEMPLATE_GITHUB_REPO = 'https://github.com/adobe/app-builder-template';
const DEVELOPER_CONSOLE_PROJECT = 'https://developer-stage.adobe.com/console/projects/1234';
const IMS_ACCESS_TOKEN = 'fake';
const IMS_AUTH_CODE = 'fake';
const IMS_CLIENT_SECRET = 'fake';
const IMS_CLIENT_ID = 'fake';
const IMS_SCOPES = 'openid service_sdk';
const fakeParams = {
  __ow_headers: {
    authorization: `Bearer ${IMS_ACCESS_TOKEN}`
  }
};

describe('PUT templates', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test('Missing Authorization header, should return 401', async () => {
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      error: {
        statusCode: 401,
        body: {
          errors: [
            {
              code: utils.ERR_RC_MISSING_REQUIRED_HEADER,
              message: 'The "authorization" header is not set.'
            }
          ]
        }
      }
    });
  });

  test('Missing PUT payload, should return 400', async () => {
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      __ow_method: HTTP_METHOD,
      ...fakeParams
    });
    expect(response).toEqual({
      error: {
        statusCode: 400,
        body: {
          errors: [
            {
              code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
              message: 'The "templateId" parameter is not set.'
            }
          ]
        }
      }
    });
  });

  test('Unsupported HTTP method, should return 405', async () => {
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      __ow_method: 'get',
      ...fakeParams
    });
    expect(response).toEqual({
      error: {
        statusCode: 405,
        body: {
          errors: [
            {
              code: utils.ERR_RC_HTTP_METHOD_NOT_ALLOWED,
              message: 'HTTP "get" method is unsupported.'
            }
          ]
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "PUT templates"');
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"PUT templates" executed successfully');
  });

  test('Incorrect PUT payload, should return 400', async () => {
    const nonGithubRepoLink = 'https://non-github.com/adobe/app-builder-template';
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_NAME,
      [PUT_PARAM_LINKS]: {
        [PUT_PARAM_LINKS_GITHUB]: nonGithubRepoLink
      },
      updatedBy: 'fake-user',
      ...fakeParams
    });

    const responseErrorCode = response.error.body.errors[0].code;
    const responseErrorMessage = response.error.body.errors[0].message;
    const responseStatusCode = response.error.statusCode;
    expect(responseErrorCode).toEqual(utils.ERR_RC_INCORRECT_REQUEST);
    expect(responseStatusCode).toEqual(400);
    expect(responseErrorMessage).not.toBeNull();
  });

  test('Template could not update, should return 404', async () => {
    findTemplateById.mockReturnValue({
      id: 'fake-templateId',
      name: 'fake-templateName',
      links: {
        github: TEMPLATE_GITHUB_REPO,
        consoleProject: DEVELOPER_CONSOLE_PROJECT
      },
      updatedBy: 'fake-user',
      status: 'Approved'
    });
    updateTemplate.mockReturnValue({ acknowledged: false, matchedCount: 0, modifiedCount: 0 });
    const githubRepoLink = 'https://github.com/adobe/app-builder-template';
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_ID,
      [PUT_PARAM_LINKS]: {
        [PUT_PARAM_LINKS_GITHUB]: githubRepoLink
      },
      updatedBy: 'fake-user',
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "PUT templates"');
    expect(findTemplateById).not.toHaveBeenCalledWith({}, TEMPLATE_ID);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"PUT templates" not executed successfully');
  });

  test('Template does not exist, should return 404', async () => {
    findTemplateById.mockReturnValue(null);
    updateTemplate.mockReturnValue({ matchedCount: 0 });
    const githubRepoLink = 'https://github.com/adobe/app-builder-template';
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_ID,
      [PUT_PARAM_LINKS]: {
        [PUT_PARAM_LINKS_GITHUB]: githubRepoLink
      },
      updatedBy: 'fake-user',
      apis: [
        {
          code: 'fake-code',
          credentialType: 'fake-credentialType',
          flowType: 'fake-flowType'
        }
      ],
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "PUT templates"');
    expect(findTemplateById).not.toHaveBeenCalledWith({}, TEMPLATE_ID);
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"PUT templates" executed successfully');
  });

  test('Server Error should be catch and return 500', async () => {
    findTemplateById.mockImplementationOnce(() => {
      const error = new Error('Internal Server Error');
      error.status = 500; // You can add a status property to the error object
      throw error;
    });

    updateTemplate.mockImplementationOnce(() => {
      const error = new Error('Internal Server Error');
      error.status = 500; // You can add a status property to the error object
      throw error;
    });
    const githubRepoLink = 'https://github.com/adobe/app-builder-template';
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_ID,
      [PUT_PARAM_LINKS]: {
        [PUT_PARAM_LINKS_GITHUB]: githubRepoLink
      },
      updatedBy: 'fake-user',
      ...fakeParams
    });
    expect(response).toEqual({
      error: {
        body: {
          errors: [
            {
              code: 'server_error',
              message: 'An error occurred, please try again later.'
            }
          ]
        },
        statusCode: 500
      }
    });
    updateTemplate.mockReset();
    findTemplateById.mockReset();
  });

  test('Do not allow null templateId param', async () => {
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      __ow_method: HTTP_METHOD,
      templateId: null,
      name: 'fake-template-name',
      links: {
        github: TEMPLATE_GITHUB_REPO
      },
      updatedBy: 'fake-user',
      apis: [
        {
          code: 'fake-code',
          credentialType: 'fake-credentialType',
          flowType: 'fake-flowType'
        }
      ],
      status: 'Approved',
      ...fakeParams
    });
    expect(response).toEqual({
      error: {
        statusCode: 400,
        body: {
          errors: [
            {
              code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
              message: 'The "templateId" parameter is not set.'
            }
          ]
        }
      }
    });
  });

  test('Incorrect response, should throw error', async () => {
    fetchUrl.mockReturnValue('');
    findTemplateById.mockReturnValue(null);
    updateTemplate.mockReturnValue({ matchedCount: 1 });
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_ID,
      [PUT_PARAM_LINKS]: {
        [PUT_PARAM_LINKS_GITHUB]: TEMPLATE_GITHUB_REPO
      },
      updatedBy: 'fake-user',
      apis: [
        {
          code: 'fake-code',
          credentialType: 'fake-credentialType',
          flowType: 'fake-flowType'
        }
      ],
      status: 'Approved',
      ...fakeParams
    });
    expect(response).toEqual({
      error: {
        body: {
          errors: [
            {
              code: 'server_error',
              message: 'An error occurred, please try again later.'
            }
          ]
        },
        statusCode: 500
      }
    });
  });

  test('Should overwrite existing template, Scenario 1 : when api present in the payload', async () => {
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/app-builder-template';
    const templateId = 'fake-template-id';
    const template = {
      id: templateId,
      name: templateName,
      links: {
        github: TEMPLATE_GITHUB_REPO
      },
      updatedBy: 'fake-user',
      apis: [
        {
          code: 'fake-code',
          credentialType: 'fake-credentialType',
          flowType: 'fake-flowType'
        }
      ],
      codeSamples: [
        {
          language: 'fake-language', // programming language for the code sample
          link: 'fake-link' // link to the zip file containing the code sample
        }
      ],
      status: 'Approved'
    };
    findTemplateById.mockReturnValue(template);
    updateTemplate.mockReturnValue({ matchedCount: 1 });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_ID,
      [PUT_PARAM_LINKS]: {
        [PUT_PARAM_LINKS_GITHUB]: TEMPLATE_GITHUB_REPO
      },
      updatedBy: 'fake-user',
      apis: [
        {
          code: 'fake-code',
          credentialType: 'fake-credentialType',
          flowType: 'fake-flowType'
        }
      ],
      codeSamples: [
        {
          language: 'fake-language', // programming language for the code sample
          link: 'fake-link' // link to the zip file containing the code sample
        }],
      status: 'Approved',
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateName}`
          }
        }
      }
    });
  });

  test('Should overwrite existing template, Scenario 2 : when credentials present in the payload', async () => {
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/app-builder-template';
    const templateId = 'fake-template-id';
    const template = {
      id: templateId,
      name: templateName,
      links: {
        github: TEMPLATE_GITHUB_REPO
      },
      updatedBy: 'fake-user',
      credentials: [ // Only needed for Dev Console templates
        {
          type: 'apikey', // please see below for allowed values
          flowType: 'adobeid' // please see below for allowed values
        }
      ],
      status: 'Approved',
      description: 'fake-describe',
      latestVersion: 'fake-version',
      adobeRecommended: true,
      keywords: ['fake-keywords'],
      categories: ['fake-categories'],
      extensions: [{
        extensionPointId: 'fake-extensionPointId'
      }],
      runtime: false
    };
    findTemplateById.mockReturnValue(template);
    updateTemplate.mockReturnValue({ matchedCount: 1 });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_URL,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_ID,
      [PUT_PARAM_LINKS]: {
        [PUT_PARAM_LINKS_GITHUB]: TEMPLATE_GITHUB_REPO
      },
      updatedBy: 'fake-user',
      credentials: [ // Only needed for Dev Console templates
        {
          type: 'apikey', // please see below for allowed values
          flowType: 'adobeid' // please see below for allowed values
        }
      ],
      status: 'Approved',
      description: 'fake-describe',
      latestVersion: 'fake-version',
      adobeRecommended: true,
      keywords: ['fake-keywords'],
      categories: ['fake-categories'],
      extensions: [{
        extensionPointId: 'fake-extensionPointId'
      }],
      runtime: true,
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateName}`
          }
        }
      }
    });
  });

  test('Should Updating existing template, should make call to config endpoint and udpate the template', async () => {
    mockConsoleSDKInstance.getProjectInstallConfig.mockResolvedValue({
      body: {
        credentials: [
          {
            type: 'fake-type',
            flowType: 'fake-flowType',
            apis: [
              {
                code: 'fake-code',
                productProfiles: [
                  {
                    id: 'fake-id',
                    productId: 'fake-productId',
                    name: 'fake-name'
                  }
                ]
              }
            ]
          }
        ]
      }
    });
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/app-builder-template';
    const templateId = 'fake-template-id';
    const template = {
      id: templateId,
      name: templateName,
      links: {
        consoleProject: DEVELOPER_CONSOLE_PROJECT
      },
      updatedBy: 'fake-user',
      status: 'Approved',
      credentials: [{
        type: 'fake-type',
        flowType: 'fake-flowType'
      }],
      apis: [{
        credentialType: 'fake-type',
        flowType: 'fake - flowType',
        code: 'fake-code',
        productProfiles: [
          {
            id: 'fake-id',
            productId: 'fake-productId',
            name: 'fake-name'
          }
        ]
      }]
    };
    findTemplateById.mockReturnValue(template);
    updateTemplate.mockReturnValue({ matchedCount: 1 });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_SECRET,
      IMS_AUTH_CODE,
      IMS_SCOPES,
      IMS_CLIENT_ID,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_ID,
      [PUT_PARAM_LINKS]: {
        consoleProject: DEVELOPER_CONSOLE_PROJECT
      },
      updatedBy: 'fake-user',
      status: 'Approved',
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateName}`
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "PUT templates"');
    expect(generateAccessToken).toHaveBeenCalledWith(IMS_AUTH_CODE, IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES);
    expect(findTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"PUT templates" executed successfully');
  });

  test('Should Updating existing template, but no apis present in the credential', async () => {
    mockConsoleSDKInstance.getProjectInstallConfig.mockResolvedValue({
      body: {
        credentials: [
          {
            type: 'fake-type',
            flowType: 'fake-flowType'
          }
        ]
      }
    });
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/app-builder-template';
    const templateId = 'fake-template-id';
    const template = {
      id: templateId,
      name: templateName,
      links: {
        consoleProject: DEVELOPER_CONSOLE_PROJECT
      },
      updatedBy: 'fake-user',
      status: 'Approved',
      credentials: [{
        type: 'fake-type',
        flowType: 'fake-flowType'
      }],
      apis: [{
        credentialType: 'fake-type',
        flowType: 'fake - flowType',
        code: 'fake-code',
        productProfiles: [
          {
            id: 'fake-id',
            productId: 'fake-productId',
            name: 'fake-name'
          }
        ]
      }]
    };
    findTemplateById.mockReturnValue(template);
    updateTemplate.mockReturnValue({ matchedCount: 1 });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_SECRET,
      IMS_AUTH_CODE,
      IMS_SCOPES,
      IMS_CLIENT_ID,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      TEMPLATE_REGISTRY_API_URL: process.env.TEMPLATE_REGISTRY_API_URL,
      __ow_method: HTTP_METHOD,
      [PUT_PARAM_ID]: TEMPLATE_ID,
      [PUT_PARAM_LINKS]: {
        consoleProject: DEVELOPER_CONSOLE_PROJECT
      },
      updatedBy: 'fake-user',
      status: 'Approved',
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        ...template,
        _links: {
          self: {
            href: `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateName}`
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "PUT templates"');
    expect(generateAccessToken).toHaveBeenCalledWith(IMS_AUTH_CODE, IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES);
    expect(findTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"PUT templates" executed successfully');
  });
});
