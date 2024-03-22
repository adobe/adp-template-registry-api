const { MongoClient } = require('mongodb');

const dbName = 'abstgtplregistryva6';
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017';
let db = null;

async function connectToMongoDB() {
  try {
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(dbName);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

async function mongoConnection(collectionName) {
  if (!db || db === null) {
    await connectToMongoDB();
  }
  return db.collection(collectionName); // returns a collection
}

module.exports = { connectToMongoDB, mongoConnection };