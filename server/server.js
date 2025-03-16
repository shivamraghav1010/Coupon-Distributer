// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
require('dotenv').config(); // Add this for environment variables

const app = express();
const port = process.env.PORT || 3000; // Use environment variable for port

// Middleware
app.use(cors({
  origin: 'https://coupon-distributer-frontend.vercel.app',
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://shivamraghav32816:MuohA62xRm9G2iX9@cluster0.g1mwz.mongodb.net/coupon-system', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Coupon Schema
const CouponSchema = new mongoose.Schema({
  code: String,
  used: { type: Boolean, default: false },
  claimedByIp: String,
  claimedAt: Date
});

const Coupon = mongoose.model('Coupon', CouponSchema);

// Claim Schema
const ClaimSchema = new mongoose.Schema({
  ip: String,
  lastClaim: Date
});

const Claim = mongoose.model('Claim', ClaimSchema);

// Initial coupons (run once)
async function initializeCoupons() {
  const count = await Coupon.countDocuments();
  if (count === 0) {
    const initialCoupons = ['DISC10', 'SAVE20', 'FREE15', 'OFFER25', 'DEAL30'];
    await Coupon.insertMany(initialCoupons.map(code => ({ code })));
    console.log('Initial coupons inserted');
  }
}
initializeCoupons();

// Rate limiter (1 hour cooldown)
const claimLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1,
  keyGenerator: (req) => req.ip,
  message: (req) => ({
    success: false,
    message: `Please wait ${Math.ceil((req.rateLimit.resetTime - Date.now()) / 60000)} minutes`
  })
});

// Claim endpoint
app.get('/api/claim-coupon', claimLimiter, async (req, res) => {
  try {
    const clientIp = req.ip;
    const cookieId = req.cookies['coupon_session'] || Date.now().toString();

    // Check cookie restriction (24 hours)
    if (req.cookies['last_claim']) {
      const lastClaim = parseInt(req.cookies['last_claim']);
      const hoursSince = (Date.now() - lastClaim) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        return res.json({
          success: false,
          message: `Please wait ${Math.ceil(24 - hoursSince)} hours`
        });
      }
    }

    // Find next available coupon
    const coupon = await Coupon.findOneAndUpdate(
      { used: false },
      { used: true, claimedByIp: clientIp, claimedAt: new Date() },
      { new: true, sort: { _id: 1 } }
    );

    if (!coupon) {
      return res.json({ success: false, message: 'No coupons available' });
    }

    // Record claim
    await Claim.findOneAndUpdate(
      { ip: clientIp },
      { lastClaim: new Date() },
      { upsert: true }
    );

    res.cookie('coupon_session', cookieId, { maxAge: 24 * 60 * 60 * 1000 });
    res.cookie('last_claim', Date.now(), { maxAge: 24 * 60 * 60 * 1000 });

    res.json({
      success: true,
      coupon: coupon.code,
      message: `Coupon ${coupon.code} claimed!`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// New endpoint to insert coupons
app.post('/api/add-coupon', async (req, res) => {
  try {
    const { code } = req.body;
    
    // Validate input
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required and must be a string'
      });
    }

    // Check if coupon already exists
    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    // Create new coupon
    const newCoupon = new Coupon({
      code,
      used: false
    });
    
    await newCoupon.save();
    
    res.status(201).json({
      success: true,
      message: `Coupon ${code} added successfully`,
      coupon: newCoupon
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding coupon',
      error: error.message
    });
  }
});

// For serverless deployment (e.g., Vercel), export the app
module.exports = app;

// For local development, start the server
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}