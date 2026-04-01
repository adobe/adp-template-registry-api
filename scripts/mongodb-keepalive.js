/*
 * MongoDB Keepalive Script
 * Connects to MongoDB and inserts a keepalive timestamp to keep the cluster active
 */

const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_NAME;
const source = process.env.KEEPALIVE_SOURCE || 'github-actions-workflow';

if (!mongoUri) {
  throw new Error('MONGODB_URI environment variable is required');
}

if (!dbName) {
  throw new Error('MONGODB_NAME environment variable is required');
}

/**
 * Connects to MongoDB, inserts a keepalive timestamp, and closes the connection.
 * This keeps the MongoDB cluster active to prevent automatic pausing.
 * @returns {Promise<void>}
 */
async function connectToMongo () {
  const client = new MongoClient(mongoUri);
  try {
    console.log('Connecting to MongoDB...');
    console.log('Database: ' + dbName);
    await client.connect();
    console.log('Connected to MongoDB successfully');

    const db = client.db(dbName);

    // Append keepalive timestamp to track activity history
    const keepaliveCollection = db.collection('_keepalive');
    const timestamp = new Date().toISOString();
    await keepaliveCollection.insertOne({
      timestamp,
      date: new Date(),
      source
    });
    console.log('Appended keepalive timestamp: ' + timestamp);
    console.log('MongoDB keepalive successful');
    console.log('Cluster will remain active for another 30 days');
  } catch (error) {
    console.error('MongoDB connection failed:');
    console.error(error.message);
    throw error;
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Run the async function - unhandled rejections will cause process to exit with code 1
connectToMongo();
