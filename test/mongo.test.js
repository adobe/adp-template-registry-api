const { MongoClient } = require('mongodb');
const { mongoConnection } = require('../db/mongo');

describe('mongoConnection', () => {
  let clientConnectSpy;
  let clientDbMock;

  beforeAll(() => {
    clientConnectSpy = jest.spyOn(MongoClient.prototype, 'connect').mockResolvedValue();
    clientDbMock = jest.spyOn(MongoClient.prototype, 'db').mockReturnValue({
      collection: jest.fn().mockReturnValue({
        // Mock any methods you might use on the collection
        // For example:
        insertOne: jest.fn(),
        find: jest.fn(),
        // Add more as needed
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
    await mongoConnection(collectionName);

    expect(clientConnectSpy).toHaveBeenCalled();
    expect(clientDbMock).toHaveBeenCalledWith('abstgtplregistryva6');
    expect(clientDbMock().collection).toHaveBeenCalledWith(collectionName);
  });

  it('should return the existing collection if already connected', async () => {
    await mongoConnection('existingCollection');
    await mongoConnection('existingCollection');

    expect(clientConnectSpy).not.toHaveBeenCalled();
    expect(clientDbMock).not.toHaveBeenCalled();
    expect(clientDbMock().collection).toHaveBeenCalledWith('existingCollection');
  });
});

