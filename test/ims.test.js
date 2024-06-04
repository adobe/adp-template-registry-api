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

const nock = require('nock');
const { Ims, getTokenData } = require('@adobe/aio-lib-ims');
const { validateAccessToken, isAdmin, generateAccessToken, isValidServiceToken } = require('../actions/ims');

jest.mock('@adobe/aio-lib-ims');

const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };

process.env = {
  IMS_URL: 'https://ims-na1-stg1.adobelogin.com',
  IMS_CLIENT_ID: 'test'
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetAllMocks();
});

describe('Verify communication with IMS', () => {
  test('Verify checking that provided IMS access token is valid', async () => {
    nock(process.env.IMS_URL)
      .get(`/ims/validate_token/v1?client_id=${process.env.IMS_CLIENT_ID}&type=access_token`)
      .times(1)
      .reply(200, {
        valid: true
      });

    await expect(validateAccessToken('<access-token>', process.env.IMS_URL, process.env.IMS_CLIENT_ID))
      .resolves.toBeUndefined();
  });

  test('Verify that exception is thrown for non-valid IMS access token', async () => {
    nock(process.env.IMS_URL)
      .get(`/ims/validate_token/v1?client_id=${process.env.IMS_CLIENT_ID}&type=access_token`)
      .times(1)
      .reply(200, {
        valid: false,
        reason: 'bad_signature'
      });

    await expect(validateAccessToken('<access-token>', process.env.IMS_URL, process.env.IMS_CLIENT_ID))
      .rejects.toThrow('Provided IMS access token is invalid. Reason: bad_signature');
  });

  test('Verify checking that provided IMS access token belongs to admin user', async () => {
    const adminImsOrganizations = [
      'adminOrg@AdobeOrg'
    ];
    nock(process.env.IMS_URL)
      .get('/ims/organizations/v6')
      .times(1)
      .reply(200, [
        {
          orgName: 'Org1',
          orgRef: { ident: 'adminOrg', authSrc: 'AdobeOrg' },
          orgType: 'Enterprise'
        },
        {
          orgName: 'Org2',
          orgRef: { ident: 'non-adminOrg', authSrc: 'AdobeOrg' },
          orgType: 'Enterprise'
        }
      ]);

    await expect(isAdmin('<access-token>', process.env.IMS_URL, adminImsOrganizations))
      .resolves.toBe(true);
  });

  test('Verify checking that provided IMS access token does not belong to admin user', async () => {
    const adminImsOrganizations = [
      'adminOrg@AdobeOrg'
    ];
    nock(process.env.IMS_URL)
      .get('/ims/organizations/v6')
      .times(1)
      .reply(200, [
        {
          orgName: 'Org1',
          orgRef: { ident: 'non-adminOrg1', authSrc: 'AdobeOrg' },
          orgType: 'Enterprise'
        },
        {
          orgName: 'Org2',
          orgRef: { ident: 'non-adminOrg2', authSrc: 'AdobeOrg' },
          orgType: 'Enterprise'
        }
      ]);

    await expect(isAdmin('<access-token>', process.env.IMS_URL, adminImsOrganizations))
      .resolves.toBe(false);
  });

  test('Verify that exception is thrown for non-successful IMS communication', async () => {
    nock(process.env.IMS_URL)
      .get('/ims/organizations/v6')
      .times(1)
      .reply(400);

    await expect(isAdmin('<access-token>', process.env.IMS_URL, []))
      .rejects.toThrow(`Error fetching "${process.env.IMS_URL}/ims/organizations/v6". AxiosError: Request failed with status code 400`);
  });

  test('Verify that exception is thrown for non-successful IMS communication, non-error code', async () => {
    nock(process.env.IMS_URL)
      .get('/ims/organizations/v6')
      .times(1)
      .reply(201);

    await expect(isAdmin('<access-token>', process.env.IMS_URL, []))
      .rejects.toThrow(`Error fetching "${process.env.IMS_URL}/ims/organizations/v6". Response code is 201`);
  });

  test('Verify generate access token', async () => {
    const getAccessTokenMock = jest.fn(() => ({
      payload: {
        access_token: 'my-access-token',
        refresh_token: 'my-refresh-token'
      }
    }));
    Ims.mockImplementation(() => ({
      getAccessToken: getAccessTokenMock
    }));

    // Initial call that should fetch the token
    await expect(generateAccessToken('', process.env.IMS_CLIENT_ID, 'client-secret', 'adobeid', mockLoggerInstance))
      .resolves.toBe('my-access-token');
    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);

    // Subsequent call that should use the cached token
    await expect(generateAccessToken('', process.env.IMS_CLIENT_ID, 'client-secret', 'adobeid', mockLoggerInstance))
      .resolves.toBe('my-access-token');
    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  test('Verify cached token expiration', async () => {
    const getAccessTokenMock = jest.fn(() => ({
      payload: {
        access_token: 'my-access-token',
        refresh_token: 'my-refresh-token'
      }
    }));
    Ims.mockImplementation(() => ({
      getAccessToken: getAccessTokenMock
    }));

    // Initial call that should
    await expect(generateAccessToken('', process.env.IMS_CLIENT_ID, 'client-secret', 'adobeid', mockLoggerInstance))
      .resolves.toBe('my-access-token');
    expect(getAccessTokenMock).toHaveBeenCalledTimes(0);

    // Move time forward by 11 minutes
    jest
      .useFakeTimers()
      .setSystemTime(new Date(Date.now() + 1000 * 60 * 11));

    await expect(generateAccessToken('', process.env.IMS_CLIENT_ID, 'client-secret', 'adobeid', mockLoggerInstance))
      .resolves.toBe('my-access-token');
    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);

    // Reset system time
    jest.useRealTimers();
  });

  test('Verify checking that provided IMS access token is a service token with no required scopes', () => {
    getTokenData.mockImplementation(() => ({
      user_id: 'service-account@AdobeService'
    }));

    expect(isValidServiceToken('fake-token')).toBe(true);
  });

  test('Verify checking that provided IMS access token is a service token due to the system scope', () => {
    getTokenData.mockImplementation(() => ({
      user_id: 'service-account@AdobeID',
      scope: 'system'
    }));

    expect(isValidServiceToken('fake-token')).toBe(true);
  });

  test('Verify checking that provided IMS access token is not a service token', () => {
    getTokenData.mockImplementation(() => ({
      user_id: 'service-account@AdobeID',
      scope: 'not-the-scope'
    }));

    expect(isValidServiceToken('fake-token')).toBe(false);
  });

  test('Verify checking that provided IMS access token is a service token, but does not have required scopes', () => {
    getTokenData.mockImplementation(() => ({
      user_id: 'service-account@AdobeService',
      scope: 'not-the-scope'
    }));

    expect(isValidServiceToken('fake-token', ['that-scope'])).toBe(false);
  });

  test('Verify checking that provided IMS access token is a service token and has access to multiple scopes', () => {
    getTokenData.mockImplementation(() => ({
      user_id: 'service-account@AdobeService',
      scope: 'not-the-scope,the-other-scope'
    }));

    expect(isValidServiceToken('fake-token', ['that-scope', 'the-other-scope'])).toBe(false);
  });
});
