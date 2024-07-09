/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { fetchAppIdsWithPendingRequests } = require('../actions/acrs');

describe('acrs', () => {
  const MOCK_ACRS_RESPONSE = [
    {
      applicationIds: ['ContentTaggingSDK1'],
      productArrangementCodes: [],
      userReason: 'I need access to this or similar application',
      status: 'PENDING',
      userAccountId: '29F71A96660304330A494229@6e2f199d65cfd5d849402d.e',
      createDate: '2024-05-29T05:21:28.000+00:00',
      modifyDate: '2024-05-29T05:21:28.000+00:00',
      statusDate: null,
      orgId: '6CB219EB65CFD5C40A494126@AdobeOrg',
      appAuthRequestId: 'e4c0b6f58fc1a9ea018fc2cbce880007'
    },
    {
      applicationIds: ['ContentTaggingSDK1'],
      productArrangementCodes: [],
      userReason: 'I need access to this or similar application',
      status: 'DENIED',
      adminReason: 'Not providing access at this time',
      userAccountId: '29F71A96660304330A494229@6e2f199d65cfd5d849402d.e',
      createDate: '2024-05-16T06:12:19.000+00:00',
      modifyDate: '2024-05-29T04:45:53.000+00:00',
      statusDate: '2024-05-29T04:45:53.000+00:00',
      orgId: '6CB219EB65CFD5C40A494126@AdobeOrg',
      appAuthRequestId: 'e4c0cd538f7dee57018f8007b1050011'
    }
  ];

  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn()
  };

  test('success', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve(MOCK_ACRS_RESPONSE),
        ok: true
      })
    );
    const orgId = 'orgId';
    const userToken = 'userToken';
    const apiKey = 'api_key';

    const expectedUrl = `https://acrs-stage.adobe.io/organization/${orgId}/app_auth_requests?userAccountId=self`;
    const expectedHeaders = {
      'x-api-key': apiKey,
      authorization: 'Bearer ' + userToken
    };

    const result = await fetchAppIdsWithPendingRequests(userToken, orgId, 'stage', apiKey, mockLogger);

    expect(result).toEqual(new Set(['ContentTaggingSDK1']));
    expect(global.fetch).toHaveBeenCalledWith(expectedUrl, { headers: expectedHeaders });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Fetching pending requests from acrs url:${expectedUrl}`);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('failure when response invalid', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        text: () => Promise.resolve('Some error'),
        ok: false
      })
    );
    const orgId = 'orgId';
    const userToken = 'userToken';
    const apiKey = 'api_key';

    const expectedUrl = `https://acrs-stage.adobe.io/organization/${orgId}/app_auth_requests?userAccountId=self`;
    const expectedHeaders = {
      'x-api-key': apiKey,
      authorization: 'Bearer ' + userToken
    };

    await expect(async () => await fetchAppIdsWithPendingRequests(userToken, orgId, 'stage', apiKey, mockLogger)).rejects.toThrow(`Failed to fetch pending requests from ACRS for org ${orgId}.`);

    expect(global.fetch).toHaveBeenCalledWith(expectedUrl, { headers: expectedHeaders });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Fetching pending requests from acrs url:${expectedUrl}`);
    expect(mockLogger.error).toHaveBeenCalledWith(`Error response from acrs while fetching pending requests for org ${orgId}. Response: Some error`);
  });

  test('failure when throws error', async () => {
    const expectedError = new Error('some error');
    global.fetch = jest.fn().mockRejectedValue(expectedError);
    const orgId = 'orgId';
    const userToken = 'userToken';
    const apiKey = 'api_key';

    const expectedUrl = `https://acrs.adobe.io/organization/${orgId}/app_auth_requests?userAccountId=self`;
    const expectedHeaders = {
      'x-api-key': apiKey,
      authorization: 'Bearer ' + userToken
    };

    await expect(async () => await fetchAppIdsWithPendingRequests(userToken, orgId, 'prod', apiKey, mockLogger)).rejects.toThrow(`Failed to fetch pending requests from ACRS for org ${orgId}.`);

    expect(global.fetch).toHaveBeenCalledWith(expectedUrl, { headers: expectedHeaders });
    expect(mockLogger.debug).toHaveBeenCalledWith(`Fetching pending requests from acrs url:${expectedUrl}`);
    expect(mockLogger.error).toHaveBeenCalledWith(`Error while fetching pending requests from acrs for org ${orgId}.`, expectedError);
  });
});
