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

const { evaluateEntitlements } = require('../actions/templateEntitlement');
const mockConsoleSDK = require('@adobe/aio-lib-console');
const mockAcrs = require('../actions/acrs');
jest.mock('@adobe/aio-lib-console');
jest.mock('../actions/acrs');

describe('evaluateEntitlements', () => {
  const mockConsoleClient = {
    getServicesForOrgV2: jest.fn().mockResolvedValue({
      body: {
        services: [
          {
            code: 'sdkCode1',
            enabled: true,
            entitledForOrg: true,
            canRequestAccess: false,
            properties: {
              licenseConfigs: [{ id: '1', name: 'licConName', productId: 'licConProd' }]
            }
          },
          { code: 'sdkCode2', enabled: true, entitledForOrg: true, canRequestAccess: false },
          { code: 'sdkCode3', enabled: false, entitledForOrg: false, canRequestAccess: true, disabledReasons: ['USER_MISSING_PRODUCT_PROFILES'] },
          { code: 'sdkCode4', enabled: false, entitledForOrg: false, canRequestAccess: false, disabledReasons: ['ORG_MISSING_FIS'] },
          { code: 'sdkCode5', enabled: false, entitledForOrg: true, canRequestAccess: true, disabledReasons: ['USER_MISSING_PRODUCT_PROFILES'] }
        ]
      }
    })
  };

  mockConsoleSDK.init.mockResolvedValue(mockConsoleClient);

  const requestAccessAppId = 'requestAccessAppId';

  mockAcrs.fetchAppIdsWithPendingRequests.mockResolvedValue((new Set([requestAccessAppId])));

  const logger = {
    debug: jest.fn()
  };

  const templates = [
    {
      name: 'template1',
      apis: [
        { code: 'sdkCode1' },
        { code: 'sdkCode2' }
      ]
    },
    {
      name: 'template2',
      apis: [
        { code: 'sdkCode3' },
        { code: 'sdkCode4' }
      ]
    },
    {
      name: 'template3',
      apis: [
        { code: 'sdkCode5' }
      ],
      requestAccessAppId
    }
  ];

  const params = {
    __ow_headers: {
      'x-org-id': 'orgId',
      authorization: 'Bearer userToken',
      'x-api-key': 'api_key'
    },
    IMS_CLIENT_ID: 'clientId'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should evaluate entitlements correctly with request access status', async () => {
    const expectedEntitlements = [
      {
        name: 'template1',
        apis: [
          { code: 'sdkCode1', licenseConfigs: [{ id: '1', name: 'licConName', productId: 'licConProd' }] },
          { code: 'sdkCode2' }
        ],
        userEntitled: true,
        orgEntitled: true,
        canRequestAccess: false,
        disEntitledReasons: [],
        isRequestPending: false
      },
      {
        name: 'template2',
        apis: [
          { code: 'sdkCode3' },
          { code: 'sdkCode4' }
        ],
        userEntitled: false,
        orgEntitled: false,
        canRequestAccess: false,
        disEntitledReasons: ['USER_MISSING_PRODUCT_PROFILES', 'ORG_MISSING_FIS'],
        isRequestPending: false
      },
      {
        name: 'template3',
        apis: [
          { code: 'sdkCode5' }
        ],
        userEntitled: false,
        orgEntitled: true,
        canRequestAccess: true,
        disEntitledReasons: ['USER_MISSING_PRODUCT_PROFILES'],
        isRequestPending: true,
        requestAccessAppId
      }
    ];

    const result = await evaluateEntitlements(templates, params, logger);

    expect(mockConsoleSDK.init).toHaveBeenCalledWith('userToken', 'clientId', 'stage');
    expect(mockConsoleClient.getServicesForOrgV2).toHaveBeenCalledWith('orgId', 'sdkCode1,sdkCode2,sdkCode3,sdkCode4,sdkCode5');
    expect(logger.debug).toHaveBeenCalledWith('Evaluating entitlements for 3 templates, orgId: orgId');
    expect(logger.debug).toHaveBeenCalledWith('Retrieving services for org orgId with sdkCodes: sdkCode1,sdkCode2,sdkCode3,sdkCode4,sdkCode5');
    expect(logger.debug).toHaveBeenCalledWith('Evaluating entitlements for 3 templates, orgId: orgId');
    expect(mockAcrs.fetchAppIdsWithPendingRequests).toHaveBeenCalledWith('userToken', 'orgId', 'stage', 'api_key', logger);
    expect(result).toEqual(expectedEntitlements);
  });

  test('should evaluate entitlements correctly without request access status', async () => {
    const expectedEntitlements = [
      {
        name: 'template1',
        apis: [
          { code: 'sdkCode1', licenseConfigs: [{ id: '1', name: 'licConName', productId: 'licConProd' }] },
          { code: 'sdkCode2' }
        ],
        userEntitled: true,
        orgEntitled: true,
        canRequestAccess: false,
        disEntitledReasons: [],
        isRequestPending: false
      },
      {
        name: 'template2',
        apis: [
          { code: 'sdkCode3' },
          { code: 'sdkCode4' }
        ],
        userEntitled: false,
        orgEntitled: false,
        canRequestAccess: false,
        disEntitledReasons: ['USER_MISSING_PRODUCT_PROFILES', 'ORG_MISSING_FIS'],
        isRequestPending: false
      }
    ];

    const inputTemplates = [templates[0], templates[1]];

    const result = await evaluateEntitlements(inputTemplates, params, logger);

    expect(mockConsoleSDK.init).toHaveBeenCalledWith('userToken', 'clientId', 'stage');
    expect(mockConsoleClient.getServicesForOrgV2).toHaveBeenCalledWith('orgId', 'sdkCode1,sdkCode2,sdkCode3,sdkCode4');
    expect(logger.debug).toHaveBeenCalledWith('Evaluating entitlements for 2 templates, orgId: orgId');
    expect(logger.debug).toHaveBeenCalledWith('Retrieving services for org orgId with sdkCodes: sdkCode1,sdkCode2,sdkCode3,sdkCode4');
    expect(logger.debug).toHaveBeenCalledWith('Evaluating entitlements for 2 templates, orgId: orgId');
    expect(mockAcrs.fetchAppIdsWithPendingRequests).not.toHaveBeenCalled();
    expect(result).toEqual(expectedEntitlements);
  });

  test('should return input templates as it is if org id is missing', async () => {
    const invalidParams = {
      __ow_headers: {
        authorization: 'Bearer userToken'
      },
      IMS_CLIENT_ID: 'clientId'
    };

    const result = await evaluateEntitlements(templates, invalidParams, logger);
    expect(result).toEqual(templates);
    expect(mockConsoleSDK.init).not.toHaveBeenCalled();
    expect(mockConsoleClient.getServicesForOrgV2).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('No org id or templates specified. Skipping entitlement check.');
  });

  test('should return input if templates are null', async () => {
    const result = await evaluateEntitlements(null, params, logger);
    expect(result).toBeNull();
    expect(mockConsoleSDK.init).not.toHaveBeenCalled();
    expect(mockConsoleClient.getServicesForOrgV2).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('No org id or templates specified. Skipping entitlement check.');
  });

  test('should return input if templates array is empty', async () => {
    const result = await evaluateEntitlements([], params, logger);
    expect(result).toEqual([]);
    expect(mockConsoleSDK.init).not.toHaveBeenCalled();
    expect(mockConsoleClient.getServicesForOrgV2).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('No org id or templates specified. Skipping entitlement check.');
  });

  test('should throw an error if user token is missing', async () => {
    const invalidParams = {
      __ow_headers: {
        'x-org-id': 'orgId'
      },
      IMS_CLIENT_ID: 'clientId'
    };

    await expect(evaluateEntitlements(templates, invalidParams, logger)).rejects.toThrow('Invalid user token or templates');
    expect(mockConsoleSDK.init).not.toHaveBeenCalled();
    expect(mockConsoleClient.getServicesForOrgV2).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  test('should throw an error if services retrieval fails', async () => {
    mockConsoleClient.getServicesForOrgV2.mockResolvedValueOnce({ body: null });

    await expect(evaluateEntitlements(templates, params, logger)).rejects.toThrow('Failed to retrieve services for the organization. Received: null');
    expect(mockConsoleSDK.init).toHaveBeenCalledWith('userToken', 'clientId', 'stage');
    expect(mockConsoleClient.getServicesForOrgV2).toHaveBeenCalledWith('orgId', 'sdkCode1,sdkCode2,sdkCode3,sdkCode4,sdkCode5');
    expect(logger.debug).toHaveBeenCalledWith('Evaluating entitlements for 3 templates, orgId: orgId');
    expect(logger.debug).toHaveBeenCalledWith('Retrieving services for org orgId with sdkCodes: sdkCode1,sdkCode2,sdkCode3,sdkCode4,sdkCode5');
    expect(logger.debug).not.toHaveBeenCalledWith('Retrieved services for org orgId');
  });

  test('should throw an error if not all services are found for the org', async () => {
    mockConsoleClient.getServicesForOrgV2.mockResolvedValueOnce({
      body: {
        services: [
          { code: 'sdkCode1', enabled: true, entitledForOrg: true, canRequestAccess: true }
        ]
      }
    });

    await expect(evaluateEntitlements(templates, params, logger)).rejects.toThrow('Not all services were found for the org. Found: 1, Expected: 5 Missing: sdkCode2,sdkCode3,sdkCode4,sdkCode5');
    expect(mockConsoleSDK.init).toHaveBeenCalledWith('userToken', 'clientId', 'stage');
    expect(mockConsoleClient.getServicesForOrgV2).toHaveBeenCalledWith('orgId', 'sdkCode1,sdkCode2,sdkCode3,sdkCode4,sdkCode5');
    expect(logger.debug).toHaveBeenNthCalledWith(1, 'Evaluating entitlements for 3 templates, orgId: orgId');
    expect(logger.debug).toHaveBeenNthCalledWith(2, 'apiHost:', undefined);
    expect(logger.debug).toHaveBeenNthCalledWith(3, 'env: ', 'stage');
    expect(logger.debug).toHaveBeenNthCalledWith(4, 'Retrieving services for org orgId with sdkCodes: sdkCode1,sdkCode2,sdkCode3,sdkCode4,sdkCode5');
  });
});
