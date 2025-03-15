const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser'); 
const crypto = require('crypto'); // For hashing IP addresses
const { v4: uuidv4 } = require('uuid'); // For generating unique cookie IDs
require("dotenv").config();
const app = express();
const port = process.env.PORT || 4000; 


// Middleware
// app.use(cors({
//   origin: 'http://localhost:3001', 
//   credentials: true 
// }));

app.use(cors({
    origin: '*',  // Allows all origins (not recommended for production)
    credentials: false
}));

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); 



// MongoDB Connection
const mongoURI = process.env.MONGODB_URI ;
mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));




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



// User Model
const userSchema = new mongoose.Schema({
    ipAddress: { type: String, required: true },
    claimedCoupons: [
        {
            code: { type: String, required: true },
            claimedAt: { type: Date, required: true }
        }
    ]
});
const User = mongoose.model('User', userSchema);


const COUPON_CLAIM_COOLDOWN = 3600; // 1 minute in seconds



// Middleware to set a unique cookie if it doesn't exist
app.use((req, res, next) => {
  if (!req.cookies.coupon_user_id) {
    const userId = uuidv4();
    res.cookie('coupon_user_id', userId, {
      maxAge: 365 * 24 * 60 * 60 * 1000, 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' ? true : false, 
      sameSite: 'Lax' // Allow cookies in development
    });
  }
  next();
});



// Function to check if a user is blocked (based on cooldown)
async function isBlocked(identifier) {
    const cooldown = await Cooldown.findOne({ identifier });
    if (cooldown) {
        const timeElapsed = (Date.now() - new Date(cooldown.lastClaimed).getTime()) / 1000;
        console.log(`Cooldown check for ${identifier}: ${timeElapsed} seconds elapsed`);

        if (timeElapsed < COUPON_CLAIM_COOLDOWN) {
            return { blocked: true, remainingTime: COUPON_CLAIM_COOLDOWN - timeElapsed };
        }
    }
    return { blocked: false, remainingTime: 0 };
}



// Function to update or create a cooldown
async function updateCooldown(identifier) {
    await Cooldown.updateOne(
        { identifier },
        { lastClaimed: Date.now() },
        { upsert: true }
    );
}



// API endpoint to claim a coupon
app.get('/api/coupon', async (req, res) => {
  const ipAddress = req.ip || req.connection.remoteAddress; 
  const cookieId = req.cookies.coupon_user_id;
  const ipHash = crypto.createHash('sha256').update(ipAddress).digest('hex');

  console.log(`Request received: IP=${ipAddress}, CookieID=${cookieId}`);

  // Check cooldowns
  const ipCheck = await isBlocked(ipHash);
  const cookieCheck = await isBlocked(cookieId);

  if (ipCheck.blocked) {
    return res.status(429).json({ message: 'Too many requests from this IP. Please wait.', remainingTime: ipCheck.remainingTime });
  }
  if (cookieCheck.blocked) {
    return res.status(429).json({ message: 'Too many requests from this browser. Please wait.', remainingTime: cookieCheck.remainingTime });
  }




  // Find an available coupon that was either never claimed or was claimed more than 1 minute ago
  const coupon = await Coupon.findOneAndUpdate(
      {
          $or: [
              { isClaimed: false },
              { claimedAt: { $lt: new Date(Date.now() - COUPON_CLAIM_COOLDOWN * 1000) } } 
          ]
      },
      { isClaimed: true, claimedAt: new Date() },
      { new: true }
  );

  if (!coupon) {
      return res.status(404).json({ message: 'No coupons available.' });
  }

  // Update cooldowns
  await updateCooldown(ipHash);
  await updateCooldown(cookieId);

  // Log the coupon claim in the User collection
  await User.updateOne(
      { ipAddress: ipHash },
      { 
          $push: { 
              claimedCoupons: { 
                  code: coupon.code, 
                  claimedAt: new Date() 
              } 
          } 
      },
      { upsert: true }
  );

  res.json({ couponCode: coupon.code, message: 'Coupon claimed successfully!' });
});



// API to initialize coupons (run this only once)
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
}, 30000); // Runs every 30 seconds


app.get('/', (req, res) => {
    res.send(
        {
            activeStatus: true,
            error:false,
            message: "Server is running"
        }
    );
});



// Start Server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});


