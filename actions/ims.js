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

const axios = require('axios').default;
const { Ims, getTokenData } = require('@adobe/aio-lib-ims');
const { getEnv } = require('./utils');

const CACHE_MAX_AGE = 10 * 60 * 1000; // 10 minutes
const credentialCache = {
  token: null,
  expiration: null
};

/**
 * Checks that the provided token is a valid IMS access token.
 *
 * @param {string} accessToken IMS access token
 * @param {string} imsUrl IMS host
 * @param {string} imsClientId IMS client id
 * @returns {Promise<void>}
 */
async function validateAccessToken (accessToken, imsUrl, imsClientId) {
  const response = await requestImsResource(
    imsUrl + '/ims/validate_token/v1',
    accessToken,
    { 'X-IMS-ClientId': imsClientId },
    { client_id: imsClientId, type: 'access_token' }
  );
  if (!response.valid) {
    const error = `Provided IMS access token is invalid. Reason: ${response.reason}`;
    throw new Error(error);
  }
}

/**
 * Checks if the provided IMS access token belongs to an admin user.
 *
 * @param {string} accessToken IMS access token
 * @param {string} imsUrl IMS host
 * @param {Array<string>} adminImsOrganizations IMS organizations related to admin users
 * @returns {Promise<boolean>} true if the user is an admin, false otherwise
 */
async function isAdmin (accessToken, imsUrl, adminImsOrganizations) {
  const imsOrganizations = await requestImsResource(imsUrl + '/ims/organizations/v6', accessToken);
  let isAdmin = false;
  imsOrganizations.forEach(item => {
    const imsOrg = item.orgRef.ident + '@' + item.orgRef.authSrc;
    if (adminImsOrganizations.includes(imsOrg)) {
      isAdmin = true;
    }
  });
  return isAdmin;
}

/**
 * Checks if the provided IMS access token is a service token and has access to the list of required scopes.
 * Checking for "@AdobeService" is the new way to check for a service token, but older service clients won't
 * add this to their tokens, so we also check for the "system" scope.
 * @param {string} accessToken IMS access token
 * @param {Array<string>} requiredScopes Required scopes for the token
 * @returns {boolean} If the token is a service token
 */
function isValidServiceToken (accessToken, requiredScopes = []) {
  const tokenData = getTokenData(accessToken);
  const isServiceToken = tokenData?.user_id?.endsWith('@AdobeService') || tokenData?.scope?.includes('system');
  const hasValidScopes = requiredScopes.every(scope => tokenData?.scope?.includes(scope));
  return isServiceToken && hasValidScopes;
}

/**
 * @param {string} url URL to IMS resource
 * @param {string} accessToken IMS access token
 * @param {object} headers headers to be set if any
 * @param {object} params params to be set if any
 * @returns {Promise}
 * @private
 */
async function requestImsResource (url, accessToken, headers = {}, params = {}) {
  return new Promise((resolve, reject) => {
    axios({
      method: 'get',
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers
      },
      params
    })
      .then(response => {
        if (response.status === 200) {
          resolve(response.data);
        } else {
          const error = `Error fetching "${url}". Response code is ${response.status}`;
          reject(new Error(error));
        }
      })
      .catch(e => {
        const error = `Error fetching "${url}". ${e.toString()}`;
        reject(new Error(error));
      });
  });
}

/**
 * Generates an IMS access token using the provided IMS Auth Code.
 * @param {string} imsAuthCode - IMS Auth Code
 * @param {string} imsClientId - IMS Client ID
 * @param {string} imsClientSecret - IMS Client Secret
 * @param {string} imsScopes - List of space-separated scopes
 * @param {object} logger - Logger object
 * @returns {Promise<string>} - IMS access token
 */
async function generateAccessToken (imsAuthCode, imsClientId, imsClientSecret, imsScopes, logger) {
  // If the token is not cached or has expired, generate a new one
  if (!credentialCache.token || credentialCache.expiration <= Date.now()) {
    const ims = new Ims(getEnv(logger));
    const { payload } = await ims.getAccessToken(imsAuthCode, imsClientId, imsClientSecret, imsScopes);
    credentialCache.token = payload.access_token;
    credentialCache.expiration = Date.now() + CACHE_MAX_AGE;
    logger.debug('Generated IMS access token');
  }

  return credentialCache.token;
}

module.exports = {
  validateAccessToken,
  isAdmin,
  isValidServiceToken,
  generateAccessToken
};
