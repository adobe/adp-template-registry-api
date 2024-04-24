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
const { validateAccessToken } = require('../actions/ims');
// const { ObjectId } = require('mongodb');
const { findTemplateById } = require('../actions/templateRegistry');
const action = require('../actions/templates/install/index');
// const consoleLib = require('@adobe/aio-lib-console');
const utils = require('../actions/utils');

// Mocking dependencies
const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}));

jest.mock('../actions/ims', () => ({
  validateAccessToken: jest.fn()
}));

jest.mock('../actions/templateRegistry', () => ({
  findTemplateById: jest.fn()
}));

jest.mock('@adobe/aio-lib-console', () => ({
  init: jest.fn(() => ({
    createAdobeIdIntegration: jest.fn(),
    createOauthS2SCredentialIntegration: jest.fn(),
    downloadWorkspaceJson: jest.fn()
  }))
}));

const IMS_ACCESS_TOKEN = 'mockToken';
const mockParams = {
  IMS_URL: 'mock IMS_URL',
  IMS_CLIENT_ID: 'mock IMS_CLIENT_ID',
  MONGODB_URI: 'mock MONGODB_URI',
  MONGODB_NAME: 'mock MONGODB_NAME',
  __ow_method: 'POST',
  templateId: 'mockTemplateId',
  orgId: 'mockOrgId',
  projectName: 'mockProjectName',
  description: 'mockDescription',
  metadata: { mockMetadata: 'value' },
  __ow_headers: {
    authorization: `Bearer ${IMS_ACCESS_TOKEN}`
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  validateAccessToken.mockReset();
}
);

describe('POST Install template: Headers & other basic checks', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test('should return 405 error if HTTP method is not allowed', async () => {
    mockParams.__ow_method = 'GET';
    const response = await action.main(mockParams);
    expect(response.error.statusCode).toBe(405);
    expect(response).toEqual({
      error: {
        statusCode: 405,
        body: {
          errors: [
            {
              code: utils.ERR_RC_HTTP_METHOD_NOT_ALLOWED,
              message: 'HTTP "GET" method is unsupported.'
            }
          ]
        }
      }
    });
    expect(Core.Logger().error).toHaveBeenCalled();
    // reset __ow_method
    mockParams.__ow_method = 'POST';
  });

  test('Missing Authorization header, should return 401', async () => {
    const response = await action.main({ __ow_method: mockParams.__ow_method });
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
    expect(validateAccessToken).not.toHaveBeenCalled();
  });

  test('Missing templateId param, should return 400', async () => {
    const response = await action.main({
      __ow_method: mockParams.__ow_method,
      __ow_headers: mockParams.__ow_headers
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
    expect(validateAccessToken).not.toHaveBeenCalled();
  });

  test('Invalid token, should return 401', async () => {
    const err = 'Provided IMS access token is invalid. Reason: bad_signature';
    validateAccessToken.mockImplementation(() => {
      throw new Error(err);
    });

    const response = await action.main({
      IMS_URL: mockParams.IMS_URL,
      IMS_CLIENT_ID: mockParams.IMS_CLIENT_ID,
      __ow_method: mockParams.__ow_method,
      __ow_headers: mockParams.__ow_headers,
      templateId: mockParams.templateId
    });
    expect(response).toEqual({
      error: {
        statusCode: 401,
        body: { errors: [utils.errorMessage(utils.ERR_RC_INVALID_IMS_ACCESS_TOKEN, err)] }
      }
    });
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, mockParams.IMS_URL, mockParams.IMS_CLIENT_ID);
  });
});
describe('POST Install template: Core business logic specific tests', () => {
  test('Incorrect request body, should return 400', async () => {
    mockParams.projectName = undefined;
    mockParams.orgId = undefined;
    const response = await action.main(mockParams);
    expect(response).toEqual({
      error: {
        statusCode: 400,
        body: {
          errors: [
            {
              code: utils.ERR_RC_INCORRECT_REQUEST,
              message: 'Request has one or more errors => In body => For Content-Type application/json => Invalid value => at: orgId => Expected a string. Received: undefined => at: projectName => Expected a string. Received: undefined'
            }
          ]
        }
      }
    });
    // reset params
    mockParams.projectName = 'mockProjectName';
    mockParams.orgId = 'mockOrgId';
  });

  test('should return 404 error if template is not found', async () => {
    findTemplateById.mockReturnValueOnce(null);
    const response = await action.main(mockParams);
    expect(response.error).toStrictEqual(
      {
        statusCode: 404,
        body: {
          errors: [
            {
              code: utils.ERR_RC_INVALID_TEMPLATE_ID,
              message: `Template with id ${mockParams.templateId} not found.`
            }
          ]
        }
      }
    );
    expect(Core.Logger().error).toHaveBeenCalled();
  });

  test('should return 500 error if any error occurs', async () => {
    findTemplateById.mockImplementation(() => {
      throw new Error('mockError');
    });
    const response = await action.main(mockParams);
    expect(response.error.statusCode).toBe(500);
    expect(response.error.body.errors[0].code).toBe(utils.ERR_RC_SERVER_ERROR);
    expect(Core.Logger().error).toHaveBeenCalled();
  });
});
