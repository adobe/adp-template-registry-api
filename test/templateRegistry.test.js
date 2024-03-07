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

const { expect, describe, test } = require('@jest/globals');
const nock = require('nock');
const { findTemplateByName, getReviewIssueByTemplateName } = require('../actions/templateRegistry');

process.env = {};

describe('Verify communication with Template Registry', () => {
  test('Verify finding a template by a template name', async () => {
    const templateName = '@adobe/app-builder-template';
    const template = {
      'id': 'd1dc1000-f32e-4172-a0ec-9b2f3ef6ac47',
      'author': 'Adobe Inc.',
      'name': templateName,
      'description': 'A template for testing purposes [1.0.9]',
      'latestVersion': '1.0.9',
      'publishDate': '2022-05-01T03:50:39.658Z',
      'apis': [
        {
          'code': 'AnalyticsSDK',
          'credentials': 'OAuth'
        }
      ],
      'adobeRecommended': false,
      'keywords': [
        'aio',
        'adobeio',
        'app',
        'templates',
        'aio-app-builder-template'
      ],
      'status': 'Approved',
      'links': {
        'npm': 'https://www.npmjs.com/package/@adobe/app-builder-template',
        'github': 'https://github.com/adobe/app-builder-template'
      },
      'categories': [
        'action',
        'ui'
      ]
    };
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .reply(200, [
        template
      ]);

    await expect(findTemplateByName(templateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY))
      .resolves.toEqual(template);
  });

  test('Verify returning NULL for a non-existing template', async () => {
    const templateName = '@adobe/app-builder-template-none';
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .reply(200, []);

    await expect(findTemplateByName(templateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY))
      .resolves.toBeNull();
  });

  test('Returns an open "Template Review Request" issue', async () => {
    const templateName = '@adobe/app-builder-template';
    const issueUrl = `https://github.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues/2`;
    nock('https://api.github.com')
      .get(`/repos/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues?state=open&labels=add-template&sort=updated-desc`)
      .times(1)
      .reply(200, [
        {
          'html_url': `https://github.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues/1`,
          'body': '### Link to GitHub repo\nhttps://github.com/company1/app-builder-template\n### npm package name\n@company1/app-builder-template'
        },
        {
          'html_url': issueUrl,
          'body': `### Link to GitHub repo\nhttps://github.com/adobe/app-builder-template\n### npm package name\n${templateName}`
        }
      ]);

    await expect(getReviewIssueByTemplateName(templateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY))
      .resolves.toBe(issueUrl);
  });

  test('Verify returning NULL for a non-existing open "Template Review Request" issue', async () => {
    const templateName = '@adobe/non-existing-template';
    await expect(getReviewIssueByTemplateName(templateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY))
      .resolves.toBeNull();
  });

  test('Verify that exception is thrown for non-successful Template Registry communication', async () => {
    const templateName = '@adobe/app-builder-template';
    nock('https://raw.githubusercontent.com')
      .get(`/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json`)
      .times(1)
      .reply(404);

    await expect(findTemplateByName(templateName, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY))
      .rejects.toThrow(`Error fetching "https://raw.githubusercontent.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/main/registry.json". AxiosError: Request failed with status code 404`);
  });
});
