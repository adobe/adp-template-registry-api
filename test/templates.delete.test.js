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
const { validateAccessToken, isAdmin, isValidServiceToken } = require('../actions/ims');
const utils = require('../actions/utils');
const action = require('../actions/templates/delete/index');
const { findTemplateByName, removeTemplateById, removeTemplateByName } = require('../actions/templateRegistry');

const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}));
jest.mock('@adobe/aio-metrics-client');
jest.mock('../actions/ims');
jest.mock('../actions/templateRegistry');

beforeEach(() => {
  jest.clearAllMocks();
  validateAccessToken.mockReset();
  isAdmin.mockReset();
});

process.env = {
  ADMIN_IMS_ORGANIZATIONS: 'adminOrg@AdobeOrg, adminOrg2@AdobeOrg'
};

const HTTP_METHOD = 'delete';
const IMS_ACCESS_TOKEN = 'fake';
const fakeParams = {
  __ow_headers: {
    authorization: `Bearer ${IMS_ACCESS_TOKEN}`
  }
};

describe('DELETE templates', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test('Missing Authorization header, should return 401', async () => {
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      __ow_method: HTTP_METHOD
    });
    expect(response).toEqual({
      error: {
        statusCode: 401,
        body: {
          errors: [{
            code: utils.ERR_RC_MISSING_REQUIRED_HEADER,
            message: 'The "authorization" header is not set.'
          }]
        }
      }
    });
    expect(validateAccessToken).not.toHaveBeenCalled();
    expect(isAdmin).not.toHaveBeenCalled();
  });

  test('Unsupported HTTP method, should return 405', async () => {
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      __ow_method: 'get'
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
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "DELETE templates"');
    expect(mockLoggerInstance.info).not.toHaveBeenCalledWith('"DELETE templates" executed successfully');
  });

  test('Invalid token, should return 401', async () => {
    const err = 'Provided IMS access token is invalid. Reason: bad_signature';
    validateAccessToken.mockImplementation(() => {
      throw new Error(err);
    });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      __ow_method: HTTP_METHOD,
      ...fakeParams
    });
    expect(response).toEqual({
      error: {
        statusCode: 401,
        body: { errors: [utils.errorMessage(utils.ERR_RC_INVALID_IMS_ACCESS_TOKEN, err)] }
      }
    });
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_CLIENT_ID);
    expect(isAdmin).not.toHaveBeenCalled();
  });

  test('Not admin token, should return 403', async () => {
    const err = 'This operation is available to admins only. To request template removal from Template Registry, please, create a "Template Removal Request" issue on https://github.com/adobe/aio-template-submission';
    isAdmin.mockReturnValue(false);

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      __ow_method: HTTP_METHOD,
      ...fakeParams
    });
    expect(response).toEqual({
      error: {
        statusCode: 403,
        body: { errors: [utils.errorMessage(utils.ERR_RC_PERMISSION_DENIED, err)] }
      }
    });
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_CLIENT_ID);
    expect(isAdmin).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.ADMIN_IMS_ORGANIZATIONS.split(','));
  });

  test('Should return a 404 with no orgName or templateName', async () => {
    isAdmin.mockReturnValue(true);

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      __ow_method: HTTP_METHOD,
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 404
    });
  });

  test('Should handle errors and return 500', async () => {
    const orgName = '@adobe';
    const templateName = 'app-builder-template-none';
    isAdmin.mockReturnValue(true);

    const err = 'Error connecting to MongoDB';
    findTemplateByName.mockImplementation(() => {
      throw new Error(err);
    });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      __ow_method: HTTP_METHOD,
      orgName,
      templateName,
      ...fakeParams
    });
    expect(response).toEqual({
      error: {
        statusCode: 500,
        body: { errors: [utils.errorMessage(utils.ERR_RC_SERVER_ERROR, 'An error occurred, please try again later.')] }
      }
    });
  });

  test('Template does not exist, should return 404', async () => {
    isAdmin.mockReturnValue(true);

    const orgName = '@adobe';
    const templateName = 'app-builder-template-none';
    const fullTemplateName = `${orgName}/${templateName}`;
    removeTemplateByName.mockReturnValue({ deletedCount: 0 });
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      __ow_method: HTTP_METHOD,
      orgName,
      templateName,
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "DELETE templates"');
    expect(removeTemplateByName).toHaveBeenCalledWith({}, fullTemplateName);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"DELETE templates" executed successfully');
  });

  test('Admin token, should return 200', async () => {
    isAdmin.mockReturnValue(true);

    const templateName = 'app-builder-template';
    const orgName = '@adobe';
    const fullTemplateName = orgName + '/' + templateName;
    removeTemplateByName.mockReturnValue({ deletedCount: 1 });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      __ow_method: HTTP_METHOD,
      orgName,
      templateName,
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 200
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "DELETE templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_CLIENT_ID);
    expect(isAdmin).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.ADMIN_IMS_ORGANIZATIONS.split(','));
    expect(removeTemplateByName).toHaveBeenCalledWith({}, fullTemplateName);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"DELETE templates" executed successfully');
  });

  test('Service token, should return 200', async () => {
    isValidServiceToken.mockReturnValue(true);

    const templateName = 'app-builder-template';
    const fullTemplateName = templateName;

    // const templateName = 'app-builder-template';
    // const orgName = '@adobe';
    // const fullTemplateName = orgName + '/' + templateName;
    removeTemplateByName.mockReturnValue({ deletedCount: 1 });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      __ow_method: HTTP_METHOD,
      templateName,
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 200
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "DELETE templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_CLIENT_ID);
    expect(isValidServiceToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, ['template_registry.write']);
    expect(removeTemplateByName).toHaveBeenCalledWith({}, fullTemplateName);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"DELETE templates" executed successfully');
  });

  test('Should Delete By Template Id : Admin token, should return 200', async () => {
    isAdmin.mockReturnValue(true);

    const templateId = '66392ba097b141e102e8cff6';
    removeTemplateById.mockReturnValue({ deletedCount: 1 });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      __ow_method: HTTP_METHOD,
      templateId,
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 200
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "DELETE templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_CLIENT_ID);
    // expect(isAdmin).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.ADMIN_IMS_ORGANIZATIONS.split(','));
    expect(removeTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"DELETE templates" executed successfully');
  });

  // eslint-disable-next-line jest/no-focused-tests
  test('Should Delete By Template Id : Service token, should return 200', async () => {
    isValidServiceToken.mockReturnValue(true);
    const templateId = '66392ba097b141e102e8cff6';
    removeTemplateById.mockReturnValue({ deletedCount: 1 });

    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      __ow_method: HTTP_METHOD,
      templateId,
      ...fakeParams
    });

    expect(response).toEqual({
      statusCode: 200
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "DELETE templates"');
    expect(validateAccessToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, process.env.IMS_URL, process.env.IMS_CLIENT_ID);
    expect(isValidServiceToken).toHaveBeenCalledWith(IMS_ACCESS_TOKEN, ['template_registry.write']);
    expect(removeTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"DELETE templates" executed successfully');
  });

  test('Template Id Scenario : TemplateId cannot be null, should return 404', async () => {
    isAdmin.mockReturnValue(true);

    const templateId = null;
    removeTemplateById.mockReturnValue({ deletedCount: 0 });
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      __ow_method: HTTP_METHOD,
      templateId,
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "DELETE templates"');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"DELETE templates" executed successfully');
  });

  test('Template Id Scenario : Template does not exist, should return 404', async () => {
    isAdmin.mockReturnValue(true);

    const templateId = '66392ba097b141e102e8cff6';
    removeTemplateById.mockReturnValue({ deletedCount: 0 });
    const response = await action.main({
      IMS_URL: process.env.IMS_URL,
      IMS_CLIENT_ID: process.env.IMS_CLIENT_ID,
      ADMIN_IMS_ORGANIZATIONS: process.env.ADMIN_IMS_ORGANIZATIONS,
      TEMPLATE_REGISTRY_ORG: process.env.TEMPLATE_REGISTRY_ORG,
      TEMPLATE_REGISTRY_REPOSITORY: process.env.TEMPLATE_REGISTRY_REPOSITORY,
      ACCESS_TOKEN_GITHUB: process.env.ACCESS_TOKEN_GITHUB,
      __ow_method: HTTP_METHOD,
      templateId,
      ...fakeParams
    });
    expect(response).toEqual({
      statusCode: 404
    });
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Calling "DELETE templates"');
    expect(removeTemplateById).toHaveBeenCalledWith({}, templateId);
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('"DELETE templates" executed successfully');
  });
});
