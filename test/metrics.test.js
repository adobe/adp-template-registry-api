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

const { withMetrics } = require('../actions/metrics');

jest.mock('../actions/utils');
jest.mock('@adobe/aio-metrics-client');
jest.mock('@adobe/aio-lib-ims');

describe('metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('withMetrics - Metrics URL set', async () => {
    const fn = jest.fn(() => Promise.resolve({
      statusCode: 200
    }));
    const wrappedFn = withMetrics(fn, 'test', 'GET /test');
    await expect(wrappedFn({
      METRICS_URL: 'http://localhost:8080'
    })).resolves.toEqual({
      statusCode: 200
    });
  });
});
