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

const { MongoClient, Collection } = require('mongodb');

let db = null;

/**
 * Connects to MongoDB.
 * @param {object} params MongoDB connection parameters
 * @returns {Promise<void>}
 */
async function connectToMongoDB (params) {
  try {
    const dbName = params.MONGODB_NAME;
    const url = params.MONGODB_URI;
    const client = new MongoClient(url);
    await client.connect();
    console.log('Connected to MongoDB.');
    db = client.db(dbName);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw new Error('Error connecting to MongoDB');
  }
}

/**
 * Returns a collection to interact with from MongoDB.
 * @param {object} params MongoDB connection parameters
 * @param {string} collectionName Name of the collection
 * @returns {Promise<Collection>} A collection
 */
async function mongoConnection (params, collectionName) {
  if (!db || db === null) {
    await connectToMongoDB(params);
  }
  return db.collection(collectionName); // returns a collection
}

module.exports = { mongoConnection };
