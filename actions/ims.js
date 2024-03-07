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

/**
 * Checks that the provided token is a valid IMS access token.
 *
 * @param {string} accessToken IMS access token
 * @param {string} imsUrl IMS host
 * @param {string} imsClientId IMS client id
 * @returns {void}
 */
async function validateAccessToken(accessToken, imsUrl, imsClientId) {
  const response = await requestImsResource(
    imsUrl + '/ims/validate_token/v1',
    accessToken,
    { 'X-IMS-ClientId': imsClientId },
    { 'client_id': imsClientId, 'type': 'access_token' }
  );
  if (response.valid === true) {
    return;
  } else {
    const error = `Provided IMS access token is invalid. Reason: ${response.reason}`;
    throw new Error(error);
  }
}

/**
 * Checks if the provided IMS access token belongs to an admin user.
 *
 * @param {string} accessToken IMS access token
 * @param {string} imsUrl IMS host
 * @param {array<string>} adminImsOrganizations IMS organizations related to admin users
 * @returns {Promise<boolean>}
 */
async function isAdmin(accessToken, imsUrl, adminImsOrganizations) {
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
 * @param {string} url URL to IMS resource
 * @param {string} accessToken IMS access token
 * @param {object} headers headers to be set if any
 * @param {object} params params to be set if any
 * @returns {Promise}
 * @private
 */
async function requestImsResource(url, accessToken, headers = {}, params = {}) {
  return new Promise((resolve, reject) => {
    axios({
      'method': 'get',
      'url': url,
      'headers': {
        'Authorization': `Bearer ${accessToken}`,
        ...headers
      },
      'params': params
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

module.exports = {
  validateAccessToken,
  isAdmin
};
