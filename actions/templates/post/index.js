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

const { Core } = require('@adobe/aio-sdk');
const { errorResponse, errorMessage, getBearerToken, stringParameters, checkMissingRequestInputs, ERR_RC_SERVER_ERROR, ERR_RC_HTTP_METHOD_NOT_ALLOWED, ERR_RC_INVALID_IMS_ACCESS_TOKEN, ERR_RC_INCORRECT_REQUEST }
  = require('../../utils');
const { validateAccessToken, generateAccessToken } = require('../../ims');
const { findTemplateByName, addTemplate } = require('../../templateRegistry');
const Enforcer = require('openapi-enforcer');
const consoleLib = require('@adobe/aio-lib-console');

const HTTP_METHOD = 'post';
const POST_PARAM_NAME = 'name';

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });

  const imsUrl = params.IMS_URL;
  const imsClientId = params.IMS_CLIENT_ID;

  const dbParams = {
    'MONGODB_URI': params.MONGODB_URI,
    'MONGODB_NAME': params.MONGODB_NAME
  };

  try {
    // 'info' is the default level if not set
    logger.info('Calling "POST templates"');

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params));

    if (params.__ow_method === undefined || params.__ow_method.toLowerCase() !== HTTP_METHOD) {
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
    const openapi = await Enforcer('./openapi.yaml', { componentOptions: { exceptionSkipCodes: ['WPAR002'] } });

    let body = {
      name: params.name,
      ...(params.description && {description: params.description}), // developer console only
      ...(params.version && {version: params.version}), // developer console only
      createdBy: params.createdBy,
      links: {
        ...(params.links.consoleProject && {consoleProject: params.links.consoleProject}), // developer console only
        ...(params.links.github && {github: params.links.github}) // app builder only
      }
    };

    const [req, reqError] = openapi.request({
      'method': HTTP_METHOD,
      'path': '/templates',
      'body': body
    });
    if (reqError) {
      return errorResponse(400, [errorMessage(ERR_RC_INCORRECT_REQUEST, reqError.toString().split('\n').map(line => line.trim()).join(' => '))], logger);
    }

    const templateName = params.name;
    const consoleProjectUrl = params?.links?.consoleProject;

    const result = await findTemplateByName(dbParams, templateName);
    if (null !== result) {
      return {
        'statusCode': 409
      };
    }

    if (consoleProjectUrl) {
      const projectId = consoleProjectUrl.split('/').at(-2);
      const accessToken = await generateAccessToken(params.IMS_AUTH_CODE, params.IMS_CLIENT_ID, params.IMS_CLIENT_SECRET, params.IMS_SCOPES);
      const consoleClient = await consoleLib.init(accessToken, params.IMS_CLIENT_ID, 'stage'); // Dev console templates can only be added from stage
      const { body: installConfig } = await consoleClient.getProjectInstallConfig(projectId);

      // We have to get the install config in this format to maintain backwards
      // compatibility with current template registry
      const credentials = [];
      const apis = [];

      for (const credential of installConfig.credentials) {
        credentials.push({
          type: credential.type,
          flowType: credential.flowType,
        });

        if (credential.apis) {
          apis.push(...credential.apis.map(api => {
            return {
              credentialType: credential.type,
              flowType: credential.flowType,
              code: api.code,
              productProfiles: api?.productProfiles
            };
          }));
        }
      }

      body = {
        ...body,
        credentials,
        apis
      };
    }

    const template = await addTemplate(dbParams, body);
    // const issueNumber = await createReviewIssue(templateName, githubRepoUrl, params.ACCESS_TOKEN_GITHUB, params.TEMPLATE_REGISTRY_ORG, params.TEMPLATE_REGISTRY_REPOSITORY);
    const response = {
      ...template,
      '_links': {
        'self': {
          'href': `${params.TEMPLATE_REGISTRY_API_URL}/templates/${templateName}`
        },
        // 'review': {
        //   'href': `https://github.com/${params.TEMPLATE_REGISTRY_ORG}/${params.TEMPLATE_REGISTRY_REPOSITORY}/issues/${issueNumber}`,
        //   'description': 'A link to the "Template Review Request" Github issue.'
        // }
      }
    };

    // validate the response data to be sure it complies with OpenApi Schema
    const [res, resError] = req.response(200, response);
    if (resError) {
      throw new Error(resError.toString());
    }

    logger.info('"POST templates" executed successfully');
    return {
      'statusCode': 200,
      'body': res.body
    };
  } catch (error) {
    // log any server errors
    logger.error(error);
    // return with 500
    return errorResponse(500, [errorMessage(ERR_RC_SERVER_ERROR, 'An error occurred, please try again later.')], logger);
  }
}

exports.main = main;
