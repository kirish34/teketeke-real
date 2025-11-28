require('dotenv').config();
const { sendPendingSmsBatch } = require('./server/sms/sms.worker');

(async () => {
  try {
    await sendPendingSmsBatch();
  } catch (err) {
    console.error('SMS runner error:', err.message);
  } finally {
    process.exit(0);
  }
})();
