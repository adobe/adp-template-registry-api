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

const fetch = require('node-fetch');
require('dotenv').config();
const { Ims } = require('@adobe/aio-lib-ims');
const testConsoleTemplate = require('./fixtures/smoke/template.console.json');

let accessToken = '';

describe('smoke tests', () => {
  beforeAll(async () => {
    const ims = new Ims(process.env.AIO_RUNTIME_APIHOST.includes('stage') ? 'stage' : 'prod');
    const { payload } = await ims.getAccessToken(
      process.env.IMS_AUTH_CODE,
      process.env.IMS_CLIENT_ID,
      process.env.IMS_CLIENT_SECRET,
      process.env.IMS_SCOPES
    );
    accessToken = payload.access_token;
  });

  describe('console template', () => {
    let newTemplateId = '';
    it('should add a new template', async () => {
      const response = await fetch(`${process.env.TEMPLATE_REGISTRY_API_URL}/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(testConsoleTemplate)
      });
      expect(response.status).toBe(200);
      const template = await response.json();
      newTemplateId = template.id;
      expect(template.name).toBe('test-template-smoke-tests');
    });

    it('should fetch the new template', async () => {
      const response = await fetch(`${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${newTemplateId}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });
      expect(response.status).toBe(200);
      const template = await response.json();
      expect(template.name).toBe('test-template-smoke-tests');
    });

    it('should fetch list of templates, should have the new template', async () => {
      const response = await fetch(`${process.env.TEMPLATE_REGISTRY_API_URL}/templates`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });
      expect(response.status).toBe(200);
      const { items: templates } = await response.json();
      const newTemplate = templates.find(template => template.id === newTemplateId);
      expect(newTemplate).toBeDefined();
    });

    it('should update the new template', async () => {
      const response = await fetch(`${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${newTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...testConsoleTemplate,
          updatedBy: 'GitHub Actions',
          description: 'new template description updated'
        })
      });
      expect(response.status).toBe(200);

      const responseCheckUpdate = await fetch(`${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${newTemplateId}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });
      const template = await responseCheckUpdate.json();

      expect(responseCheckUpdate.status).toBe(200);
      expect(template.description).toBe('new template description updated');
    });

    it('should delete the new template', async () => {
      const response = await fetch(`${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${newTemplateId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });
      expect(response.status).toBe(200);

      const responseCheckDelete = await fetch(`${process.env.TEMPLATE_REGISTRY_API_URL}/templates/${newTemplateId}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });
      expect(responseCheckDelete.status).toBe(404);
    });
  });
});
