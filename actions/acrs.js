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

/**
 * Calls ACRS to fetch all requests for the user in the org. Collects all the app ids with a pending status
 * in a set and returns that in the response. In case of an error, the error is caught and logged and an empty
 * Set is returned
 * @param {string} userToken Token belonging to the logged in user
 * @param {string} orgId IMS org id for the org to be checked
 * @param {string} env Service environment - stage or prod
 * @param {string} apiKey API key of the service
 * @param {object} logger logger instance
 * @returns {Promise<Set<string>>} a Set of app ids which have a pending request
 */
async function fetchAppIdsWithPendingRequests (userToken, orgId, env, apiKey, logger) {
  try {
    const url = `https://acrs${env === 'stage' ? '-stage' : ''}.adobe.io/organization/${orgId}/app_auth_requests?userAccountId=self`;
    logger.debug(`Fetching pending requests from acrs url:${url}`);
    const headers = {
      authorization: 'Bearer ' + userToken,
      'x-api-key': apiKey
    };
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const responseText = await response.text();
      logger.error(`Error response from acrs while fetching pending requests for org ${orgId}. Response: ${responseText}`);
      throw new Error(`Failed to fetch pending requests from ACRS for org ${orgId}.`);
    }

    const accessRequests = await response.json();

    const pendingAppIds = new Set();
    accessRequests.forEach(accessRequest => {
      if (accessRequest.status !== 'PENDING') {
        return;
      }

      accessRequest.applicationIds.forEach(applicationId => pendingAppIds.add(applicationId));
    });
    return pendingAppIds;
  } catch (error) {
    logger.error(`Error while fetching pending requests from acrs for org ${orgId}.`, error);
    throw new Error(`Failed to fetch pending requests from ACRS for org ${orgId}.`);
  }
}

module.exports = {
  fetchAppIdsWithPendingRequests
};
