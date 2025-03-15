const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser'); 
const crypto = require('crypto'); 
const { v4: uuidv4 } = require('uuid'); 
require("dotenv").config();

const app = express();
const port = process.env.PORT || 4000; 

// Middleware
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); 

// MongoDB Connection
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Coupon Model
const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    isClaimed: { type: Boolean, default: false },
    claimedAt: { type: Date, default: null } 
});
const Coupon = mongoose.model('Coupon', couponSchema);

// Cooldown Model
const cooldownSchema = new mongoose.Schema({
    identifier: { type: String, required: true, unique: true },
    lastClaimed: { type: Date, default: Date.now },
});
const Cooldown = mongoose.model('Cooldown', cooldownSchema);

const COUPON_CLAIM_COOLDOWN = 60; // Cooldown in seconds

// Middleware to set a unique cookie if it doesn't exist
app.use((req, res, next) => {
  if (!req.cookies.coupon_user_id) {
    const userId = uuidv4();
    res.cookie('coupon_user_id', userId, {
      maxAge: 365 * 24 * 60 * 60 * 1000, 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax'
    });
  }
  next();
});

// Function to check if any identifier is blocked
async function isBlocked(identifiers) {
    for (let identifier of identifiers) {
        const cooldown = await Cooldown.findOne({ identifier });
        if (cooldown) {
            const timeElapsed = (Date.now() - new Date(cooldown.lastClaimed).getTime()) / 1000;
            if (timeElapsed < COUPON_CLAIM_COOLDOWN) {
                return { blocked: true, remainingTime: COUPON_CLAIM_COOLDOWN - timeElapsed };
            }
        }
    }
    return { blocked: false, remainingTime: 0 };
}

// Function to update cooldowns
async function updateCooldown(identifiers) {
    const updates = identifiers.map(identifier => ({
        updateOne: { filter: { identifier }, update: { lastClaimed: Date.now() }, upsert: true }
    }));
    await Cooldown.bulkWrite(updates);
}

// API endpoint to claim a coupon
app.get('/api/coupon', async (req, res) => {
    const ipAddress = req.ip || req.connection.remoteAddress; 
    const cookieId = req.cookies.coupon_user_id;
    const userAgent = req.headers['user-agent'] || "unknown"; 

    const ipHash = crypto.createHash('sha256').update(ipAddress).digest('hex');
    const uniqueIdentifier = `${ipHash}-${cookieId}-${userAgent}`;

    console.log(`Request: IP=${ipAddress}, Cookie=${cookieId}, UserAgent=${userAgent}`);

    // Check if the user is in cooldown
    const cooldownCheck = await isBlocked([ipHash, cookieId, uniqueIdentifier]);
    if (cooldownCheck.blocked) {
        return res.status(429).json({ 
            message: 'Too many requests. Please wait.', 
            remainingTime: cooldownCheck.remainingTime 
        });
    }

    // Atomically find and update an unclaimed coupon
    const coupon = await Coupon.findOneAndUpdate(
        { isClaimed: false }, 
        { isClaimed: true, claimedAt: new Date() }, 
        { new: true }
    );

    if (!coupon) {
        return res.status(404).json({ message: 'No coupons available.' });
    }

    // Update cooldowns for all identifiers
    await updateCooldown([ipHash, cookieId, uniqueIdentifier]);

    res.json({ couponCode: coupon.code, message: 'Coupon claimed successfully!' });
});

// API to initialize coupons
app.post('/api/init-coupons', async (req, res) => {
    const coupons = req.body.coupons;
    if (!Array.isArray(coupons)) {
        return res.status(400).json({ message: 'Coupons must be an array.' });
    }
    try {
        await Coupon.insertMany(coupons.map(code => ({ code, isClaimed: false })));
        return res.status(201).json({ message: 'Coupons initialized successfully!' });
    } catch (error) {
        console.error('Error initializing coupons:', error);
        return res.status(500).json({ message: 'Error initializing coupons.' });
    }
});

// API to reset cooldowns (for testing purposes)
app.delete('/api/reset-cooldown', async (req, res) => {
    await Cooldown.deleteMany({});
    res.json({ message: "Cooldown reset successfully" });
});

// Background job to reset coupons every 30 seconds
setInterval(async () => {
    await Coupon.updateMany(
        { isClaimed: true, claimedAt: { $lt: new Date(Date.now() - COUPON_CLAIM_COOLDOWN * 1000) } },
        { isClaimed: false, claimedAt: null }
    );
    console.log('Expired coupons reset.');
}, 30000);

app.get('/', (req, res) => {
    res.send({ activeStatus: true, error: false, message: "Server is running" });
});

// Start Server
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});
