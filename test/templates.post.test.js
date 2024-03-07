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
const { validateAccessToken } = require('../actions/ims');
const utils = require('../actions/utils');
const dotenv = require('dotenv');
const { fetchUrl, findTemplateByName, addTemplate, createReviewIssue } = require('../actions/templateRegistry');
const action = require('../actions/templates/post/index');

const mockLoggerInstance = { 'info': jest.fn(), 'debug': jest.fn(), 'error': jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => ({
  'Core': {
    'Logger': jest.fn()
  }
}));
jest.mock('../actions/ims');
jest.mock('../actions/templateRegistry');

process.env = {
  TEMPLATE_REGISTRY_API_URL: 'https://template-registry-api.tbd/apis/v1'
};
dotenv.config({ path: './.env.test' });

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
const IMS_ACCESS_TOKEN = 'fake';
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
            },
            {
              'code': utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
              'message': 'The "links.github" parameter is not set.'
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
    expect(findTemplateByName).toHaveBeenCalledWith(TEMPLATE_NAME, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"POST templates" executed successfully');
  });

  test('Adding new template, should return 200', async () => {
    findTemplateByName.mockReturnValue(null);
    fetchUrl.mockReturnValue('');
    const templateName = '@adobe/app-builder-template';
    const template = {
      'id': '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      'name': templateName,
      'status': 'InVerification',
      'links': {
        'npm': 'https://www.npmjs.com/package/@adobe/app-builder-template',
        'github': 'https://github.com/adobe/app-builder-template'
      }
    };
    addTemplate.mockReturnValue(template);
    const issueNumber = 1001;
    createReviewIssue.mockReturnValue(issueNumber);
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
          },
          'review': {
            'description': 'A link to the "Template Review Request" Github issue.',
            'href': `https://github.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues/${issueNumber}`
          }
        }
      }
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "POST templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_URL);
    expect(findTemplateByName).toHaveBeenCalledWith(TEMPLATE_NAME, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(addTemplate).toHaveBeenCalledWith(TEMPLATE_NAME, TEMPLATE_GITHUB_REPO, process.env.ACCESS_TOKEN_GITHUB, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY, `Add "${TEMPLATE_NAME}" via API`);
    expect(createReviewIssue).toHaveBeenCalledWith(TEMPLATE_NAME, TEMPLATE_GITHUB_REPO, process.env.ACCESS_TOKEN_GITHUB, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"POST templates" executed successfully');
  });
});
