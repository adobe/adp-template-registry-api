const { evaluateEntitlements } = require('../actions/templateEntitlement');
const mockConsoleSDK = require('@adobe/aio-lib-console');

jest.mock('@adobe/aio-lib-console');

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
          { code: 'sdkCode4', enabled: false, entitledForOrg: false, canRequestAccess: false, disabledReasons: ['ORG_MISSING_FIS'] }
        ]
      }
    })
  };

  mockConsoleSDK.init.mockResolvedValue(mockConsoleClient);

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
    }
  ];

  const params = {
    __ow_headers: {
      'x-org-id': 'orgId',
      authorization: 'Bearer userToken'
    },
    IMS_CLIENT_ID: 'clientId'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should evaluate entitlements correctly', async () => {
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
        disEntitledReasons: []
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
        disEntitledReasons: ['USER_MISSING_PRODUCT_PROFILES', 'ORG_MISSING_FIS']
      }
    ];

    const result = await evaluateEntitlements(templates, params, logger);

    expect(mockConsoleSDK.init).toHaveBeenCalledWith('userToken', 'clientId', 'stage');
    expect(mockConsoleClient.getServicesForOrgV2).toHaveBeenCalledWith('orgId', 'sdkCode1,sdkCode2,sdkCode3,sdkCode4');
    expect(logger.debug).toHaveBeenCalledWith('Evaluating entitlements for 2 templates, orgId: orgId');
    expect(logger.debug).toHaveBeenCalledWith('Retrieving services for org orgId with sdkCodes: sdkCode1,sdkCode2,sdkCode3,sdkCode4');
    expect(logger.debug).toHaveBeenCalledWith('Evaluating entitlements for 2 templates, orgId: orgId');
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
    expect(logger.debug).toHaveBeenCalledWith('No org id specified. Skipping entitlement check.');
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

  test('should throw an error if templates are missing', async () => {
    await expect(evaluateEntitlements(null, params, logger)).rejects.toThrow('Invalid user token or templates');
    expect(mockConsoleSDK.init).not.toHaveBeenCalled();
    expect(mockConsoleClient.getServicesForOrgV2).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  test('should throw an error if templates array is empty', async () => {
    await expect(evaluateEntitlements([], params, logger)).rejects.toThrow('Invalid user token or templates');
    expect(mockConsoleSDK.init).not.toHaveBeenCalled();
    expect(mockConsoleClient.getServicesForOrgV2).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  test('should throw an error if services retrieval fails', async () => {
    mockConsoleClient.getServicesForOrgV2.mockResolvedValueOnce({ body: null });

    await expect(evaluateEntitlements(templates, params, logger)).rejects.toThrow('Failed to retrieve services for the organization. Received: null');
    expect(mockConsoleSDK.init).toHaveBeenCalledWith('userToken', 'clientId', 'stage');
    expect(mockConsoleClient.getServicesForOrgV2).toHaveBeenCalledWith('orgId', 'sdkCode1,sdkCode2,sdkCode3,sdkCode4');
    expect(logger.debug).toHaveBeenCalledWith('Evaluating entitlements for 2 templates, orgId: orgId');
    expect(logger.debug).toHaveBeenCalledWith('Retrieving services for org orgId with sdkCodes: sdkCode1,sdkCode2,sdkCode3,sdkCode4');
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

    await expect(evaluateEntitlements(templates, params, logger)).rejects.toThrow('Not all services were found for the org. Found: 1, Expected: 4 Missing: sdkCode2,sdkCode3,sdkCode4');
    expect(mockConsoleSDK.init).toHaveBeenCalledWith('userToken', 'clientId', 'stage');
    expect(mockConsoleClient.getServicesForOrgV2).toHaveBeenCalledWith('orgId', 'sdkCode1,sdkCode2,sdkCode3,sdkCode4');
    expect(logger.debug).toHaveBeenNthCalledWith(1, 'Evaluating entitlements for 2 templates, orgId: orgId');
    expect(logger.debug).toHaveBeenNthCalledWith(2, 'apiHost:', undefined);
    expect(logger.debug).toHaveBeenNthCalledWith(3, 'env: ', 'stage');
    expect(logger.debug).toHaveBeenNthCalledWith(4, 'Retrieving services for org orgId with sdkCodes: sdkCode1,sdkCode2,sdkCode3,sdkCode4');
  });
});
