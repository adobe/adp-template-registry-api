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

const axios = require('axios').default;
const { Octokit } = require('@octokit/rest');
const { v4: uuidv4 } = require('uuid');

const TEMPLATE_STATUS_IN_VERIFICATION = 'InVerification';
const TEMPLATE_STATUS_APPROVED = 'Approved';
const TEMPLATE_STATUS_REJECTED = 'Rejected';

let openReviewIssues = null;

/**
 * Returns a template record from Template Registry by a template name.
 *
 * @param {string} templateName template name
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @returns {Promise<object|null>} an existing template record or null
 */
async function findTemplateByName(templateName, templateRegistryOrg, templateRegistryRepository) {
  const templates = await getTemplates(templateRegistryOrg, templateRegistryRepository);
  const template = templates.find(item => item.name === templateName);
  return (template !== undefined) ? template : null;
}

/**
 * Adds a template to Template Registry.
 *
 * @param {string} templateName template name
 * @param {string} githubRepoUrl Github repo URL
 * @param {string} githubAccessToken Github access token
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @param {string} commitMessage commit message
 * @returns {object} a newly created template
 */
async function addTemplate(templateName, githubRepoUrl, githubAccessToken, templateRegistryOrg, templateRegistryRepository, commitMessage) {
  const templates = await getTemplates(templateRegistryOrg, templateRegistryRepository, true);
  const template = {
    'id': uuidv4(),
    'name': templateName,
    'status': 'InVerification',
    'links': {
      'npm': `https://www.npmjs.com/package/${templateName}`,
      'github': githubRepoUrl
    }
  };
  templates.push(template);
  await saveRegistry(templates, githubAccessToken, templateRegistryOrg, templateRegistryRepository, commitMessage);
  return template;
}

/**
 * Removes a template from Template Registry.
 *
 * @param {string} templateName template name
 * @param {string} githubAccessToken Github access token
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @param {string} commitMessage commit message
 * @returns {void}
 */
async function removeTemplateByName(templateName, githubAccessToken, templateRegistryOrg, templateRegistryRepository, commitMessage) {
  const templates = await getTemplates(templateRegistryOrg, templateRegistryRepository, true);
  let index = templates.findIndex(item => item.name === templateName);
  if (index !== -1) {
    templates.splice(index, 1);
    await saveRegistry(templates, githubAccessToken, templateRegistryOrg, templateRegistryRepository, commitMessage);
  }
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
async function createReviewIssue(templateName, githubRepoUrl, githubAccessToken, templateRegistryOrg, templateRegistryRepository) {
  const octokit = new Octokit({
    'auth': githubAccessToken
  });
  const response = await octokit.rest.issues.create({
    'owner': templateRegistryOrg,
    'repo': templateRegistryRepository,
    'title': `Add ${templateName}`,
    'labels': ['add-template', 'template-registry-api'],
    'body': `### Link to GitHub repo\n${githubRepoUrl}\n### npm package name\n${templateName}`
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
async function getReviewIssueByTemplateName(templateName, templateRegistryOrg, templateRegistryRepository) {
  const issues = await getOpenReviewIssues(templateRegistryOrg, templateRegistryRepository);
  const reviewIssue = issues.find(item => item.body.endsWith(templateName));
  return (reviewIssue !== undefined) ? reviewIssue['html_url'] : null;
}

/**
 * Finds all open "Template Review Request" issues.
 *
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @returns {Array} An array of open "Template Review Request" issues
 * @private
 */
async function getOpenReviewIssues(templateRegistryOrg, templateRegistryRepository) {
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
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @param {boolean} avoidCache (Optional) If it is set, registry.json will be fetched in another way to overcome Github caching.
 * @returns {Promise<object>} existing Template Registry records
 */
async function getTemplates(templateRegistryOrg, templateRegistryRepository, avoidCache = false) {
  if (avoidCache === true) {
    // a workaround that partially helps to overcome https://raw.githubusercontent.com/ caching issues (Cache-Control: max-age=300)
    // todo: there is still a short delay when a new commit starts to be visible
    const lastCommitHash = await fetchUrl(
      `https://api.github.com/repos/${templateRegistryOrg}/${templateRegistryRepository}/commits/main`,
      {
        'Accept': 'application/vnd.github.VERSION.sha'
      }
    );
    return await fetchUrl(
      `https://raw.githubusercontent.com/${templateRegistryOrg}/${templateRegistryRepository}/${lastCommitHash}/registry.json`
    );
  } else {
    return await fetchUrl(
      `https://raw.githubusercontent.com/${templateRegistryOrg}/${templateRegistryRepository}/main/registry.json`
    );
  }
}

/**
 * Saves the registry json object to registry.json
 *
 * @param {object} registry registry json object
 * @param {string} githubAccessToken Github access token
 * @param {string} templateRegistryOrg Template Registry organization name
 * @param {string} templateRegistryRepository Template Registry repository name
 * @param {string} commitMessage commit message
 * @returns {void}
 * @private
 */
async function saveRegistry(registry, githubAccessToken, templateRegistryOrg, templateRegistryRepository, commitMessage) {
  const data = JSON.stringify(registry, null, 4);
  const octokit = new Octokit({
    'auth': githubAccessToken
  });
  const fileMetadata = await octokit.request(`GET /repos/${templateRegistryOrg}/${templateRegistryRepository}/contents/registry.json`, {
    'owner': templateRegistryOrg,
    'repo': templateRegistryRepository,
    'branch': 'main',
    'path': 'registry.json'
  });
  await octokit.request(`PUT /repos/${templateRegistryOrg}/${templateRegistryRepository}/contents/registry.json`, {
    'owner': templateRegistryOrg,
    'repo': templateRegistryRepository,
    'branch': 'main',
    'path': 'registry.json',
    'message': commitMessage,
    'content': Buffer.from(data).toString('base64'),
    'sha': fileMetadata['data']['sha']
  });
}

/**
 * @param {string} url URL of a resource to fetch
 * @param {object} headers headers to be set if any
 * @param {object} params params to be set if any
 * @returns {Promise}
 */
async function fetchUrl(url, headers = {}, params = {}) {
  return new Promise((resolve, reject) => {
    axios({
      'method': 'get',
      'url': url,
      'headers': headers,
      'params': params
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
  addTemplate,
  removeTemplateByName,
  createReviewIssue,
  getReviewIssueByTemplateName,
  TEMPLATE_STATUS_IN_VERIFICATION,
  TEMPLATE_STATUS_APPROVED,
  TEMPLATE_STATUS_REJECTED
};
