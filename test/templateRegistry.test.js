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

const { MongoClient, ObjectId } = require('mongodb');
const nock = require('nock');
const {
  fetchUrl,
  createReviewIssue,
  getReviewIssueByTemplateName,
  findTemplateByName,
  getTemplates,
  addTemplate,
  removeTemplateByName,
  updateTemplate,
  findTemplateById,
  removeTemplateById
} = require('../actions/templateRegistry');

const dbParams = {
  MONGODB_URI: 'mongodb://localhost:27017',
  MONGODB_NAME: 'testDb'
};

jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn(() => {
      return {
        rest: {
          issues: {
            create: jest.fn(() => ({ data: { number: 1 } }))
          }
        }
      };
    })
  };
});

describe('Verify communication with Template Registry', () => {
  test('Returns an open "Template Review Request" issue', async () => {
    const templateName = '@adobe/app-builder-template';
    const issueUrl = `https://github.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues/2`;
    nock('https://api.github.com')
      .get(`/repos/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues?state=open&labels=add-template&sort=updated-desc`)
      .times(1)
      .reply(200, [
        {
          html_url: `https://github.com/${process.env.TEMPLATE_REGISTRY_ORG}/${process.env.TEMPLATE_REGISTRY_REPOSITORY}/issues/1`,
          body: '### Link to GitHub repo\nhttps://github.com/company1/app-builder-template\n### npm package name\n@company1/app-builder-template'
        },
        {
          html_url: issueUrl,
          body: `### Link to GitHub repo\nhttps://github.com/adobe/app-builder-template\n### npm package name\n${templateName}`
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
    // _id: new ObjectId('6618567c770086a68ee56fca'),
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
      insertOne: jest.fn().mockResolvedValue({
        acknowledged: true,
        insertedId: 'mongodb-template-id'
      }),
      updateOne: jest.fn().mockResolvedValue({
        acknowledged: true, matchedCount: 1, modifiedCount: 1
      }),
      deleteOne: jest.fn().mockResolvedValue(),
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn().mockReturnValue(templates[0]),
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
    jest.clearAllMocks();
  });

  test('should add an app builder template to the collection', async () => {
    const templateResponse = await addTemplate(dbParams, {
      name: templateName,
      links: {
        github: githubRepoUrl
      }
    });

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(collectionMock.insertOne).toHaveBeenCalled();
    expect(collectionMock.insertOne).toHaveBeenCalledWith({
      name: templateName,
      status: 'InVerification',
      links: {
        npm: `https://www.npmjs.com/package/${templateName}`,
        github: githubRepoUrl
      },
      adobeRecommended: false
    });
    expect(templateResponse).toEqual({
      id: expect.any(String),
      name: templateName,
      status: 'InVerification',
      links: {
        npm: `https://www.npmjs.com/package/${templateName}`,
        github: githubRepoUrl
      },
      adobeRecommended: false
    });
  });

  test('should add a developer console template to the collection', async () => {
    const consoleTemplate = {
      name: templateName,
      description: 'My template description',
      latestVersion: '1.0.0',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/123'
      }
    };

    const templateResponse = await addTemplate(dbParams, consoleTemplate);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(collectionMock.insertOne).toHaveBeenCalledWith({
      status: 'InVerification',
      adobeRecommended: false,
      ...consoleTemplate
    });
    expect(templateResponse).toEqual({
      status: 'InVerification',
      id: 'mongodb-template-id',
      adobeRecommended: false,
      ...consoleTemplate
    });
  });

  test('should add a developer console template to the collection with additional fields in request body', async () => {
    const consoleTemplate = {
      name: templateName,
      description: 'My template description',
      latestVersion: '1.0.0',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/123'
      },
      author: 'Adobe Inc.',
      adobeRecommended: true,
      status: 'Approved'
    };

    const templateResponse = await addTemplate(dbParams, consoleTemplate);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(collectionMock.insertOne).toHaveBeenCalledWith({
      author: 'Adobe Inc.',
      adobeRecommended: true,
      status: 'Approved',
      ...consoleTemplate
    });
    expect(templateResponse).toEqual({
      id: 'mongodb-template-id',
      author: 'Adobe Inc.',
      adobeRecommended: true,
      status: 'Approved',
      ...consoleTemplate
    });
  });

  test('should add a developer console template to the collection with only one additional field in request body', async () => {
    const consoleTemplate = {
      name: templateName,
      description: 'My template description',
      latestVersion: '1.0.0',
      links: {
        consoleProject: 'https://developer-stage.adobe.com/console/projects/123'
      },
      author: 'Adobe Inc.'
    };

    const templateResponse = await addTemplate(dbParams, consoleTemplate);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(collectionMock.insertOne).toHaveBeenCalledWith({
      author: 'Adobe Inc.',
      adobeRecommended: false,
      status: 'InVerification',
      ...consoleTemplate
    });
    expect(templateResponse).toEqual({
      id: 'mongodb-template-id',
      author: 'Adobe Inc.',
      adobeRecommended: false,
      status: 'InVerification',
      ...consoleTemplate
    });
  });

  test('should remove template from the collection', async () => {
    const templateName = 'my-template';

    await removeTemplateByName(dbParams, templateName);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(collectionMock.deleteOne).toHaveBeenCalledWith({
      name: templateName
    });
  });

  test('should remove template from the collection by id', async () => {
    const templateId = new ObjectId('6618567c770086a68ee56fca');

    await removeTemplateById(dbParams, templateId);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(collectionMock.deleteOne).toHaveBeenCalledWith({
      _id: templateId
    });
  });

  test('should get templates by id from the collection', async () => {
    const templateId = '662f8c822fb28925eb4d7f3a';
    const templatesResult = await findTemplateById(dbParams, templateId);
    expect(collectionMock.findOne).toHaveBeenCalledWith({
      _id: new ObjectId(templateId)
    });
    // expect(collectionMock.findOne().toArray).toHaveBeenCalled();
    expect(templatesResult).toEqual(templates[0]);
  });

  test('should get all templates from the collection', async () => {
    const templatesResult = await getTemplates(dbParams);
    expect(collectionMock.find).toHaveBeenCalledWith({});
    expect(collectionMock.find().toArray).toHaveBeenCalled();
    expect(templatesResult).toEqual(templates);
  });

  test('should get all templates from the collection, none', async () => {
    collectionMock.toArray.mockResolvedValueOnce([]);
    const templatesResult = await getTemplates(dbParams);
    expect(collectionMock.find).toHaveBeenCalledWith({});
    expect(collectionMock.find().toArray).toHaveBeenCalled();
    expect(templatesResult).toEqual([]);
  });

  test('should get template by name from the collection', async () => {
    const templateName = 'my-template';
    const templatesResult = await findTemplateByName(dbParams, templateName);
    expect(collectionMock.find).toHaveBeenCalledWith({});
    expect(collectionMock.find().toArray).toHaveBeenCalled();
    expect(templatesResult).toEqual(templates[0]);
  });

  test('should get template by name from the collection, not found', async () => {
    collectionMock.toArray.mockResolvedValueOnce(null);
    const templateName = 'my-template';
    const templatesResult = await findTemplateByName(dbParams, templateName);
    expect(collectionMock.find).toHaveBeenCalledWith({ name: templateName });
    expect(collectionMock.find().toArray).toHaveBeenCalled();
    expect(templatesResult).toEqual(null);
  });

  test('should get template by Id from the collection, not found', async () => {
    collectionMock.findOne.mockResolvedValueOnce(null);
    const templateId = '6618567c770086a68ee56fca';
    const templatesResult = await findTemplateById(dbParams, templateId);
    expect(collectionMock.findOne).toHaveBeenCalledWith({ _id: new ObjectId(templateId) });
    expect(templatesResult).toEqual(null);
  });

  test('axios fetchUrl should return the response body', async () => {
    nock('https://jsonplaceholder.typicode.com')
      .get('/posts/1')
      .reply(200, {
        userId: 1,
        id: 1,
        title: 'title',
        body: 'body'
      });

    const url = 'https://jsonplaceholder.typicode.com/posts/1';
    const response = await fetchUrl(url);
    expect(response).toEqual({
      userId: 1,
      id: 1,
      title: 'title',
      body: 'body'
    });
  });

  test('axios fetchUrl returns non-200 status code', async () => {
    nock('https://jsonplaceholder.typicode.com')
      .get('/posts/1')
      .reply(201, {
        userId: 1,
        id: 1,
        title: 'title',
        body: 'body'
      });

    const url = 'https://jsonplaceholder.typicode.com/posts/1';
    await expect(fetchUrl(url)).rejects.toThrow('Error fetching "https://jsonplaceholder.typicode.com/posts/1". Response code is 201');
  });

  test('axios fetchUrl returns 400 status code', async () => {
    nock('https://jsonplaceholder.typicode.com')
      .get('/posts/1')
      .reply(400, {
        userId: 1,
        id: 1,
        title: 'title',
        body: 'body'
      });

    const url = 'https://jsonplaceholder.typicode.com/posts/1';
    await expect(fetchUrl(url)).rejects.toThrow('Error fetching "https://jsonplaceholder.typicode.com/posts/1". AxiosError: Request failed with status code 400');
  });

  test('create issue for a template', async () => {
    const templateName = 'my-template';
    const githubRepoUrl = 'https://github.com/my-org/my-template';
    const issueNumber = await createReviewIssue(templateName, githubRepoUrl, process.env.GITHUB_ACCESS_TOKEN, process.env.TEMPLATE_REGISTRY_ORG, process.env.TEMPLATE_REGISTRY_REPOSITORY);
    expect(issueNumber).toBe(1);
  });

  test('should update an app builder template to the collection', async () => {
    const templateResponse = await updateTemplate(dbParams, '6618567c770086a68ee56fca', {
      status: 'InVerification',
      links: {
        npm: `https://www.npmjs.com/package/${templateName}`,
        github: githubRepoUrl
      }
    });

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(collectionMock.updateOne).toHaveBeenCalled();
    expect(collectionMock.updateOne).toHaveBeenCalledWith({
      _id: new ObjectId('6618567c770086a68ee56fca')
    }, {
      $set: {
        status: 'InVerification',
        links: {
          npm: `https://www.npmjs.com/package/${templateName}`,
          github: githubRepoUrl
        }
      }
    });
    expect(templateResponse).toEqual({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
  });

  test('should get null when calling templates by id', async () => {
    collectionMock.findOne.mockResolvedValue(null);
    const templateId = '662f8c822fb28925eb4d7f3a';
    const templatesResult = await findTemplateById(dbParams, templateId);
    expect(collectionMock.findOne).toHaveBeenCalledWith({
      _id: new ObjectId(templateId)
    });
    expect(templatesResult).toEqual(null);
    collectionMock.findOne.mockReset();
  });
});
