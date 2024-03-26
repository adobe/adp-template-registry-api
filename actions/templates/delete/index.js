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
const { errorResponse, errorMessage, getBearerToken, stringParameters, checkMissingRequestInputs, ERR_RC_SERVER_ERROR, ERR_RC_HTTP_METHOD_NOT_ALLOWED, ERR_RC_INVALID_IMS_ACCESS_TOKEN, ERR_RC_PERMISSION_DENIED }
  = require('../../utils');
const { validateAccessToken, isAdmin } = require('../../ims');
const { fetchUrl, findTemplateByName, removeTemplateByName } = require('../../templateRegistry');

const HTTP_METHOD = 'delete';

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });

  const imsUrl = params.IMS_URL;
  const imsClientId = params.IMS_CLIENT_ID;
  const adminImsOrganizations = params.ADMIN_IMS_ORGANIZATIONS.split(',');

  const dbParams = {
    'MONGODB_URI': params.MONGODB_URI,
    'MONGODB_NAME': params.MONGODB_NAME
  };

  try {
    // 'info' is the default level if not set
    logger.info('Calling "DELETE templates"');

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params));

    if (params.__ow_method === undefined || params.__ow_method.toLowerCase() !== HTTP_METHOD) {
      return errorResponse(405, [errorMessage(ERR_RC_HTTP_METHOD_NOT_ALLOWED, `HTTP "${params.__ow_method}" method is unsupported.`)], logger);
    }

    // check for missing request input parameters and headers
    const requiredParams = [/* add required params */];
    const requiredHeaders = ['Authorization'];
    const errorMessages = checkMissingRequestInputs(params, requiredParams, requiredHeaders);
    if (errorMessages) {
      return errorResponse(401, errorMessages, logger);
    }

    // extract the user Bearer token from the Authorization header
    const accessToken = getBearerToken(params);

    try {
      // validate the token, an exception will be thrown for a non-valid token
      await validateAccessToken(accessToken, imsUrl, imsClientId);
    } catch (error) {
      return errorResponse(401, [errorMessage(ERR_RC_INVALID_IMS_ACCESS_TOKEN, error.message)], logger);
    }

    // check if the token belongs to an admin
    const isCallerAdmin = await isAdmin(accessToken, imsUrl, adminImsOrganizations);
    if (isCallerAdmin !== true) {
      const err = 'This operation is available to admins only. To request template removal from Template Registry, please, create a "Template Removal Request" issue on https://github.com/adobe/aio-template-submission';
      return errorResponse(403, [errorMessage(ERR_RC_PERMISSION_DENIED, err)], logger);
    }

    const orgName = params.orgName;
    const templateName = params.templateName;
    if ((orgName === undefined) && (templateName === undefined)) {
      return {
        'statusCode': 404
      };
    }
    const fullTemplateName = (orgName !== undefined) ? orgName + '/' + templateName : templateName;
    const template = await findTemplateByName(dbParams, fullTemplateName);
    if (null === template) {
      return {
        'statusCode': 404
      };
    }
    // a workaround that helps to overcome https://raw.githubusercontent.com/ caching issues (Cache-Control: max-age=300)
    const content = await fetchUrl(`https://github.com/${params.TEMPLATE_REGISTRY_ORG}/${params.TEMPLATE_REGISTRY_REPOSITORY}/blob/main/registry.json?timestamp=${new Date().getTime()}`);
    if (!content.includes(`>${fullTemplateName}<`)) {
      return {
        'statusCode': 404
      };
    }

    await removeTemplateByName(dbParams, fullTemplateName);
    const response = {
      'statusCode': 200
    };

    logger.info('"DELETE templates" executed successfully');
    return response;
  } catch (error) {
    // log any server errors
    logger.error(error);
    // return with 500
    return errorResponse(500, [errorMessage(ERR_RC_SERVER_ERROR, 'An error occurred, please try again later.')], logger);
  }
}

exports.main = main;
