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

const utils = require('./../actions/utils.js');

test('interface', () => {
  expect(typeof utils.errorResponse).toBe('function');
  expect(typeof utils.stringParameters).toBe('function');
  expect(typeof utils.checkMissingRequestInputs).toBe('function');
  expect(typeof utils.getBearerToken).toBe('function');
});

describe('errorResponse', () => {
  test('(400, errorMessages)', () => {
    const errors = [{
      code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
      message: 'The "a" parameter is not set.'
    }];
    const res = utils.errorResponse(400, errors);
    expect(res).toEqual({
      error: {
        statusCode: 400,
        body: { errors }
      }
    });
  });

  test('(400, errorMessages, logger)', () => {
    const logger = {
      info: jest.fn()
    };
    const errors = [{
      code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
      message: 'The "a" parameter is not set.'
    }];
    const res = utils.errorResponse(400, errors, logger);
    expect(logger.info).toHaveBeenCalledWith('Status code: 400');
    expect(logger.info).toHaveBeenCalledWith('missing_required_parameter: The "a" parameter is not set.');
    expect(res).toEqual({
      error: {
        statusCode: 400,
        body: { errors }
      }
    });
  });
});

describe('stringParameters', () => {
  test('no auth header', () => {
    const params = {
      a: 1, b: 2, __ow_headers: { 'x-api-key': 'fake-api-key' }
    };
    expect(utils.stringParameters(params)).toEqual(JSON.stringify(params));
  });
  test('with auth header', () => {
    const params = {
      a: 1, b: 2, __ow_headers: { 'x-api-key': 'fake-api-key', authorization: 'secret' }
    };
    expect(utils.stringParameters(params)).toEqual(expect.stringContaining('"authorization":"<hidden>"'));
    expect(utils.stringParameters(params)).not.toEqual(expect.stringContaining('secret'));
  });
  test('with sensitive values in params', () => {
    const params = {
      IMS_AUTH_CODE: '1234',
      MONGODB_URI: 'mongodb://mongo:27017',
      GITHUB_ACCESS_TOKEN: 'fake-token',
      IMS_CLIENT_SECRET: 'secret'
    };
    expect(utils.stringParameters(params)).toEqual(expect.stringContaining(
      '"IMS_AUTH_CODE":"<hidden>","MONGODB_URI":"<hidden>","GITHUB_ACCESS_TOKEN":"<hidden>","IMS_CLIENT_SECRET":"<hidden>"'
    ));
  });
  test('with only some sensitive values in params', () => {
    const params = {
      IMS_AUTH_CODE: '1234',
      MONGODB_URI: 'mongodb://mongo:27017',
      GITHUB_ACCESS_TOKEN: 'fake-token'
    };
    const stringParams = utils.stringParameters(params);
    expect(stringParams).toEqual(expect.stringContaining(
      '"IMS_AUTH_CODE":"<hidden>","MONGODB_URI":"<hidden>","GITHUB_ACCESS_TOKEN":"<hidden>"'
    ));
    expect(stringParams).toEqual(expect.not.stringContaining('IMS_CLIENT_SECRET'));
  });
});

describe('checkMissingRequestInputs', () => {
  test('({ a: 1, b: 2 }, [a])', () => {
    expect(utils.checkMissingRequestInputs({ a: 1, b: 2 }, ['a'])).toEqual(null);
  });
  test('({ a: 1 }, [a, b])', () => {
    expect(utils.checkMissingRequestInputs({ a: 1 }, ['a', 'b'])).toEqual([{
      code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
      message: 'The "b" parameter is not set.'
    }]);
  });
  test('({ a: { b: { c: 1 } }, f: { g: 2 } }, [a.b.c, f.g.h.i])', () => {
    expect(utils.checkMissingRequestInputs({ a: { b: { c: 1 } }, f: { g: 2 } }, ['a.b.c', 'f.g.h.i'])).toEqual([{
      code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
      message: 'The "f.g.h.i" parameter is not set.'
    }]);
  });
  test('({ a: { b: { c: 1 } }, f: { g: 2 } }, [a.b.c, f.g.h])', () => {
    expect(utils.checkMissingRequestInputs({ a: { b: { c: 1 } }, f: { g: 2 } }, ['a.b.c', 'f'])).toEqual(null);
  });
  test('({ a: 1, __ow_headers: { h: 1, i: 2 } }, undefined, [h])', () => {
    expect(utils.checkMissingRequestInputs({ a: 1, __ow_headers: { h: 1, i: 2 } }, undefined, ['h'])).toEqual(null);
  });
  test('({ a: 1, __ow_headers: { f: 2 } }, [a], [h, i])', () => {
    expect(utils.checkMissingRequestInputs({ a: 1, __ow_headers: { f: 2 } }, ['a'], ['h', 'i'])).toEqual([{
      code: utils.ERR_RC_MISSING_REQUIRED_HEADER,
      message: 'The "h" header is not set.'
    },
    {
      code: utils.ERR_RC_MISSING_REQUIRED_HEADER,
      message: 'The "i" header is not set.'
    }]);
  });
  test('({ c: 1, __ow_headers: { f: 2 } }, [a, b], [h, i])', () => {
    expect(utils.checkMissingRequestInputs({ c: 1 }, ['a', 'b'], ['h', 'i'])).toEqual([{
      code: utils.ERR_RC_MISSING_REQUIRED_HEADER,
      message: 'The "h" header is not set.'
    },
    {
      code: utils.ERR_RC_MISSING_REQUIRED_HEADER,
      message: 'The "i" header is not set.'
    },
    {
      code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
      message: 'The "a" parameter is not set.'
    }, {
      code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
      message: 'The "b" parameter is not set.'
    }]);
  });
  test('({ a: 0 }, [a])', () => {
    expect(utils.checkMissingRequestInputs({ a: 0 }, ['a'])).toEqual(null);
  });
  test('({ a: null }, [a])', () => {
    expect(utils.checkMissingRequestInputs({ a: null }, ['a'])).toEqual(null);
  });
  test('({ a: \'\' }, [a])', () => {
    expect(utils.checkMissingRequestInputs({ a: '' }, ['a'])).toEqual([{
      code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
      message: 'The "a" parameter is not set.'
    }]);
  });
  test('({ a: undefined }, [a])', () => {
    expect(utils.checkMissingRequestInputs({ a: undefined }, ['a'])).toEqual([{
      code: utils.ERR_RC_MISSING_REQUIRED_PARAMETER,
      message: 'The "a" parameter is not set.'
    }]);
  });
});

describe('getBearerToken', () => {
  test('({})', () => {
    expect(utils.getBearerToken({})).toEqual(undefined);
  });
  test('({ authorization: Bearer fake, __ow_headers: {} })', () => {
    expect(utils.getBearerToken({ authorization: 'Bearer fake', __ow_headers: {} })).toEqual(undefined);
  });
  test('({ authorization: Bearer fake, __ow_headers: { authorization: fake } })', () => {
    expect(utils.getBearerToken({ authorization: 'Bearer fake', __ow_headers: { authorization: 'fake' } })).toEqual(undefined);
  });
  test('({ __ow_headers: { authorization: Bearerfake} })', () => {
    expect(utils.getBearerToken({ __ow_headers: { authorization: 'Bearerfake' } })).toEqual(undefined);
  });
  test('({ __ow_headers: { authorization: Bearer fake} })', () => {
    expect(utils.getBearerToken({ __ow_headers: { authorization: 'Bearer fake' } })).toEqual('fake');
  });
  test('({ __ow_headers: { authorization: Bearer fake Bearer fake} })', () => {
    expect(utils.getBearerToken({ __ow_headers: { authorization: 'Bearer fake Bearer fake' } })).toEqual('fake Bearer fake');
  });
});

describe('convertMongoIdToString', () => {
  test('should convert _id field to string for single object', () => {
    const input = { _id: 123, name: 'Test' };
    const expectedOutput = { id: '123', name: 'Test' };
    expect(utils.convertMongoIdToString(input)).toEqual(expectedOutput);
  });

  test('should convert _id field to string for array of objects', () => {
    const input = [{ _id: 123, name: 'Test1' }, { _id: 456, name: 'Test2' }];
    const expectedOutput = [{ id: '123', name: 'Test1' }, { id: '456', name: 'Test2' }];
    expect(utils.convertMongoIdToString(input)).toEqual(expectedOutput);
  });

  test('should handle input with no _id field', () => {
    const input = { name: 'Test' };
    const expectedOutput = { name: 'Test' };
    expect(utils.convertMongoIdToString(input)).toEqual(expectedOutput);
  });

  test('should handle empty array input', () => {
    const input = [];
    const expectedOutput = [];
    expect(utils.convertMongoIdToString(input)).toEqual(expectedOutput);
  });

  test('should handle null input', () => {
    const input = null;
    const expectedOutput = null;
    expect(utils.convertMongoIdToString(input)).toEqual(expectedOutput);
  });

  test('should handle undefined input', () => {
    const input = undefined;
    const expectedOutput = undefined;
    expect(utils.convertMongoIdToString(input)).toEqual(expectedOutput);
  });
});
