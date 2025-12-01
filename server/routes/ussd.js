// routes/ussd.js
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const router = express.Router();

const pool = require('../db/pool');
const { createMobileWithdrawal } = require('../wallet/wallet.service');
const { sendB2CPayment } = require('../mpesa/mpesaB2C.service');

const DARAJA_ENV = process.env.DARAJA_ENV || 'sandbox';
const DARAJA_BASE_URL =
  process.env.DARAJA_BASE_URL ||
  (DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke');
const DARAJA_CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY;
const DARAJA_CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || process.env.MPESA_CONSUMER_SECRET;
const DARAJA_SHORTCODE = process.env.DARAJA_SHORTCODE || process.env.MPESA_B2C_SHORTCODE;
const DARAJA_PASSKEY = process.env.DARAJA_PASSKEY;
const DARAJA_CALLBACK_URL = process.env.DARAJA_CALLBACK_URL || process.env.MPESA_B2C_RESULT_URL;

// ----------------------
// Helper: parse vehicle code from serviceCode
// e.g. "*123*00011#" -> "00011"
// ----------------------
function extractEmbeddedVehicleCode(serviceCode) {
  // Adjust this regex if your pattern changes
  // This expects last 5 digits before the '#'
  const match = serviceCode.match(/\*([0-9]{5})#$/);
  if (!match) return null;
  return match[1]; // "00011"
}

function normalizeMsisdn(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return '254' + digits.slice(1);
  if (digits.length === 9 && digits.startsWith('7')) return '254' + digits;
  return digits;
}

function buildVirtualAccountFromPhone(msisdn) {
  return `MSISDN${msisdn}`;
}

async function ensurePinTable() {
  await pool.query(`
    create table if not exists wallet_pins (
      wallet_id uuid primary key references wallets(id) on delete cascade,
      pin_hash text not null,
      pin_salt text not null,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )
  `);
  await pool.query(`create index if not exists wallet_pins_wallet_idx on wallet_pins(wallet_id)`);
}

const pinTableReady = ensurePinTable();

function hashPin(pin, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

async function getDarajaAccessToken() {
  if (!DARAJA_CONSUMER_KEY || !DARAJA_CONSUMER_SECRET) {
    throw new Error('Daraja consumer key/secret not configured');
  }
  const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(`${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daraja token error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

// Find a vehicle + wallet using a USSD-assigned code like "00011"
async function findVehicleByUssdCode(ussdCode) {
  const code = (ussdCode || '').trim().toUpperCase();
  if (!code) return null;

  const client = await pool.connect();
  try {
    // Try match against USSD pool (base+checksum or full_code suffix)
    const poolRes = await client.query(
      `
        SELECT
          m.id         AS vehicle_id,
          m.number_plate,
          m.sacco_id,
          m.wallet_id,
          up.full_code,
          up.base,
          up.checksum
        FROM ussd_pool up
        LEFT JOIN matatus m ON m.id = up.allocated_to_id
        WHERE up.status = 'ALLOCATED'
          AND (
            up.full_code ILIKE '%' || $1 || '#'
            OR (up.base || up.checksum::text) = $1
          )
        LIMIT 1
      `,
      [code]
    );

    let vehicleRow = poolRes.rows[0] || null;

    // Fallback: vehicle code could be the plate (MAT021 style)
    if (!vehicleRow) {
      const matRes = await client.query(
        `
          SELECT id AS vehicle_id, number_plate, sacco_id, wallet_id
          FROM matatus
          WHERE upper(number_plate) = $1
          LIMIT 1
        `,
        [code]
      );
      vehicleRow = matRes.rows[0] || null;
    }

    if (!vehicleRow) return null;

    // Backfill wallet if missing on matatus
    let walletId = vehicleRow.wallet_id || null;
    if (!walletId && vehicleRow.vehicle_id) {
      const wRes = await client.query(
        `select id from wallets where entity_type = 'MATATU' and entity_id = $1 limit 1`,
        [vehicleRow.vehicle_id]
      );
      walletId = wRes.rows[0]?.id || null;
    }

    return {
      id: vehicleRow.vehicle_id,
      plate: vehicleRow.number_plate,
      sacco_id: vehicleRow.sacco_id,
      wallet_id: walletId,
      ussd_code: vehicleRow.base ? `${vehicleRow.base}${vehicleRow.checksum || ''}` : code,
    };
  } finally {
    client.release();
  }
}

// Create a pending fare transaction (intent) before STK
async function createFareIntent({ sessionId, msisdn, walletId, vehicleId, amount }) {
  const client = await pool.connect();
  try {
    let saccoId = null;
    if (vehicleId) {
      const row = await client.query(`select sacco_id from matatus where id = $1 limit 1`, [vehicleId]);
      saccoId = row.rows[0]?.sacco_id || null;
    }

    const shortRef = Math.floor(1000 + Math.random() * 9000);
    const insertRes = await client.query(
      `
        insert into transactions
          (sacco_id, matatu_id, kind, fare_amount_kes, service_fee_kes, status, passenger_msisdn, notes)
        values
          ($1, $2, 'SACCO_FEE', $3, 0, 'PENDING', $4, $5)
        returning id
      `,
      [saccoId, vehicleId || null, Number(amount), msisdn || null, `USSD ${sessionId || ''}`.trim()]
    );

    return { id: insertRes.rows[0].id, short_ref: shortRef };
  } finally {
    client.release();
  }
}

// Trigger STK Push via your Safaricom Daraja integration
async function triggerStkPush({ phoneNumber, amount, accountReference, transactionDesc, internalRef }) {
  const msisdn = normalizeMsisdn(phoneNumber);
  if (!msisdn) throw new Error('Missing or invalid phone number for STK');
  if (!DARAJA_SHORTCODE || !DARAJA_PASSKEY) {
    console.warn('[STK] Daraja shortcode/passkey missing; skipping real STK');
    return {
      checkout_request_id: `MOCK-${Date.now()}`,
      status: 'QUEUED',
    };
  }

  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
  const token = await getDarajaAccessToken();

  const payload = {
    BusinessShortCode: DARAJA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Number(amount || 0),
    PartyA: msisdn,
    PartyB: DARAJA_SHORTCODE,
    PhoneNumber: msisdn,
    CallBackURL: DARAJA_CALLBACK_URL || 'https://example.com/mpesa-callback',
    AccountReference: accountReference || internalRef || 'TEKETEKE',
    TransactionDesc: transactionDesc || 'TekeTeke Fare',
  };

  const res = await fetch(`${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.errorMessage || data.error || 'Daraja STK push failed');
  }

  return {
    checkout_request_id: data.CheckoutRequestID || null,
    merchant_request_id: data.MerchantRequestID || null,
    status: 'QUEUED',
  };
}

// Get wallet linked to a phone (owner wallet)
async function getWalletByPhone(phoneNumber) {
  const msisdn = normalizeMsisdn(phoneNumber);
  if (!msisdn) return null;
  await pinTableReady;
  const vac = buildVirtualAccountFromPhone(msisdn);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wRes = await client.query(
      `select id, balance from wallets where virtual_account_code = $1 for update`,
      [vac]
    );
    let wallet = wRes.rows[0] || null;

    if (!wallet) {
      const insertRes = await client.query(
        `
          insert into wallets (entity_type, entity_id, virtual_account_code, balance)
          values ('MSISDN', null, $1, 0)
          on conflict (virtual_account_code) do update set virtual_account_code = excluded.virtual_account_code
          returning id, balance
        `,
        [vac]
      );
      wallet = insertRes.rows[0];
    }

    const pinRes = await client.query(`select 1 from wallet_pins where wallet_id = $1 limit 1`, [wallet.id]);
    await client.query('COMMIT');

    return {
      id: wallet.id,
      balance: Number(wallet.balance || 0),
      has_pin: !!pinRes.rows.length,
      msisdn,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('getWalletByPhone error:', err.message);
    return null;
  } finally {
    client.release();
  }
}

// Check if wallet has a PIN
async function walletHasPin(walletId) {
  await pinTableReady;
  const { rows } = await pool.query(`select 1 from wallet_pins where wallet_id = $1 limit 1`, [walletId]);
  return !!rows.length;
}

// Set wallet PIN (hash it in real implementation)
async function setWalletPin(walletId, pin) {
  await pinTableReady;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await hashPin(pin, salt);
  await pool.query(
    `
      insert into wallet_pins (wallet_id, pin_hash, pin_salt, updated_at)
      values ($1, $2, $3, now())
      on conflict (wallet_id) do update
      set pin_hash = excluded.pin_hash,
          pin_salt = excluded.pin_salt,
          updated_at = now()
    `,
    [walletId, hash.toString('hex'), salt]
  );
}

// Verify wallet PIN
async function verifyWalletPin(walletId, pin) {
  await pinTableReady;
  const { rows } = await pool.query(
    `select pin_hash, pin_salt from wallet_pins where wallet_id = $1 limit 1`,
    [walletId]
  );
  if (!rows.length) return false;
  const { pin_hash: pinHash, pin_salt: pinSalt } = rows[0];
  const hashed = await hashPin(pin, pinSalt);
  const stored = Buffer.from(pinHash, 'hex');
  if (stored.length !== hashed.length) return false;
  return crypto.timingSafeEqual(stored, hashed);
}

// Fetch wallet balance
async function getWalletBalance(walletId) {
  const { rows } = await pool.query(`select balance from wallets where id = $1 limit 1`, [walletId]);
  return rows.length ? Number(rows[0].balance || 0) : 0;
}

// Fetch last 3 txns
async function getRecentWalletTxns(walletId, limit = 3) {
  const { rows } = await pool.query(
    `
      select tx_type, amount, coalesce(description, source) as label
      from wallet_transactions
      where wallet_id = $1
      order by created_at desc
      limit $2
    `,
    [walletId, limit]
  );
  return rows.map((row) => ({
    type: String(row.tx_type || '').toUpperCase(),
    amount: Number(row.amount || 0),
    label: row.label || '',
  }));
}

// Create withdrawal request
async function createWithdrawal({ walletId, msisdn, amount, method }) {
  if (!walletId) throw new Error('walletId required');
  const phone = normalizeMsisdn(msisdn);
  if (!phone) throw new Error('msisdn required');

  const vacRes = await pool.query(
    `select virtual_account_code from wallets where id = $1 limit 1`,
    [walletId]
  );
  if (!vacRes.rows.length) throw new Error('Wallet not found');
  const virtualAccountCode = vacRes.rows[0].virtual_account_code;

  // Debit + create withdrawal record
  const withdrawalData = await createMobileWithdrawal({
    virtualAccountCode,
    amount,
    phoneNumber: phone,
    payoutMode: 'INSTANT',
  });

  // Kick B2C payout (non-blocking for the user flow)
  try {
    await sendB2CPayment({
      withdrawalId: withdrawalData.withdrawalId,
      amount: withdrawalData.netPayout,
      phoneNumber: phone,
    });
  } catch (err) {
    console.error('B2C payout error:', err.message);
  }

  return {
    id: withdrawalData.withdrawalId,
    short_ref: Math.floor(1000 + Math.random() * 9000),
    status: withdrawalData.withdrawalStatus || 'PENDING',
  };
}

// Find a vehicle + wallet using a USSD-assigned code like "00011"
async function findVehicleByUssdCode(ussdCode) {
  // TODO: replace with real DB query:
  // e.g. select * from vehicles where ussd_code = $1;
  // Return null if not found
  return {
    id: 'veh_00011',
    plate: 'KCF 123A',
    sacco_id: 'sacco_001',
    wallet_id: 'wallet_veh_00011',
    ussd_code: ussdCode,
  };
}

// Create a pending fare transaction (intent) before STK
async function createFareIntent({ sessionId, msisdn, walletId, vehicleId, amount }) {
  // TODO: insert into your db and return the record
  // For demo:
  return {
    id: 'tx_' + Date.now(),
    short_ref: Math.floor(Math.random() * 9999),
  };
}

// Trigger STK Push via your Safaricom Daraja integration
async function triggerStkPush({ phoneNumber, amount, accountReference, transactionDesc, internalRef }) {
  // TODO: call Safaricom API here
  console.log('[STK] Trigger STK for', {
    phoneNumber,
    amount,
    accountReference,
    transactionDesc,
    internalRef,
  });
}

// Get wallet linked to a phone (owner wallet)
async function getWalletByPhone(phoneNumber) {
  // TODO: query DB
  // Must return: { id, balance, has_pin, pin_hash, owner_name, ... } OR null
  return {
    id: 'wallet_owner_' + phoneNumber,
    balance: 9800,
    has_pin: false, // change after you implement pin
  };
}

// Check if wallet has a PIN
async function walletHasPin(walletId) {
  // TODO: check DB for PIN existence
  return false;
}

// Set wallet PIN (hash it in real implementation)
async function setWalletPin(walletId, pin) {
  // TODO: update DB with hashed pin
  console.log('[PIN] Set PIN for wallet', walletId, 'PIN:', pin);
}

// Verify wallet PIN
async function verifyWalletPin(walletId, pin) {
  // TODO: compare against hashed pin in DB
  // For now, always accept "1234" as demo
  return pin === '1234';
}

// Fetch wallet balance
async function getWalletBalance(walletId) {
  // TODO: fetch real balance
  return 9800;
}

// Fetch last 3 txns
async function getRecentWalletTxns(walletId, limit = 3) {
  // TODO: query DB for history
  return [
    { type: 'CREDIT', amount: 12400, label: 'Fare - MAT021' },
    { type: 'DEBIT', amount: 5000, label: 'Withdrawal M-PESA' },
    { type: 'CREDIT', amount: 8900, label: 'Fare - TX015' },
  ].slice(0, limit);
}

// Create withdrawal request
async function createWithdrawal({ walletId, msisdn, amount, method }) {
  // method: "MPESA" | "BANK"
  // TODO: insert in DB so your payout engine can pick it
  return {
    id: 'wd_' + Date.now(),
    short_ref: Math.floor(Math.random() * 9999),
  };
}

// ----------------------
// Main /ussd handler
// ----------------------
router.post('/', async (req, res) => {
  try {
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    // Normalize values
    const msisdn = normalizeMsisdn(phoneNumber); // e.g. "2547XXXXXXX"
    if (!msisdn) {
      return res.send('END Invalid phone number. Please try again.');
    }
    const rawText = (text || '').trim(); // e.g. "", "1", "1*00011*50"
    const parts = rawText.length ? rawText.split('*') : [];

    // Detect if this is a QUICK-PAY entry like *123*00011#
    const vehicleCodeFromService = extractEmbeddedVehicleCode(serviceCode || '');
    const isQuickPay = !!vehicleCodeFromService;

    if (isQuickPay) {
      // -----------------------------------------
      // QUICK-PAY FLOW: *123*00011#
      // 1) text == ""        -> ask for amount
      // 2) text == "<amount>" -> trigger STK, END
      // -----------------------------------------
      const matatuCode = vehicleCodeFromService;

      // Lookup vehicle/wallet
      const vehicle = await findVehicleByUssdCode(matatuCode);
      if (!vehicle) {
        return res.send('END Matatu not found. Tell crew to contact Sky Yalla support.');
      }

      if (!vehicle.wallet_id) {
        return res.send('END Matatu wallet not ready. Please try again later.');
      }

      if (parts.length === 0) {
        // First hit - ask for amount
        const msg =
          `CON Pay matatu ${matatuCode}\n\n` +
          `Enter fare amount (KES):`;
        return res.send(msg);
      }

      // User entered amount
      const amountStr = parts[0];
      const amount = Number(amountStr);
      if (Number.isNaN(amount) || amount <= 0) {
        const msg =
          `CON Invalid amount.\n` +
          `Enter fare amount (KES):`;
        return res.send(msg);
      }

      // Optional bounds - adjust as you like
      if (amount < 10 || amount > 1000) {
        const msg =
          `CON Amount must be between 10 and 1000.\n` +
          `Enter fare amount (KES):`;
        return res.send(msg);
      }

      // Create pending fare intent
      const tx = await createFareIntent({
        sessionId,
        msisdn,
        walletId: vehicle.wallet_id,
        vehicleId: vehicle.id,
        amount,
      });

      // Trigger STK
      await triggerStkPush({
        phoneNumber: msisdn,
        amount,
        accountReference: vehicle.plate || matatuCode,
        transactionDesc: `Fare ${vehicle.plate || matatuCode}`,
        internalRef: tx.id,
      });

      const refCode = 'TT' + String(tx.short_ref || '').padStart(4, '0');
      const endMsg =
        `END You will receive an M-PESA prompt.\n` +
        `Enter your PIN to complete payment.\nRef: ${refCode}`;
      return res.send(endMsg);
    }

    // -----------------------------------------
    // MAIN MENU FLOW: *123#
    // parts = [] initial, or ["1"], ["1","00011"], ...
    // -----------------------------------------
    if (parts.length === 0) {
      // No input yet -> show main menu
      const mainMenu =
        `CON TekeTeke\n\n` +
        `1. Pay Fare\n` +
        `2. My Wallet\n` +
        `3. Help\n\n` +
        `Reply:`;
      return res.send(mainMenu);
    }

    const first = parts[0];

    // =========================
    // 1) PAY FARE FROM *123#
    // =========================
    if (first === '1') {
      // Flow:
      // "1"                -> ask vehicle code
      // "1*00011"          -> ask amount
      // "1*00011*50"       -> STK + END

      if (parts.length === 1) {
        // Ask for vehicle code
        const msg =
          `CON Enter vehicle code:\n` +
          `(e.g. 00011, MAT021)\n\n` +
          `Reply:`;
        return res.send(msg);
      }

      if (parts.length === 2) {
        // We have vehicle code, ask for amount
        const vehicleCodeInput = parts[1].trim().toUpperCase();

        const vehicle = await findVehicleByUssdCode(vehicleCodeInput);
        if (!vehicle) {
          const msg =
            `CON Matatu not found.\n` +
            `Enter vehicle code again:\n` +
            `Reply:`;
          return res.send(msg);
        }
        if (!vehicle.wallet_id) {
          return res.send('END Matatu wallet not ready. Please try again later.');
        }

        const msg =
          `CON Paying matatu ${vehicle.ussd_code || vehicleCodeInput}\n\n` +
          `Enter fare amount (KES):`;
        return res.send(msg);
      }

      if (parts.length >= 3) {
        const vehicleCodeInput = parts[1].trim().toUpperCase();
        const amountStr = parts[2].trim();

        const vehicle = await findVehicleByUssdCode(vehicleCodeInput);
        if (!vehicle) {
          return res.send('END Matatu not found. Tell crew to contact support.');
        }
        if (!vehicle.wallet_id) {
          return res.send('END Matatu wallet not ready. Please try again later.');
        }

        const amount = Number(amountStr);
        if (Number.isNaN(amount) || amount <= 0) {
          const msg =
            `CON Invalid amount.\n` +
            `Enter fare amount (KES):`;
          return res.send(msg);
        }

        if (amount < 10 || amount > 1000) {
          const msg =
            `CON Amount must be between 10 and 1000.\n` +
            `Enter fare amount (KES):`;
          return res.send(msg);
        }

        const tx = await createFareIntent({
          sessionId,
          msisdn,
          walletId: vehicle.wallet_id,
          vehicleId: vehicle.id,
          amount,
        });

        await triggerStkPush({
          phoneNumber: msisdn,
          amount,
          accountReference: vehicle.plate || vehicleCodeInput,
          transactionDesc: `Fare ${vehicle.plate || vehicleCodeInput}`,
          internalRef: tx.id,
        });

        const refCode = 'TT' + String(tx.short_ref || '').padStart(4, '0');
        const endMsg =
          `END You will receive an M-PESA prompt.\n` +
          `Enter your PIN to complete payment.\nRef: ${refCode}`;
        return res.send(endMsg);
      }
    }

    // =========================
    // 2) MY WALLET (PIN PROTECTED)
    // =========================
    if (first === '2') {
      // Wallet flow states (parts array):
      // User without PIN:
      //  ["2"]                   -> ask to set PIN
      //  ["2","1234"]            -> ask confirm
      //  ["2","1234","1234"]     -> save PIN, END
      //
      // User with PIN:
      //  ["2"]                   -> ask for PIN
      //  ["2","1234"]            -> if ok, show wallet menu
      //  ["2","1234","1"]        -> withdraw to M-PESA: ask amount
      //  ["2","1234","1","500"]  -> create withdrawal, END
      //  ["2","1234","2"]        -> show last transactions, END

      // 1) Get wallet linked to this phone
      const walletOwner = await getWalletByPhone(msisdn);
      if (!walletOwner) {
        return res.send('END No wallet linked to this number yet. Contact Sky Yalla support.');
      }

      const walletId = walletOwner.id;
      const hasPin = await walletHasPin(walletId);

      // -------- User has NO PIN: set up PIN first --------
      if (!hasPin) {
        if (parts.length === 1) {
          const msg =
            `CON Set a 4-digit wallet PIN:\n` +
            `Reply:`;
          return res.send(msg);
        }

        if (parts.length === 2) {
          const pin1 = parts[1].trim();
          if (!/^[0-9]{4}$/.test(pin1)) {
            const msg =
              `CON Invalid PIN.\n` +
              `Enter a 4-digit PIN:\n` +
              `Reply:`;
            return res.send(msg);
          }
          const msg =
            `CON Confirm your PIN:\n` +
            `Re-enter the same 4-digit PIN:\n` +
            `Reply:`;
          return res.send(msg);
        }

        if (parts.length >= 3) {
          const pin1 = parts[1].trim();
          const pin2 = parts[2].trim();
          if (pin1 !== pin2 || !/^[0-9]{4}$/.test(pin1)) {
            return res.send('END PINs did not match. Dial *123# and try again.');
          }

          await setWalletPin(walletId, pin1);
          return res.send('END PIN set successfully. Dial *123# again and choose "My Wallet".');
        }
      }

      // -------- User already HAS PIN --------
      if (parts.length === 1) {
        const msg =
          `CON Enter your 4-digit wallet PIN:\n` +
          `Reply:`;
        return res.send(msg);
      }

      const pin = parts[1].trim();
      const isPinValid = await verifyWalletPin(walletId, pin);
      if (!isPinValid) {
        return res.send('END Incorrect PIN. Dial *123# and try again.');
      }

      // PIN is valid
      if (parts.length === 2) {
        // Show wallet menu
        const balance = await getWalletBalance(walletId);
        const msg =
          `CON My Wallet\n` +
          `Balance: KES ${balance}\n\n` +
          `1. Withdraw to M-PESA\n` +
          `2. Last 3 transactions\n` +
          `0. Back\n\n` +
          `Reply:`;
        return res.send(msg);
      }

      const walletChoice = parts[2];

      // ---- Option 1: Withdraw to M-PESA ----
      if (walletChoice === '1') {
        if (parts.length === 3) {
          const balance = await getWalletBalance(walletId);
          const msg =
            `CON Withdraw to M-PESA\n` +
            `Balance: KES ${balance}\n\n` +
            `Enter amount to withdraw (KES):`;
          return res.send(msg);
        }

        if (parts.length >= 4) {
          const amountStr = parts[3].trim();
          const amount = Number(amountStr);
          if (Number.isNaN(amount) || amount <= 0) {
            const msg =
              `CON Invalid amount.\n` +
              `Enter amount to withdraw (KES):`;
            return res.send(msg);
          }

          // Optional: check against balance here
          const balance = await getWalletBalance(walletId);
          if (amount > balance) {
            const msg =
              `CON Amount exceeds balance (KES ${balance}).\n` +
              `Enter amount to withdraw (KES):`;
            return res.send(msg);
          }

          const wd = await createWithdrawal({
            walletId,
            msisdn,
            amount,
            method: 'MPESA',
          });

          const ref = 'WD' + String(wd.short_ref || '').padStart(4, '0');
          const endMsg =
            `END Withdrawal requested.\n` +
            `You will receive an M-PESA SMS shortly.\nRef: ${ref}`;
          return res.send(endMsg);
        }
      }

      // ---- Option 2: Last 3 transactions ----
      if (walletChoice === '2') {
        const txns = await getRecentWalletTxns(walletId, 3);
        let body = 'Recent:\n';
        txns.forEach((t, idx) => {
          const sign = t.type === 'CREDIT' -> '+' : '-';
          body += `${idx + 1}. ${sign}${t.amount} ${t.label}\n`;
        });
        const msg = `END ${body.trim()}`;
        return res.send(msg);
      }

      // ---- Option 0: Back / Exit ----
      if (walletChoice === '0') {
        return res.send('END Goodbye.');
      }

      // Unknown wallet menu choice
      return res.send('END Invalid option.');
    }

    // =========================
    // 3) HELP
    // =========================
    if (first === '3') {
      const msg =
        `END Help & Support\n\n` +
        `Call/WhatsApp:\n` +
        `0758222666\n` +
        `Email: info@skyyalla.com`;
      return res.send(msg);
    }

    // Fallback: invalid root option
    return res.send('END Invalid option. Dial *123# again.');
  } catch (err) {
    console.error('USSD handler error:', err);
    return res.send('END Service temporarily unavailable. Please try again.');
  }
});

module.exports = router;
