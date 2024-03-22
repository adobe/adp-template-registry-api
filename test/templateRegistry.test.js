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

const { MongoClient } = require('mongodb');
const { expect, describe, test } = require('@jest/globals');
const nock = require('nock');
const { getReviewIssueByTemplateName, findTemplateByName, getTemplates, addTemplate, removeTemplateByName } = require('../actions/templateRegistry');

process.env = {};

describe('Verify communication with Template Registry', () => {

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
});

describe('Template Registry Mongodb CRUD Actions', () => {
  let clientConnectSpy;
  let clientDbMock;
  let collectionMock;

  const collectionName = 'templates';
  const templateName = 'my-template';
  const githubRepoUrl = 'https://github.com/my-org/my-template';
  const templates = [{
    id: 'mongodb-template-id',
    name: templateName,
    status: 'InVerification',
    links: {
      npm: `https://www.npmjs.com/package/${templateName}`,
      github: githubRepoUrl
    }
  }];

  beforeAll(() => {
    clientConnectSpy = jest.spyOn(MongoClient.prototype, 'connect').mockResolvedValue();
    collectionMock = {
      insertOne: jest.fn().mockResolvedValue(),
      deleteOne: jest.fn().mockResolvedValue(),
      find: jest.fn().mockReturnThis  (),
      toArray: jest.fn().mockResolvedValue(templates)
    };
    clientDbMock = jest.spyOn(MongoClient.prototype, 'db').mockReturnValue({
      collection: jest.fn((cName) => {
        if (cName === collectionName) {
          return collectionMock;
        }
        throw new Error('Unexpected collection name');
      })
    });
  });

  afterAll(() => {
    clientConnectSpy.mockRestore();
    clientDbMock.mockRestore();
  });

  test('should add a template to the collection', async () => {

    const templateResponse = await addTemplate(templateName, githubRepoUrl);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(clientDbMock).toHaveBeenCalledWith(expect.any(String)); // Ensure db is called with a string
    expect(collectionMock.insertOne).toHaveBeenCalledWith({
      id: expect.any(String),
      name: templateName,
      status: 'InVerification',
      links: {
        npm: `https://www.npmjs.com/package/${templateName}`,
        github: githubRepoUrl
      }
    });
    expect(templateResponse).toEqual({
      id: expect.any(String),
      name: templateName,
      status: 'InVerification',
      links: {
        npm: `https://www.npmjs.com/package/${templateName}`,
        github: githubRepoUrl
      }
    });
  });

  test('should remove template from the collection', async () => {
    const templateName = 'my-template';

    await removeTemplateByName(templateName);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(clientDbMock).toHaveBeenCalledWith(expect.any(String));
    expect(collectionMock.deleteOne).toHaveBeenCalledWith({
      name: templateName,
    });
  });

  test('should get all templates from the collection', async () => {
    const templatesResult = await getTemplates();
    expect(collectionMock.find).toHaveBeenCalledWith({});
    expect(collectionMock.find().toArray).toHaveBeenCalled();
    expect(templatesResult).toEqual(templates);
  });

  test('should get template by name from the collection', async () => {
    const templateName = 'my-template';
    const templatesResult = await findTemplateByName(templateName);
    expect(collectionMock.find).toHaveBeenCalledWith({});
    expect(collectionMock.find().toArray).toHaveBeenCalled();
    expect(templatesResult).toEqual(templates[0]);
  });
});