require('../config')

const express = require('express')
const router = express.Router()
const os = require('os')
const axios = require('axios')

// Helper function untuk format response
const formatResponse = (status, message, data = null) => {
    return {
        status: status,
        creator: global.creator,
        message: message,
        data: data,
        timestamp: new Date().toISOString()
    }
}

// Helper function untuk error response
const errorResponse = (res, message, statusCode = 500) => {
    return res.status(statusCode).json({
        status: false,
        creator: global.creator,
        message: message,
        timestamp: new Date().toISOString()
    })
}

// Helper function untuk success response
const successResponse = (res, message, data = null) => {
    return res.status(200).json({
        status: true,
        creator: global.creator,
        message: message,
        data: data,
        timestamp: new Date().toISOString()
    })
}

// API Status Endpoint
router.get('/status', (req, res) => {
    try {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsagePercent = ((usedMemory / totalMemory) * 100).toFixed(2);

        const statusData = {
            server: {
                platform: os.platform(),
                arch: os.arch(),
                uptime: os.uptime(),
                hostname: os.hostname(),
                cpus: os.cpus().length
            },
            memory: {
                total: totalMemory,
                free: freeMemory,
                used: usedMemory,
                usage_percent: parseFloat(memoryUsagePercent)
            },
            network: {
                interfaces: os.networkInterfaces()
            },
            load: os.loadavg()
        }

        return successResponse(res, 'Server is running normally', statusData)
    } catch (error) {
        console.error('Status endpoint error:', error)
        return errorResponse(res, 'Failed to get server status')
    }
})

// Ping Endpoint
router.get('/ping', (req, res) => {
    return successResponse(res, 'Pong! Server is responsive')
})

// Deepseek AI Endpoint
router.get('/deepseek', async (req, res) => {
    const q = req.query.q
    const model = req.query.model || 'deepseek-chat'

    if (!q || q.trim() === '') {
        return res.status(400).json({
            status: false,
            creator: global.creator,
            message: 'Query parameter "q" is required',
            timestamp: new Date().toISOString()
        })
    }

    try {
        const response = await axios.get(`https://api-rebix.vercel.app/api/deepseek-r1?q=${encodeURIComponent(q)}`, {
            timeout: 30000
        })

        if (response.status === 200) {
            return successResponse(res, 'Deepseek API response successful', {
                model: response.data.model || model,
                response: response.data.response,
                processing_time: response.data.processing_time || 'unknown',
                source: 'external-api'
            })
        } else {
            return errorResponse(res, 'Deepseek API returned an error', response.status)
        }
    } catch (error) {
        console.error('Deepseek API error:', error.message)
        
        // Fallback response jika API external down
        const fallbackResponses = [
            "I'm currently experiencing high load. Please try again in a moment.",
            "I'm here to help! What would you like to know?",
            "Hello! I'm your AI assistant. How can I help you today?"
        ]
        
        return successResponse(res, 'Deepseek API fallback response', {
            model: 'deepseek-fallback',
            response: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)],
            processing_time: '0ms',
            source: 'fallback',
            note: 'External API may be experiencing issues'
        })
    }
})

// Microsoft Copilot AI Endpoint (New)
router.get('/copilot', async (req, res) => {
    const text = req.query.text
    const model = req.query.model || 'copilot-default'

    if (!text || text.trim() === '') {
        return res.status(400).json({
            status: false,
            creator: global.creator,
            message: 'Query parameter "text" is required',
            timestamp: new Date().toISOString()
        })
    }

    try {
        // Call external Copilot API
        const response = await axios.get(`https://api.yupra.my.id/api/ai/copilot?text=${encodeURIComponent(text)}`, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        })

        if (response.status === 200) {
            const data = response.data
            
            return res.status(200).json({
                status: true,
                creator: global.creator,
                message: 'Copilot AI response successful',
                model: data.model || model,
                result: data.result,
                citations: data.citations || [],
                processing_time: data.processing_time || 'unknown',
                timestamp: new Date().toISOString(),
                source: 'microsoft-copilot'
            })
        } else {
            return errorResponse(res, 'Copilot API returned an error', response.status)
        }
    } catch (error) {
        console.error('Copilot API error:', error.message)
        
        // Fallback response untuk Copilot
        const fallbackResponses = [
            "Hello! I'm Copilot, your AI assistant. How can I help you today?",
            "Hey there! I'm here to assist with any questions you might have.",
            "Hi! I'm Copilot, ready to help you with information and creative tasks."
        ]
        
        return res.status(200).json({
            status: true,
            creator: global.creator,
            message: 'Copilot API fallback response',
            model: 'copilot-fallback',
            result: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)],
            citations: [],
            processing_time: '0ms',
            timestamp: new Date().toISOString(),
            source: 'fallback',
            note: 'External API may be experiencing issues'
        })
    }
})

// Advanced AI Chat Endpoint - Multiple Models
router.get('/ai/chat', async (req, res) => {
    const { text, model = 'auto' } = req.query

    if (!text || text.trim() === '') {
        return errorResponse(res, 'Query parameter "text" is required', 400)
    }

    try {
        let aiResponse
        let selectedModel = model

        // Pilih model berdasarkan parameter atau secara otomatis
        if (model === 'auto' || model === 'copilot') {
            selectedModel = 'copilot'
            const response = await axios.get(`https://api.yupra.my.id/api/ai/copilot?text=${encodeURIComponent(text)}`, {
                timeout: 20000
            })
            aiResponse = response.data
        } else if (model === 'deepseek') {
            selectedModel = 'deepseek'
            const response = await axios.get(`https://api-rebix.vercel.app/api/deepseek-r1?q=${encodeURIComponent(text)}`, {
                timeout: 20000
            })
            aiResponse = response.data
        } else {
            return errorResponse(res, `Model '${model}' is not supported. Available: auto, copilot, deepseek`, 400)
        }

        return successResponse(res, `${selectedModel} AI response successful`, {
            model: selectedModel,
            query: text,
            response: aiResponse.result || aiResponse.response || 'No response from AI',
            source: selectedModel,
            details: aiResponse
        })
    } catch (error) {
        console.error('AI Chat endpoint error:', error.message)
        return errorResponse(res, 'Failed to get AI response. Please try again.')
    }
})

// Health Check Endpoint
router.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        endpoints: {
            total: 5,
            available: ['/status', '/ping', '/deepseek', '/copilot', '/ai/chat']
        },
        rate_limit: {
            window: '1 minute',
            max_requests: 2000
        }
    }

    return res.status(200).json(healthData)
})

// API Information Endpoint
router.get('/info', (req, res) => {
    const apiInfo = {
        name: 'Advanced REST API Server',
        version: '2.0.0',
        creator: global.creator,
        description: 'Multi-model AI API server with various endpoints',
        endpoints: {
            status: {
                path: '/api/status',
                method: 'GET',
                description: 'Get server status and system information',
                parameters: 'none'
            },
            ping: {
                path: '/api/ping',
                method: 'GET',
                description: 'Simple health check endpoint',
                parameters: 'none'
            },
            deepseek: {
                path: '/api/deepseek',
                method: 'GET',
                description: 'Deepseek AI chat endpoint',
                parameters: 'q (required) - Your question'
            },
            copilot: {
                path: '/api/copilot',
                method: 'GET',
                description: 'Microsoft Copilot AI endpoint',
                parameters: 'text (required) - Your message'
            },
            ai_chat: {
                path: '/api/ai/chat',
                method: 'GET',
                description: 'Multi-model AI chat endpoint',
                parameters: 'text (required), model (optional: auto, copilot, deepseek)'
            }
        },
        rate_limiting: '2000 requests per minute per IP',
        documentation: 'Visit / on your browser for full documentation'
    }

    return successResponse(res, 'API information retrieved successfully', apiInfo)
})

// Catch-all for undefined API routes
router.all('*', (req, res) => {
    return res.status(404).json({
        status: false,
        creator: global.creator,
        message: `API endpoint ${req.method} ${req.originalUrl} not found`,
        available_endpoints: [
            'GET /api/status',
            'GET /api/ping',
            'GET /api/deepseek?q=your_question',
            'GET /api/copilot?text=your_message',
            'GET /api/ai/chat?text=message&model=auto',
            'GET /api/health',
            'GET /api/info'
        ],
        timestamp: new Date().toISOString()
    })
})

module.exports = router
