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

const { Core } = require('@adobe/aio-sdk');
const { errorResponse, errorMessage, stringParameters, ERR_RC_SERVER_ERROR, ERR_RC_HTTP_METHOD_NOT_ALLOWED, ERR_RC_INCORRECT_REQUEST } = require('../../utils');
const { getTemplates, getReviewIssueByTemplateName, TEMPLATE_STATUS_IN_VERIFICATION, TEMPLATE_STATUS_REJECTED } = require('../../templateRegistry');
const Enforcer = require('openapi-enforcer');
const orderBy = require('lodash.orderby');

const HTTP_METHOD = 'get';
const FILTER_VALUE_ANY = '*';
const FILTER_VALUE_NONE = '';
const FILTER_VALUE_NOT = '!';
const FILTER_VALUE_OR = '|';
const FILTER_TYPE_STUB = 'stub';

// LIST operation is available to everyone, no IMS access token is required

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });
  const dbParams = {
    'MONGODB_URI': params.MONGODB_URI,
    'MONGODB_NAME': params.MONGODB_NAME
  };

  try {
    // 'info' is the default level if not set
    logger.info('Calling "LIST templates"');

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params));

    if (params.__ow_method === undefined || params.__ow_method.toLowerCase() !== HTTP_METHOD) {
      return errorResponse(405, [errorMessage(ERR_RC_HTTP_METHOD_NOT_ALLOWED, `HTTP "${params.__ow_method}" method is unsupported.`)], logger);
    }

    // Configuration for filtering.
    // "field" - the name of the field from template object
    // "queryParam" - the name of the query param recieved via request
    // "filterType" - type of the "queryParam"
    // "subfield" - needed if filtering is happening by a subfield under the hood
    const filterConfig = [
      {
        'field': 'name',
        'queryParam': 'names',
        'filterType': 'array'
      },
      {
        'field': 'categories',
        'queryParam': 'categories',
        'filterType': 'array'
      },
      {
        'field': 'apis',
        'queryParam': 'apis',
        'filterType': 'array',
        'subfield': 'code'
      },
      {
        'field': 'status',
        'queryParam': 'statuses',
        'filterType': 'array'
      },
      {
        'field': 'adobeRecommended',
        'queryParam': 'adobeRecommended',
        'filterType': 'boolean'
      },
      {
        'field': 'extensions',
        'queryParam': 'extensions',
        'filterType': 'array',
        'subfield': 'extensionPointId'
      },
      {
        'field': 'event',
        'queryParam': 'events',
        'filterType': FILTER_TYPE_STUB // we do not have the final structure for this field, so we support "empty" and "any" filters for now
      },
      {
        'field': 'runtime',
        'queryParam': 'runtime',
        'filterType': 'boolean'
      }
    ];
    let templates = await getTemplates(dbParams);
    let queryParams = {};
    filterConfig.forEach(config => {
      if (config.queryParam in params) {
        const queryParamValues = params[config.queryParam].split(',').map(item => item.trim());
        templates = filter(templates, queryParamValues, config.field, config.filterType, config.subfield);
        queryParams[config.queryParam] = queryParamValues;
      }
    });

    // top-level keys are query parameters
    // query parameters mapped to their respective fields
    // and possibly nested fields in each template object for sorting
    const orderByFields = {
      'names': {
        'field': 'name'
      },
      'statuses': {
        'field': 'status'
      },
      'adobeRecommended': {
        'field': 'adobeRecommended'
      },
      'publishDate': {
        'field': 'publishDate'
      }
    };

    let sortFields = [];
    let sortOrders = [];
    if (params['orderBy']) {
      let orderByArray = params['orderBy']
        .split(',')
        // splitting on field/sorting direction pairs, and removing extra spaces
        .map(item => item.split(' ').filter(item => item !== ''))
        // removing incorrect sorting requests
        .filter(item => item.length === 1 || (item.length === 2 && ['asc', 'desc'].includes(item[1])))
        // removing unsupported fields
        .filter(item => Object.prototype.hasOwnProperty.call(orderByFields, item[0]))
        // adding the default sorting direction
        .map(item => {
          if (item.length === 1) {
            item.push('asc');
          }
          return item;
        });
      orderByArray.forEach(item => {
        let field = orderByFields[item[0]].field;
        let dir = item[1];
        if (orderByFields[item[0]].subfield) {
          field += '.' + orderByFields[item[0]].subfield;
        }
        sortFields.push(field);
        sortOrders.push(dir);
      });
      queryParams['orderBy'] = params['orderBy'].split(',').map(item => item.split(' ').filter(item => item !== '').join(' ')).join(',');

      templates = orderBy(templates, sortFields, sortOrders);
    }

    const queryString = Object.keys(queryParams).length !== 0 ? ('?' + Object.keys(queryParams).map(key => key + '=' + queryParams[key]).join('&')) : '';

    Enforcer.v3_0.Schema.defineDataTypeFormat('string', 'uuid', null);
    Enforcer.v3_0.Schema.defineDataTypeFormat('string', 'uri', null);
    const options = {
      componentOptions: {
        // skip a warning about the "allowEmptyValue" property
        // see https://swagger.io/docs/specification/describing-parameters/ Empty-Valued and Nullable Parameters
        exceptionSkipCodes: ['WPAR002']
      }
    };
    const openapi = await Enforcer('./openapi.yaml', options);
    const [req, reqError] = openapi.request({
      'method': HTTP_METHOD,
      'path': `/templates${queryString}`
    });
    if (reqError) {
      return errorResponse(400, [errorMessage(ERR_RC_INCORRECT_REQUEST, reqError.toString().split('\n').map(line => line.trim()).join(' => '))], logger);
    }

    for (let i = 0; i < templates.length; i++) {
      templates[i] = {
        ...templates[i],
        '_links': {
          'self': {
            'href': `${params.TEMPLATE_REGISTRY_API_URL}/templates/${templates[i].name}`
          }
        }
      };
      const templateStatuses = [TEMPLATE_STATUS_IN_VERIFICATION, TEMPLATE_STATUS_REJECTED];
      if (templateStatuses.includes(templates[i].status)) {
        const reviewIssue = await getReviewIssueByTemplateName(templates[i].name, params.TEMPLATE_REGISTRY_ORG, params.TEMPLATE_REGISTRY_REPOSITORY);
        if (null !== reviewIssue) {
          templates[i]['_links']['review'] = {
            'href': reviewIssue,
            'description': 'A link to the "Template Review Request" Github issue.'
          };
        }
      }
    }

    const items = {
      'items': templates,
      '_links': {
        'self': {
          'href': `${params.TEMPLATE_REGISTRY_API_URL}/templates${queryString}`
        }
      }
    };

    // validate the response data to be sure it complies with OpenApi Schema
    const [res, resError] = req.response(200, items);
    if (resError) {
      throw new Error(resError.toString());
    }

    logger.info('"LIST templates" executed successfully');
    return {
      'statusCode': 200,
      'body': res.body
    };
  } catch (error) {
    // log any server errors
    logger.error(error);

    // return with 500
    return errorResponse(500, [errorMessage(ERR_RC_SERVER_ERROR, 'An error occurred, please try again later.')], logger);
  }
}

/**
 * Apply filters to an array of templates
 *
 * @param {Array} templates
 * @param {Array} filterValues
 * @param {String} field
 * @param {String} filterType
 * @param {String} subfield
 * @returns {Array}
 */
function filter(templates, filterValues, field, filterType, subfield) {
  // From filterValues, extract values that start with "!" to be used as a negative filter
  const filterValuesToExclude = [];
  const filterOrValues = [];
  filterValues = filterValues.filter(value => {
    if (value.startsWith(FILTER_VALUE_NOT)) {
      filterValuesToExclude.push(value.substr(1));
      return false;
    }

    if (value.startsWith(FILTER_VALUE_OR)) {
      filterOrValues.push(value.substr(1));
      return false;
    }

    return true;
  });

  return templates.filter(template => {
    const isFieldSet = Object.prototype.hasOwnProperty.call(template, field);
    // check special cases: "empty" and "any" filters
    if ([FILTER_VALUE_ANY, FILTER_VALUE_NONE].includes(filterValues.join('')) && filterValuesToExclude.length === 0 && filterOrValues.length === 0) {
      if (filterValues.join('') === FILTER_VALUE_ANY && isFieldSet) {
        return true;
      } else if (filterValues.join('') === FILTER_VALUE_NONE && !isFieldSet) {
        return true;
      } else {
        return false;
      }
    }

    if (!isFieldSet) {
      return false;
    }

    switch (filterType) {
      case FILTER_TYPE_STUB: {
        return false;
      }
      case 'boolean': {
        const hasToBeTrue = filterValues.join('') === 'true';
        return template[field] === hasToBeTrue;
      }
      case 'array': {
        let templateFieldValues = template[field];
        if (subfield) {
          templateFieldValues = Array.isArray(template[field]) ? template[field].map(item => item[subfield]) : template[field][subfield];
        }

        if (Array.isArray(templateFieldValues)) {
          // Check if any of the template field values is in the list of filter values to exclude
          if (templateFieldValues.some(value => filterValuesToExclude.includes(value))) {
            return false;
          }

          // If there are no filter values, then the filter is "any"
          if (filterValues.length === 0) {
            return true;
          }

          // Check if any (OR) of the template field values is in the list of filter OR values
          if (templateFieldValues.some(value => filterOrValues.includes(value))) {
            return true;
          }

          // Check if all (AND) of the template field values is in the list of filter values to include
          if (filterValues.every(value => templateFieldValues.includes(value))) {
            return true;
          }
        } else {
          if (filterValuesToExclude.includes(templateFieldValues)) {
            return false;
          } else if (filterValues.length === 0) {
            return true;
          }
          return filterValues.includes(templateFieldValues);
        }
      }
    }

    return false;
  });
}

exports.main = main;
