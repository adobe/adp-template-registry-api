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
const { errorResponse, errorMessage, stringParameters, checkMissingRequestInputs, ERR_RC_SERVER_ERROR, ERR_RC_HTTP_METHOD_NOT_ALLOWED, ERR_RC_INCORRECT_REQUEST, ERR_RC_MISSING_REQUIRED_PARAMETER, getEnv } =
  require('../../utils');
const { generateAccessToken } = require('../../ims');
const { findTemplateById, updateTemplate } = require('../../templateRegistry');
const Enforcer = require('openapi-enforcer');
const consoleLib = require('@adobe/aio-lib-console');

const HTTP_METHOD = 'put';
const PUT_PARAM_NAME = 'templateId';

const serializeRequestBody = (params) => {
  return {
    ...(params.description && { description: params.description }), // developer console only
    ...(params.latestVersion && { latestVersion: params.latestVersion }), // developer console only
    ...(params.updatedBy && { updatedBy: params.updatedBy }),
    ...('adobeRecommended' in params && { adobeRecommended: params.adobeRecommended }),
    ...('keywords' in params && params.keywords.length && { keywords: params.keywords }),
    ...('categories' in params && params.categories.length && { categories: params.categories }),
    ...('extensions' in params && params.extensions.length && { extensions: params.extensions }),
    ...('credentials' in params && params.credentials.length && { credentials: params.credentials }),
    ...('codeSamples' in params && params.codeSamples.length && { codeSamples: params.codeSamples }),
    ...('requestAccessAppId' in params && { requestAccessAppId: params.requestAccessAppId }),
    ...('apis' in params && params.apis.length && { apis: params.apis }),
    ...('status' in params && { status: params.status }),
    ...('runtime' in params && { runtime: params.runtime }),
    ...('links' in params && { links: params.links })
  };
};

/**
 * Updates a new template in the Template Registry.
 * @param {object} params request parameters
 * @returns {object} response
 */
async function main (params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });

  const dbParams = {
    MONGODB_URI: params.MONGODB_URI,
    MONGODB_NAME: params.MONGODB_NAME
  };

  try {
    // 'info' is the default level if not set
    logger.info('Calling "PUT templates"');

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params));

    if (params.__ow_method === undefined || params.__ow_method.toLowerCase() !== HTTP_METHOD) {
      return errorResponse(405, [errorMessage(ERR_RC_HTTP_METHOD_NOT_ALLOWED, `HTTP "${params.__ow_method}" method is unsupported.`)], logger);
    }

    // check for missing request input parameters and headers
    const requiredHeaders = ['Authorization'];
    const errorMessages = checkMissingRequestInputs(params, [], requiredHeaders);
    if (errorMessages) {
      return errorResponse(401, errorMessages, logger);
    }

    const isTemplateIdValid = PUT_PARAM_NAME in params && typeof params[PUT_PARAM_NAME] === 'string' && params[PUT_PARAM_NAME].length > 0;
    if (!isTemplateIdValid) {
      return errorResponse(400, [errorMessage(ERR_RC_MISSING_REQUIRED_PARAMETER, `The "${PUT_PARAM_NAME}" parameter is not set.`)], logger);
    }

    Enforcer.v3_0.Schema.defineDataTypeFormat('string', 'uuid', null);
    Enforcer.v3_0.Schema.defineDataTypeFormat('string', 'uri', null);

    // WPAR002 - skip a warning about the "allowEmptyValue" property
    // see https://swagger.io/docs/specification/describing-parameters/ Empty-Valued and Nullable Parameters
    const openapi = await Enforcer('./template-registry-api.json', { componentOptions: { exceptionSkipCodes: ['WPAR002'] } });

    let body = serializeRequestBody(params);

    const [req, reqError] = openapi.request({
      method: HTTP_METHOD,
      path: `/templates/{${PUT_PARAM_NAME}}`,
      params: {
        templateId: params[PUT_PARAM_NAME]
      },
      body
    });
    if (reqError) {
      return errorResponse(400, [errorMessage(ERR_RC_INCORRECT_REQUEST, reqError.toString().split('\n').map(line => line.trim()).join(' => '))], logger);
    }

    const templateId = params.templateId;
    const consoleProjectUrl = params?.links?.consoleProject;

    const hasCredentialsOrApiInParams = (('credentials' in params && params.credentials.length > 0) || ('apis' in params && params.apis.length > 0));

    if (hasCredentialsOrApiInParams) {
      // scenario 1 :  if apis or credentials, just overwrite the template
      const dbResponse = await updateTemplate(dbParams, templateId, body);
      if (dbResponse.matchedCount < 1) {
        return {
          statusCode: 404
        };
      }
    } else if (consoleProjectUrl) {
      // scenario 2 :  if consoleProject in payload, replace apis and credentials
      const projectId = consoleProjectUrl.split('/').at(-2);
      const accessToken = await generateAccessToken(params.IMS_AUTH_CODE, params.IMS_CLIENT_ID, params.IMS_CLIENT_SECRET, params.IMS_SCOPES, logger);
      const consoleClient = await consoleLib.init(accessToken, params.IMS_CLIENT_ID, getEnv(logger));
      const { body: installConfig } = await consoleClient.getProjectInstallConfig(projectId);

      // We have to get the install config in this format to maintain backwards
      // compatibility with current template registry
      const credentials = [];
      const apis = [];
      for (const credential of installConfig.credentials) {
        credentials.push({
          type: credential.type,
          flowType: credential.flowType
        });

        if (credential.apis) {
          apis.push(...credential.apis.map(api => {
            return {
              credentialType: credential.type,
              flowType: credential.flowType,
              code: api.code
            };
          }));
        }
      }

      body = { ...body, credentials, apis };
    }

    // an app builder template scenario
    const dbResponse = await updateTemplate(dbParams, templateId, body);
    if (dbResponse.matchedCount < 1) {
      logger.info('"PUT templates" not executed successfully');
      return {
        statusCode: 404
      };
    }

    // fetch the updated template from the database
    const template = await findTemplateById(dbParams, templateId);

    const response = {
      ...template,
      _links: {
        self: {
          href: `${params.TEMPLATE_REGISTRY_API_URL}/templates/${template?.name}`
        }
      }
    };

    // validate the response data to be sure it complies with OpenApi Schema
    const [res, resError] = req.response(200, response);
    if (resError) {
      throw new Error(resError.toString());
    }

    logger.info('"PUT templates" executed successfully');
    return {
      statusCode: 200,
      body: res.body
    };
  } catch (error) {
    // log any server errors
    logger.error(error);
    // return with 500
    return errorResponse(500, [errorMessage(ERR_RC_SERVER_ERROR, 'An error occurred, please try again later.')], logger);
  }
}

exports.main = main;
