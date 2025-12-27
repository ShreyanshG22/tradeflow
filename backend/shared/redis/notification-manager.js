/**
 * Notification Manager for TradeFlow
 * 
 * Handles real-time notifications, alerts, and pub/sub messaging
 * for user notifications, trade alerts, and system status updates.
 */

const { redisManager, REDIS_DATABASES, PUBSUB_CHANNELS } = require('./redis-config');

class NotificationManager {
    constructor() {
        this.redis = redisManager.getConnection(REDIS_DATABASES.NOTIFICATIONS);
        this.publisher = redisManager.getPublisher(REDIS_DATABASES.NOTIFICATIONS);
        this.subscriber = redisManager.getSubscriber(REDIS_DATABASES.NOTIFICATIONS);
        
        // Notification TTL settings
        this.alertTTL = 7 * 24 * 60 * 60; // 7 days for alerts
        this.notificationTTL = 30 * 24 * 60 * 60; // 30 days for notifications
    }

    /**
     * Send user alert/notification
     */
    async sendUserAlert(userId, alert) {
        const alertId = this.generateAlertId();
        const alertData = {
            id: alertId,
            userId,
            type: alert.type, // 'trade', 'risk', 'system', 'strategy'
            title: alert.title,
            message: alert.message,
            severity: alert.severity || 'info', // 'info', 'warning', 'error', 'success'
            data: alert.data || {},
            timestamp: new Date().toISOString(),
            read: false,
            actionRequired: alert.actionRequired || false
        };
        
        // Store alert for user
        const alertKey = `user_alert:${userId}:${alertId}`;
        await this.redis.setex(alertKey, this.alertTTL, JSON.stringify(alertData));
        
        // Add to user's alert list
        const userAlertsKey = `user_alerts:${userId}`;
        await this.redis.zadd(userAlertsKey, Date.now(), alertId);
        await this.redis.expire(userAlertsKey, this.alertTTL);
        
        // Publish real-time notification
        await this.publisher.publish(
            PUBSUB_CHANNELS.NOTIFICATIONS.USER_ALERTS,
            JSON.stringify({
                userId,
                alert: alertData
            })
        );
        
        return alertData;
    }

    /**
     * Send trade alert
     */
    async sendTradeAlert(userId, tradeData) {
        const alert = {
            type: 'trade',
            title: `Trade ${tradeData.side.toUpperCase()}: ${tradeData.symbol}`,
            message: `${tradeData.side.toUpperCase()} ${tradeData.quantity} ${tradeData.symbol} at $${tradeData.price}`,
            severity: tradeData.status === 'filled' ? 'success' : 'info',
            data: {
                tradeId: tradeData.id,
                symbol: tradeData.symbol,
                side: tradeData.side,
                quantity: tradeData.quantity,
                price: tradeData.price,
                status: tradeData.status
            }
        };
        
        return await this.sendUserAlert(userId, alert);
    }

    /**
     * Send risk alert
     */
    async sendRiskAlert(userId, riskData) {
        const alert = {
            type: 'risk',
            title: 'Risk Alert',
            message: riskData.message,
            severity: riskData.severity || 'warning',
            actionRequired: true,
            data: {
                riskType: riskData.type,
                currentValue: riskData.currentValue,
                threshold: riskData.threshold,
                portfolioId: riskData.portfolioId
            }
        };
        
        return await this.sendUserAlert(userId, alert);
    }

    /**
     * Send strategy alert
     */
    async sendStrategyAlert(userId, strategyData) {
        const alert = {
            type: 'strategy',
            title: `Strategy: ${strategyData.name}`,
            message: strategyData.message,
            severity: strategyData.severity || 'info',
            data: {
                strategyId: strategyData.id,
                strategyName: strategyData.name,
                status: strategyData.status,
                performance: strategyData.performance
            }
        };
        
        return await this.sendUserAlert(userId, alert);
    }

    /**
     * Get user alerts
     */
    async getUserAlerts(userId, options = {}) {
        const {
            limit = 50,
            offset = 0,
            unreadOnly = false,
            type = null
        } = options;
        
        const userAlertsKey = `user_alerts:${userId}`;
        
        // Get alert IDs sorted by timestamp (newest first)
        const alertIds = await this.redis.zrevrange(
            userAlertsKey,
            offset,
            offset + limit - 1
        );
        
        const alerts = [];
        for (const alertId of alertIds) {
            const alertKey = `user_alert:${userId}:${alertId}`;
            const alertData = await this.redis.get(alertKey);
            
            if (alertData) {
                const alert = JSON.parse(alertData);
                
                // Apply filters
                if (unreadOnly && alert.read) continue;
                if (type && alert.type !== type) continue;
                
                alerts.push(alert);
            }
        }
        
        return alerts;
    }

    /**
     * Mark alert as read
     */
    async markAlertAsRead(userId, alertId) {
        const alertKey = `user_alert:${userId}:${alertId}`;
        const alertData = await this.redis.get(alertKey);
        
        if (alertData) {
            const alert = JSON.parse(alertData);
            alert.read = true;
            alert.readAt = new Date().toISOString();
            
            await this.redis.setex(alertKey, this.alertTTL, JSON.stringify(alert));
            return alert;
        }
        
        return null;
    }

    /**
     * Mark all alerts as read for a user
     */
    async markAllAlertsAsRead(userId) {
        const alerts = await this.getUserAlerts(userId, { unreadOnly: true });
        
        for (const alert of alerts) {
            await this.markAlertAsRead(userId, alert.id);
        }
        
        return alerts.length;
    }

    /**
     * Delete alert
     */
    async deleteAlert(userId, alertId) {
        const alertKey = `user_alert:${userId}:${alertId}`;
        const userAlertsKey = `user_alerts:${userId}`;
        
        // Remove from user's alert list
        await this.redis.zrem(userAlertsKey, alertId);
        
        // Delete the alert data
        return await this.redis.del(alertKey);
    }

    /**
     * Get unread alert count
     */
    async getUnreadAlertCount(userId) {
        const alerts = await this.getUserAlerts(userId, { unreadOnly: true });
        return alerts.length;
    }

    /**
     * Subscribe to user alerts
     */
    async subscribeToUserAlerts(userId, callback) {
        const channel = PUBSUB_CHANNELS.NOTIFICATIONS.USER_ALERTS;
        
        this.subscriber.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    const data = JSON.parse(message);
                    if (data.userId === userId) {
                        callback(data.alert);
                    }
                } catch (error) {
                    console.error('Error parsing user alert:', error);
                }
            }
        });
        
        await this.subscriber.subscribe(channel);
    }

    /**
     * Broadcast system status update
     */
    async broadcastSystemStatus(status) {
        const statusData = {
            type: 'system_status',
            status: status.status, // 'online', 'maintenance', 'degraded', 'offline'
            message: status.message,
            timestamp: new Date().toISOString(),
            affectedServices: status.affectedServices || [],
            estimatedResolution: status.estimatedResolution
        };
        
        await this.publisher.publish(
            PUBSUB_CHANNELS.NOTIFICATIONS.SYSTEM_STATUS,
            JSON.stringify(statusData)
        );
        
        // Cache current system status
        await this.redis.setex(
            'system_status',
            3600, // 1 hour TTL
            JSON.stringify(statusData)
        );
        
        return statusData;
    }

    /**
     * Get current system status
     */
    async getSystemStatus() {
        const data = await this.redis.get('system_status');
        return data ? JSON.parse(data) : null;
    }

    /**
     * Subscribe to system status updates
     */
    async subscribeToSystemStatus(callback) {
        const channel = PUBSUB_CHANNELS.NOTIFICATIONS.SYSTEM_STATUS;
        
        this.subscriber.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    const data = JSON.parse(message);
                    callback(data);
                } catch (error) {
                    console.error('Error parsing system status:', error);
                }
            }
        });
        
        await this.subscriber.subscribe(channel);
    }

    /**
     * Send portfolio update notification
     */
    async sendPortfolioUpdate(userId, portfolioData) {
        const updateData = {
            userId,
            portfolioId: portfolioData.id,
            type: portfolioData.updateType, // 'balance', 'position', 'pnl'
            data: portfolioData,
            timestamp: new Date().toISOString()
        };
        
        await this.publisher.publish(
            PUBSUB_CHANNELS.PORTFOLIO.POSITION_UPDATES,
            JSON.stringify(updateData)
        );
        
        return updateData;
    }

    /**
     * Subscribe to portfolio updates
     */
    async subscribeToPortfolioUpdates(userId, callback) {
        const channel = PUBSUB_CHANNELS.PORTFOLIO.POSITION_UPDATES;
        
        this.subscriber.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    const data = JSON.parse(message);
                    if (data.userId === userId) {
                        callback(data);
                    }
                } catch (error) {
                    console.error('Error parsing portfolio update:', error);
                }
            }
        });
        
        await this.subscriber.subscribe(channel);
    }

    /**
     * Generate unique alert ID
     */
    generateAlertId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2);
        return `alert_${timestamp}_${random}`;
    }

    /**
     * Clean up old alerts (should be run periodically)
     */
    async cleanupOldAlerts(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days in ms
        const pattern = 'user_alert:*';
        const keys = await this.redis.keys(pattern);
        
        let cleanedCount = 0;
        const cutoffTime = Date.now() - maxAge;
        
        for (const key of keys) {
            const alertData = await this.redis.get(key);
            if (alertData) {
                const alert = JSON.parse(alertData);
                const alertTime = new Date(alert.timestamp).getTime();
                
                if (alertTime < cutoffTime) {
                    await this.redis.del(key);
                    cleanedCount++;
                }
            }
        }
        
        return cleanedCount;
    }

    /**
     * Get notification statistics
     */
    async getNotificationStats() {
        const alertKeys = await this.redis.keys('user_alert:*');
        const userAlertKeys = await this.redis.keys('user_alerts:*');
        
        const stats = {
            totalAlerts: alertKeys.length,
            activeUsers: userAlertKeys.length,
            systemStatus: await this.getSystemStatus()
        };
        
        return stats;
    }
}

module.exports = { NotificationManager };