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

const { MongoClient } = require('mongodb');
const { mongoConnection } = require('../db/mongo');

describe('mongoConnection', () => {
  let clientConnectSpy;
  let clientDbMock;

  beforeAll(() => {
    clientConnectSpy = jest.spyOn(MongoClient.prototype, 'connect').mockResolvedValue();
    clientDbMock = jest.spyOn(MongoClient.prototype, 'db').mockReturnValue({
      collection: jest.fn().mockReturnValue({
        insertOne: jest.fn(),
        find: jest.fn(),
      })
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    clientConnectSpy.mockRestore();
    clientDbMock.mockRestore();
  });

  it('should connect to MongoDB and return a collection', async () => {
    const collectionName = 'testCollection';
    await mongoConnection({}, collectionName);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(clientDbMock).toHaveBeenCalled();
    expect(clientDbMock().collection).toHaveBeenCalledWith(collectionName);
  });

  it('should return the existing collection if already connected', async () => {
    await mongoConnection({}, 'existingCollection');
    await mongoConnection({}, 'existingCollection');

    expect(clientConnectSpy).not.toHaveBeenCalled();
    expect(clientDbMock).not.toHaveBeenCalled();
    expect(clientDbMock().collection).toHaveBeenCalledWith('existingCollection');
  });
});

