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
const { findTemplateById } = require('../actions/templateRegistry');
const action = require('../actions/templates/install/index');
const consoleLib = require('@adobe/aio-lib-console');
const utils = require('../actions/utils');
const consoleSDK = require('@adobe/aio-lib-console');

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

jest.mock('@adobe/aio-lib-console');
const mockConsoleSDKInstance = {
  createAdobeIdIntegration: jest.fn(),
  createOauthS2SCredentialIntegration: jest.fn(),
  downloadWorkspaceJson: jest.fn()
};
consoleSDK.init.mockResolvedValue(mockConsoleSDKInstance);

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
              message: 'Request has one or more errors => In body => Invalid value => at: orgId => Expected a string. Received: undefined => at: projectName => Expected a string. Received: undefined'
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

  test('should correctly extract credentials and apis from template', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'apikey',
          flowtype: 'adobeid'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        }
      ],

      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    await action.main(mockParams);
    expect(Core.Logger().debug).toHaveBeenNthCalledWith(3, 'Credentials found: [{"type":"apikey","flowtype":"adobeid"}]');
    expect(Core.Logger().debug).toHaveBeenNthCalledWith(4, 'APIs found: [{"code":"AssetComputeSDK","productProfiles":[{"id":"123456","productId":"AB12CD34EF56","name":"Default product profile"}],"credentialType":"apikey","flowType":"adobeid"}]');
  });

  test('should initialize console lib with correct parameters', async () => {
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    findTemplateById.mockReturnValueOnce({ id: 'mockTemplateId' });
    await action.main(mockParams);
    expect(consoleLib.init).toHaveBeenCalledWith(
      'mockToken', 'mock IMS_CLIENT_ID', 'prod'
    );
  });

  test('should create Oauth S2S integration if template has Oauth S2S flow', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'oauth_server_to_server',
          flowType: 'entp'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauth_server_to_server',
          flowType: 'entp'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauthnativeapp',
          flowType: 'adobeid'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    const mockOAuthS2SIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };
    mockConsoleSDKInstance.createOauthS2SCredentialIntegration.mockResolvedValue(mockOAuthS2SIntegrationResponse);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    delete mockParams.description;
    await action.main(mockParams);
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).not.toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).toHaveBeenCalledWith('mockOrgId', { description: 'Created from template @adobe/developer-console-template', name: 'mockProjectName', services: [{ atlasPlanCode: '', licenseConfigs: [], roles: [], sdkCode: 'PhotoshopSDK' }], templateId: 'mockTemplateId' });
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalledWith('mockOrgId', 'mockProjectId', 'mockWorkspaceId');
  });

  test('should create Oauth S2S integration if template has Oauth S2S flow, with description set', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'oauth_server_to_server',
          flowType: 'entp'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauth_server_to_server',
          flowType: 'entp'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauthnativeapp',
          flowType: 'adobeid'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    const mockOAuthS2SIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };
    mockConsoleSDKInstance.createOauthS2SCredentialIntegration.mockResolvedValue(mockOAuthS2SIntegrationResponse);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    mockParams.description = 'mockDescription';
    await action.main(mockParams);
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).not.toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).toHaveBeenCalledWith('mockOrgId', { description: 'mockDescription', name: 'mockProjectName', services: [{ atlasPlanCode: '', licenseConfigs: [], roles: [], sdkCode: 'PhotoshopSDK' }], templateId: 'mockTemplateId' });
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalledWith('mockOrgId', 'mockProjectId', 'mockWorkspaceId');
  });

  test('should create AdobeId integration if template has AdobeId flow', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'apikey',
          flowType: 'adobeid'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauthnativeapp',
          flowType: 'adobeid'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    const mockAdobeIdIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };
    mockConsoleSDKInstance.createAdobeIdIntegration.mockResolvedValue(mockAdobeIdIntegrationResponse);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    mockParams.metadata = {
      domain: 'mockDomain',
      urlScheme: 'mockUrlScheme',
      redirectUriList: 'mockRedirectUriList',
      defaultRedirectUri: 'mockDefaultRedirectUri'
    };
    delete mockParams.description;
    await action.main(mockParams);
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).not.toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).toHaveBeenCalledWith('mockOrgId', { name: 'mockProjectName', description: 'Created from template @adobe/developer-console-template', platform: 'apiKey', services: [{ sdkCode: 'AssetComputeSDK', atlasPlanCode: '', licenseConfigs: [], roles: [] }, { atlasPlanCode: '', licenseConfigs: [], roles: [], sdkCode: 'PhotoshopSDK' }], templateId: 'mockTemplateId', domain: 'mockDomain', urlScheme: 'mockUrlScheme', redirectUriList: 'mockRedirectUriList', defaultRedirectUri: 'mockDefaultRedirectUri' });
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalledWith('mockOrgId', 'mockProjectId', 'mockWorkspaceId');
  });

  test('should create AdobeId integration if template has AdobeId flow, with description set', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'apikey',
          flowType: 'adobeid'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauthnativeapp',
          flowType: 'adobeid'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    const mockAdobeIdIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };
    mockConsoleSDKInstance.createAdobeIdIntegration.mockResolvedValue(mockAdobeIdIntegrationResponse);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    mockParams.metadata = {
      domain: 'mockDomain',
      urlScheme: 'mockUrlScheme',
      redirectUriList: 'mockRedirectUriList',
      defaultRedirectUri: 'mockDefaultRedirectUri'
    };
    mockParams.description = 'mockDescription';
    await action.main(mockParams);
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).not.toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).toHaveBeenCalledWith('mockOrgId', { name: 'mockProjectName', description: 'mockDescription', platform: 'apiKey', services: [{ sdkCode: 'AssetComputeSDK', atlasPlanCode: '', licenseConfigs: [], roles: [] }, { atlasPlanCode: '', licenseConfigs: [], roles: [], sdkCode: 'PhotoshopSDK' }], templateId: 'mockTemplateId', domain: 'mockDomain', urlScheme: 'mockUrlScheme', redirectUriList: 'mockRedirectUriList', defaultRedirectUri: 'mockDefaultRedirectUri' });
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalledWith('mockOrgId', 'mockProjectId', 'mockWorkspaceId');
  });

  test('should throw error if template has invalid flowType', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'apikey',
          flowType: 'analytics'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'analytics'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    findTemplateById.mockReturnValueOnce(mockTemplate);
    await action.main(mockParams);
    expect(Core.Logger().error).toHaveBeenCalledWith('Credential flow type "analytics" not supported for template install.');
  });

  test('should throw error if response is invalid, 500', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'apikey',
          flowType: 'adobeid'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauthnativeapp',
          flowType: 'adobeid'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    const mockAdobeIdIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    mockConsoleSDKInstance.createAdobeIdIntegration.mockResolvedValue(mockAdobeIdIntegrationResponse);
    mockConsoleSDKInstance.downloadWorkspaceJson.mockResolvedValue(null);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651stagejpn3-runtime-stage-b.ethos651-stage-jpn3.ethos.adobe.net';
    const response = await action.main(mockParams);
    expect(response.error.statusCode).toBe(500);
    expect(response.error.body.errors[0].code).toBe(utils.ERR_RC_SERVER_ERROR);
    expect(response.error.body.errors[0].message).toContain('Response invalid');
  });

  test('should return response as expected, 201', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'apikey',
          flowType: 'adobeid'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauthnativeapp',
          flowType: 'adobeid'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    const mockAdobeIdIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };

    const mockWorkspaceJson = {
      project: {
        id: 'mockProjectId',
        name: 'mockProjectName',
        description: 'mockDescription',
        org: {
          id: 'mockOrgId',
          name: 'mockOrgName',
          ims_org_id: 'mockImsOrgId',
          workspace: {
            id: 'mockWorkspaceId',
            name: 'mockWorkspaceName',
            description: 'mockWorkspaceDescription',
            details: {
              credentials: [],
              apis: [],
              services: [],
              runtime: {}
            }
          }
        }
      }
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    mockConsoleSDKInstance.createAdobeIdIntegration.mockResolvedValue(mockAdobeIdIntegrationResponse);
    mockConsoleSDKInstance.downloadWorkspaceJson.mockResolvedValue(mockWorkspaceJson);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    const response = await action.main(mockParams);
    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({
      project: {
        id: 'mockProjectId',
        name: 'mockProjectName',
        description: 'mockDescription',
        org: {
          id: 'mockOrgId',
          name: 'mockOrgName',
          ims_org_id: 'mockImsOrgId',
          workspace: {
            id: 'mockWorkspaceId',
            name: 'mockWorkspaceName',
            description: 'mockWorkspaceDescription',
            details: {
              credentials: [],
              apis: [],
              services: [],
              runtime: {}
            }
          }
        }
      }
    });
  });

  test('should create AdobeId integration if template has AdobeId flow, test uppercase credential/api type and flow type', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'APIKEY',
          flowType: 'ADOBEID'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'APIKEY',
          flowType: 'ADOBEID'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'APIKEY',
          flowType: 'ADOBEID'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'OAUTHNATIVEAPP',
          flowType: 'ADOBEID'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    const mockAdobeIdIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };
    mockConsoleSDKInstance.createAdobeIdIntegration.mockResolvedValue(mockAdobeIdIntegrationResponse);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    mockParams.metadata = {
      domain: 'mockDomain',
      urlScheme: 'mockUrlScheme',
      redirectUriList: 'mockRedirectUriList',
      defaultRedirectUri: 'mockDefaultRedirectUri'
    };
    delete mockParams.description;
    await action.main(mockParams);
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).not.toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).toHaveBeenCalledWith('mockOrgId', { name: 'mockProjectName', description: 'Created from template @adobe/developer-console-template', platform: 'apiKey', services: [{ sdkCode: 'AssetComputeSDK', atlasPlanCode: '', licenseConfigs: [], roles: [] }, { atlasPlanCode: '', licenseConfigs: [], roles: [], sdkCode: 'PhotoshopSDK' }], templateId: 'mockTemplateId', domain: 'mockDomain', urlScheme: 'mockUrlScheme', redirectUriList: 'mockRedirectUriList', defaultRedirectUri: 'mockDefaultRedirectUri' });
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalledWith('mockOrgId', 'mockProjectId', 'mockWorkspaceId');
  });

  test('should set license config for APIs if present in request body, adobeid credential type', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'apikey',
          flowType: 'adobeid'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauthnativeapp',
          flowType: 'adobeid'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    const mockAdobeIdIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };
    mockConsoleSDKInstance.createAdobeIdIntegration.mockResolvedValue(mockAdobeIdIntegrationResponse);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    mockParams.metadata = {
      domain: 'mockDomain',
      urlScheme: 'mockUrlScheme',
      redirectUriList: 'mockRedirectUriList',
      defaultRedirectUri: 'mockDefaultRedirectUri'
    };
    mockParams.apis = [
      {
        code: 'AssetComputeSDK',
        credentialType: 'apikey',
        flowType: 'adobeid',
        licenseConfigs: [
          {
            id: '1',
            productId: 'A',
            op: 'mockOp'
          }
        ]
      },
      {
        code: 'PhotoshopSDK',
        credentialType: 'apikey',
        flowType: 'adobeid',
        licenseConfigs: [
          {
            id: '2',
            productId: 'B',
            op: 'mockOp'
          }
        ]
      }
    ];
    await action.main(mockParams);
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).not.toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).toHaveBeenCalledWith('mockOrgId', { name: 'mockProjectName', description: 'Created from template @adobe/developer-console-template', platform: 'apiKey', services: [{ sdkCode: 'AssetComputeSDK', atlasPlanCode: '', licenseConfigs: [{ id: '1', productId: 'A', op: 'mockOp' }], roles: [] }, { atlasPlanCode: '', licenseConfigs: [{ id: '2', productId: 'B', op: 'mockOp' }], roles: [], sdkCode: 'PhotoshopSDK' }], templateId: 'mockTemplateId', domain: 'mockDomain', urlScheme: 'mockUrlScheme', redirectUriList: 'mockRedirectUriList', defaultRedirectUri: 'mockDefaultRedirectUri' });
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalledWith('mockOrgId', 'mockProjectId', 'mockWorkspaceId');
  });

  test('should set license config for APIs if present in request body, entp credential type', async () => {
    const mockTemplate = {
      id: '56bf8211-d92d-44ef-b98b-6ee89812e1d7',
      author: 'John doe',
      name: '@adobe/developer-console-template',
      description: 'Developer Console template',
      latestVersion: '1.0.0',
      adobeRecommended: true,
      status: 'Approved',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/1234'
      },
      credentials: [
        {
          type: 'oauth_server_to_server',
          flowType: 'entp'
        }
      ],
      apis: [
        {
          code: 'AssetComputeSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'apikey',
          flowType: 'adobeid'
        },
        {
          code: 'PhotoshopSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauth_server_to_server',
          flowType: 'entp'
        },
        {
          code: 'IllustratorSDK',
          productProfiles: [
            {
              id: '123456',
              productId: 'AB12CD34EF56',
              name: 'Default product profile'
            }
          ],
          credentialType: 'oauthnativeapp',
          flowType: 'adobeid'
        }
      ],
      codeSamples: [
        {
          language: 'node',
          link: 'https://developer-stage.adobe.com/sample.zip'
        }
      ]
    };
    findTemplateById.mockReturnValueOnce(mockTemplate);
    const mockOAuthS2SIntegrationResponse = {
      body: {
        id: 'mockId',
        apikey: 'mockApiKey',
        orgId: 'mockOrgId',
        projectId: 'mockProjectId',
        workspaceId: 'mockWorkspaceId',
        subscriptionResult: {
          sdkList: [],
          errorList: []
        }
      }
    };
    mockConsoleSDKInstance.createOauthS2SCredentialIntegration.mockResolvedValue(mockOAuthS2SIntegrationResponse);
    process.env.__OW_API_HOST = 'https://controller-gw-ns-team-ethos651prodjpn3-runtime-prod-b.ethos651-prod-jpn3.ethos.adobe.net';
    delete mockParams.description;
    mockParams.apis = [
      {
        code: 'AssetComputeSDK',
        credentialType: 'apikey',
        flowType: 'adobeid',
        licenseConfigs: [
          {
            id: '1',
            productId: 'A',
            op: 'mockOp'
          }
        ]
      },
      {
        code: 'PhotoshopSDK',
        credentialType: 'oauth_server_to_server',
        flowType: 'ENTP',
        licenseConfigs: [
          {
            id: '2',
            productId: 'B',
            op: 'mockOp'
          }
        ]
      }
    ];
    await action.main(mockParams);
    expect(mockConsoleSDKInstance.createAdobeIdIntegration).not.toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.createOauthS2SCredentialIntegration).toHaveBeenCalledWith('mockOrgId', { description: 'Created from template @adobe/developer-console-template', name: 'mockProjectName', services: [{ atlasPlanCode: '', licenseConfigs: [{ id: '2', productId: 'B', op: 'mockOp' }], roles: [], sdkCode: 'PhotoshopSDK' }], templateId: 'mockTemplateId' });
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalled();
    expect(mockConsoleSDKInstance.downloadWorkspaceJson).toHaveBeenCalledWith('mockOrgId', 'mockProjectId', 'mockWorkspaceId');
  });
});
