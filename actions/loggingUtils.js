/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { Core } = require('@adobe/aio-sdk');

const REQUEST_ID_HEADER = 'x-request-id';
const START_API_FORMAT = 'Start-API endpoint=%s x-request-id=%s';
const END_API_FORMAT = 'End-API endpoint=%s statusCode=%s durationMs=%s x-request-id=%s';

/**
 * @param {object} params action input parameters
 * @returns {string|undefined} the request id, or undefined if the header isn't set
 */
function getRequestId (params) {
  return params?.__ow_headers?.[REQUEST_ID_HEADER];
}

/**
 * Extracts the HTTP status code from an action response, handling both the success shape
 * ({statusCode, body}) and the errorResponse() shape ({error: {statusCode, body}}).
 * @param {object} response an action's return value
 * @returns {number|undefined} the status code, if one can be found
 */
function getStatusCode (response) {
  return response?.statusCode ?? response?.error?.statusCode;
}

/**
 * Wraps an action's handler with standardized start/end request logging: one log line when the
 * request comes in and one when it completes (success or error), tagged with the endpoint, status
 * code, and duration.
 *
 * @param {string} endpoint endpoint identifier, e.g. 'GET /templates/{templateId}'
 * @param {Function} handler the action's (params) => Promise<response> function
 * @returns {Function} a (params) => Promise<response> function suitable for exports.main
 */
function withRequestLogging (endpoint, handler) {
  return async function handleWithLogging (params) {
    const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });
    const requestId = getRequestId(params) ?? '';
    const start = Date.now();

    logger.info(START_API_FORMAT, endpoint, requestId);

    let response;
    try {
      response = await handler(params);
      return response;
    } finally {
      logger.info(END_API_FORMAT, endpoint, getStatusCode(response), Date.now() - start, requestId);
    }
  };
}

module.exports = {
  getRequestId,
  getStatusCode,
  withRequestLogging
};
