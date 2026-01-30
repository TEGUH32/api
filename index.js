require('dotenv').config();

let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
let logger = require('morgan');
let cors = require('cors');

const rateLimit = require('express-rate-limit');

// Import routes
let indexRouter = require('./routes/index');
let apiRouter = require('./routes/api');
let authRouter = require('./routes/auth');
let apiKeysRouter = require('./routes/apikeys');
let paymentRouter = require('./routes/payment');
let userRouter = require('./routes/user');

// Import middleware
const { authenticateToken, authenticateApiKey, optionalApiKey, errorHandler } = require('./middleware/auth');

let PORT = process.env.PORT || 3000;

const app = express();

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

// Set up rate limiting: max 2000 requests per minute per IP
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 2000, // limit each IP to 2000 requests per windowMs
    message: 'Oops too many requests'
});
app.use(limiter);

app.set('json spaces', 2);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Main routes
app.use('/', indexRouter);

// Authentication routes (public)
app.use('/auth', authRouter);

// Payment routes (public for notifications)
app.use('/payment', paymentRouter);

// Protected routes (require authentication)
app.use('/api-keys', authenticateToken, apiKeysRouter);
app.use('/user', authenticateToken, userRouter);

// API routes with optional API key authentication
app.use('/api', apiRouter);

// 404 handler
app.get('*', function(req, res) {
    res.status(404).json({
        status: false,
        creator: global.creator,
        message: 'Page Not Found'
    });
});

// Error handling middleware
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${process.env.DB_PATH || './database.sqlite'}`);
});
