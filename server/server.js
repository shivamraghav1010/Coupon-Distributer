const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5175',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://shivamraghav32816:MuohA62xRm9G2iX9@cluster0.g1mwz.mongodb.net/donenext?retryWrites=true&w=majority';
mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Coupon Schema
const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  used: { type: Boolean, default: false },
  claimedByIp: String,
  claimedAt: Date,
});
const Coupon = mongoose.model('Coupon', CouponSchema);

// Claim Schema
const ClaimSchema = new mongoose.Schema({
  ip: { type: String, required: true },
  lastClaim: { type: Date, required: true },
});
const Claim = mongoose.model('Claim', ClaimSchema);

// Initialize coupons
async function initializeCoupons() {
  try {
    const count = await Coupon.countDocuments();
    if (count === 0) {
      const initialCoupons = ['DISC10', 'SAVE20', 'FREE15', 'OFFER25', 'DEAL30'];
      await Coupon.insertMany(initialCoupons.map(code => ({ code })));
      console.log('Initial coupons inserted');
    }
  } catch (error) {
    console.error('Error initializing coupons:', error);
  }
}
initializeCoupons();

// Function to reset all coupons
async function resetAllCoupons() {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await Coupon.updateMany({}, { $set: { used: false, claimedByIp: null, claimedAt: null } }, { session });
    await session.commitTransaction();
    console.log('All coupons have been reset');
  } catch (error) {
    await session.abortTransaction();
    console.error('Error resetting all coupons:', error);
  } finally {
    session.endSession();
  }
}

// Rate limiter (60 seconds per IP)
const claimLimiter = rateLimit({
  windowMs: 60 * 1000, // 60 seconds
  max: 1, // 1 claim per window
  keyGenerator: req => req.ip,
  handler: (req, res) => {
    const timeLeft = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({
      success: false,
      message: `Please wait ${timeLeft} second${timeLeft > 1 ? 's' : ''} before claiming again`,
    });
  },
});

// Claim endpoint
app.get('/api/claim-coupon', claimLimiter, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const clientIp = req.ip;
    const cookieId = req.cookies['coupon_session'] || Date.now().toString();

    // Find and claim an unused coupon atomically
    let coupon = await Coupon.findOneAndUpdate(
      { used: false },
      { $set: { used: true, claimedByIp: clientIp, claimedAt: new Date() } },
      { session, new: true, sort: { _id: 1 } }
    );

    if (!coupon) {
      // Check if all coupons are used
      const unusedCount = await Coupon.countDocuments({ used: false }, { session });
      if (unusedCount === 0) {
        await resetAllCoupons(); // Reset only if all coupons are claimed
        coupon = await Coupon.findOneAndUpdate(
          { used: false },
          { $set: { used: true, claimedByIp: clientIp, claimedAt: new Date() } },
          { session, new: true, sort: { _id: 1 } }
        );
        if (!coupon) {
          return res.status(404).json({ success: false, message: 'No coupons available after reset' });
        }
      } else {
        return res.status(404).json({ success: false, message: 'No coupons available at this time' });
      }
    }

    // Update the user's last claim time
    await Claim.findOneAndUpdate(
      { ip: clientIp },
      { lastClaim: new Date() },
      { upsert: true, session }
    );

    // Set cookies
    res.cookie('coupon_session', cookieId, { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
    res.cookie('last_claim', Date.now(), { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });

    await session.commitTransaction();
    res.json({
      success: true,
      coupon: coupon.code,
      message: `Coupon ${coupon.code} claimed successfully!`,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Claim error:', error);
    res.status(500).json({ success: false, message: 'Server error occurred' });
  } finally {
    session.endSession();
  }
});

// Add coupon endpoint
app.post('/api/add-coupon', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid coupon code required' });
    }

    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    const newCoupon = new Coupon({ code });
    await newCoupon.save();

    res.status(201).json({
      success: true,
      message: `Coupon ${code} added successfully`,
      coupon: newCoupon,
    });
  } catch (error) {
    console.error('Add coupon error:', error);
    res.status(500).json({ success: false, message: 'Error adding coupon' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Backend running successfully' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;