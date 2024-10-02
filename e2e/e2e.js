require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
jest.setTimeout(60000);

const fetch = require('node-fetch');
const { validateAccessToken, generateAccessToken } = require('../actions/ims');

const {
  IMS_AUTH_CODE,
  IMS_CLIENT_ID,
  IMS_CLIENT_SECRET,
  IMS_SCOPES,
  IMS_URL,
  TEMPLATE_REGISTRY_API_URL,
  ACCESS_TOKEN
} = process.env;

/**
 * @param {string} accessToken - token to access API
 * @param {object} templateData contains name and links
 * @description Creates a new template
 * @returns {object} returns the created template
 */
async function createTemplate (accessToken, templateData) {
  const response = await fetch(`${TEMPLATE_REGISTRY_API_URL}/templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(templateData)
  });

  if (!response.ok) {
    throw new Error(`createTemplate: HTTP error! status: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  return { data, status: response.status };
}

/**
 * @param {string} accessToken - token to access API
 * @param {string} templateId - template id to be updated
 * @param {object} updateTemplateData - data to be updated
 * @description Updates a new template
 * @returns {object} returns the updated template
 */
async function updateTemplate (accessToken, templateId, updateTemplateData) {
  const response = await fetch(`${TEMPLATE_REGISTRY_API_URL}/templates/${templateId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(updateTemplateData)
  });

  if (!response.ok) {
    throw new Error(`updateTemplate: HTTP error! status: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  return { data, status: response.status };
}

/**
 * @param {string} accessToken token to access API
 * @param {string} templateId , id of the template to be fetched
 * @description Fetches template by id
 * @returns {object} returns the template
 */
async function getTemplate (accessToken, templateId) {
  const url = `${TEMPLATE_REGISTRY_API_URL}/templates/${templateId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    return { data: {}, status: response.status, error: response.statusText };
  }

  const data = await response.json();
  return { data, status: response.status };
}

/**
 * @param {string} accessToken token to access API
 * @param {object} queryParams , filters to be applied
 * @description Fetches templates with filters
 * @returns {Array} returns the templates
 */
async function getTemplates (accessToken, queryParams) {
  const url = `${TEMPLATE_REGISTRY_API_URL}/templates`;

  const urlObj = new URL(url);
  const params = new URLSearchParams(queryParams);
  urlObj.search = params.toString();

  const response = await fetch(urlObj.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await response.json();
  return { data, status: response.status };
}

/**
 * @param {string} accessToken token to access API
 * @param {string} templateId , id of the template to be deleted
 * @description deletes template by id
 * @returns {object} returns the response
 */
async function deleteTemplate (accessToken, templateId) {
  const response = await fetch(`${TEMPLATE_REGISTRY_API_URL}/templates/${templateId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });

  return response;
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

describe('E2E Tests', () => {
  let accessToken = ACCESS_TOKEN;

  beforeAll(async () => {
    accessToken = accessToken ?? await generateAccessToken(IMS_AUTH_CODE, IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES, console);
  });

  describe('Template Registry API - E2E Tests', () => {
    let createdTemplateId;

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
      expect(createTemplateResponseStatus).toBe(200);
      expect(createdTemplate.id).toBeDefined();
      expect(createdTemplate.name).toBe(templateData.name);
      expect(Object.keys(createdTemplate)).toEqual(expect.arrayContaining(['_links', 'adobeRecommended', 'id', 'links', 'name', 'status']));
      expect(createdTemplate._links).toHaveProperty('self');
      expect(createdTemplate._links.self).toHaveProperty('href');
      expect(createdTemplate.links).toHaveProperty('github');
      expect(createdTemplate.adobeRecommended).toBe(false);

      const { data: getTemplateData, status: getTemplateResponse } = await getTemplate(accessToken, createdTemplate.id);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.id).toEqual(createdTemplate.id);

      createdTemplateId = createdTemplate.id;
    });

    it('Should list templates by id', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplate(accessToken, createdTemplateId);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.status).toBe('InVerification');
    });

    it('Should fetch templates by name', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { name: '@adobe/test-template' });
      expect(getTemplateData.items.length).toBeGreaterThan(0);
      expect(getTemplateResponse).toBe(200);
    });

    it('Should fetch templates by Approved status', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { name: 'Approved' });
      expect(getTemplateData.items.length).toBeGreaterThan(0);
      expect(getTemplateResponse).toBe(200);
    });

    it('Should fetch templates by InVerification status', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { name: 'InVerification' });
      expect(getTemplateData.items.length).toBeGreaterThan(0);
      expect(getTemplateResponse).toBe(200);
    });

    it('Should update an existing template', async () => {
      const updateData = {
        updatedBy: 'Tester',
        description: 'Updated description'
      };

      const updateResponse = await updateTemplate(accessToken, createdTemplateId, updateData);
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.description).toBe(updateData.description);
    });

    it('Should delete template by id', async () => {
      const deleteResponse = await deleteTemplate(accessToken, createdTemplateId);
      expect(deleteResponse.status).toBe(200);
    });

    it('Should return 404 on deleting non-existent id', async () => {
      const deleteResponse = await deleteTemplate(accessToken, 'c09309fea566cb37f8afa89a');
      expect(deleteResponse.status).toBe(404);
    });

    it('Should return 404 on fetching non-existent id', async () => {
      const getResponse = await getTemplate(accessToken, 'c09309fea566cb37f8afa89a');
      expect(getResponse.status).toBe(404);
    });
  });

  describe('Template Registry API - Console Template Tests', () => {
    let consoleTemplateId = null;

    const consoleTemplateData = {
      adobeRecommended: true,
      apis: [
        {
          code: 'ccai-sdk',
          credentialType: 'OAUTH_SERVER_TO_SERVER',
          flowType: 'ENTP'
        },
        {
          code: 'PhotoshopCCESDK',
          credentialType: 'OAUTH_SERVER_TO_SERVER',
          flowType: 'ENTP'
        },
        {
          code: 'LightroomCCESDK',
          credentialType: 'OAUTH_SERVER_TO_SERVER',
          flowType: 'ENTP'
        },
        {
          code: 'Firefly SDK - Enterprise - GA',
          credentialType: 'OAUTH_SERVER_TO_SERVER',
          flowType: 'ENTP'
        }
      ],
      author: 'Adobe, Inc.',
      codeSamples: [
        {
          language: 'javascript',
          link: 'https://developer-stage.adobe.com/package.zip'
        }
      ],
      createdBy: 'PostBuster User',
      credentials: [
        {
          flowType: 'ENTP',
          type: 'OAUTH_SERVER_TO_SERVER'
        }
      ],
      description: 'Full test template made by PostBuster',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/918/4566206088344750634/overview'
      },
      name: `test-template-fields-postbuster-${uuidv4()}`, // Generate UUID
      status: 'Approved'
    };

    it('should return create a new console template', async () => {
      const { data: templateData, status: createTemplateResponse } = await createTemplate(accessToken, consoleTemplateData);
      consoleTemplateId = templateData.id;

      expect(templateData).toHaveProperty('adobeRecommended');
      expect(templateData).toHaveProperty('apis');
      expect(templateData).toHaveProperty('author');
      expect(templateData).toHaveProperty('codeSamples');
      expect(templateData).toHaveProperty('createdBy');
      expect(templateData).toHaveProperty('credentials');
      expect(templateData).toHaveProperty('description');
      expect(templateData).toHaveProperty('links');
      expect(templateData).toHaveProperty('name');
      expect(templateData).toHaveProperty('status');
      expect(createTemplateResponse).toBe(200);

      expect(templateData.adobeRecommended).toBe(true);
      expect(templateData.status).toBe('Approved');
      expect(templateData.author).toBe('Adobe, Inc.');
      expect(templateData.createdBy).toBe('PostBuster User');
      expect(templateData.description).toBe('Full test template made by PostBuster');
      expect(templateData.name).toMatch(/^test-template-fields-postbuster-/);
      expect(templateData.credentials[0]).toHaveProperty('flowType');
      expect(templateData.credentials[0]).toHaveProperty('type');
      expect(templateData.credentials[0].flowType).toBe('ENTP');
      expect(templateData.credentials[0].type).toBe('OAUTH_SERVER_TO_SERVER');
    });

    it('Should list console templates by id', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplate(accessToken, consoleTemplateId);
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.id).toBe(consoleTemplateId);
      expect(getTemplateData.status).toBe('Approved');
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
    });

    it('Should list all console templates by status:InVerification', async () => {
      const { data: getTemplateData, status: getTemplateResponse } = await getTemplates(accessToken, { name: 'InVerification' });
      expect(getTemplateResponse).toBe(200);
      expect(getTemplateData.items.length).toBeGreaterThan(0);
    });

    it('Should delete console template by id', async () => {
      const deleteResponse = await deleteTemplate(accessToken, consoleTemplateId);
      expect(deleteResponse.status).toBe(200);
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
      expect(createTemplateResponseStatus).toBe(200);
      const createdTemplateId = createdTemplate.id;

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

      const deleteResponse = await deleteTemplate(accessToken, createdTemplateId);
      expect(deleteResponse.status).toBe(200);
    });

    it('Should verify concurrent template operations', async () => {
      const createPromises = Array(5).fill().map(() => createTemplate(accessToken, {
        name: `@adobe/concurrent-test-${Date.now()}`,
        links: {
          github: 'https://github.com/adobe/test-template'
        }
      }));
      const createdTemplates = await Promise.all(createPromises);

      const updatePromises = createdTemplates.map(template =>
        updateTemplate(accessToken, template.data.id, { updatedBy: 'ConcurrentTest', description: `Updated ${Date.now()}` })
      );

      await Promise.all(updatePromises);

      const deletePromises = createdTemplates.map(template => deleteTemplate(accessToken, template.data.id));
      const deletePromisesResponse = await Promise.all(deletePromises);

      for (const response of deletePromisesResponse) {
        expect(response.status).toBe(200);
      }
    });
  });
});
