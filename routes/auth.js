const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            plan: user.plan
        },
        process.env.JWT_SECRET || 'your-jwt-secret-key-change-this-in-production',
        { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );
};

// Generate session ID
const generateSessionId = () => {
    return 'sess_' + require('crypto').randomBytes(32).toString('hex');
};

// Register new user (NO EMAIL VERIFICATION)
router.post('/register', [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('full_name').optional().trim()
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email, password, full_name } = req.body;

        // Check if user already exists
        const existingUser = await database.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                status: false,
                message: 'Email already registered. Please login or use a different email.'
            });
        }

        // Create new user (auto-verified, no email verification)
        const user = await database.createUser(email, password, full_name || email.split('@')[0]);

        // Create default API key for new user
        const apiKey = await database.createApiKey(user.id, 'Default API Key', 365);

        // Generate JWT token
        const token = generateToken(user);

        // Create session
        const sessionId = generateSessionId();
        await database.createSession(
            sessionId,
            user.id,
            req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            req.get('user-agent') || 'Unknown'
        );

        res.status(201).json({
            status: true,
            message: 'Registration successful! Welcome to API Teguh.',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.fullName || user.full_name,
                    plan: user.plan || 'free',
                    is_verified: true,
                    created_at: user.created_at || new Date().toISOString()
                },
                token,
                session_id: sessionId,
                api_key: apiKey.key_value || apiKey.key,
                api_key_info: {
                    name: apiKey.name,
                    daily_limit: apiKey.daily_limit || 100,
                    expires_at: apiKey.expires_at
                }
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            status: false,
            message: 'Registration failed. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Login
router.post('/login', [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required')
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Find user
        const user = await database.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                status: false,
                message: 'Invalid email or password'
            });
        }

        // Check if user is active
        if (!user.is_active) {
            return res.status(401).json({
                status: false,
                message: 'Account is deactivated. Please contact support.'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = generateToken(user);

        // Create session
        const sessionId = generateSessionId();
        await database.createSession(
            sessionId,
            user.id,
            req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            req.get('user-agent') || 'Unknown'
        );

        // Get user's API keys
        const apiKeys = await database.getUserApiKeys(user.id);
        const primaryApiKey = apiKeys.find(key => key.is_active) || apiKeys[0];

        res.status(200).json({
            status: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    plan: user.plan,
                    is_verified: true,
                    is_active: user.is_active,
                    created_at: user.created_at
                },
                token,
                session_id: sessionId,
                api_key: primaryApiKey?.key_value || null,
                api_key_info: primaryApiKey ? {
                    id: primaryApiKey.id,
                    name: primaryApiKey.name,
                    daily_limit: primaryApiKey.daily_limit,
                    requests_today: primaryApiKey.requests_today,
                    expires_at: primaryApiKey.expires_at
                } : null
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            status: false,
            message: 'Login failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'] || req.body.session_id;
        
        if (sessionId) {
            await database.deleteSession(sessionId);
        }

        // Also cleanup expired sessions
        await database.cleanupExpiredSessions();

        res.status(200).json({
            status: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            status: false,
            message: 'Logout failed'
        });
    }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        
        // Get user's API keys
        const apiKeys = await database.getUserApiKeys(user.id);
        const primaryApiKey = apiKeys.find(key => key.is_active) || apiKeys[0];
        
        // Get user's usage stats for today
        const usageStats = await database.getUserUsageStats(user.id, 1);
        const todayUsage = usageStats[0] || { total_requests: 0 };

        res.status(200).json({
            status: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    plan: user.plan,
                    is_verified: user.is_verified,
                    is_active: user.is_active,
                    created_at: user.created_at
                },
                api_key: primaryApiKey ? {
                    key: primaryApiKey.key_value,
                    name: primaryApiKey.name,
                    daily_limit: primaryApiKey.daily_limit,
                    requests_today: primaryApiKey.requests_today,
                    expires_at: primaryApiKey.expires_at
                } : null,
                usage: {
                    today: {
                        total_requests: todayUsage.total_requests || 0,
                        limit: primaryApiKey?.daily_limit || 100
                    }
                }
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to get user info'
        });
    }
});

// Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const newToken = generateToken(req.user);

        res.status(200).json({
            status: true,
            data: {
                token: newToken
            }
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to refresh token'
        });
    }
});

// Update user profile
router.put('/profile', authenticateToken, [
    body('full_name').optional().trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('current_password').optional(),
    body('new_password').optional().isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { full_name, current_password, new_password } = req.body;
        const userId = req.user.id;

        let updateData = {};

        // Update full name
        if (full_name) {
            updateData.full_name = full_name;
        }

        // Update password if both current and new passwords are provided
        if (current_password && new_password) {
            // Get current user with password
            const user = await database.findUserById(userId);
            
            // Verify current password
            const isPasswordValid = await bcrypt.compare(current_password, user.password);
            if (!isPasswordValid) {
                return res.status(400).json({
                    status: false,
                    message: 'Current password is incorrect'
                });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(new_password, 10);
            updateData.password = hashedPassword;
        }

        // Update user in database
        if (Object.keys(updateData).length > 0) {
            const client = await database.pool.connect();
            try {
                await client.query('BEGIN');

                const updateFields = [];
                const updateValues = [];
                let paramIndex = 1;

                for (const [key, value] of Object.entries(updateData)) {
                    updateFields.push(`${key} = $${paramIndex}`);
                    updateValues.push(value);
                    paramIndex++;
                }

                // Add updated_at timestamp
                updateFields.push('updated_at = CURRENT_TIMESTAMP');
                updateValues.push(userId);

                const updateQuery = `
                    UPDATE users 
                    SET ${updateFields.join(', ')}
                    WHERE id = $${paramIndex}
                    RETURNING id, email, full_name, plan, is_verified, created_at
                `;

                const result = await client.query(updateQuery, updateValues);
                await client.query('COMMIT');

                if (result.rows.length === 0) {
                    throw new Error('User not found');
                }

                const updatedUser = result.rows[0];

                res.status(200).json({
                    status: true,
                    message: 'Profile updated successfully',
                    data: {
                        user: {
                            id: updatedUser.id,
                            email: updatedUser.email,
                            full_name: updatedUser.full_name,
                            plan: updatedUser.plan,
                            is_verified: updatedUser.is_verified
                        }
                    }
                });

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } else {
            // No updates provided
            res.status(400).json({
                status: false,
                message: 'No updates provided'
            });
        }

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to update profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Check email availability
router.get('/check-email', async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({
                status: false,
                message: 'Email parameter is required'
            });
        }

        const user = await database.findUserByEmail(email);
        
        res.status(200).json({
            status: true,
            data: {
                email,
                available: !user,
                exists: !!user
            }
        });
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to check email availability'
        });
    }
});

// Request password reset (optional - if you want to add this later)
router.post('/forgot-password', [
    body('email').isEmail().withMessage('Valid email required')
], async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await database.findUserByEmail(email);
        if (!user) {
            // Don't reveal if user exists for security
            return res.status(200).json({
                status: true,
                message: 'If an account exists with this email, you will receive password reset instructions.'
            });
        }

        // In a real implementation, you would:
        // 1. Generate reset token
        // 2. Send email with reset link
        // 3. Store token in database with expiry
        
        // For now, return success response
        res.status(200).json({
            status: true,
            message: 'If an account exists with this email, you will receive password reset instructions.'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to process password reset request'
        });
    }
});

// Reset password (optional)
router.post('/reset-password', [
    body('token').notEmpty().withMessage('Reset token required'),
    body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
    try {
        const { token, new_password } = req.body;
        
        // In a real implementation, you would:
        // 1. Verify reset token
        // 2. Check expiry
        // 3. Update password
        // 4. Invalidate used token
        
        res.status(200).json({
            status: true,
            message: 'Password has been reset successfully. Please login with your new password.'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to reset password'
        });
    }
});

// Delete account
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { confirm_text } = req.body;

        if (!confirm_text || confirm_text.toLowerCase() !== 'delete') {
            return res.status(400).json({
                status: false,
                message: 'Please type "DELETE" to confirm account deletion'
            });
        }

        const client = await database.pool.connect();
        try {
            await client.query('BEGIN');

            // Delete user's sessions
            await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

            // Delete user's API keys
            await client.query('DELETE FROM api_keys WHERE user_id = $1', [userId]);

            // Delete user's usage logs
            await client.query('DELETE FROM usage_logs WHERE user_id = $1', [userId]);

            // Delete user's transactions
            await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);

            // Finally, delete the user
            const result = await client.query(
                'DELETE FROM users WHERE id = $1 RETURNING email',
                [userId]
            );

            await client.query('COMMIT');

            if (result.rows.length === 0) {
                return res.status(404).json({
                    status: false,
                    message: 'User not found'
                });
            }

            res.status(200).json({
                status: true,
                message: 'Account deleted successfully'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to delete account'
        });
    }
});

module.exports = router;
