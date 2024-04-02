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
const { validateAccessToken, generateAccessToken } = require('../actions/ims');
const { ObjectId } = require('mongodb');
const utils = require('../actions/utils');
const { fetchUrl, findTemplateByName, addTemplate } = require('../actions/templateRegistry');
const action = require('../actions/templates/post/index');
const consoleSDK = require('@adobe/aio-lib-console');

const mockLoggerInstance = { 'info': jest.fn(), 'debug': jest.fn(), 'error': jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => ({
  'Core': {
    'Logger': jest.fn()
  }
}));
jest.mock('@adobe/aio-lib-console');
const mockConsoleSDKInstance = {
  getProjectInstallConfig: jest.fn()
};
consoleSDK.init.mockResolvedValue(mockConsoleSDKInstance);
jest.mock('../actions/ims');
jest.mock('../actions/templateRegistry');

process.env = {
  TEMPLATE_REGISTRY_API_URL: 'https://template-registry-api.tbd/apis/v1'
};

beforeEach(() => {
  jest.clearAllMocks();
  validateAccessToken.mockReset();
});

const HTTP_METHOD = 'post';
const POST_PARAM_NAME = 'name';
const POST_PARAM_LINKS = 'links';
const POST_PARAM_LINKS_GITHUB = 'github';
const TEMPLATE_NAME = '@adobe/app-builder-template';
const TEMPLATE_GITHUB_REPO = 'https://github.com/adobe/app-builder-template';
const DEVELOPER_CONSOLE_PROJECT = 'https://developer-stage.adobe.com/console/projects/1234';
const DEVELOPER_CONSOLE_TEMPLATE_NAME = '@adobe/developer-console-template';
const IMS_ACCESS_TOKEN = 'fake';
const IMS_AUTH_CODE = 'fake';
const IMS_CLIENT_SECRET = 'fake';
const IMS_CLIENT_ID = 'fake';
const IMS_SCOPES = 'openid service_sdk';
const fakeParams = {
  '__ow_headers': {
    'authorization': `Bearer ${IMS_ACCESS_TOKEN}`
  }
};

describe('POST templates', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test('Missing Authorization header, should return 401', async () => {
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': process.env.IMS_URL,
      '__ow_method': HTTP_METHOD
    });
    expect(response).toEqual({
      'error': {
        'statusCode': 401,
        'body': {
          'errors': [
            {
              'code': utils.ERR_RC_MISSING_REQUIRED_HEADER,
              'message': 'The "authorization" header is not set.'
            }
          ]
        }
      }
    });
    expect(validateAccessToken).not.toHaveBeenCalled();
  });

  test('Missing POST payload, should return 400', async () => {
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': process.env.IMS_URL,
      '__ow_method': HTTP_METHOD,
      ...fakeParams
    });
    expect(response).toEqual({
      'error': {
        'statusCode': 400,
        'body': {
          'errors': [
            {
              'code': utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
              'message': 'The "name" parameter is not set.'
            }
          ]
        }
      }
    });
    expect(validateAccessToken).not.toHaveBeenCalled();
  });

  test('Invalid token, should return 401', async () => {
    const err = 'Provided IMS access token is invalid. Reason: bad_signature';
    validateAccessToken.mockImplementation(() => {
      throw new Error(err);
    });

    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': process.env.IMS_URL,
      '__ow_method': HTTP_METHOD,
      [POST_PARAM_NAME]: TEMPLATE_NAME,
      [POST_PARAM_LINKS]: {
        [POST_PARAM_LINKS_GITHUB]: TEMPLATE_GITHUB_REPO
      },
      ...fakeParams
    });
    expect(response).toEqual({
      'error': {
        'statusCode': 401,
        'body': { 'errors': [utils.errorMessage(utils.ERR_RC_INVALID_IMS_ACCESS_TOKEN, err)] }
      }
    });
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_URL);
  });

  test('Unsupported HTTP method, should return 400', async () => {
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': process.env.IMS_URL,
      '__ow_method': 'get',
      ...fakeParams
    });
    expect(response).toEqual({
      'error': {
        'statusCode': 405,
        'body': {
          'errors': [
            {
              'code': utils.ERR_RC_HTTP_METHOD_NOT_ALLOWED,
              'message': 'HTTP "get" method is unsupported.'
            }
          ]
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "POST templates"');
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"POST templates" executed successfully');
  });

  test('Incorrect POST payload, should return 400', async () => {
    const nonGithubRepoLink = 'https://non-github.com/adobe/app-builder-template';
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': process.env.IMS_URL,
      'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
      'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
      'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
      '__ow_method': HTTP_METHOD,
      [POST_PARAM_NAME]: TEMPLATE_NAME,
      [POST_PARAM_LINKS]: {
        [POST_PARAM_LINKS_GITHUB]: nonGithubRepoLink
      },
      ...fakeParams
    });
    expect(response).toEqual({
      'error': {
        'statusCode': 400,
        'body': {
          'errors': [
            {
              'code': utils.ERR_RC_INCORRECT_REQUEST,
              'message': `Request has one or more errors => In body => For Content-Type application/json => Invalid value => at: links > github => String does not match required pattern /^https:\\/\\/github\\.com\\// with value: "${nonGithubRepoLink}"`
            }
          ]
        }
      }
    });
  });

  test('Template already exists, should return 409', async () => {
    findTemplateByName.mockReturnValue({
      'name': TEMPLATE_NAME
    });
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': process.env.IMS_URL,
      'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
      'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
      'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
      '__ow_method': HTTP_METHOD,
      [POST_PARAM_NAME]: TEMPLATE_NAME,
      [POST_PARAM_LINKS]: {
        [POST_PARAM_LINKS_GITHUB]: TEMPLATE_GITHUB_REPO
      },
      ...fakeParams
    });
    expect(response).toEqual({
      'statusCode': 409
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "POST templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_URL);
    expect(findTemplateByName).toHaveBeenCalledWith({}, TEMPLATE_NAME);
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"POST templates" executed successfully');
  });

  test('Adding new template, should return 500 due to incorrect response', async () => {
    findTemplateByName.mockReturnValue(null);
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/app-builder-template';
    const template = {
      '_id': new ObjectId(),
      'name': templateName,
      'status': 'InVerification',
      'links': {
        'npm': 'https://www.npmjs.com/package/@adobe/app-builder-template',
        'github': 'https://github.com/adobe/app-builder-template'
      },
      'foo': 'bar'
    };
    addTemplate.mockReturnValue(template);
    // TODO: Uncomment the following after integrating with App Builder templates again
    //       Dev Console templates don't have review issues
    // const issueNumber = 1001;
    // createReviewIssue.mockReturnValue(issueNumber);
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': process.env.IMS_URL,
      'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
      'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
      'ACCESS_TOKEN_GITHUB': process.env.ACCESS_TOKEN_GITHUB,
      'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
      '__ow_method': HTTP_METHOD,
      [POST_PARAM_NAME]: TEMPLATE_NAME,
      [POST_PARAM_LINKS]: {
        [POST_PARAM_LINKS_GITHUB]: TEMPLATE_GITHUB_REPO
      },
      ...fakeParams
    });
    expect(response).toEqual({
      'error': {
        'statusCode': 500,
        'body': {
          'errors': [
            {
              'code': utils.ERR_RC_SERVER_ERROR,
              'message': 'An error occurred, please try again later.'
            }
          ]
        }
      }
    });
    // TODO: Uncomment the following after integrating with App Builder templates again
    // expect(createReviewIssue).toHaveBeenCalledWith(TEMPLATE_NAME, TEMPLATE_GITHUB_REPO, process.env.ACCESS_TOKEN_GITHUB, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
  });

  test('Adding new template, should return 200', async () => {
    findTemplateByName.mockReturnValue(null);
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/app-builder-template';
    const template = {
      '_id': new ObjectId(),
      'name': templateName,
      'status': 'InVerification',
      'links': {
        'npm': 'https://www.npmjs.com/package/@adobe/app-builder-template',
        'github': 'https://github.com/adobe/app-builder-template'
      }
    };
    const convertedTemplate = utils.convertMongoIdToString(template);
    addTemplate.mockReturnValue({
      ...convertedTemplate,
    });
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': process.env.IMS_URL,
      'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
      'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
      'ACCESS_TOKEN_GITHUB': process.env.ACCESS_TOKEN_GITHUB,
      'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
      '__ow_method': HTTP_METHOD,
      [POST_PARAM_NAME]: TEMPLATE_NAME,
      [POST_PARAM_LINKS]: {
        [POST_PARAM_LINKS_GITHUB]: TEMPLATE_GITHUB_REPO
      },
      ...fakeParams
    });
    expect(response).toEqual({
      'statusCode': 200,
      'body': {
        ...template,
        '_links': {
          'self': {
            'href': `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateName}`
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "POST templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_URL);
    expect(findTemplateByName).toHaveBeenCalledWith({},TEMPLATE_NAME);
    expect(addTemplate).toHaveBeenCalledWith({MONGODB_NAME: undefined, MONGODB_URI: undefined }, {
      'name': TEMPLATE_NAME,
      'links': {
        'github': TEMPLATE_GITHUB_REPO
      }
    });
    // TODO: Uncomment the following after integrating with App Builder templates again
    // expect(createReviewIssue).toHaveBeenCalledWith(TEMPLATE_NAME, TEMPLATE_GITHUB_REPO, process.env.ACCESS_TOKEN_GITHUB, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"POST templates" executed successfully');
  });

  test('Adding new developer console template, should return 200', async () => {
    mockConsoleSDKInstance.getProjectInstallConfig.mockResolvedValue({
      body: {
        credentials: [
          {
            type: 'serviceAccount',
            flowType: 'oauth2',
            apis: [
              {
                code: 'AdobeIO'
              }
            ]
          }
        ]
      }
    });

    findTemplateByName.mockReturnValue(null);
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/developer-console-template';
    const template = {
      'id': '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      'name': templateName,
      'description': 'Developer Console template',
      'status': 'InVerification',
      'version': '1.0.0',
      'links': {
        'consoleProject': DEVELOPER_CONSOLE_PROJECT
      }
    };
    addTemplate.mockReturnValue(template);
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': IMS_CLIENT_ID,
      'IMS_CLIENT_SECRET': IMS_CLIENT_SECRET,
      'IMS_AUTH_CODE': IMS_AUTH_CODE,
      'IMS_SCOPES': IMS_SCOPES,
      'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
      'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
      'ACCESS_TOKEN_GITHUB': process.env.ACCESS_TOKEN_GITHUB,
      'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
      '__ow_method': HTTP_METHOD,
      name: DEVELOPER_CONSOLE_TEMPLATE_NAME,
      links: {
        consoleProject: DEVELOPER_CONSOLE_PROJECT
      },
      description: 'Developer Console template',
      version: '1.0.0',
      ...fakeParams
    });
    expect(response).toEqual({
      'statusCode': 200,
      'body': {
        ...template,
        '_links': {
          'self': {
            'href': `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateName}`
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "POST templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, IMS_CLIENT_ID);
    expect(generateAccessToken).toHaveBeenCalledWith(IMS_AUTH_CODE, IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES);
    expect(findTemplateByName).toHaveBeenCalledWith({},DEVELOPER_CONSOLE_TEMPLATE_NAME);
    expect(addTemplate).toHaveBeenCalledWith({MONGODB_NAME: undefined, MONGODB_URI: undefined }, {
      'name': DEVELOPER_CONSOLE_TEMPLATE_NAME,
      'apis': [
        {
          'credentialType': 'serviceAccount',
          'flowType': 'oauth2',
          'code': 'AdobeIO',
          'productProfiles': undefined
        }
      ],
      'credentials': [
        {
          'type': 'serviceAccount',
          'flowType': 'oauth2'
        }
      ],
      'links': {
        'consoleProject': DEVELOPER_CONSOLE_PROJECT
      },
      'description': 'Developer Console template',
      'version': '1.0.0'
    });
    // TODO: Uncomment the following after integrating with App Builder templates again
    // expect(createReviewIssue).toHaveBeenCalledWith(TEMPLATE_NAME, TEMPLATE_GITHUB_REPO, process.env.ACCESS_TOKEN_GITHUB, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"POST templates" executed successfully');
  });

  test('Adding new developer console template without apis, should return 200', async () => {
    mockConsoleSDKInstance.getProjectInstallConfig.mockResolvedValue({
      body: {
        credentials: [
          {
            type: 'serviceAccount',
            flowType: 'oauth2'
          }
        ]
      }
    });

    findTemplateByName.mockReturnValue(null);
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/developer-console-template';
    const template = {
      'id': '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      'name': templateName,
      'description': 'Developer Console template',
      'status': 'InVerification',
      'version': '1.0.0',
      'links': {
        'consoleProject': DEVELOPER_CONSOLE_PROJECT
      }
    };
    addTemplate.mockReturnValue(template);
    const response = await action.main({
      'IMS_URL': process.env.IMS_URL,
      'IMS_CLIENT_ID': IMS_CLIENT_ID,
      'IMS_CLIENT_SECRET': IMS_CLIENT_SECRET,
      'IMS_AUTH_CODE': IMS_AUTH_CODE,
      'IMS_SCOPES': IMS_SCOPES,
      'TEMPLATE_REGISTRY_ORG': process.env.TEMPLATE_REGISTRY_ORG,
      'TEMPLATE_REGISTRY_REPOSITORY': process.env.TEMPLATE_REGISTRY_REPOSITORY,
      'ACCESS_TOKEN_GITHUB': process.env.ACCESS_TOKEN_GITHUB,
      'TEMPLATE_REGISTRY_API_URL': process.env.TEMPLATE_REGISTRY_API_URL,
      '__ow_method': HTTP_METHOD,
      name: DEVELOPER_CONSOLE_TEMPLATE_NAME,
      links: {
        consoleProject: DEVELOPER_CONSOLE_PROJECT
      },
      description: 'Developer Console template',
      version: '1.0.0',
      ...fakeParams
    });
    expect(response).toEqual({
      'statusCode': 200,
      'body': {
        ...template,
        '_links': {
          'self': {
            'href': `${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${templateName}`
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "POST templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, IMS_CLIENT_ID);
    expect(generateAccessToken).toHaveBeenCalledWith(IMS_AUTH_CODE, IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES);
    expect(findTemplateByName).toHaveBeenCalledWith({},DEVELOPER_CONSOLE_TEMPLATE_NAME);
    expect(addTemplate).toHaveBeenCalledWith({MONGODB_NAME: undefined, MONGODB_URI: undefined }, {
      'name': DEVELOPER_CONSOLE_TEMPLATE_NAME,
      'apis': [],
      'credentials': [
        {
          'type': 'serviceAccount',
          'flowType': 'oauth2'
        }
      ],
      'links': {
        'consoleProject': DEVELOPER_CONSOLE_PROJECT
      },
      'description': 'Developer Console template',
      'version': '1.0.0'
    });
    // TODO: Uncomment the following after integrating with App Builder templates again
    // expect(createReviewIssue).toHaveBeenCalledWith(TEMPLATE_NAME, TEMPLATE_GITHUB_REPO, process.env.ACCESS_TOKEN_GITHUB, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"POST templates" executed successfully');
  });
});
