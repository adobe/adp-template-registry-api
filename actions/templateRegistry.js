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

const axios = require('axios').default;
const { Octokit } = require('@octokit/rest');

const collectionName = 'templates';

const TEMPLATE_STATUS_IN_VERIFICATION = 'InVerification';
const TEMPLATE_STATUS_APPROVED = 'Approved';
const TEMPLATE_STATUS_REJECTED = 'Rejected';

let openReviewIssues = null;

const { ObjectId } = require('mongodb');
const { mongoConnection } = require('../db/mongo');
const { convertMongoIdToString } = require('./utils');

/**
 * Returns a template record from Template Registry by a template id.
 *
 * @param {object} dbParams database connection parameters
 * @param {string} templateId template id
 * @returns {Promise<object|null>} an existing template record or null
 */
async function findTemplateById (dbParams, templateId) {
  const collection = await mongoConnection(dbParams, collectionName);
  const result = await collection.findOne({ _id: new ObjectId(templateId) });
  return result ? convertMongoIdToString(result) : null;
}

/**
 * Updates a template to Template Registry.
 *
 * @param {object} dbParams database connection parameters
 * @param {string} templateId template Id
 * @param {object} templateBody template data
 * @returns {object} mongo response
 */
async function updateTemplate (dbParams, templateId, templateBody) {
  const collection = await mongoConnection(dbParams, collectionName);

  const response = await collection.updateOne({ _id: new ObjectId(templateId) }, {
    $set: templateBody
  });

  return response;
  /**
   * { "acknowledged" : true, "matchedCount" : 1, "modifiedCount" : 1 }
   */
}

/**
 * Returns a template record from Template Registry by a template name.
 *
 * @param {object} dbParams database connection parameters
 * @param {string} templateName template name
 * @returns {Promise<object|null>} an existing template record or null
 */
async function findTemplateByName (dbParams, templateName) {
  const collection = await mongoConnection(dbParams, collectionName);
  const results = await collection.find({ name: templateName }).toArray();
  return results?.length ? convertMongoIdToString(results[0]) : null;
}

/**
 * Adds a template to Template Registry.
 *
 * @param {object} dbParams database connection parameters
 * @param {object} body template data
 * @returns {object} a newly created template
 */
async function addTemplate (dbParams, body) {
  const collection = await mongoConnection(dbParams, collectionName);
  const template = {
    ...body,
    status: body.status ? body.status : TEMPLATE_STATUS_IN_VERIFICATION,
    adobeRecommended: body.adobeRecommended ? body.adobeRecommended : false
  };

  // Only add npm link if github link is provided
  if (template.links?.github) {
    template.links.npm = `https://www.npmjs.com/package/${body.name}`;
  }

  const result = await collection.insertOne(template);
  const output = { ...template, id: result?.insertedId?.toString() };
  return convertMongoIdToString(output);
}

/**
 * Removes a template from Template Registry.
 *
 * @param {object} dbParams database connection parameters
 * @param {string} templateName template name
 * @returns {object} response
 */
async function removeTemplateByName (dbParams, templateName) {
  const collection = await mongoConnection(dbParams, collectionName);
  const response = await collection.deleteOne({ name: templateName });
  return response;
}

/**
 * Removes a template from Template Registry.
 *
 * @param {object} dbParams database connection parameters
 * @param {string} templateId template id
 * @returns {object} response
 */
async function removeTemplateById (dbParams, templateId) {
  const collection = await mongoConnection(dbParams, collectionName);
  const response = await collection.deleteOne({ _id: new ObjectId(templateId) });
  return response;
}

/**
 * Creates a Template Review Request issue.
 *
 * @param {string} templateName template name
 * @param {string} githubRepoUrl Github repo URL
 * @param {string} githubAccessToken Github access token
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @returns {Promise<number>} created issue number
 */
async function createReviewIssue (templateName, githubRepoUrl, githubAccessToken, templateRegistryOrg, templateRegistryRepository) {
  const octokit = new Octokit({
    auth: githubAccessToken
  });
  const response = await octokit.rest.issues.create({
    owner: templateRegistryOrg,
    repo: templateRegistryRepository,
    title: `Add ${templateName}`,
    labels: ['add-template', 'template-registry-api'],
    body: `### Link to GitHub repo\n${githubRepoUrl}\n### npm package name\n${templateName}`
  });
  return response.data.number;
}

/**
 * Finds an open "Template Review Request" issue by a template name if any.
 *
 * @param {string} templateName template name
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @returns {Promise<object|null>} an open "Template Review Request" issue or null
 */
async function getReviewIssueByTemplateName (templateName, templateRegistryOrg, templateRegistryRepository) {
  const issues = await getOpenReviewIssues(templateRegistryOrg, templateRegistryRepository);
  const reviewIssue = issues.find(item => item.body.endsWith(templateName));
  return (reviewIssue !== undefined) ? reviewIssue.html_url : null;
}

/**
 * Finds all open "Template Review Request" issues.
 *
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @returns {Array} An array of open "Template Review Request" issues
 * @private
 */
async function getOpenReviewIssues (templateRegistryOrg, templateRegistryRepository) {
  if (openReviewIssues === null) {
    openReviewIssues = await fetchUrl(
      `https://api.github.com/repos/${templateRegistryOrg}/${templateRegistryRepository}/issues?state=open&labels=add-template&sort=updated-desc`
    );
  }
  return openReviewIssues;
}

/**
 * Returns Template Registry records.
 *
 * @param {object} dbParams database connection parameters
 * @returns {Promise<Array|[]>} existing Template Registry records
 */
async function getTemplates (dbParams) {
  const collection = await mongoConnection(dbParams, collectionName);
  const results = await collection.find({}).toArray();
  const result = results?.length ? convertMongoIdToString(results) : [];
  return result;
}

/**
 * @param {string} url URL of a resource to fetch
 * @param {object} headers headers to be set if any
 * @param {object} params params to be set if any
 * @returns {Promise} response data
 */
async function fetchUrl (url, headers = {}, params = {}) {
  return new Promise((resolve, reject) => {
    axios({
      method: 'get',
      url,
      headers,
      params
    })
      .then(response => {
        if (response.status === 200) {
          resolve(response.data);
        } else {
          const error = `Error fetching "${url}". Response code is ${response.status}`;
          reject(new Error(error));
        }
      })
      .catch(e => {
        const error = `Error fetching "${url}". ${e.toString()}`;
        reject(new Error(error));
      });
  });
}

module.exports = {
  fetchUrl,
  getTemplates,
  findTemplateByName,
  findTemplateById,
  addTemplate,
  removeTemplateByName,
  createReviewIssue,
  updateTemplate,
  getReviewIssueByTemplateName,
  TEMPLATE_STATUS_IN_VERIFICATION,
  TEMPLATE_STATUS_APPROVED,
  TEMPLATE_STATUS_REJECTED,
  removeTemplateById
};
