require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
jest.setTimeout(60000);

const { Ims } = require('@adobe/aio-lib-ims');
const { validateAccessToken } = require('../actions/ims');
const consoleTemplateFixture = require('./fixtures/template.console.json');

const {
  IMS_AUTH_CODE,
  IMS_CLIENT_ID,
  IMS_CLIENT_SECRET,
  IMS_SCOPES,
  IMS_URL,
  TEMPLATE_REGISTRY_API_URL,
  ACCESS_TOKEN
} = process.env;

const alwaysRequired = { IMS_URL, IMS_CLIENT_ID, TEMPLATE_REGISTRY_API_URL };
const tokenRequired = { IMS_AUTH_CODE, IMS_CLIENT_SECRET, IMS_SCOPES };

const missing = Object.entries(alwaysRequired)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (!ACCESS_TOKEN) {
  missing.push(...Object.entries(tokenRequired).filter(([, v]) => !v).map(([k]) => k));
}

if (missing.length > 0) {
  missing.forEach(k => console.error(`Missing required environment variable: ${k}`));
  throw new Error(`E2E setup failed: missing environment variables: ${missing.join(', ')}`);
}

/**
 * Resolves all target-specific configuration in one place.
 *
 * Default target is the deployed API Gateway (stage/prod), which maps REST paths
 * and HTTP methods to actions: GET /templates -> list, POST /templates -> create,
 * GET|PUT|DELETE /templates/{id} -> get|put|delete.
 *
 * Set E2E_TARGET=local to hit a local server instead. It has no
 * gateway, so each action is exposed as a raw web action at `<base>/<action-name>`
 * and `{id}` path params are not extracted — item ops therefore pass templateId as
 * a query param. A dedicated undici dispatcher trusts `aio app dev`'s self-signed
 * cert (dist/dev-keys) — scoped to these requests only, so real environments keep
 * full TLS verification. Override the dev URL with E2E_LOCAL_URL if needed.
 *
 * @returns {{
 *   local: boolean,
 *   dispatcher: import('undici').Dispatcher,
 *   collectionUrl: (op: 'list'|'create') => string,
 *   itemUrl: (op: 'get'|'update'|'delete', id: string) => string,
 *   nameUrl: (op: 'get'|'delete', orgName: string, templateName: string) => string,
 *   installUrl: (id: string) => string
 * }} target configuration
 */
function resolveTarget () {
  const local = process.env.E2E_TARGET === 'local';
  const baseUrl = local
    ? (process.env.E2E_LOCAL_URL || 'https://localhost:9080/api/v1/web/template-registry-api')
    : TEMPLATE_REGISTRY_API_URL;

  // A dedicated, closable connection pool used for every request in the run (see installFetchLogging)
  // and closed in afterAll, so keep-alive sockets don't linger as open handles. Only the local
  // target trusts the self-signed dev cert; real environments keep full TLS verification.
  const { Agent } = require('undici');
  const dispatcher = new Agent(local ? { connect: { rejectUnauthorized: false } } : {});

  const localAction = { create: 'templates-post', list: 'templates-list', get: 'templates-get', update: 'templates-put', delete: 'templates-delete', install: 'templates-install' };

  return {
    local,
    dispatcher,
    collectionUrl: (op) => local ? `${baseUrl}/${localAction[op]}` : `${baseUrl}/templates`,
    itemUrl: (op, id) => local
      ? `${baseUrl}/${localAction[op]}?templateId=${encodeURIComponent(id)}`
      : `${baseUrl}/templates/${id}`,
    nameUrl: (op, orgName, templateName) => local
      ? `${baseUrl}/${localAction[op]}?orgName=${encodeURIComponent(orgName)}&templateName=${encodeURIComponent(templateName)}`
      : `${baseUrl}/templates/${orgName}/${encodeURIComponent(templateName)}`,
    installUrl: (id) => local
      ? `${baseUrl}/${localAction.install}?templateId=${encodeURIComponent(id)}`
      : `${baseUrl}/install/${id}`
  };
}

const target = resolveTarget();

/**
 * Generates an E2E token against stage IMS by default, or prod when E2E_TARGET=prod.
 * @returns {Promise<string>} IMS access token
 */
async function generateE2EAccessToken () {
  const imsEnv = process.env.E2E_TARGET === 'prod' ? 'prod' : 'stage';
  const ims = new Ims(imsEnv);
  const { payload } = await logLibraryCall(
    `IMS getAccessToken (${imsEnv})`,
    { imsEnv, client_id: IMS_CLIENT_ID, scopes: IMS_SCOPES, client_secret: IMS_CLIENT_SECRET, auth_code: IMS_AUTH_CODE ? REDACTED : undefined },
    () => ims.getAccessToken(IMS_AUTH_CODE, IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES)
  );
  return payload.access_token;
}

// Credentials, plus `token`, which also holds IMS token metadata (token and refresh-token ids, user id, scopes).
const SENSITIVE_KEY = /^(authorization|access_token|refresh_token|id_token|client_secret|password|token)$/i;
const REDACTED = '<redacted>';

/**
 * Returns a deep copy of a value with sensitive fields (tokens, secrets, Authorization) masked.
 * @param {*} value value to redact
 * @returns {*} redacted copy
 */
function redact (value) {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) =>
      [k, SENSITIVE_KEY.test(k) && v !== null && v !== undefined ? REDACTED : redact(v)]
    ));
  }
  return value;
}

/**
 * @param {string} url request URL
 * @returns {string} URL with sensitive query params masked
 */
function redactUrl (url) {
  try {
    const urlObj = new URL(url);
    for (const key of [...urlObj.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) {
        urlObj.searchParams.set(key, REDACTED);
      }
    }
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * @param {*} value value to print
 * @returns {string} printable, redacted representation
 */
function printable (value) {
  if (value === undefined || value === '') {
    return '<empty>';
  }
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return value; }
  }
  return JSON.stringify(redact(parsed), null, 2);
}

/**
 * Logs an outgoing HTTP request. Header values and body fields holding credentials are masked,
 * so you can still see whether an Authorization header was sent.
 * @param {string} method HTTP method
 * @param {string} url request URL
 * @param {object|Headers} [headers] request headers
 * @param {*} [body] request body
 */
function logRequest (method, url, headers = {}, body) {
  const headerEntries = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
  console.log(`\n== HTTP REQUEST ==\n${method} ${redactUrl(url)}\nHeaders: ${printable(headerEntries)}\nBody: ${printable(body)}`);
}

/**
 * Logs an HTTP response: status, headers and duration. The body is deliberately not logged.
 * @param {string} method HTTP method of the request
 * @param {string} url request URL
 * @param {Response} response fetch response
 * @param {number} durationMs request duration in milliseconds
 */
function logResponse (method, url, response, durationMs) {
  console.log(`-- HTTP RESPONSE (${method} ${redactUrl(url)}, ${durationMs} ms) --\nStatus: ${response.status} ${response.statusText}\nHeaders: ${printable(Object.fromEntries(response.headers.entries()))}\n==================\n`);
}

/**
 * Wraps the global fetch so every HTTP call made through it is logged with its request and response:
 * the Template Registry API calls made by the tests, and the IMS token validation done by
 * actions/ims.js. Response bodies are not logged.
 * @returns {Function} restores the original fetch
 */
function installFetchLogging () {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input.url ?? String(input));
    const method = (init.method || input?.method || 'GET').toUpperCase();
    init = { dispatcher: target.dispatcher, ...init };
    logRequest(method, url, init.headers, init.body);
    const startTime = Date.now();
    let response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      console.log(`-- HTTP ERROR (${method} ${redactUrl(url)}, ${Date.now() - startTime} ms) --\n${error.stack || error}\n==================\n`);
      throw error;
    }
    logResponse(method, url, response, Date.now() - startTime);
    return response;
  };
  return () => { globalThis.fetch = originalFetch; };
}

/**
 * Logs an upstream call made through an Adobe library (IMS, Developer Console), which uses its own
 * HTTP client rather than the global fetch. The result (response body) is deliberately not logged.
 * @param {string} description what is being called
 * @param {object} details call parameters (sensitive fields are masked)
 * @param {Function} call async function performing the call
 * @param {Function} [summarize] maps the result to non-body metadata to log, e.g. the HTTP status
 * @returns {Promise<*>} the call result
 */
async function logLibraryCall (description, details, call, summarize = () => ({ outcome: 'success' })) {
  console.log(`\n== UPSTREAM CALL ==\n${description}\nDetails: ${printable(details)}`);
  const startTime = Date.now();
  try {
    const result = await call();
    console.log(`-- UPSTREAM RESULT (${description}, ${Date.now() - startTime} ms) --\n${printable(summarize(result))}\n==================\n`);
    return result;
  } catch (error) {
    console.log(`-- UPSTREAM ERROR (${description}, ${Date.now() - startTime} ms) --\n${error.stack || error}\n==================\n`);
    throw error;
  }
}

/**
 * Reads a fetch Response body as text and parses it as JSON, falling back to the
 * raw text when the body is not valid JSON. Also drains the body so the
 * underlying socket is released.
 * @param {Response} response fetch response
 * @returns {Promise<*>} parsed JSON, or the raw text
 */
async function parseBody (response) {
  const rawBody = await response.text();
  try { return JSON.parse(rawBody); } catch { return rawBody; }
}

/**
 * Builds common request headers, tagging each call with a unique x-request-id so
 * it can be traced through the service logs (e.g. `Start-API ... x-request-id=`).
 * @param {string} [accessToken] bearer token to access the API; Authorization is omitted when falsy
 * @returns {object} request headers
 */
function requestHeaders (accessToken) {
  return {
    'Content-Type': 'application/json',
    ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    'x-request-id': `e2e-test-${uuidv4()}`
  };
}

/**
 * Sends a request to the target API. Logging is done by the global fetch wrapper (see installFetchLogging).
 * @param {string} method HTTP method
 * @param {string} url request URL
 * @param {string} [accessToken] token to access API; omit for an unauthenticated request
 * @param {object} [body] JSON request body
 * @returns {Promise<{ok: boolean, status: number, statusText: string, data: *}>} response summary
 */
async function apiRequest (method, url, accessToken, body) {
  const response = await fetch(url, {
    method,
    headers: requestHeaders(accessToken),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await parseBody(response);
  return { ok: response.ok, status: response.status, statusText: response.statusText, data };
}

/**
 * @param {string} accessToken - token to access API
 * @param {object} templateData contains name and links
 * @description Creates a new template
 * @returns {object} returns the created template
 */
async function createTemplate (accessToken, templateData) {
  const { ok, status, statusText, data } = await apiRequest('POST', target.collectionUrl('create'), accessToken, templateData);
  if (!ok) {
    throw new Error(`createTemplate: HTTP error! status: ${status} - ${statusText}`);
  }
  return { data, status };
}

/**
 * @param {string} accessToken - token to access API
 * @param {string} templateId - template id to be updated
 * @param {object} updateTemplateData - data to be updated
 * @description Updates a new template
 * @returns {object} returns the updated template
 */
async function updateTemplate (accessToken, templateId, updateTemplateData) {
  const { ok, status, statusText, data } = await apiRequest('PUT', target.itemUrl('update', templateId), accessToken, updateTemplateData);
  if (!ok) {
    throw new Error(`updateTemplate: HTTP error! status: ${status} - ${statusText}`);
  }
  return { data, status };
}

/**
 * @param {string} accessToken token to access API
 * @param {string} templateId , id of the template to be fetched
 * @description Fetches template by id
 * @returns {object} returns the template
 */
async function getTemplate (accessToken, templateId) {
  const { ok, status, statusText, data } = await apiRequest('GET', target.itemUrl('get', templateId), accessToken);
  if (!ok) {
    return { data: {}, status, error: statusText };
  }
  return { data, status };
}

/**
 * @param {string} accessToken token to access API
 * @param {object} [queryParams] filters to be applied
 * @description Fetches templates with filters
 * @returns {Array} returns the templates
 */
async function getTemplates (accessToken, queryParams = {}) {
  const urlObj = new URL(target.collectionUrl('list'));
  for (const [key, value] of Object.entries(queryParams)) {
    urlObj.searchParams.set(key, value);
  }
  const { status, data } = await apiRequest('GET', urlObj.toString(), accessToken);
  return { data, status };
}

/**
 * @param {string} accessToken token to access API
 * @param {string} templateId , id of the template to be deleted
 * @description deletes template by id
 * @returns {object} returns the response
 */
async function deleteTemplate (accessToken, templateId) {
  return apiRequest('DELETE', target.itemUrl('delete', templateId), accessToken);
}

/**
 * Utility to generate a UUID (version 4)
 * @returns {string} returns a UUID
 */
const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const NON_EXISTENT_TEMPLATE_ID = 'c09309fea566cb37f8afa89a';
const INVALID_TEMPLATE_ID = 'not-a-valid-template-id';

/**
 * A well-formed JWT that IMS will reject. Malformed (non-JWT) tokens are not used, because the
 * actions decode the token before validating it.
 * @returns {string} an invalid access token
 */
const invalidAccessToken = () => {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ user_id: 'e2e-invalid-user', type: 'access_token', client_id: 'e2e' })}.invalid-signature`;
};

describe('E2E Tests', () => {
  let accessToken = ACCESS_TOKEN;

  let restoreFetch;

  beforeAll(async () => {
    restoreFetch = installFetchLogging();
    accessToken = accessToken ?? await generateE2EAccessToken();
  });

  afterAll(async () => {
    restoreFetch?.();
    await target.dispatcher.close();
  });

  describe('Template Registry API - E2E Tests', () => {
    let createdTemplateId;
    let createdTemplateName;

    afterAll(async () => {
      if (createdTemplateId) {
        await deleteTemplate(accessToken, createdTemplateId);
      }
    });

    it('should not throw an error for an invalid access token', async () => {
      await expect(validateAccessToken(accessToken, IMS_URL, IMS_CLIENT_ID))
        .resolves
        .not.toThrow();
    });

    it('Should create a new template', async () => {
      const templateData = {
        name: `@adobe/e2e-test-template-${uuidv4()}`,
        links: {
          github: 'https://github.com/adobe/test-template'
        }
      };

      const { data: createdTemplate, status: createTemplateResponseStatus } = await createTemplate(accessToken, templateData);
      createdTemplateId = createdTemplate.id;
      createdTemplateName = createdTemplate.name;

      expect(createTemplateResponseStatus).toBe(200);
      expect(createdTemplate.id).toBeDefined();
      expect(createdTemplate.name).toBe(templateData.name);
      expect(Object.keys(createdTemplate)).toEqual(expect.arrayContaining(['_links', 'adobeRecommended', 'id', 'links', 'name', 'status']));
      expect(createdTemplate._links.self.href).toMatch(new RegExp(`/templates/${templateData.name}$`));
      expect(createdTemplate.links).toHaveProperty('github');
      expect(createdTemplate.adobeRecommended).toBe(false);
      expect(createdTemplate.status).toBe('InVerification');

      const { data: getTemplateData, status: getTemplateResponse } = await getTemplate(accessToken, createdTemplate.id);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.id).toEqual(createdTemplate.id);
    });

    it('Should return 409 when creating a template with an existing name', async () => {
      const { status } = await apiRequest('POST', target.collectionUrl('create'), accessToken, {
        name: createdTemplateName,
        links: { github: 'https://github.com/adobe/test-template' }
      });
      expect(status).toBe(409);
    });

    it('Should list templates by id', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplate(accessToken, createdTemplateId);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.status).toBe('InVerification');
    });

    it('Should fetch a template by id without an access token', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplate(null, createdTemplateId);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.id).toBe(createdTemplateId);
    });

    it('Should fetch templates by name', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { names: createdTemplateName });
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.map(template => template.id)).toEqual([createdTemplateId]);
    });

    it('Should fetch templates by Approved status', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { statuses: 'Approved' });
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.length).toBeGreaterThan(0);
      getTemplateData.items.forEach(template => expect(template.status).toBe('Approved'));
    });

    it('Should fetch templates by InVerification status', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { statuses: 'InVerification' });
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.find(template => template.id === createdTemplateId)).toBeDefined();
      getTemplateData.items.forEach(template => expect(template.status).toBe('InVerification'));
    });

    it('Should exclude templates matching a negated status filter', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { statuses: '!InVerification' });
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.find(template => template.id === createdTemplateId)).toBeUndefined();
      getTemplateData.items.forEach(template => expect(template.status).not.toBe('InVerification'));
    });

    it('Should sort templates by name in descending order', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { orderBy: 'names desc' });
      expect(getTemplateResponse).toBe(200);
      const names = getTemplateData.items.map(template => template.name);
      expect(names.length).toBeGreaterThan(1);
      for (let i = 1; i < names.length; i++) {
        expect(names[i - 1] >= names[i]).toBe(true);
      }
    });

    it('Should update an existing template', async () => {
      const updateData = {
        updatedBy: 'Tester',
        description: 'Updated description'
      };

      const updateResponse = await updateTemplate(accessToken, createdTemplateId, updateData);
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.description).toBe(updateData.description);

      const { data: getTemplateData } = await getTemplate(accessToken, createdTemplateId);
      expect(getTemplateData.description).toBe(updateData.description);
    });

    it('Should delete template by id', async () => {
      const deleteResponse = await deleteTemplate(accessToken, createdTemplateId);
      expect(deleteResponse.status).toBe(200);

      const getResponse = await getTemplate(accessToken, createdTemplateId);
      expect(getResponse.status).toBe(404);
      createdTemplateId = undefined;
    });

    it('Should return 404 on deleting non-existent id', async () => {
      const deleteResponse = await deleteTemplate(accessToken, NON_EXISTENT_TEMPLATE_ID);
      expect(deleteResponse.status).toBe(404);
    });

    it('Should return 404 on fetching non-existent id', async () => {
      const getResponse = await getTemplate(accessToken, NON_EXISTENT_TEMPLATE_ID);
      expect(getResponse.status).toBe(404);
    });

    it('Should return 404 on updating non-existent id', async () => {
      const { status } = await apiRequest('PUT', target.itemUrl('update', NON_EXISTENT_TEMPLATE_ID), accessToken, { updatedBy: 'Tester' });
      expect(status).toBe(404);
    });

    it('Should return 400 for an invalid template id', async () => {
      const getResponse = await apiRequest('GET', target.itemUrl('get', INVALID_TEMPLATE_ID), accessToken);
      const updateResponse = await apiRequest('PUT', target.itemUrl('update', INVALID_TEMPLATE_ID), accessToken, { updatedBy: 'Tester' });
      const deleteResponse = await apiRequest('DELETE', target.itemUrl('delete', INVALID_TEMPLATE_ID), accessToken);
      expect([getResponse.status, updateResponse.status, deleteResponse.status]).toEqual([400, 400, 400]);
    });
  });

  // GET/DELETE /templates/{orgName}/{templateName} are in the OpenAPI spec, but the deployed API gateway does
  // not route them yet (it returns its own 404), so this suite only runs against a local server or when
  // E2E_ORG_NAME_ROUTES=true.
  const describeOrgName = target.local || process.env.E2E_ORG_NAME_ROUTES === 'true' ? describe : describe.skip;

  describeOrgName('Template Registry API - Templates by org and name', () => {
    const orgName = '@adobe';
    const templateName = `e2e-name-test-${uuidv4()}`;
    let templateId;

    beforeAll(async () => {
      const { data } = await createTemplate(accessToken, {
        name: `${orgName}/${templateName}`,
        links: { github: 'https://github.com/adobe/test-template' }
      });
      templateId = data.id;
    });

    afterAll(async () => {
      // best-effort cleanup in case a test failed before deleting the template
      if (templateId) {
        await deleteTemplate(accessToken, templateId);
      }
    });

    it('Should fetch a template by org and name', async () => {
      const { status, data } = await apiRequest('GET', target.nameUrl('get', orgName, templateName), accessToken);
      expect(status).toBe(200);
      expect(data.id).toBe(templateId);
      expect(data.name).toBe(`${orgName}/${templateName}`);
      expect(data._links.self.href).toMatch(new RegExp(`/templates/${orgName}/${templateName}$`));
    });

    it('Should delete a template by org and name', async () => {
      const deleteResponse = await apiRequest('DELETE', target.nameUrl('delete', orgName, templateName), accessToken);
      expect(deleteResponse.status).toBe(200);

      const getResponse = await apiRequest('GET', target.nameUrl('get', orgName, templateName), accessToken);
      expect(getResponse.status).toBe(404);
      templateId = undefined;
    });

    it('Should return 404 on deleting a non-existent org and name', async () => {
      const { status } = await apiRequest('DELETE', target.nameUrl('delete', orgName, `e2e-missing-${uuidv4()}`), accessToken);
      expect(status).toBe(404);
    });
  });

  describe('Template Registry API - Authentication and validation', () => {
    const validTemplate = () => ({
      name: `@adobe/e2e-auth-test-${uuidv4()}`,
      links: { github: 'https://github.com/adobe/test-template' }
    });

    it('Should return 401 when creating a template without an access token', async () => {
      const { status } = await apiRequest('POST', target.collectionUrl('create'), null, validTemplate());
      expect(status).toBe(401);
    });

    it('Should return 401 when creating a template with an invalid access token', async () => {
      const { status } = await apiRequest('POST', target.collectionUrl('create'), invalidAccessToken(), validTemplate());
      expect(status).toBe(401);
    });

    it('Should return 400 when creating a template without a name', async () => {
      const { status } = await apiRequest('POST', target.collectionUrl('create'), accessToken, { links: { github: 'https://github.com/adobe/test-template' } });
      expect(status).toBe(400);
    });

    it('Should return 401 when updating a template without an access token', async () => {
      const { status } = await apiRequest('PUT', target.itemUrl('update', NON_EXISTENT_TEMPLATE_ID), null, { updatedBy: 'Tester' });
      expect(status).toBe(401);
    });

    it('Should return 401 when deleting a template without an access token', async () => {
      const { status } = await apiRequest('DELETE', target.itemUrl('delete', NON_EXISTENT_TEMPLATE_ID), null);
      expect(status).toBe(401);
    });

    it('Should return 401 when listing templates with an invalid access token', async () => {
      const { status } = await getTemplates(invalidAccessToken());
      expect(status).toBe(401);
    });

    it('Should return 400 for an unsupported list filter value', async () => {
      const { status } = await getTemplates(accessToken, { runtime: 'not-a-boolean' });
      expect(status).toBe(400);
    });
  });

  describe('Template Registry API - Install Template', () => {
    const installBody = () => ({ orgId: 'e2e-org', projectName: `e2e${Date.now()}`, metadata: {} });

    it('Should return 401 when installing without an access token', async () => {
      const { status } = await apiRequest('POST', target.installUrl(NON_EXISTENT_TEMPLATE_ID), null, installBody());
      expect(status).toBe(401);
    });

    it('Should return 400 when the install request body is missing required fields', async () => {
      const { status } = await apiRequest('POST', target.installUrl(NON_EXISTENT_TEMPLATE_ID), accessToken, { projectName: 'e2e' });
      expect(status).toBe(400);
    });

    it('Should return 400 when installing with an invalid template id', async () => {
      const { status } = await apiRequest('POST', target.installUrl(INVALID_TEMPLATE_ID), accessToken, installBody());
      expect(status).toBe(400);
    });

    it('Should return 404 when installing a non-existent template', async () => {
      const { status } = await apiRequest('POST', target.installUrl(NON_EXISTENT_TEMPLATE_ID), accessToken, installBody());
      expect(status).toBe(404);
    });

    // Opt-in: installing creates a real Developer Console project. Console rejects service tokens,
    // so a user token for an org the user can create projects in is required.
    const { E2E_INSTALL_ORG_ID, E2E_INSTALL_ACCESS_TOKEN, E2E_INSTALL_API_CODE } = process.env;
    const describeInstall = E2E_INSTALL_ORG_ID && E2E_INSTALL_ACCESS_TOKEN && E2E_INSTALL_API_CODE ? describe : describe.skip;

    describeInstall('with E2E_INSTALL_ORG_ID, E2E_INSTALL_ACCESS_TOKEN and E2E_INSTALL_API_CODE', () => {
      it('Should install a template into a new Developer Console project', async () => {
        const consoleLib = require('@adobe/aio-lib-console');
        const credential = { type: 'oauth_server_to_server', flowType: 'entp' };
        const { data: template } = await createTemplate(accessToken, {
          name: `e2e-install-test-${uuidv4()}`,
          status: 'Approved',
          links: { consoleProject: 'https://developer-stage.adobe.com/console/projects/e2e/e2e/overview' },
          credentials: [credential],
          apis: [{ code: E2E_INSTALL_API_CODE, credentialType: credential.type, flowType: credential.flowType }]
        });

        let projectId;
        try {
          const { status, data } = await apiRequest('POST', target.installUrl(template.id), E2E_INSTALL_ACCESS_TOKEN, {
            ...installBody(),
            orgId: E2E_INSTALL_ORG_ID,
            description: 'Created by the template registry e2e tests'
          });
          projectId = data?.projectId;
          expect(status).toBe(201);
          expect(data).toEqual(expect.objectContaining({ id: expect.any(String), apiKey: expect.any(String), orgId: E2E_INSTALL_ORG_ID }));
        } finally {
          if (projectId) {
            const consoleClient = await consoleLib.init(E2E_INSTALL_ACCESS_TOKEN, IMS_CLIENT_ID, process.env.E2E_TARGET === 'prod' ? 'prod' : 'stage');
            await logLibraryCall(
              'Developer Console deleteProject',
              { orgId: E2E_INSTALL_ORG_ID, projectId },
              () => consoleClient.deleteProject(E2E_INSTALL_ORG_ID, projectId),
              (response) => ({ status: response?.status })
            );
          }
          await deleteTemplate(accessToken, template.id);
        }
      });
    });
  });

  // Tagged @smoke: also run by `npm run test:smoke`, intended for post-deploy checks against Production
  // (not enabled in CI yet), so the payload must stay production-safe.
  describe('Template Registry API - Console Template Tests @smoke', () => {
    let consoleTemplateId = null;

    afterAll(async () => {
      if (consoleTemplateId) {
        await deleteTemplate(accessToken, consoleTemplateId);
      }
    });

    const consoleTemplateData = {
      ...consoleTemplateFixture,
      name: `${consoleTemplateFixture.name}-${uuidv4()}`
    };

    it('should create a new console template', async () => {
      const { data: templateData, status: createTemplateResponse } = await createTemplate(accessToken, consoleTemplateData);
      consoleTemplateId = templateData.id;

      expect(createTemplateResponse).toBe(200);
      expect(templateData.id).toBeDefined();
      expect(templateData).toHaveProperty('apis');
      expect(templateData).toMatchObject({
        adobeRecommended: consoleTemplateData.adobeRecommended,
        author: consoleTemplateData.author,
        codeSamples: consoleTemplateData.codeSamples,
        createdBy: consoleTemplateData.createdBy,
        credentials: consoleTemplateData.credentials,
        description: consoleTemplateData.description,
        links: consoleTemplateData.links,
        name: consoleTemplateData.name,
        status: consoleTemplateData.status
      });
    });

    it('Should list console templates by id', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplate(accessToken, consoleTemplateId);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.id).toBe(consoleTemplateId);
      expect(getTemplateData.name).toBe(consoleTemplateData.name);
      expect(getTemplateData.status).toBe('Approved');
    });

    it('Should include the console template in the list of templates', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.find(template => template.id === consoleTemplateId)).toBeDefined();
    });

    it('Should hide console templates from unauthenticated list requests', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(null);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.find(template => template.id === consoleTemplateId)).toBeUndefined();
    });

    it('Should filter console templates by api code and adobeRecommended', async () => {
      const apiCode = consoleTemplateData.apis[0].code;
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, {
        apis: apiCode,
        adobeRecommended: String(consoleTemplateData.adobeRecommended)
      });
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.find(template => template.id === consoleTemplateId)).toBeDefined();
      getTemplateData.items.forEach(template => {
        expect(template.apis.map(api => api.code)).toContain(apiCode);
        expect(template.adobeRecommended).toBe(consoleTemplateData.adobeRecommended);
      });
    });

    it('should update an existing console template', async () => {
      const updateData = {
        status: 'InVerification',
        updatedBy: 'Tester',
        description: 'Updated description'
      };
      const updateResponse = await updateTemplate(accessToken, consoleTemplateId, updateData);
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.description).toBe(updateData.description);
      expect(updateResponse.data.updatedBy).toBe(updateData.updatedBy);
      expect(updateResponse.data.status).toBe(updateData.status);

      const { data: getTemplateData, status: getTemplateResponse } = await getTemplate(accessToken, consoleTemplateId);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.description).toBe(updateData.description);
    });

    it('Should list all console templates by status:InVerification', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { statuses: 'InVerification' });
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.find(template => template.id === consoleTemplateId)).toBeDefined();
      getTemplateData.items.forEach(template => expect(template.status).toBe('InVerification'));
    });

    it('Should delete console template by id', async () => {
      const deleteResponse = await deleteTemplate(accessToken, consoleTemplateId);
      expect(deleteResponse.status).toBe(200);

      const { status: getTemplateResponse } = await getTemplate(accessToken, consoleTemplateId);
      expect(getTemplateResponse).toBe(404);
      consoleTemplateId = null;
    });
  });

  describe('Template Registry API - Performance Testing', () => {
    const numRequests = 25;
    const responseTime = 3000;

    it('Should verify GET Templated By Id API performance under load', async () => {
      const templateData = {
        name: `@adobe/test-template-${uuidv4()}`,
        links: {
          github: 'https://github.com/adobe/test-template'
        }
      };

      const { data: createdTemplate, status: createTemplateResponseStatus } = await createTemplate(accessToken, templateData);
      const createdTemplateId = createdTemplate.id;

      try {
        expect(createTemplateResponseStatus).toBe(200);
        const startTime = Date.now();

        const requests = Array(numRequests).fill().map(() => getTemplate(accessToken, createdTemplateId));
        const responses = await Promise.all(requests);

        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const avgResponseTime = totalTime / numRequests;

        console.log(`Average response time: ${avgResponseTime}ms`);
        responses.every(r => console.log(r.status + '\n'));

        expect(avgResponseTime).toBeLessThan(responseTime);
        expect(responses.every(r => r.status === 200)).toBe(true);
      } catch (error) {
        console.error('Template load test failed before cleanup:', error);
        throw error;
      } finally {
        const deleteResponse = await deleteTemplate(accessToken, createdTemplateId);
        expect(deleteResponse.status).toBe(200);
      }
    });

    it('Should verify concurrent template operations', async () => {
      const createdTemplateIds = [];
      const createPromises = Array(5).fill().map(() => createTemplate(accessToken, {
        name: `@adobe/concurrent-test-${uuidv4()}`,
        links: {
          github: 'https://github.com/adobe/test-template'
        }
      }).then(template => {
        createdTemplateIds.push(template.data.id);
        return template;
      }));
      let updatePromises = [];

      try {
        const createdTemplates = await Promise.all(createPromises);
        updatePromises = createdTemplates.map(template =>
          updateTemplate(accessToken, template.data.id, { updatedBy: 'ConcurrentTest', description: `Updated ${Date.now()}` })
        );
        await Promise.all(updatePromises);
      } catch (error) {
        console.error('Concurrent template operations failed before cleanup:', error);
        throw error;
      } finally {
        // A rejected request must not let cleanup race with other creates or updates.
        await Promise.allSettled([...createPromises, ...updatePromises]);
        const deleteResults = await Promise.allSettled(createdTemplateIds.map(id => deleteTemplate(accessToken, id)));
        for (const result of deleteResults) {
          expect(result.status).toBe('fulfilled');
          expect(result.value.status).toBe(200);
        }
      }
    });
  });
});
