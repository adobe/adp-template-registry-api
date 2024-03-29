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

// ERR_RC - Error Response Code
const ERR_RC_SERVER_ERROR = 'server_error';
const ERR_RC_HTTP_METHOD_NOT_ALLOWED = 'http_method_not_allowed';
const ERR_RC_MISSING_REQUIRED_HEADER = 'missing_required_header';
const ERR_RC_MISSING_REQUIRED_PARAMETER = 'missing_required_parameter';
const ERR_RC_INCORRECT_REQUEST = 'incorrect_request';
const ERR_RC_INVALID_IMS_ACCESS_TOKEN = 'invalid_ims_access_token';
const ERR_RC_PERMISSION_DENIED = 'permission_denied';

/**
 *
 * Returns a log ready string of the action input parameters.
 * The `Authorization` header content will be replaced by '<hidden>'.
 *
 * @param {object} params action input parameters.
 *
 * @returns {string}
 *
 */
function stringParameters(params) {
  // hide authorization token without overriding params
  let headers = params.__ow_headers || {};
  if (headers.authorization) {
    headers = { ...headers, authorization: '<hidden>' };
  }
  return JSON.stringify({ ...params, __ow_headers: headers });
}

/**
 *
 * Returns the list of missing keys giving an object and its required keys.
 * A parameter is missing if its value is undefined or ''.
 * A value of 0 or null is not considered as missing.
 *
 * @param {object} obj object to check.
 * @param {array} required list of required keys.
 *        Each element can be multi level deep using a '.' separator e.g. 'myRequiredObj.myRequiredKey'
 *
 * @returns {array}
 * @private
 */
function getMissingKeys(obj, required) {
  return required.filter(r => {
    const splits = r.split('.');
    const last = splits[splits.length - 1];
    const traverse = splits.slice(0, -1).reduce((tObj, split) => { tObj = (tObj[split] || {}); return tObj; }, obj);
    return traverse[last] === undefined || traverse[last] === ''; // missing default params are empty string
  });
}

/**
 *
 * Returns the list of missing keys giving an object and its required keys.
 * A parameter is missing if its value is undefined or ''.
 * A value of 0 or null is not considered as missing.
 *
 * @param {object} params action input parameters.
 * @param {array} requiredHeaders list of required input headers.
 * @param {array} requiredParams list of required input parameters.
 *        Each element can be multi level deep using a '.' separator e.g. 'myRequiredObj.myRequiredKey'.
 *
 * @returns {array} if the return value is not null, then it holds an array of error object messages describing the missing inputs.
 *
 */
function checkMissingRequestInputs(params, requiredParams = [], requiredHeaders = []) {
  let errorMessages = [];

  // input headers are always lowercase
  requiredHeaders = requiredHeaders.map(h => h.toLowerCase());
  // check for missing headers
  const missingHeaders = getMissingKeys(params.__ow_headers || {}, requiredHeaders);
  if (missingHeaders.length > 0) {
    missingHeaders.forEach(
      header => errorMessages.push(
        errorMessage(ERR_RC_MISSING_REQUIRED_HEADER, `The "${header}" header is not set.`)
      )
    );
  }

  // check for missing parameters
  const missingParams = getMissingKeys(params, requiredParams);
  if (missingParams.length > 0) {
    missingParams.forEach(
      param => errorMessages.push(
        errorMessage(ERR_RC_MISSING_REQUIRED_PARAMETER, `The "${param}" parameter is not set.`)
      )
    );
  }

  return errorMessages.length > 0 ? errorMessages : null;
}

/**
 *
 * Extracts the bearer token string from the Authorization header in the request parameters.
 *
 * @param {object} params action input parameters.
 *
 * @returns {string|undefined} the token string or undefined if not set in request headers.
 *
 */
function getBearerToken(params) {
  if (params.__ow_headers &&
    params.__ow_headers.authorization &&
    params.__ow_headers.authorization.startsWith('Bearer ')) {
    return params.__ow_headers.authorization.substring('Bearer '.length);
  }
  return undefined;
}

/**
 *
 * Returns an error response object and attempts to log.info the status code and error message(s).
 *
 * @param {number} statusCode the error status code.
 *        e.g. 400
 * @param {array} messages an array of error object messages.
 *        e.g. [{"code":"missing_required_parameter","message":"The \"XXX\" parameter is not set."}]
 * @param {*} [logger] an optional logger instance object with an `info` method
 *        e.g. `new require('@adobe/aio-sdk').Core.Logger('name')`
 *
 * @returns {object} the error object, ready to be returned from the action main's function.
 *
 */
function errorResponse(statusCode, messages, logger) {
  if (logger && typeof logger.info === 'function') {
    logger.info(`Status code: ${statusCode}`);
    messages.forEach(
      item => logger.info(`${item.code}: ${item.message}`)
    );
  }
  return {
    error: {
      statusCode,
      body: {
        errors: messages
      }
    }
  };
}

/**
 * Returns an error message object.
 *
 * @param {string} code error response code
 * @param {string} message error message
 * @returns {object<code: string, message: string>}
 */
function errorMessage(code, message) {
  return {
    'code': code,
    'message': message
  };
}

module.exports = {
  errorResponse,
  getBearerToken,
  stringParameters,
  checkMissingRequestInputs,
  errorMessage,
  ERR_RC_SERVER_ERROR,
  ERR_RC_HTTP_METHOD_NOT_ALLOWED,
  ERR_RC_MISSING_REQUIRED_HEADER,
  ERR_RC_MISSING_REQUIRED_PARAMETER,
  ERR_RC_INCORRECT_REQUEST,
  ERR_RC_INVALID_IMS_ACCESS_TOKEN,
  ERR_RC_PERMISSION_DENIED
};
