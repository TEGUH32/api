const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

class Database {
    constructor() {
        const connectionString = process.env.DATABASE_URL || process.env.NEON_URL;
        
        if (!connectionString) {
            console.error('DATABASE_URL environment variable is not set');
            // Fallback untuk development
            this.pool = null;
            return;
        }

        try {
            this.pool = new Pool({
                connectionString: connectionString,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });

            this.pool.on('connect', () => {
                console.log('Connected to PostgreSQL database');
            });

            this.pool.on('error', (err) => {
                console.error('Unexpected error on idle client', err);
            });

            // Initialize database
            this.initializeTables();
        } catch (error) {
            console.error('Error initializing database pool:', error);
            this.pool = null;
        }
    }

    async initializeTables() {
        if (!this.pool) {
            console.log('Skipping table initialization - no database connection');
            return;
        }

        try {
            // Enable UUID extension
            await this.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
            
            // Users table
            await this.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    full_name VARCHAR(255),
                    plan VARCHAR(50) DEFAULT 'free',
                    is_verified INTEGER DEFAULT 1,
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // API Keys table
            await this.query(`
                CREATE TABLE IF NOT EXISTS api_keys (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL,
                    key_value VARCHAR(255) UNIQUE NOT NULL,
                    name VARCHAR(255) DEFAULT 'Default API Key',
                    is_active INTEGER DEFAULT 1,
                    daily_limit INTEGER DEFAULT 100,
                    requests_today INTEGER DEFAULT 0,
                    last_reset_date DATE DEFAULT CURRENT_DATE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP WITH TIME ZONE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);

            // Sessions table
            await this.query(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id VARCHAR(255) PRIMARY KEY,
                    user_id UUID NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);

            // Reset tokens table
            await this.query(`
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL,
                    token VARCHAR(255) UNIQUE NOT NULL,
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    is_used INTEGER DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);

            // Usage logs table
            await this.query(`
                CREATE TABLE IF NOT EXISTS usage_logs (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL,
                    api_key_id UUID NOT NULL,
                    endpoint VARCHAR(255) NOT NULL,
                    status_code INTEGER,
                    response_time INTEGER,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
                )
            `);

            // Create indexes for better performance
            await this.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
            await this.query('CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)');
            await this.query('CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)');
            await this.query('CREATE INDEX IF NOT EXISTS idx_api_keys_value ON api_keys(key_value)');
            await this.query('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
            await this.query('CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)');
            await this.query('CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token)');
            await this.query('CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at)');
            await this.query('CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date ON usage_logs(user_id, created_at)');

            console.log('Database tables initialized successfully');
        } catch (error) {
            console.error('Error initializing database tables:', error);
        }
    }

    async query(text, params) {
        if (!this.pool) {
            throw new Error('Database connection not available');
        }

        const client = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } catch (error) {
            console.error('Database query error:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    // ============= USER METHODS =============
    async createUser(userData) {
        try {
            const { id, email, password, full_name, plan } = userData;
            const result = await this.query(
                `INSERT INTO users (id, email, password, full_name, plan) 
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING *`,
                [id, email.toLowerCase().trim(), password, full_name, plan || 'free']
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async findUserByEmail(email) {
        try {
            const result = await this.query(
                `SELECT * FROM users WHERE email = $1`,
                [email.toLowerCase().trim()]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error finding user by email:', error);
            throw error;
        }
    }

    async findUserById(id) {
        try {
            const result = await this.query(
                `SELECT * FROM users WHERE id = $1`,
                [id]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error finding user by id:', error);
            throw error;
        }
    }

    async updateUser(userId, updateData) {
        try {
            const fields = [];
            const values = [];
            let paramCount = 1;

            for (const [key, value] of Object.entries(updateData)) {
                fields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }

            // Always update updated_at
            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(userId);

            const query = `
                UPDATE users 
                SET ${fields.join(', ')} 
                WHERE id = $${paramCount} 
                RETURNING id, email, full_name, plan, is_verified, created_at
            `;

            const result = await this.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    async deleteUser(userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Delete related records first
            await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM usage_logs WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM api_keys WHERE user_id = $1', [userId]);
            
            // Finally delete the user
            const result = await client.query(
                'DELETE FROM users WHERE id = $1 RETURNING id',
                [userId]
            );

            await client.query('COMMIT');
            return result.rowCount > 0;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting user:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // ============= API KEY METHODS =============
    async createApiKey(apiKeyData) {
        try {
            const { id, user_id, key_value, name, daily_limit, expires_at } = apiKeyData;
            const result = await this.query(
                `INSERT INTO api_keys (id, user_id, key_value, name, daily_limit, expires_at) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 RETURNING *`,
                [id, user_id, key_value, name, daily_limit, expires_at]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error creating API key:', error);
            throw error;
        }
    }

    async getUserApiKeys(userId) {
        try {
            const result = await this.query(
                `SELECT * FROM api_keys 
                 WHERE user_id = $1 
                 ORDER BY created_at DESC`,
                [userId]
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting user API keys:', error);
            throw error;
        }
    }

    async findApiKeyByValue(keyValue) {
        try {
            const result = await this.query(
                `SELECT ak.*, u.plan, u.is_active as user_active
                 FROM api_keys ak
                 JOIN users u ON ak.user_id = u.id
                 WHERE ak.key_value = $1 AND ak.is_active = 1 AND u.is_active = 1`,
                [keyValue]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error finding API key by value:', error);
            throw error;
        }
    }

    async updateApiKeyUsage(apiKeyId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Reset counter if it's a new day
            await client.query(
                `UPDATE api_keys 
                 SET requests_today = CASE 
                     WHEN last_reset_date < CURRENT_DATE THEN 1 
                     ELSE requests_today + 1 
                 END,
                 last_reset_date = CASE 
                     WHEN last_reset_date < CURRENT_DATE THEN CURRENT_DATE 
                     ELSE last_reset_date 
                 END
                 WHERE id = $1`,
                [apiKeyId]
            );

            // Get updated usage
            const result = await client.query(
                `SELECT requests_today, daily_limit FROM api_keys WHERE id = $1`,
                [apiKeyId]
            );

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating API key usage:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteApiKey(apiKeyId, userId) {
        try {
            const result = await this.query(
                `DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id`,
                [apiKeyId, userId]
            );
            return result.rowCount > 0;
        } catch (error) {
            console.error('Error deleting API key:', error);
            throw error;
        }
    }

    // ============= SESSION METHODS =============
    async createSession(sessionData) {
        try {
            const { id, user_id, ip_address, user_agent } = sessionData;
            const result = await this.query(
                `INSERT INTO sessions (id, user_id, ip_address, user_agent) 
                 VALUES ($1, $2, $3, $4) 
                 RETURNING *`,
                [id, user_id, ip_address, user_agent]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error creating session:', error);
            throw error;
        }
    }

    async findSession(sessionId) {
        try {
            const result = await this.query(
                `SELECT * FROM sessions WHERE id = $1`,
                [sessionId]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error finding session:', error);
            throw error;
        }
    }

    async deleteSession(sessionId) {
        try {
            const result = await this.query(
                `DELETE FROM sessions WHERE id = $1 RETURNING id`,
                [sessionId]
            );
            return result.rowCount > 0;
        } catch (error) {
            console.error('Error deleting session:', error);
            throw error;
        }
    }

    async cleanupExpiredSessions() {
        try {
            // Delete sessions older than 7 days
            const result = await this.query(
                `DELETE FROM sessions WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`
            );
            return result.rowCount;
        } catch (error) {
            console.error('Error cleaning up expired sessions:', error);
            throw error;
        }
    }

    // ============= PASSWORD RESET METHODS =============
    async saveResetToken(userId, token, expiry) {
        try {
            await this.query(
                `INSERT INTO password_reset_tokens (user_id, token, expires_at) 
                 VALUES ($1, $2, $3)`,
                [userId, token, expiry]
            );
            return true;
        } catch (error) {
            console.error('Error saving reset token:', error);
            throw error;
        }
    }

    async verifyResetToken(token) {
        try {
            const result = await this.query(
                `SELECT * FROM password_reset_tokens 
                 WHERE token = $1 
                   AND expires_at > CURRENT_TIMESTAMP 
                   AND is_used = 0`,
                [token]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error verifying reset token:', error);
            throw error;
        }
    }

    async invalidateResetToken(token) {
        try {
            const result = await this.query(
                `UPDATE password_reset_tokens 
                 SET is_used = 1 
                 WHERE token = $1`,
                [token]
            );
            return result.rowCount > 0;
        } catch (error) {
            console.error('Error invalidating reset token:', error);
            throw error;
        }
    }

    // ============= USAGE STATS METHODS =============
    async logUsage(usageData) {
        try {
            const { user_id, api_key_id, endpoint, status_code, response_time, ip_address } = usageData;
            const result = await this.query(
                `INSERT INTO usage_logs (user_id, api_key_id, endpoint, status_code, response_time, ip_address) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 RETURNING id`,
                [user_id, api_key_id, endpoint, status_code, response_time, ip_address]
            );
            return result.rows[0].id;
        } catch (error) {
            console.error('Error logging usage:', error);
            throw error;
        }
    }

    async getUserUsageStats(userId, days = 1) {
        try {
            const result = await this.query(
                `SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as total_requests,
                    AVG(response_time) as avg_response_time
                 FROM usage_logs 
                 WHERE user_id = $1 
                   AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC`,
                [userId]
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting user usage stats:', error);
            throw error;
        }
    }

    async getApiKeyUsageStats(apiKeyId, days = 7) {
        try {
            const result = await this.query(
                `SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as total_requests,
                    AVG(response_time) as avg_response_time
                 FROM usage_logs 
                 WHERE api_key_id = $1 
                   AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC`,
                [apiKeyId]
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting API key usage stats:', error);
            throw error;
        }
    }

    // ============= HELPER METHODS =============
    async testConnection() {
        try {
            const result = await this.query('SELECT NOW() as current_time');
            console.log('Database connection test successful:', result.rows[0].current_time);
            return true;
        } catch (error) {
            console.error('Database connection test failed:', error);
            return false;
        }
    }

    async getDatabaseStats() {
        try {
            const stats = {};
            
            // Get table counts
            const tables = ['users', 'api_keys', 'sessions', 'usage_logs', 'password_reset_tokens'];
            
            for (const table of tables) {
                const result = await this.query(`SELECT COUNT(*) FROM ${table}`);
                stats[table] = parseInt(result.rows[0].count);
            }
            
            return stats;
        } catch (error) {
            console.error('Error getting database stats:', error);
            return null;
        }
    }

    async close() {
        if (this.pool) {
            try {
                await this.pool.end();
                console.log('Database connection pool closed');
            } catch (error) {
                console.error('Error closing database connection pool:', error);
            }
        }
    }
}

module.exports = new Database();
