require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());

// static
app.use('/public', express.static(path.join(__dirname,'..','public')));

// routes
app.use('/u', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/pay', require('./routes/pay-daraja'));

app.get('/healthz', (_req,res)=>res.json({ok:true, mode:'real'}));

const PORT = process.env.PORT || 5001;
app.listen(PORT, ()=>console.log('TekeTeke REAL API listening on '+PORT));

module.exports = app;

