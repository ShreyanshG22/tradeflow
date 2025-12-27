/**
 * Redis Session Manager for TradeFlow
 * 
 * Handles user session storage, JWT token management, and session cleanup
 * using Redis for high-performance session management.
 */

const { redisManager, REDIS_DATABASES, CACHE_KEYS } = require('./redis-config');

class SessionManager {
    constructor() {
        this.redis = redisManager.getConnection(REDIS_DATABASES.SESSIONS);
        this.defaultTTL = 24 * 60 * 60; // 24 hours in seconds
        this.refreshTokenTTL = 7 * 24 * 60 * 60; // 7 days in seconds
    }

    /**
     * Create a new user session
     */
    async createSession(userId, sessionData = {}) {
        const sessionId = this.generateSessionId();
        const sessionKey = CACHE_KEYS.USER_SESSION(sessionId);
        
        const session = {
            userId,
            sessionId,
            createdAt: new Date().toISOString(),
            lastAccessedAt: new Date().toISOString(),
            ipAddress: sessionData.ipAddress,
            userAgent: sessionData.userAgent,
            deviceInfo: sessionData.deviceInfo,
            ...sessionData
        };
        
        await this.redis.setex(sessionKey, this.defaultTTL, JSON.stringify(session));
        
        // Also maintain a user -> sessions mapping for multi-device support
        await this.addUserSession(userId, sessionId);
        
        return sessionId;
    }

    /**
     * Get session data by session ID
     */
    async getSession(sessionId) {
        const sessionKey = CACHE_KEYS.USER_SESSION(sessionId);
        const sessionData = await this.redis.get(sessionKey);
        
        if (!sessionData) {
            return null;
        }
        
        const session = JSON.parse(sessionData);
        
        // Update last accessed time
        session.lastAccessedAt = new Date().toISOString();
        await this.redis.setex(sessionKey, this.defaultTTL, JSON.stringify(session));
        
        return session;
    }

    /**
     * Update session data
     */
    async updateSession(sessionId, updates) {
        const session = await this.getSession(sessionId);
        
        if (!session) {
            throw new Error('Session not found');
        }
        
        const updatedSession = {
            ...session,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        const sessionKey = CACHE_KEYS.USER_SESSION(sessionId);
        await this.redis.setex(sessionKey, this.defaultTTL, JSON.stringify(updatedSession));
        
        return updatedSession;
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionId) {
        const session = await this.getSession(sessionId);
        
        if (session) {
            // Remove from user sessions list
            await this.removeUserSession(session.userId, sessionId);
        }
        
        const sessionKey = CACHE_KEYS.USER_SESSION(sessionId);
        return await this.redis.del(sessionKey);
    }

    /**
     * Get all sessions for a user
     */
    async getUserSessions(userId) {
        const userSessionsKey = `user_sessions:${userId}`;
        const sessionIds = await this.redis.smembers(userSessionsKey);
        
        const sessions = [];
        for (const sessionId of sessionIds) {
            const session = await this.getSession(sessionId);
            if (session) {
                sessions.push(session);
            } else {
                // Clean up stale session ID
                await this.removeUserSession(userId, sessionId);
            }
        }
        
        return sessions;
    }

    /**
     * Delete all sessions for a user
     */
    async deleteUserSessions(userId) {
        const sessions = await this.getUserSessions(userId);
        
        for (const session of sessions) {
            await this.deleteSession(session.sessionId);
        }
        
        // Clean up the user sessions set
        const userSessionsKey = `user_sessions:${userId}`;
        await this.redis.del(userSessionsKey);
        
        return sessions.length;
    }

    /**
     * Store refresh token
     */
    async storeRefreshToken(userId, refreshToken, sessionId) {
        const tokenKey = `refresh_token:${refreshToken}`;
        const tokenData = {
            userId,
            sessionId,
            createdAt: new Date().toISOString()
        };
        
        await this.redis.setex(tokenKey, this.refreshTokenTTL, JSON.stringify(tokenData));
    }

    /**
     * Validate and consume refresh token
     */
    async validateRefreshToken(refreshToken) {
        const tokenKey = `refresh_token:${refreshToken}`;
        const tokenData = await this.redis.get(tokenKey);
        
        if (!tokenData) {
            return null;
        }
        
        const parsed = JSON.parse(tokenData);
        
        // Check if associated session still exists
        const session = await this.getSession(parsed.sessionId);
        if (!session) {
            // Clean up orphaned refresh token
            await this.redis.del(tokenKey);
            return null;
        }
        
        return parsed;
    }

    /**
     * Revoke refresh token
     */
    async revokeRefreshToken(refreshToken) {
        const tokenKey = `refresh_token:${refreshToken}`;
        return await this.redis.del(tokenKey);
    }

    /**
     * Add session to user's session list
     */
    async addUserSession(userId, sessionId) {
        const userSessionsKey = `user_sessions:${userId}`;
        await this.redis.sadd(userSessionsKey, sessionId);
        await this.redis.expire(userSessionsKey, this.refreshTokenTTL);
    }

    /**
     * Remove session from user's session list
     */
    async removeUserSession(userId, sessionId) {
        const userSessionsKey = `user_sessions:${userId}`;
        return await this.redis.srem(userSessionsKey, sessionId);
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2);
        return `${timestamp}_${random}`;
    }

    /**
     * Clean up expired sessions (should be run periodically)
     */
    async cleanupExpiredSessions() {
        const pattern = CACHE_KEYS.USER_SESSION('*');
        const keys = await this.redis.keys(pattern);
        
        let cleanedCount = 0;
        
        for (const key of keys) {
            const ttl = await this.redis.ttl(key);
            if (ttl === -2) { // Key doesn't exist
                cleanedCount++;
            }
        }
        
        return cleanedCount;
    }

    /**
     * Get session statistics
     */
    async getSessionStats() {
        const pattern = CACHE_KEYS.USER_SESSION('*');
        const keys = await this.redis.keys(pattern);
        
        const stats = {
            totalSessions: keys.length,
            activeSessions: 0,
            expiringSoon: 0 // Sessions expiring in next hour
        };
        
        for (const key of keys) {
            const ttl = await this.redis.ttl(key);
            if (ttl > 0) {
                stats.activeSessions++;
                if (ttl < 3600) { // Less than 1 hour
                    stats.expiringSoon++;
                }
            }
        }
        
        return stats;
    }

    /**
     * Extend session TTL
     */
    async extendSession(sessionId, additionalSeconds = null) {
        const sessionKey = CACHE_KEYS.USER_SESSION(sessionId);
        const ttl = additionalSeconds || this.defaultTTL;
        
        const exists = await this.redis.exists(sessionKey);
        if (!exists) {
            return false;
        }
        
        await this.redis.expire(sessionKey, ttl);
        return true;
    }
}

module.exports = { SessionManager };