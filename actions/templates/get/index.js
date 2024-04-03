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
const { errorResponse, errorMessage, stringParameters, ERR_RC_SERVER_ERROR, ERR_RC_HTTP_METHOD_NOT_ALLOWED } = require('../../utils');
const { findTemplateByName, getReviewIssueByTemplateName, TEMPLATE_STATUS_IN_VERIFICATION, TEMPLATE_STATUS_REJECTED } =
  require('../../templateRegistry');
const Enforcer = require('openapi-enforcer');

// GET operation is available to everyone, no IMS access token is required

const HTTP_METHOD = 'get';

/**
 * Get a template from the Template Registry.
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
    logger.info('Calling "GET templates"');

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params));

    if (params.__ow_method === undefined || params.__ow_method.toLowerCase() !== HTTP_METHOD) {
      return errorResponse(405, [errorMessage(ERR_RC_HTTP_METHOD_NOT_ALLOWED, `HTTP "${params.__ow_method}" method is unsupported.`)], logger);
    }

    Enforcer.v3_0.Schema.defineDataTypeFormat('string', 'uuid', null);
    Enforcer.v3_0.Schema.defineDataTypeFormat('string', 'uri', null);
    
    // WPAR002 - skip a warning about the "allowEmptyValue" property
    // see https://swagger.io/docs/specification/describing-parameters/ Empty-Valued and Nullable Parameters
    // EDEV001 - skip a warning about the basepath property, needed by IO Runtime for deploying apis
    const openapi = await Enforcer('./template-registry-api.json', { componentOptions: { exceptionSkipCodes: ['WPAR002', 'EDEV001'] } });
    const [req] = openapi.request({
      method: HTTP_METHOD,
      path: '/templates/{templateName}'
    });

    const orgName = params.orgName;
    const templateName = params.templateName;
    if ((orgName === undefined) && (templateName === undefined)) {
      return {
        statusCode: 404
      };
    }
    const fullTemplateName = (orgName !== undefined) ? orgName + '/' + templateName : templateName;
    const template = await findTemplateByName(dbParams, fullTemplateName);
    if (template === null) {
      return {
        statusCode: 404
      };
    }
    const response = {
      ...template,
      _links: {
        self: {
          href: `${params.TEMPLATE_REGISTRY_API_URL}/templates/${fullTemplateName}`
        }
      }
    };
    const templateStatuses = [TEMPLATE_STATUS_IN_VERIFICATION, TEMPLATE_STATUS_REJECTED];
    if (templateStatuses.includes(template.status)) {
      const reviewIssue = await getReviewIssueByTemplateName(fullTemplateName, params.TEMPLATE_REGISTRY_ORG, params.TEMPLATE_REGISTRY_REPOSITORY);
      if (reviewIssue !== null) {
        response._links.review = {
          href: reviewIssue,
          description: 'A link to the "Template Review Request" Github issue.'
        };
      }
    }

    // validate the response data to be sure it complies with OpenApi Schema
    const [res, error] = req.response(200, response);
    if (error) {
      throw new Error(error.toString());
    }

    logger.info('"GET templates" executed successfully');
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
