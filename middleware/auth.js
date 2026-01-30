const jwt = require('jsonwebtoken');
const database = require('../database');

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                status: false,
                message: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if user exists and is active
        const user = await database.findUserById(decoded.userId);
        if (!user || !user.is_active) {
            return res.status(401).json({
                status: false,
                message: 'Invalid or inactive user'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({
            status: false,
            message: 'Invalid or expired token'
        });
    }
};

// API Key authentication middleware
const authenticateApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.query.api_key;

        if (!apiKey) {
            return res.status(401).json({
                status: false,
                message: 'API key required',
                code: 'API_KEY_MISSING'
            });
        }

        const keyData = await database.findApiKey(apiKey);
        
        if (!keyData) {
            return res.status(401).json({
                status: false,
                message: 'Invalid API key',
                code: 'INVALID_API_KEY'
            });
        }

        // Check if API key is expired
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return res.status(401).json({
                status: false,
                message: 'API key has expired',
                code: 'API_KEY_EXPIRED'
            });
        }

        // Check and update usage
        const usage = await database.checkAndUpdateApiKeyUsage(keyData.id);
        
        if (!usage.allowed) {
            return res.status(429).json({
                status: false,
                message: 'Daily API limit exceeded',
                code: 'RATE_LIMIT_EXCEEDED',
                data: {
                    limit: usage.limit,
                    remaining: usage.remaining
                }
            });
        }

        // Get user information
        const user = await database.findUserById(keyData.user_id);
        if (!user || !user.is_active) {
            return res.status(401).json({
                status: false,
                message: 'User account is inactive'
            });
        }

        req.apiKey = keyData;
        req.user = user;
        req.usage = usage;
        next();
    } catch (error) {
        console.error('API Key authentication error:', error);
        return res.status(500).json({
            status: false,
            message: 'Authentication failed'
        });
    }
};

// Optional API key authentication (allows requests without API key)
const optionalApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.query.api_key;

        if (apiKey) {
            const keyData = await database.findApiKey(apiKey);
            
            if (keyData) {
                const usage = await database.checkAndUpdateApiKeyUsage(keyData.id);
                
                req.apiKey = keyData;
                req.usage = usage;
                
                if (!usage.allowed) {
                    return res.status(429).json({
                        status: false,
                        message: 'Daily API limit exceeded',
                        code: 'RATE_LIMIT_EXCEEDED'
                    });
                }

                const user = await database.findUserById(keyData.user_id);
                if (user) {
                    req.user = user;
                }
            }
        }

        next();
    } catch (error) {
        console.error('Optional API key authentication error:', error);
        next(); // Continue even if authentication fails
    }
};

// Admin middleware
const isAdmin = (req, res, next) => {
    if (req.user && req.user.plan === 'admin') {
        next();
    } else {
        res.status(403).json({
            status: false,
            message: 'Admin access required'
        });
    }
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            status: false,
            message: err.message
        });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            status: false,
            message: 'Invalid token'
        });
    }

    res.status(500).json({
        status: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};

module.exports = {
    authenticateToken,
    authenticateApiKey,
    optionalApiKey,
    isAdmin,
    errorHandler
};
