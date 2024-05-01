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
const { errorResponse, errorMessage, getBearerToken, stringParameters, checkMissingRequestInputs, ERR_RC_SERVER_ERROR, ERR_RC_HTTP_METHOD_NOT_ALLOWED, ERR_RC_INVALID_IMS_ACCESS_TOKEN, ERR_RC_INCORRECT_REQUEST, ERR_RC_INVALID_TEMPLATE_ID, getConsoleEnv } = require('../../utils');
const { validateAccessToken } = require('../../ims');
const { findTemplateById } = require('../../templateRegistry');
const Enforcer = require('openapi-enforcer');
const consoleLib = require('@adobe/aio-lib-console');

const HTTP_METHOD = 'post';
const POST_PARAM_NAME = 'templateId';

/**
 * Serialize the request body of Install template action
 * @param {object} params action params
 * @returns {object} serialized request body
 */
const serializeRequestBody = (params) => {
  // Extracting required properties
  const { orgId, projectName, description, metadata } = params;
  // Constructing the serialized object
  return {
    orgId,
    projectName,
    ...(description && { description }), // Include description if it exists
    metadata // Include metadata object
  };
};

/**
 * Install a template - create Developer Console project with required credentials and APIs.
 * @param {object} params request parameters
 * @returns {object} response
 */
async function main (params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });

  const imsUrl = params.IMS_URL;
  const imsClientId = params.IMS_CLIENT_ID;

  const dbParams = {
    MONGODB_URI: params.MONGODB_URI,
    MONGODB_NAME: params.MONGODB_NAME
  };

  try {
    // 'info' is the default level if not set
    logger.info('Calling "POST install template"');

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params));

    if (params.__ow_method === undefined || params.__ow_method.toString().toLowerCase() !== HTTP_METHOD) {
      logger.error(`Unsupported method: ${params.__ow_method}`);
      return errorResponse(405, [errorMessage(ERR_RC_HTTP_METHOD_NOT_ALLOWED, `HTTP "${params.__ow_method}" method is unsupported.`)], logger);
    }

    // check for missing request input parameters and headers
    const requiredHeaders = ['Authorization'];
    let errorMessages = checkMissingRequestInputs(params, [], requiredHeaders);
    if (errorMessages) {
      return errorResponse(401, errorMessages, logger);
    }
    const requiredParams = [
      POST_PARAM_NAME
    ];
    errorMessages = checkMissingRequestInputs(params, requiredParams);
    if (errorMessages) {
      return errorResponse(400, errorMessages, logger);
    }

    // extract the user Bearer token from the Authorization header
    const accessToken = getBearerToken(params);

    try {
      // validate the token, an exception will be thrown for a non-valid token
      await validateAccessToken(accessToken, imsUrl, imsClientId);
    } catch (error) {
      return errorResponse(401, [errorMessage(ERR_RC_INVALID_IMS_ACCESS_TOKEN, error.message)], logger);
    }

    Enforcer.v3_0.Schema.defineDataTypeFormat('string', 'uuid', null);
    Enforcer.v3_0.Schema.defineDataTypeFormat('string', 'uri', null);

    // WPAR002 - skip a warning about the "allowEmptyValue" property
    // see https://swagger.io/docs/specification/describing-parameters/ Empty-Valued and Nullable Parameters
    const openapi = await Enforcer('./template-registry-api.json', { componentOptions: { exceptionSkipCodes: ['WPAR002'] } });

    const body = serializeRequestBody(params);

    logger.debug(`Request body: ${JSON.stringify(body)}`);

    const [req, reqError] = openapi.request({
      method: 'POST',
      path: '/templates/{templateId}/install',
      body
    });
    if (reqError) {
      return errorResponse(400, [errorMessage(ERR_RC_INCORRECT_REQUEST, reqError.toString().split('\n').map(line => line.trim()).join(' => '))], logger);
    }
    console.log('Request:', req);

    const template = await findTemplateById(dbParams, params.templateId);
    if (!template) {
      logger.error(`Template with id ${params.templateId} not found.`);
      return errorResponse(404, [errorMessage(ERR_RC_INVALID_TEMPLATE_ID, `Template with id ${params.templateId} not found.`)], logger);
    }
    logger.info(`Template found: ${JSON.stringify(template)}`);

    // extract credentials and APIs from the template
    const { credentials, apis } = template;

    logger.debug(`Credentials found: ${JSON.stringify(credentials)}`);
    logger.debug(`APIs found: ${JSON.stringify(apis)}`);

    // credential types could be: 'oauth_server_to_server', 'apikey', 'oauthnativeapp', 'oauthwebapp', 'oauthsinglepageapp'
    // credential flow types could be: 'adobeid', 'entp'
    // adobeid is used for OAuth creds and entp is used for OAuthS2S and JWT creds

    const mapAdobeIdCredentialTypeToPlatformType = {
      apikey: 'apiKey',
      oauthnativeapp: 'NativeApp',
      oauthwebapp: 'WebApp',
      oauthsinglepageapp: 'SinglePageApp'
    };

    const env = getConsoleEnv(logger);
    const consoleClient = await consoleLib.init(accessToken, params.IMS_CLIENT_ID, env);

    // Console APIs only support creating one type of credential at a time
    // Also, for current templates, we only support one credential type per template
    // So, assuming only one credential present in credentials array

    const credentialType = credentials[0].type;
    const credentialFlowType = credentials[0].flowType;
    let createIntegrationResponse = {};

    if (credentialFlowType === 'adobeid') {
      // form integration request body
      const createAdobeIdIntegrationReqBody = {
        name: String(body.projectName),
        description: String(body.description ? body.description : `Created from template ${template.name}`),
        platform: String(mapAdobeIdCredentialTypeToPlatformType[credentialType]),
        ...(body.metadata?.urlScheme && { urlScheme: body.metadata.urlScheme }), // Include urlScheme if it exists
        ...(body.metadata?.redirectUriList && { redirectUriList: body.metadata.redirectUriList }), // Include redirectUriList if it exists
        ...(body.metadata?.defaultRedirectUri && { defaultRedirectUri: body.metadata.defaultRedirectUri }), // Include defaultRedirectUri if it exists
        ...(body.metadata?.domain && { domain: body.metadata.domain }), // Include domain if it exists
        templateId: params.templateId,
        services: []
      };

      // iterate over APIs and add APIs to request body services array
      for (const api of apis) {
        if (api.flowType !== 'adobeid' || api.credentialType !== credentialType) {
          continue;
        }
        const service = {
          sdkCode: api.code,
          atlasPlanCode: '',
          licenseConfigs: [],
          roles: []
        };
        createAdobeIdIntegrationReqBody.services.push(service);
      }

      logger.debug(`Create AdobeId Integration Request Body: ${JSON.stringify(createAdobeIdIntegrationReqBody)}`);

      // create AdobeID integration
      createIntegrationResponse = await consoleClient.createAdobeIdIntegration(body.orgId, createAdobeIdIntegrationReqBody);
      logger.debug(`AdobeID Integration created: ${JSON.stringify(createIntegrationResponse)}`);
    } else if (credentialFlowType === 'entp') {
      // form integration request body
      const createOAuthS2SIntegrationReqBody = {
        name: String(body.projectName),
        description: String(body.description ? body.description : `Created from template ${template.name}`),
        templateId: params.templateId,
        services: []
      };

      for (const api of apis) {
        if (api.flowType !== 'entp' || api.credentialType !== credentialType) {
          continue;
        }
        const service = {
          sdkCode: api.code,
          atlasPlanCode: '',
          licenseConfigs: [],
          roles: []
        };
        createOAuthS2SIntegrationReqBody.services.push(service);
      }
      logger.debug(`Create OAuth S2S Integration Request Body: ${JSON.stringify(createOAuthS2SIntegrationReqBody)}`);

      // create OAuth server to server integration
      createIntegrationResponse = await consoleClient.createOauthS2SCredentialIntegration(body.orgId, createOAuthS2SIntegrationReqBody);
      logger.debug(`OAuth S2S Integration created: ${JSON.stringify(createIntegrationResponse)}`);
    } else {
      logger.error(`Credential flow type "${credentialFlowType}" not supported for template install.`);
      return errorResponse(400, [errorMessage(ERR_RC_INCORRECT_REQUEST, `Credential flow type "${credentialFlowType}" not supported for template install`)], logger);
    }
    const { projectId, workspaceId } = createIntegrationResponse;
    logger.debug(`ProjectId: ${projectId}, WorkspaceId: ${workspaceId}`);

    // call download workspace config API to get the config
    const response = await consoleClient.downloadWorkspaceJson(body.orgId, projectId, workspaceId);
    logger.debug(`Workspace config: ${JSON.stringify(response)}`);

    // validate the response data to be sure it complies with OpenApi Schema
    const [res, resError] = req.response(201, response);
    if (resError) {
      throw new Error(resError.toString());
    }

    logger.info('"POST Install templates" executed successfully');
    return {
      statusCode: 201,
      body: res.body
    };
  } catch (error) {
    logger.error(error);
    return errorResponse(500, [errorMessage(ERR_RC_SERVER_ERROR, error.message)], logger);
  }
}
exports.main = main;
