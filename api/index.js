const serverless = require('serverless-http');
const app = require('../server/server');
module.exports = serverless(app);
