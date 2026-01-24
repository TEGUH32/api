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

// Spotify Downloader Endpoint (BARU)
router.get('/spotify', async (req, res) => {
    const url = req.query.url
    const quality = req.query.quality || 'high'

    if (!url || url.trim() === '') {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'Query parameter "url" is required',
            timestamp: new Date().toISOString(),
            example: '/api/spotify?url=https://open.spotify.com/track/3k68kVFWTTBP0Jb4LOzCax',
            note: 'Supports Spotify track URLs only'
        })
    }

    // Validasi URL Spotify
    if (!url.includes('open.spotify.com/track/') && !url.includes('spotify.com/track/')) {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'URL must be a valid Spotify track link',
            timestamp: new Date().toISOString(),
            supported_formats: [
                'https://open.spotify.com/track/{track_id}',
                'https://spotify.com/track/{track_id}',
                'https://open.spotify.com/track/{track_id}?si=xxxx'
            ],
            example_url: 'https://open.spotify.com/track/3k68kVFWTTBP0Jb4LOzCax'
        })
    }

    try {
        const startTime = Date.now();
        
        // Extract track ID dari URL
        let trackId = '';
        const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/);
        if (trackMatch && trackMatch[1]) {
            trackId = trackMatch[1];
        } else {
            return res.status(400).json({
                status: false,
                status_code: 400,
                creator: global.creator,
                message: 'Invalid Spotify track URL',
                timestamp: new Date().toISOString()
            })
        }

        // Call external Spotify API
        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/spotify?url=${encodeURIComponent(url)}`, {
            timeout: 45000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://open.spotify.com/',
                'Origin': 'https://open.spotify.com'
            },
            validateStatus: (status) => status < 500
        })

        const processingTime = Date.now() - startTime;
        
        if (response.status === 200) {
            const data = response.data
            
            // Format response sesuai dengan struktur yang diminta
            return res.status(200).json({
                status: data.status || true,
                status_code: data.status_code || 200,
                creator: global.creator, // Menggunakan creator dari config
                processing_time: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                result: {
                    id: data.result?.id || trackId,
                    title: data.result?.title || 'Unknown Track',
                    artists: data.result?.artists || 'Unknown Artist',
                    album: data.result?.album || 'Unknown Album',
                    cover_url: data.result?.cover_url || 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/800px-Spotify_logo_without_text.svg.png',
                    duration_ms: data.result?.duration_ms || 0,
                    release_date: data.result?.release_date || 'Unknown',
                    download: data.result?.download || `https://api.fabdl.com/spotify/download-mp3/${trackId}`,
                    metadata: {
                        url_provided: url,
                        quality_requested: quality,
                        track_id: trackId,
                        duration_formatted: formatDuration(data.result?.duration_ms || 0)
                    }
                }
            })
        } else {
            // Jika API external mengembalikan error
            return res.status(response.status).json({
                status: false,
                status_code: response.status,
                creator: global.creator,
                message: 'Spotify API returned an error',
                processing_time: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                error: response.data?.message || 'Unknown error from external API',
                track_id: trackId,
                note: 'The track might be unavailable or the API is down'
            })
        }
    } catch (error) {
        console.error('Spotify API error:', error.message)
        
        // Fallback response untuk Spotify dengan data dummy
        return res.status(200).json({
            status: false,
            status_code: 500,
            creator: global.creator,
            message: 'Failed to fetch Spotify data',
            processing_time: '0ms',
            timestamp: new Date().toISOString(),
            error: error.message,
            note: 'Spotify API may be experiencing issues or the track is unavailable',
            fallback_data: {
                id: 'demo_track_id',
                title: 'Sample Track (Demo)',
                artists: 'Sample Artist',
                album: 'Sample Album',
                cover_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/800px-Spotify_logo_without_text.svg.png',
                duration_ms: 180000,
                release_date: '2023-01-01',
                download: 'https://example.com/spotify-demo.mp3'
            },
            supported_urls: [
                'Spotify Track: https://open.spotify.com/track/TRACK_ID',
                'Spotify Track with SI: https://open.spotify.com/track/TRACK_ID?si=xxxx'
            ],
            troubleshooting: [
                'Ensure the track is available on Spotify',
                'Check if the track is not region-locked',
                'Verify the URL is correct',
                'Try using only the track ID portion'
            ]
        })
    }
})

// Helper function untuk format durasi
function formatDuration(ms) {
    if (!ms) return '0:00';
    
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

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

// Microsoft Copilot AI Endpoint
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

// GPT-5 AI Endpoint
router.get('/gpt5', async (req, res) => {
    const text = req.query.text
    const model = req.query.model || 'gpt-5-smart'

    if (!text || text.trim() === '') {
        return res.status(400).json({
            status: false,
            creator: global.creator,
            message: 'Query parameter "text" is required',
            timestamp: new Date().toISOString()
        })
    }

    try {
        // Call external GPT-5 API
        const response = await axios.get(`https://api.yupra.my.id/api/ai/gpt5?text=${encodeURIComponent(text)}`, {
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
                message: 'GPT-5 AI response successful',
                model: data.model || model,
                result: data.result,
                citations: data.citations || [],
                processing_time: data.processing_time || 'unknown',
                timestamp: new Date().toISOString(),
                source: 'openai-gpt5'
            })
        } else {
            return errorResponse(res, 'GPT-5 API returned an error', response.status)
        }
    } catch (error) {
        console.error('GPT-5 API error:', error.message)
        
        // Fallback response untuk GPT-5
        const fallbackResponses = [
            "Hello! I'm GPT-5, the latest AI model. How can I assist you today?",
            "Hi there! I'm here to help with your questions. What would you like to know?",
            "Greetings! As GPT-5, I can help with various topics. Ask me anything!"
        ]
        
        return res.status(200).json({
            status: true,
            creator: global.creator,
            message: 'GPT-5 API fallback response',
            model: 'gpt-5-fallback',
            result: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)],
            citations: [],
            processing_time: '0ms',
            timestamp: new Date().toISOString(),
            source: 'fallback',
            note: 'External API may be experiencing issues'
        })
    }
})

// Instagram Downloader Endpoint
router.get('/instagram', async (req, res) => {
    const url = req.query.url

    if (!url || url.trim() === '') {
        return res.status(400).json({
            status: false,
            creator: global.creator,
            message: 'Query parameter "url" is required',
            timestamp: new Date().toISOString(),
            example: '/api/instagram?url=https://www.instagram.com/p/Cxample123/'
        })
    }

    // Validasi URL Instagram
    if (!url.includes('instagram.com')) {
        return res.status(400).json({
            status: false,
            creator: global.creator,
            message: 'URL must be a valid Instagram link',
            timestamp: new Date().toISOString(),
            supported_formats: [
                'https://www.instagram.com/p/',
                'https://www.instagram.com/reel/',
                'https://www.instagram.com/tv/'
            ]
        })
    }

    try {
        const startTime = Date.now();
        // Call external Instagram API
        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/instagram?url=${encodeURIComponent(url)}`, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.instagram.com/'
            }
        })

        if (response.status === 200) {
            const data = response.data
            const processingTime = Date.now() - startTime;
            
            return res.status(200).json({
                status: true,
                status_code: 200,
                creator: global.creator,
                message: 'Instagram data fetched successfully',
                processing_time: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                result: data.result || data,
                metadata: {
                    url_provided: url,
                    content_type: data.result?.data?.[0]?.type || 'unknown',
                    has_video: data.result?.data?.some(item => item.type === 'video') || false,
                    has_image: data.result?.data?.some(item => item.type === 'image') || false,
                    total_media: data.result?.data?.length || 0
                }
            })
        } else {
            return errorResponse(res, 'Instagram API returned an error', response.status)
        }
    } catch (error) {
        console.error('Instagram API error:', error.message)
        
        // Fallback response untuk Instagram
        return res.status(200).json({
            status: false,
            status_code: 500,
            creator: global.creator,
            message: 'Failed to fetch Instagram data',
            timestamp: new Date().toISOString(),
            error: error.message,
            note: 'Instagram API may be experiencing issues or the URL is invalid',
            supported_urls: [
                'Instagram Posts: https://www.instagram.com/p/ABC123/',
                'Instagram Reels: https://www.instagram.com/reel/ABC123/',
                'Instagram TV: https://www.instagram.com/tv/ABC123/'
            ]
        })
    }
})

// Facebook Downloader Endpoint
router.get('/facebook', async (req, res) => {
    const url = req.query.url

    if (!url || url.trim() === '') {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'Query parameter "url" is required',
            timestamp: new Date().toISOString(),
            example: '/api/facebook?url=https://www.facebook.com/share/r/16sXMhKi6e/'
        })
    }

    // Validasi URL Facebook
    if (!url.includes('facebook.com') && !url.includes('fb.watch') && !url.includes('fb.com')) {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'URL must be a valid Facebook link',
            timestamp: new Date().toISOString(),
            supported_formats: [
                'https://www.facebook.com/share/r/',
                'https://www.facebook.com/video.php?v=',
                'https://www.facebook.com/watch/?v=',
                'https://fb.watch/',
                'https://m.facebook.com/'
            ]
        })
    }

    try {
        const startTime = Date.now();
        
        // Call external Facebook API
        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/facebook?url=${encodeURIComponent(url)}`, {
            timeout: 45000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.facebook.com/'
            },
            validateStatus: (status) => status < 500
        })

        const processingTime = Date.now() - startTime;
        
        if (response.status === 200) {
            const data = response.data
            
            // Format response sesuai dengan struktur yang diberikan
            return res.status(200).json({
                status: data.status || true,
                status_code: data.status_code || 200,
                creator: global.creator,
                processing_time: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                result: {
                    title: data.result?.title || 'Facebook Video',
                    thumbnail: data.result?.thumbnail || null,
                    durasi: data.result?.durasi || '0:00',
                    download: data.result?.download || {
                        hd: null,
                        sd: null,
                        audio: null
                    },
                    metadata: {
                        url_provided: url,
                        has_hd: !!data.result?.download?.hd,
                        has_sd: !!data.result?.download?.sd,
                        duration_formatted: data.result?.durasi || 'unknown',
                        video_type: data.result?.title?.includes('Video') ? 'video' : 'post'
                    }
                }
            })
        } else {
            // Jika API external mengembalikan error
            return res.status(response.status).json({
                status: false,
                status_code: response.status,
                creator: global.creator,
                message: 'Facebook API returned an error',
                processing_time: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                error: response.data?.message || 'Unknown error from external API',
                original_response: response.data
            })
        }
    } catch (error) {
        console.error('Facebook API error:', error.message)
        
        // Fallback response untuk Facebook dengan data dummy
        return res.status(200).json({
            status: false,
            status_code: 500,
            creator: global.creator,
            message: 'Failed to fetch Facebook data',
            processing_time: '0ms',
            timestamp: new Date().toISOString(),
            error: error.message,
            note: 'Facebook API may be experiencing issues or the URL is invalid/private',
            fallback_data: {
                title: 'Facebook Video (Demo)',
                thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Facebook_f_logo_%282019%29.svg/1200px-Facebook_f_logo_%282019%29.svg.png',
                durasi: '1:30',
                download: {
                    hd: 'https://example.com/video-hd.mp4',
                    sd: 'https://example.com/video-sd.mp4'
                }
            },
            supported_urls: [
                'Facebook Video: https://www.facebook.com/share/r/VIDEO_ID/',
                'Facebook Watch: https://www.facebook.com/watch/?v=VIDEO_ID',
                'Facebook Reel: https://www.facebook.com/reel/REEL_ID',
                'Facebook Post: https://www.facebook.com/PROFILE/posts/POST_ID'
            ],
            troubleshooting: [
                'Ensure the video is public (not private)',
                'Try using the full URL of the video',
                'Check if the video is still available',
                'Use a direct video link if possible'
            ]
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
        } else if (model === 'gpt5') {
            selectedModel = 'gpt5'
            const response = await axios.get(`https://api.yupra.my.id/api/ai/gpt5?text=${encodeURIComponent(text)}`, {
                timeout: 20000
            })
            aiResponse = response.data
        } else {
            return errorResponse(res, `Model '${model}' is not supported. Available: auto, copilot, deepseek, gpt5`, 400)
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

// Social Media Tools Endpoint (Updated with Spotify)
router.get('/social/media', async (req, res) => {
    const { url, platform = 'auto' } = req.query

    if (!url || url.trim() === '') {
        return errorResponse(res, 'Query parameter "url" is required', 400)
    }

    try {
        let result
        let detectedPlatform = platform

        // Auto-detect platform dari URL
        if (platform === 'auto') {
            if (url.includes('instagram.com')) {
                detectedPlatform = 'instagram'
            } else if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) {
                detectedPlatform = 'facebook'
            } else if (url.includes('tiktok.com')) {
                detectedPlatform = 'tiktok'
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                detectedPlatform = 'youtube'
            } else if (url.includes('twitter.com') || url.includes('x.com')) {
                detectedPlatform = 'twitter'
            } else if (url.includes('spotify.com') || url.includes('open.spotify.com')) {
                detectedPlatform = 'spotify'
            } else {
                detectedPlatform = 'unknown'
            }
        }

        if (detectedPlatform === 'instagram') {
            const response = await axios.get(`https://api.vreden.my.id/api/v1/download/instagram?url=${encodeURIComponent(url)}`, {
                timeout: 30000
            })
            result = response.data
        } else if (detectedPlatform === 'facebook') {
            const response = await axios.get(`https://api.vreden.my.id/api/v1/download/facebook?url=${encodeURIComponent(url)}`, {
                timeout: 45000
            })
            result = response.data
        } else if (detectedPlatform === 'spotify') {
            const response = await axios.get(`https://api.vreden.my.id/api/v1/download/spotify?url=${encodeURIComponent(url)}`, {
                timeout: 45000
            })
            result = response.data
        } else {
            return errorResponse(res, `Platform '${detectedPlatform}' is not supported yet. Currently only Instagram, Facebook, and Spotify are supported.`, 400)
        }

        return successResponse(res, `${detectedPlatform} data fetched successfully`, {
            platform: detectedPlatform,
            url: url,
            result: result.result || result,
            supported_features: ['download', 'metadata', 'statistics']
        })
    } catch (error) {
        console.error('Social Media endpoint error:', error.message)
        return errorResponse(res, 'Failed to fetch social media data')
    }
})

// Video & Audio Downloader Endpoint (Unified - Updated with Spotify)
router.get('/download', async (req, res) => {
    const { url, quality = 'best', platform = 'auto', type = 'auto' } = req.query

    if (!url || url.trim() === '') {
        return errorResponse(res, 'Query parameter "url" is required', 400)
    }

    try {
        let result
        let detectedPlatform = platform
        let detectedType = type

        // Auto-detect platform dari URL
        if (platform === 'auto') {
            if (url.includes('instagram.com')) {
                detectedPlatform = 'instagram'
                detectedType = 'video'
            } else if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) {
                detectedPlatform = 'facebook'
                detectedType = 'video'
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                detectedPlatform = 'youtube'
                detectedType = 'video'
            } else if (url.includes('spotify.com') || url.includes('open.spotify.com')) {
                detectedPlatform = 'spotify'
                detectedType = 'audio'
            } else {
                detectedPlatform = 'unknown'
            }
        }

        const startTime = Date.now();
        
        if (detectedPlatform === 'instagram') {
            const response = await axios.get(`https://api.vreden.my.id/api/v1/download/instagram?url=${encodeURIComponent(url)}`, {
                timeout: 30000
            })
            result = response.data
        } else if (detectedPlatform === 'facebook') {
            const response = await axios.get(`https://api.vreden.my.id/api/v1/download/facebook?url=${encodeURIComponent(url)}`, {
                timeout: 45000
            })
            result = response.data
        } else if (detectedPlatform === 'spotify') {
            const response = await axios.get(`https://api.vreden.my.id/api/v1/download/spotify?url=${encodeURIComponent(url)}`, {
                timeout: 45000
            })
            result = response.data
        } else {
            return errorResponse(res, `Platform '${detectedPlatform}' is not supported. Currently only Instagram, Facebook, and Spotify are supported.`, 400)
        }

        const processingTime = Date.now() - startTime;
        
        // Format response yang konsisten
        return res.status(200).json({
            status: true,
            status_code: 200,
            creator: global.creator,
            message: `${detectedPlatform} ${detectedType} data fetched successfully`,
            processing_time: `${processingTime}ms`,
            timestamp: new Date().toISOString(),
            platform: detectedPlatform,
            content_type: detectedType,
            url: url,
            quality_requested: quality,
            result: result.result || result,
            download_options: {
                available_qualities: detectedPlatform === 'facebook' ? ['hd', 'sd'] : 
                                  detectedPlatform === 'spotify' ? ['high', 'medium', 'low'] : 
                                  ['best', 'high', 'medium', 'low'],
                recommended: detectedPlatform === 'facebook' ? 'hd' : 
                           detectedPlatform === 'spotify' ? 'high' : 'best',
                note: quality === 'best' ? 'Automatically selects the best available quality' : `Requested: ${quality}`
            }
        })
    } catch (error) {
        console.error('Download endpoint error:', error.message)
        return errorResponse(res, `Failed to fetch data from ${platform}`)
    }
})

// Health Check Endpoint (Updated)
router.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        endpoints: {
            total: 11,
            available: [
                '/api/status',
                '/api/ping',
                '/api/deepseek',
                '/api/copilot',
                '/api/gpt5',
                '/api/instagram',
                '/api/facebook',
                '/api/spotify',
                '/api/social/media',
                '/api/download',
                '/api/ai/chat'
            ]
        },
        services: {
            ai_models: ['Deepseek', 'Copilot', 'GPT-5'],
            downloaders: ['Instagram', 'Facebook', 'Spotify'],
            status: 'operational'
        },
        rate_limit: {
            window: '1 minute',
            max_requests: 2000
        }
    }

    return res.status(200).json(healthData)
})

// API Information Endpoint (Updated)
router.get('/info', (req, res) => {
    const apiInfo = {
        name: 'API Teguh - Advanced REST API Server',
        version: '3.3.0',
        creator: global.creator,
        description: 'Multi-model AI API server with social media, audio, and video download tools',
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
            gpt5: {
                path: '/api/gpt5',
                method: 'GET',
                description: 'GPT-5 AI endpoint',
                parameters: 'text (required) - Your message'
            },
            instagram: {
                path: '/api/instagram',
                method: 'GET',
                description: 'Instagram downloader and metadata',
                parameters: 'url (required) - Instagram post/reel URL'
            },
            facebook: {
                path: '/api/facebook',
                method: 'GET',
                description: 'Facebook video downloader',
                parameters: 'url (required) - Facebook video URL'
            },
            spotify: {
                path: '/api/spotify',
                method: 'GET',
                description: 'Spotify track downloader and metadata',
                parameters: 'url (required) - Spotify track URL, quality (optional: high, medium, low)'
            },
            social_media: {
                path: '/api/social/media',
                method: 'GET',
                description: 'Social media tools (Instagram, Facebook, Spotify support)',
                parameters: 'url (required), platform (optional: auto, instagram, facebook, spotify)'
            },
            download: {
                path: '/api/download',
                method: 'GET',
                description: 'Unified downloader for audio and video from multiple platforms',
                parameters: 'url (required), quality (optional), platform (optional: auto), type (optional: auto, audio, video)'
            },
            ai_chat: {
                path: '/api/ai/chat',
                method: 'GET',
                description: 'Multi-model AI chat endpoint',
                parameters: 'text (required), model (optional: auto, copilot, deepseek, gpt5)'
            }
        },
        features: [
            'AI Chat with multiple models (Deepseek, Copilot, GPT-5)',
            'Instagram video/photo downloader',
            'Facebook video downloader',
            'Spotify audio downloader',
            'Social media metadata extraction',
            'Unified audio/video download endpoint',
            'Server monitoring',
            'Rate limiting'
        ],
        rate_limiting: '2000 requests per minute per IP',
        documentation: 'Visit / on your browser for full documentation',
        media_support: {
            spotify: {
                formats: ['MP3 (High Quality)', 'Metadata extraction'],
                features: ['Track info', 'Album art', 'Artist info', 'Duration'],
                requirements: 'Public Spotify tracks only'
            },
            facebook: {
                formats: ['HD (720p+)', 'SD (360p+)'],
                max_duration: 'No limit',
                requirements: 'Public videos only'
            },
            instagram: {
                formats: ['Best available', 'Multiple qualities'],
                content_types: ['Reels', 'Posts', 'Stories', 'IGTV'],
                requirements: 'Public/Private (if logged in via API)'
            }
        }
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
            'GET /api/gpt5?text=your_message',
            'GET /api/instagram?url=instagram_url',
            'GET /api/facebook?url=facebook_url',
            'GET /api/spotify?url=spotify_url',
            'GET /api/social/media?url=social_media_url&platform=auto',
            'GET /api/download?url=media_url&quality=best',
            'GET /api/ai/chat?text=message&model=auto',
            'GET /api/health',
            'GET /api/info'
        ],
        timestamp: new Date().toISOString()
    })
})

module.exports = router
