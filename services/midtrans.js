const midtransClient = require('midtrans-client');
const database = require('../database');

// Initialize Midtrans Snap client
let snap;

function initializeMidtrans() {
    try {
        snap = new midtransClient.Snap({
            isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
            serverKey: process.env.MIDTRANS_SERVER_KEY,
            clientKey: process.env.MIDTRANS_CLIENT_KEY
        });
        console.log('Midtrans initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Midtrans:', error);
    }
}

// Create payment transaction
async function createPayment(userId, plan, orderId = null) {
    try {
        const planData = await database.getPlanByName(plan);
        
        if (!planData) {
            throw new Error('Invalid plan');
        }

        const user = await database.findUserById(userId);
        const transactionId = `TRX-${Date.now()}-${userId}`;
        const finalOrderId = orderId || `ORDER-${Date.now()}-${userId}`;

        // Create transaction record in database
        await database.createTransaction(
            userId,
            transactionId,
            finalOrderId,
            planData.price,
            plan
        );

        // Prepare transaction details
        const transactionDetails = {
            transaction_details: {
                order_id: finalOrderId,
                gross_amount: planData.price
            },
            customer_details: {
                first_name: user.full_name || user.email.split('@')[0],
                email: user.email,
                phone: ''
            },
            item_details: [
                {
                    id: plan,
                    price: planData.price,
                    quantity: 1,
                    name: `${plan.toUpperCase()} Plan - ${planData.daily_limit} requests/day`
                }
            ],
            callbacks: {
                finish: `${process.env.BASE_URL || 'http://localhost:8000'}/payment/success`,
                error: `${process.env.BASE_URL || 'http://localhost:8000'}/payment/failed`,
                pending: `${process.env.BASE_URL || 'http://localhost:8000'}/payment/pending`
            },
            custom_field1: userId,
            custom_field2: plan
        };

        // Create transaction with Midtrans
        const transaction = await snap.createTransaction(transactionDetails);

        return {
            status: true,
            message: 'Payment transaction created',
            data: {
                transaction_id: transactionId,
                order_id: finalOrderId,
                token: transaction.token,
                redirect_url: transaction.redirect_url,
                plan: plan,
                amount: planData.price
            }
        };
    } catch (error) {
        console.error('Error creating payment:', error);
        throw error;
    }
}

// Verify payment notification from Midtrans
async function verifyPaymentNotification(notification) {
    try {
        // Verify signature key
        const signatureKey = notification.signature_key;
        const orderId = notification.order_id;
        const statusCode = notification.status_code;
        const grossAmount = notification.gross_amount;
        
        const expectedSignature = require('crypto')
            .createHash('sha512')
            .update(`${orderId}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`)
            .digest('hex');

        if (signatureKey !== expectedSignature) {
            throw new Error('Invalid signature');
        }

        // Update transaction status in database
        const transactionId = notification.transaction_id;
        
        await database.updateTransactionStatus(
            transactionId,
            notification.transaction_status,
            {
                payment_type: notification.payment_type,
                payment_date: notification.settlement_time,
                fraud_status: notification.fraud_status
            }
        );

        // If payment is successful, update user's plan
        if (notification.transaction_status === 'capture' || notification.transaction_status === 'settlement') {
            // Extract plan from custom field (you'll need to store this in transaction)
            // For now, we'll assume the plan is stored in the transaction
            const transactions = await new Promise((resolve, reject) => {
                database.db.all(
                    'SELECT * FROM transactions WHERE transaction_id = ?',
                    [transactionId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            if (transactions.length > 0) {
                const transaction = transactions[0];
                await database.updateUserPlan(transaction.user_id, transaction.plan);
            }
        }

        return {
            status: true,
            message: 'Payment notification verified'
        };
    } catch (error) {
        console.error('Error verifying payment notification:', error);
        throw error;
    }
}

// Check transaction status
async function checkTransactionStatus(orderId) {
    try {
        const status = await snap.transaction.status(orderId);
        
        // Update database with latest status
        await database.updateTransactionStatus(
            status.transaction_id,
            status.transaction_status,
            {
                payment_type: status.payment_type,
                payment_date: status.settlement_time,
                fraud_status: status.fraud_status
            }
        );

        return {
            status: true,
            data: status
        };
    } catch (error) {
        console.error('Error checking transaction status:', error);
        throw error;
    }
}

// Cancel transaction
async function cancelTransaction(orderId) {
    try {
        await snap.transaction.cancel(orderId);
        
        await database.updateTransactionStatus(orderId, 'cancel');
        
        return {
            status: true,
            message: 'Transaction cancelled successfully'
        };
    } catch (error) {
        console.error('Error cancelling transaction:', error);
        throw error;
    }
}

// Get available plans
async function getAvailablePlans() {
    try {
        const plans = await database.getActivePlans();
        
        return {
            status: true,
            data: plans.map(plan => ({
                id: plan.name,
                name: plan.name.charAt(0).toUpperCase() + plan.name.slice(1),
                price: plan.price,
                currency: 'IDR',
                daily_limit: plan.daily_limit,
                monthly_limit: plan.monthly_limit,
                features: plan.features
            }))
        };
    } catch (error) {
        console.error('Error getting plans:', error);
        throw error;
    }
}

// Initialize on load
initializeMidtrans();

module.exports = {
    createPayment,
    verifyPaymentNotification,
    checkTransactionStatus,
    cancelTransaction,
    getAvailablePlans
};