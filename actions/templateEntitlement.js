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

const consoleLib = require('@adobe/aio-lib-console');
const { getBearerToken, getHeaderValue, getEnv } = require('./utils');

/**
 * Evaluate entitlements for a set of templates. This function will check if the user is entitled to use the templates.
 * @param {Array} templates Array of templates
 * @param {object} params Request parameters
 * @param {object} logger Logger instance
 * @returns {Promise<Array>} Array of templates with entitlement information
 */
async function evaluateEntitlements (templates, params, logger) {
  const orgId = getHeaderValue(params, 'x-org-id');
  const userToken = getBearerToken(params);

  if (!orgId || !templates || templates.length === 0) {
    logger.debug('No org id or templates specified. Skipping entitlement check.');
    return templates;
  }

  if (!userToken) {
    throw new Error('Invalid user token or templates');
  }

  logger.debug(`Evaluating entitlements for ${templates.length} templates, orgId: ${orgId}`);

  const env = getEnv(logger);
  const consoleClient = await consoleLib.init(userToken, params.IMS_CLIENT_ID, env);

  const sdkCodesSet = new Set(templates.flatMap((template) => template.apis.map((api) => api.code)));
  const sdkCodes = Array.from(sdkCodesSet).join(',');

  logger.debug(`Retrieving services for org ${orgId} with sdkCodes: ${sdkCodes}`);

  const orgServicesResult = await consoleClient.getServicesForOrgV2(orgId, sdkCodes);

  if (orgServicesResult.body?.services?.length === 0 || !Array.isArray(orgServicesResult.body?.services)) {
    throw new Error('Failed to retrieve services for the organization. Received: ' + JSON.stringify(orgServicesResult.body));
  }

  const orgServices = orgServicesResult.body.services;

  const orgServicesSdkCodesSet = new Set(orgServices.map((service) => service.code));
  // we received less services than we requested this should never happen
  // we throw an error if it does
  if (orgServicesSdkCodesSet.size < sdkCodesSet.size) {
    const missingSdkCodes = [...sdkCodesSet].filter(a => !orgServicesSdkCodesSet.has(a));
    throw new Error(`Not all services were found for the org. Found: ${orgServices.length}, Expected: ${sdkCodesSet.size} Missing: ${missingSdkCodes}`);
  }

  const orgServicesBySdkCode = orgServices.reduce((acc, service) => {
    acc[service.code] = service;
    return acc;
  }, {});

  logger.debug(`Retrieved services for org ${orgId}`);
  let checkForPendingRequests = false;
  templates = templates.map((template) => {
    logger.debug(`Evaluating entitlements for template ${template.name}`);
    let userEntitled = true;
    let orgEntitled = true;
    let canRequestAccess = true;
    const disEntitledReasons = new Set();

    template.apis.forEach((api) => {
      const orgService = orgServicesBySdkCode[api.code];
      userEntitled = userEntitled && orgService.enabled;
      orgEntitled = orgEntitled && orgService.entitledForOrg;
      canRequestAccess = canRequestAccess && orgService.canRequestAccess;

      if (orgService.disabledReasons?.length > 0) {
        orgService.disabledReasons.forEach((reason) => {
          disEntitledReasons.add(reason);
        });
      }
      if (Array.isArray(orgService.properties?.licenseConfigs)) {
        api.licenseConfigs = orgService.properties.licenseConfigs;
      }
    });

    logger.debug(`Entitlements for orgId: ${orgId} template ${template.name}: userEntitled: ${userEntitled}, orgEntitled: ${orgEntitled}, canRequestAccess: ${canRequestAccess}, disEntitledReasons: ${JSON.stringify(disEntitledReasons)}`);

    // if user can request access and an app id has been defined for this template, we check whether there are any pending requests
    if (canRequestAccess && template.requestAccessAppId) {
      checkForPendingRequests = true;
    }

    return {
      ...template,
      userEntitled,
      orgEntitled,
      canRequestAccess,
      disEntitledReasons: [...disEntitledReasons]
    };
  });

  // if no need to check for pending requests, return the already evaluated templates
  if (!checkForPendingRequests) {
    return templates;
  }

  const appIdsWithPendingRequests = await fetchAppIdsWithPendingRequests(userToken, orgId, env, logger);

  return templates.map(template => {
    if (template.requestAccessAppId && appIdsWithPendingRequests.has(template.requestAccessAppId)) {
      template.isRequestPending = true;
    }

    return template;
  });
}

/**
 * Calls ACRS to fetch all requests for the user in the org. Collects all the app ids with a pending status
 * in a set and returns that in the response. In case of an error, the error is caught and logged and an empty
 * Set is returned
 * @param {string} userToken Token belonging to the logged in user
 * @param {string} orgId IMS org id for the org to be checked
 * @param {string} env Service environment - stage or prod
 * @param {string} apiKey API key of the service
 * @param {object} logger logger instance
 * @returns {Set<string>} a Set of app ids which have a pending request
 */
async function fetchAppIdsWithPendingRequests (userToken, orgId, env, apiKey, logger) {
  try {
    const url = `https://acrs${env === 'stage' ? '-stage' : ''}.adobe.io/organization/${orgId}/app_auth_requests?userAccountId=self`;
    logger.debug(`Fetching pending requests from acrs url:${url}`);
    const headers = {
      Authorization: 'Bearer ' + userToken,
      'x-api-key': apiKey
    };
    const response = await fetch(url, { headers });
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
    logger.error(`Error while fetching pending requests from acrs for org ${orgId}. Error: ${error.stack}`);
    throw new Error(`Failed to fetch pending requests from ACRS for org ${orgId}`);
  }
};

module.exports = {
  evaluateEntitlements
};
