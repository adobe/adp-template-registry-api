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
const { getRequestId, getStatusCode, withRequestLogging } = require('../actions/loggingUtils');

const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);
jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getRequestId', () => {
  test('returns the x-request-id header when present', () => {
    expect(getRequestId({ __ow_headers: { 'x-request-id': 'abc-123' } })).toBe('abc-123');
  });

  test('returns undefined when the header is missing', () => {
    expect(getRequestId({ __ow_headers: {} })).toBeUndefined();
  });

  test('returns undefined when there are no headers at all', () => {
    expect(getRequestId({})).toBeUndefined();
  });
});

describe('getStatusCode', () => {
  test('extracts statusCode from a success response', () => {
    expect(getStatusCode({ statusCode: 200, body: {} })).toBe(200);
  });

  test('extracts statusCode from an errorResponse() shape', () => {
    expect(getStatusCode({ error: { statusCode: 404 } })).toBe(404);
  });

  test('returns undefined for an undefined response', () => {
    expect(getStatusCode(undefined)).toBeUndefined();
  });
});

describe('withRequestLogging', () => {
  test('logs start and end of the request around a successful handler call, passing only params through', async () => {
    const handler = jest.fn().mockResolvedValue({ statusCode: 200, body: {} });
    const wrapped = withRequestLogging('GET /templates/{templateId}', handler);

    const response = await wrapped({});

    expect(response).toEqual({ statusCode: 200, body: {} });
    expect(handler).toHaveBeenCalledWith({});
    // no x-request-id header on this request - the field is still present, just blank
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Start-API endpoint=%s x-request-id=%s', 'GET /templates/{templateId}', '');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('End-API endpoint=%s statusCode=%s durationMs=%s x-request-id=%s', 'GET /templates/{templateId}', 200, expect.any(Number), '');
  });

  test('tags the Start-API/End-API lines with the real x-request-id value when the header is present', async () => {
    const handler = jest.fn().mockResolvedValue({ statusCode: 200, body: {} });
    const wrapped = withRequestLogging('GET /templates/{templateId}', handler);

    await wrapped({ __ow_headers: { 'x-request-id': 'abc-123' } });

    expect(mockLoggerInstance.info).toHaveBeenCalledWith('Start-API endpoint=%s x-request-id=%s', 'GET /templates/{templateId}', 'abc-123');
    expect(mockLoggerInstance.info).toHaveBeenCalledWith('End-API endpoint=%s statusCode=%s durationMs=%s x-request-id=%s', 'GET /templates/{templateId}', 200, expect.any(Number), 'abc-123');
  });

  test('still logs the end of the request, with the error status code, when the handler resolves with an errorResponse()', async () => {
    const handler = jest.fn().mockResolvedValue({ error: { statusCode: 500, body: {} } });
    const wrapped = withRequestLogging('POST /templates', handler);

    await wrapped({});

    expect(mockLoggerInstance.info).toHaveBeenCalledWith('End-API endpoint=%s statusCode=%s durationMs=%s x-request-id=%s', 'POST /templates', 500, expect.any(Number), '');
  });

  test('still logs the end of the request, with an undefined status code, if the handler throws', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    const wrapped = withRequestLogging('DELETE /templates', handler);

    await expect(wrapped({})).rejects.toThrow('boom');

    expect(mockLoggerInstance.info).toHaveBeenCalledWith('End-API endpoint=%s statusCode=%s durationMs=%s x-request-id=%s', 'DELETE /templates', undefined, expect.any(Number), '');
  });
});
