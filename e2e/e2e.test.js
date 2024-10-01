const responseTime = 3000;

const config = {
  baseUrl: process.env.TEMPLATE_REGISTRY_API_URL || 'http://localhost:3000',
  authToken: process.env.AUTH_TOKEN || 'your-auth-token-here'
};

const axios = require('axios');

const api = axios.create({
  baseURL: config.baseUrl,
  headers: {
    Authorization: `Bearer ${config.authToken}`,
    'Content-Type': 'application/json'
  }
});

/**
 *
 * @param {object} templateData contains name and links
 * @description Create a new template
 * @returns {object} returns the created template
 */
async function createTemplate (templateData) {
  const response = await api.post('/templates', templateData);
  return response.data;
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

describe('Template Registry API E2E Tests', () => {
  const templateIdsToBeDeletedInTheEnd = [];

  test('Create a new template', async () => {
    const templateData = {
      name: '@adobe/test-template',
      links: {
        github: 'https://github.com/adobe/test-template'
      }
    };

    const createdTemplate = await createTemplate(templateData);
    templateIdsToBeDeletedInTheEnd.push(createdTemplate.id);
    expect(createdTemplate.id).toBeDefined();
    expect(createdTemplate.name).toBe(templateData.name);

    const getResponse = await api.get(`/templates/${createdTemplate.id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.data).toEqual(createdTemplate);
  });

  test('List templates with filters', async () => {
    const createdTemplate1 = await createTemplate({ name: '@adobe/template1', categories: ['cat1'] });
    const createdTemplate2 = await createTemplate({ name: '@adobe/template2', categories: ['cat2'] });

    templateIdsToBeDeletedInTheEnd.push(createdTemplate1.id);
    templateIdsToBeDeletedInTheEnd.push(createdTemplate2.id);

    const listResponse = await api.get('/templates');
    expect(listResponse.status).toBe(200);
    expect(listResponse.data.items.length).toBeGreaterThan(1);

    const filteredResponse = await api.get('/templates?categories=cat1');
    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.data.items.every(item => item.categories.includes('cat1'))).toBe(true);

    const paginatedResponse = await api.get('/templates?size=1');
    expect(paginatedResponse.status).toBe(200);
    expect(paginatedResponse.data.items.length).toBe(1);
    expect(paginatedResponse.data._links.next).toBeDefined();
  });

  test('Update an existing template', async () => {
    const template = await createTemplate({ name: '@adobe/update-test' });
    templateIdsToBeDeletedInTheEnd.push(template.id);

    const updateData = {
      updatedBy: 'Tester',
      description: 'Updated description'
    };

    const updateResponse = await api.put(`/templates/${template.id}`, updateData);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data.description).toBe(updateData.description);

    const getResponse = await api.get(`/templates/${template.id}`);
    expect(getResponse.data.description).toBe(updateData.description);
  });

  test('Install a template', async () => {
    const template = await createTemplate({ name: '@adobe/install-test' });
    templateIdsToBeDeletedInTheEnd.push(template.id);

    const installData = {
      orgId: 'test-org-id',
      projectName: 'Test Project',
      metadata: {}
    };

    const installResponse = await api.post(`/install/${template.id}`, installData);
    expect(installResponse.status).toBe(201);
    expect(installResponse.data.id).toBeDefined();
    expect(installResponse.data.apiKey).toBeDefined();
    expect(installResponse.data.orgId).toBe(installData.orgId);
  });

  test('Delete all templates and verify deletion', async () => {
    for (const templateId of templateIdsToBeDeletedInTheEnd) {
      const deleteResponse = await api.delete(`/templates/${templateId}`);
      expect(deleteResponse.status).toBe(200);
      await expect(api.get(`/templates/${templateId}`)).rejects.toThrow('Request failed with status code 404');
    }
  });

  test('Verify error responses', async () => {
    await expect(api.post('/templates', {})).rejects.toThrow('Request failed with status code 400');

    api.defaults.headers.Authorization = 'Bearer invalid-token';
    await expect(api.get('/templates')).rejects.toThrow('Request failed with status code 401');
    api.defaults.headers.Authorization = `Bearer ${config.authToken}`;

    await expect(api.get('/templates/non-existent-id')).rejects.toThrow('Request failed with status code 404');
  });

  test('Verify authentication and authorization', async () => {
    const unauthenticatedApi = axios.create({ baseURL: config.baseUrl });
    await expect(unauthenticatedApi.get('/templates')).rejects.toThrow('Request failed with status code 401');

    // Test with invalid token
    const invalidApi = axios.create({
      baseURL: config.baseUrl,
      headers: { Authorization: 'Bearer invalid-token' }
    });
    await expect(invalidApi.get('/templates')).rejects.toThrow('Request failed with status code 401');

    // Test with insufficient permissions
    await expect(api.post('/some-restricted-endpoint')).rejects.toThrow('Request failed with status code 403');
  });

  test('Get template by organization and name', async () => {
    const templateData = {
      name: '@testorg/test-template',
      links: { github: 'https://github.com/testorg/test-template' }
    };
    await createTemplate(templateData);

    const getResponse = await api.get('/templates/testorg/test-template');
    expect(getResponse.status).toBe(200);
    expect(getResponse.data.name).toBe(templateData.name);

    await expect(api.get('/templates/testorg/non-existent')).rejects.toThrow('Request failed with status code 404');
  });

  test('Verify concurrent template operations', async () => {
    const createPromises = Array(5).fill().map(() => createTemplate({ name: `@adobe/concurrent-test-${Date.now()}` }));
    const createdTemplates = await Promise.all(createPromises);

    const updatePromises = createdTemplates.map(template =>
      api.put(`/templates/${template.id}`, { updatedBy: 'ConcurrentTest', description: `Updated ${Date.now()}` })
    );
    await Promise.all(updatePromises);

    const deletePromises = createdTemplates.map(template => api.delete(`/templates/${template.id}`));
    await Promise.all(deletePromises);

    // Verify all templates were deleted
    for (const template of createdTemplates) {
      await expect(api.get(`/templates/${template.id}`)).rejects.toThrow('Request failed with status code 404');
    }
  });

  test('Verify API performance under load', async () => {
    const startTime = Date.now();
    const numRequests = 50;

    const requests = Array(numRequests).fill().map(() => api.get('/templates'));
    const responses = await Promise.all(requests);

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgResponseTime = totalTime / numRequests;

    console.log(`Average response time: ${avgResponseTime}ms`);

    expect(avgResponseTime).toBeLessThan(responseTime); // Assuming 3000 ms is acceptable
    expect(responses.every(r => r.status === 200)).toBe(true);
  });
});

describe('Template Registry API API Console Template Tests', () => {
  const templateIdsToBeDeletedInTheEnd = [];

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
    const template = await createTemplate(consoleTemplateData);
    templateIdsToBeDeletedInTheEnd.push(template.id);

    expect(template).toMatchObject({
      status: 'Approved',
      name: expect.stringContaining('test-template-fields-postbuster-'),
      description: 'Full test template made by PostBuster'
    });
  });

  test('Update an existing console template', async () => {
    const template = await createTemplate(consoleTemplateData);
    templateIdsToBeDeletedInTheEnd.push(template.id);

    const updateData = {
      updatedBy: 'Tester',
      description: 'Updated description'
    };

    const updateResponse = await api.put(`/templates/${template.id}`, updateData);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data.description).toBe(updateData.description);

    const getResponse = await api.get(`/templates/${template.id}`);
    expect(getResponse.data.description).toBe(updateData.description);
  });

  test('Delete all console templates and verify deletion', async () => {
    for (const templateId of templateIdsToBeDeletedInTheEnd) {
      const deleteResponse = await api.delete(`/templates/${templateId}`);
      expect(deleteResponse.status).toBe(200);
      await expect(api.get(`/templates/${templateId}`)).rejects.toThrow('Request failed with status code 404');
    }
  });
});
