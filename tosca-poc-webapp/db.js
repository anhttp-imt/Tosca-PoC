// Database module — MongoDB only.
require('dotenv').config();

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'sap-automation-poc';
const COLLECTION = process.env.COLLECTION_NAME || 'imt-poc-reports';

let client;
let db;

async function connect() {
  const { MongoClient } = require('mongodb');
  client = new MongoClient(URI);
  await client.connect({ serverSelectionTimeoutMS: 3000 });
  db = client.db(DB_NAME);
  console.log(`[MongoDB] Connected to ${URI}/${DB_NAME}`);
}

// --- Public API ---
async function loadReports() {
  return await db.collection(COLLECTION).find({}).sort({ createdAt: -1 }).toArray();
}

async function saveReport(report) {
  report.createdAt = new Date();
  report.updatedAt = new Date();
  await db.collection(COLLECTION).insertOne(report);
}

async function deleteReport(id) {
  await db.collection(COLLECTION).deleteOne({ id });
}

async function deleteAllReports() {
  await db.collection(COLLECTION).deleteMany({});
}

async function close() {
  if (client) {
    await client.close();
    console.log('[MongoDB] Connection closed');
  }
}

module.exports = { connect, loadReports, saveReport, deleteReport, deleteAllReports, close };