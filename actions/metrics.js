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

const { posix } = require('path');

const { errorResponse, getBearerToken } = require('./utils');

const { incBatchCounter, incBatchCounterMultiLabel, setMetricsURL } = require('@adobe/aio-metrics-client');
const { getTokenData } = require('@adobe/aio-lib-ims');

const logger = require('@adobe/aio-lib-core-logging')('adp-template-registry-api');

/**
 * Sets the metrics URL for metrics recording
 *
 * @param {object} params Action params
 * @param {string} metricsKey Metrics key to append to the URL
 */
const setMetricsUrl = (params, metricsKey) => {
  if (params.METRICS_URL) {
    try {
      const url = new URL(params.METRICS_URL);
      url.pathname = posix.join(url.pathname, metricsKey);
      setMetricsURL(url.href);
    } catch (ex) {
      logger.info('Creating metrics url failed : ', params.METRICS_URL);
      logger.error(ex);
    }
  } else {
    logger.info('No metrics URL found in environment (searching for \'METRICS_URL\'), not recording metrics');
  }
};

/**
 * Wraps an action main to provide automatic metrics recording
 * @param {Function} fn Main action function
 * @param {string} metricsKey Endpoint key for metrics, ex. '/recordtemplateregistrymetrics'
 * @param {string} endpoint Endpoint name, ex. 'GET /templates'
 * @returns {Function} Wrapped action main function
 */
const withMetrics = (fn, metricsKey, endpoint) => {
  return async function () {
    let requesterId = 'unauth';
    let response;

    try {
      const params = arguments[0];

      if (params?.__ow_headers?.authorization) {
        const token = getBearerToken(params.__ow_headers.authorization);
        requesterId = getTokenData(token).user_id;
      }

      setMetricsUrl(params, metricsKey);

      await incBatchCounter('request_count', requesterId, endpoint);
      response = await fn.apply(this, arguments);

      if (response?.error || response.statusCode >= 400) {
        await incBatchCounterMultiLabel(
          'error_count',
          requesterId,
          {
            api: endpoint,
            errorCategory: response?.error.statusCode || response.statusCode
          }
        );
      }

      return response;
    } catch (e) {
      logger.error(e);
      await incBatchCounterMultiLabel(
        'error_count',
        requesterId,
        {
          api: endpoint,
          errorCategory: '500'
        }
      );
      return errorResponse(500, e.message);
    }
  };
};

module.exports = {
  withMetrics
};
