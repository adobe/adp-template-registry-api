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

const { posix } = require('node:path');
const { setMetricsURL, incBatchCounterMultiLabel } = require('@adobe/aio-metrics-client');
const logger = require('@adobe/aio-lib-core-logging')('adp-template-registry-api');

/**
 * Increment error counter metrics
 * @param {string} requester Name of the requester, usually IMS clientId or userId, ex. 'crusher-stage'
 * @param {string} api Endpoint to track errors for, ex. 'GET /templates/{templateId}'
 * @param {string} errorCategory Error category, ex. '401'
 */
const incErrorCounterMetrics = async (requester, api, errorCategory) => {
  await incBatchCounterMultiLabel('error_count', requester, { api, errorCategory });
};

/**
 * Sets the metrics URL for metrics recording
 *
 * @param {object} metricsUrl Metrics URL
 * @param {string} metricsKey Metrics key to append to the URL
 */
const setMetricsUrl = (metricsUrl, metricsKey) => {
  try {
    const url = new URL(metricsUrl);
    url.pathname = posix.join(url.pathname, metricsKey);
    setMetricsURL(url.href);
  } catch (ex) {
    logger.info('Creating metrics url failed : ', metricsUrl);
    logger.error(ex);
  }
};

module.exports = {
  setMetricsUrl,
  incErrorCounterMetrics
};
