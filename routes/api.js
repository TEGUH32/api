require('../config')

const express = require('express')
const router = express.Router()
const os = require('os')
const axios = require('axios')

// Helper Functions
const formatResponse = (status, message, data = null) => ({
    status,
    creator: global.creator,
    message,
    data,
    timestamp: new Date().toISOString()
})

const errorResponse = (res, message, statusCode = 500) => 
    res.status(statusCode).json({
        status: false,
        creator: global.creator,
        message,
        timestamp: new Date().toISOString()
    })

const successResponse = (res, message, data = null) => 
    res.status(200).json({
        status: true,
        creator: global.creator,
        message,
        data,
        timestamp: new Date().toISOString()
    })

const formatDuration = (ms) => {
    if (!ms) return '0:00'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const formatViews = (views) => {
    if (!views) return '0'
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M'
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K'
    return views.toString()
}

const parseYouTubeQuality = (quality) => {
    const qualityMap = {
        '144': '144p', '240': '240p', '360': '360p', '480': '480p',
        '720': '720p', '1080': '1080p', '1440': '1440p', '2160': '2160p'
    }
    return /^\d+$/.test(quality) ? qualityMap[quality] || quality + 'p' : quality
}

const validateYouTubeUrl = (url) => 
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i.test(url)

const validateThreadsUrl = (url) => 
    /(?:threads\.com|threads\.net)\/(?:@[\w\.]+|post\/[\w\-]+)/i.test(url) || 
    url.includes('threads.net') || 
    url.includes('threads.com')

const validateSpotifyUrl = (url) => 
    url.includes('open.spotify.com/track/') || url.includes('spotify.com/track/')

const validateInstagramUrl = (url) => url.includes('instagram.com')

const validateFacebookUrl = (url) => 
    url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')

const getVideoId = (url) => {
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)
    return match ? match[1] : null
}

const getSpotifyTrackId = (url) => {
    const match = url.match(/track\/([a-zA-Z0-9]+)/)
    return match ? match[1] : null
}

// Common Headers Configuration
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json'
}

// API Endpoints

// API Status
router.get('/status', (req, res) => {
    try {
        const totalMemory = os.totalmem()
        const freeMemory = os.freemem()
        const usedMemory = totalMemory - freeMemory
        const memoryUsagePercent = ((usedMemory / totalMemory) * 100).toFixed(2)

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

// Ping
router.get('/ping', (req, res) => 
    successResponse(res, 'Pong! Server is responsive')
)

// Threads Downloader
router.get('/threads', async (req, res) => {
    const url = req.query.url

    if (!url || url.trim() === '') {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'Query parameter "url" is required',
            timestamp: new Date().toISOString(),
            example: '/api/threads?url=https://www.threads.com/@mamanyahyaali/post/DOslYoXAVSs',
            note: 'Supports Threads post URLs'
        })
    }

    if (!validateThreadsUrl(url)) {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'URL must be a valid Threads link',
            timestamp: new Date().toISOString(),
            supported_formats: [
                'https://www.threads.com/@username/post/POST_ID',
                'https://threads.net/@username/post/POST_ID',
                'https://www.threads.net/@username/post/POST_ID'
            ],
            example_url: 'https://www.threads.com/@mamanyahyaali/post/DOslYoXAVSs'
        })
    }

    try {
        const startTime = Date.now()
        const cleanUrl = url.split('?')[0]
        
        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/threads?url=${encodeURIComponent(cleanUrl)}`, {
            timeout: 60000,
            headers: { ...headers, 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.threads.com/', 'Origin': 'https://www.threads.com' },
            validateStatus: status => status < 500
        })

        const processingTime = Date.now() - startTime
        
        if (response.status === 200) {
            const data = response.data
            const media = data.result?.media || []
            
            return res.status(200).json({
                status: data.status || true,
                status_code: data.status_code || 200,
                creator: global.creator,
                processing_time: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                result: {
                    media,
                    metadata: {
                        url_provided: url,
                        clean_url: cleanUrl,
                        total_media: media.length,
                        has_images: media.some(item => item.type === 'image'),
                        has_videos: media.some(item => item.type === 'video'),
                        media_types: [...new Set(media.map(item => item.type))]
                    }
                }
            })
        }

        return res.status(response.status).json({
            status: false,
            status_code: response.status,
            creator: global.creator,
            message: 'Threads API returned an error',
            processing_time: `${processingTime}ms`,
            timestamp: new Date().toISOString(),
            error: response.data?.message || 'Unknown error from external API',
            note: 'The Threads post might be unavailable, private, or the URL is invalid'
        })
    } catch (error) {
        console.error('Threads API error:', error.message)
        
        return res.status(200).json({
            status: false,
            status_code: 500,
            creator: global.creator,
            message: 'Failed to fetch Threads data',
            processing_time: '0ms',
            timestamp: new Date().toISOString(),
            error: error.message,
            note: 'Threads API may be experiencing issues or the post is unavailable',
            fallback_data: {
                media: [
                    { url: 'https://example.com/threads-sample-1.jpg', thumb: 'https://example.com/threads-sample-1.jpg', type: 'image' },
                    { url: 'https://example.com/threads-sample-2.jpg', thumb: 'https://example.com/threads-sample-2.jpg', type: 'image' }
                ],
                metadata: {
                    total_media: 2,
                    has_images: true,
                    has_videos: false,
                    media_types: ['image']
                }
            }
        })
    }
})

// Spotify Downloader
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

    if (!validateSpotifyUrl(url)) {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'URL must be a valid Spotify track link',
            timestamp: new Date().toISOString(),
            example_url: 'https://open.spotify.com/track/3k68kVFWTTBP0Jb4LOzCax'
        })
    }

    try {
        const startTime = Date.now()
        const trackId = getSpotifyTrackId(url)
        
        if (!trackId) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                creator: global.creator,
                message: 'Invalid Spotify track URL',
                timestamp: new Date().toISOString()
            })
        }

        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/spotify?url=${encodeURIComponent(url)}`, {
            timeout: 45000,
            headers: { ...headers, 'Referer': 'https://open.spotify.com/' },
            validateStatus: status => status < 500
        })

        const processingTime = Date.now() - startTime
        
        if (response.status === 200) {
            const data = response.data
            
            return res.status(200).json({
                status: data.status || true,
                status_code: data.status_code || 200,
                creator: global.creator,
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
        }

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
    } catch (error) {
        console.error('Spotify API error:', error.message)
        
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
            }
        })
    }
})

// YouTube Audio Downloader
router.get('/youtube/audio', async (req, res) => {
    const url = req.query.url
    const quality = req.query.quality || '128'

    if (!url || url.trim() === '') {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'Query parameter "url" is required',
            timestamp: new Date().toISOString(),
            example: '/api/youtube/audio?url=https://youtu.be/HWjCStB6k4o&quality=128'
        })
    }

    if (!validateYouTubeUrl(url)) {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'URL must be a valid YouTube link',
            timestamp: new Date().toISOString(),
            example_url: 'https://youtu.be/HWjCStB6k4o'
        })
    }

    try {
        const startTime = Date.now()
        const videoId = getVideoId(url)
        const validQualities = ['64', '128', '192', '256', '320']
        
        if (!validQualities.includes(quality)) {
            return res.status(400).json({
                status: false,
                status_code: 400,
                creator: global.creator,
                message: 'Invalid quality parameter',
                timestamp: new Date().toISOString(),
                valid_qualities: validQualities,
                default_quality: '128',
                note: 'Quality refers to audio bitrate in kbps'
            })
        }

        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/youtube/audio?url=${encodeURIComponent(url)}&quality=${quality}`, {
            timeout: 60000,
            headers: { ...headers, 'Referer': 'https://www.youtube.com/' },
            validateStatus: status => status < 500
        })

        const processingTime = Date.now() - startTime
        
        if (response.status === 200) {
            const data = response.data
            
            return res.status(200).json({
                status: data.status || true,
                status_code: data.status_code || 200,
                creator: global.creator,
                processing_time: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                result: {
                    status: data.result?.status || true,
                    creator: global.creator,
                    metadata: {
                        type: data.result?.metadata?.type || 'video',
                        videoId: data.result?.metadata?.videoId || videoId,
                        url: data.result?.metadata?.url || `https://youtube.com/watch?v=${videoId}`,
                        title: data.result?.metadata?.title || 'YouTube Video',
                        description: data.result?.metadata?.description || '',
                        image: data.result?.metadata?.image || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        thumbnail: data.result?.metadata?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        seconds: data.result?.metadata?.seconds || 0,
                        timestamp: data.result?.metadata?.timestamp || '0:00',
                        duration: {
                            seconds: data.result?.metadata?.duration?.seconds || data.result?.metadata?.seconds || 0,
                            timestamp: data.result?.metadata?.duration?.timestamp || data.result?.metadata?.timestamp || '0:00'
                        },
                        ago: data.result?.metadata?.ago || '',
                        views: data.result?.metadata?.views || 0,
                        views_formatted: formatViews(data.result?.metadata?.views || 0),
                        author: {
                            name: data.result?.metadata?.author?.name || 'Unknown Channel',
                            url: data.result?.metadata?.author?.url || ''
                        }
                    },
                    download: data.result?.download || {
                        status: data.result?.download?.status || true,
                        message: data.result?.download?.message || 'Audio download available',
                        quality: quality + 'kbps',
                        format: 'MP3',
                        size: data.result?.download?.size || 'unknown',
                        url: data.result?.download?.url || null
                    }
                }
            })
        }

        return res.status(response.status).json({
            status: false,
            status_code: response.status,
            creator: global.creator,
            message: 'YouTube Audio API returned an error',
            processing_time: `${processingTime}ms`,
            timestamp: new Date().toISOString(),
            error: response.data?.message || 'Unknown error from external API',
            video_id: videoId,
            note: 'The video might be unavailable, private, or restricted'
        })
    } catch (error) {
        console.error('YouTube Audio API error:', error.message)
        
        return res.status(200).json({
            status: false,
            status_code: 500,
            creator: global.creator,
            message: 'Failed to fetch YouTube audio data',
            processing_time: '0ms',
            timestamp: new Date().toISOString(),
            error: error.message
        })
    }
})

// YouTube Video Downloader
router.get('/youtube/video', async (req, res) => {
    const url = req.query.url
    const quality = req.query.quality || '360'

    if (!url || url.trim() === '') {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'Query parameter "url" is required',
            timestamp: new Date().toISOString(),
            example: '/api/youtube/video?url=https://youtu.be/HWjCStB6k4o&quality=360'
        })
    }

    if (!validateYouTubeUrl(url)) {
        return res.status(400).json({
            status: false,
            status_code: 400,
            creator: global.creator,
            message: 'URL must be a valid YouTube link',
            timestamp: new Date().toISOString(),
            example_url: 'https://youtu.be/HWjCStB6k4o'
        })
    }

    try {
        const startTime = Date.now()
        const videoId = getVideoId(url)
        const validQualities = ['144', '240', '360', '480', '720', '1080', '1440', '2160', 'best']
        const requestedQuality = parseYouTubeQuality(quality)
        
        if (!validQualities.includes(quality) && quality !== 'best') {
            return res.status(400).json({
                status: false,
                status_code: 400,
                creator: global.creator,
                message: 'Invalid quality parameter',
                timestamp: new Date().toISOString(),
                valid_qualities: validQualities,
                default_quality: '360',
                note: 'Quality refers to video resolution in pixels'
            })
        }

        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/youtube/video?url=${encodeURIComponent(url)}&quality=${quality}`, {
            timeout: 60000,
            headers: { ...headers, 'Referer': 'https://www.youtube.com/' },
            validateStatus: status => status < 500
        })

        const processingTime = Date.now() - startTime
        
        if (response.status === 200) {
            const data = response.data
            
            return res.status(200).json({
                status: data.status || true,
                status_code: data.status_code || 200,
                creator: global.creator,
                processing_time: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                result: {
                    status: data.result?.status || true,
                    creator: global.creator,
                    metadata: {
                        type: data.result?.metadata?.type || 'video',
                        videoId: data.result?.metadata?.videoId || videoId,
                        url: data.result?.metadata?.url || `https://youtube.com/watch?v=${videoId}`,
                        title: data.result?.metadata?.title || 'YouTube Video',
                        description: data.result?.metadata?.description || '',
                        image: data.result?.metadata?.image || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        thumbnail: data.result?.metadata?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        seconds: data.result?.metadata?.seconds || 0,
                        timestamp: data.result?.metadata?.timestamp || '0:00',
                        duration: {
                            seconds: data.result?.metadata?.duration?.seconds || data.result?.metadata?.seconds || 0,
                            timestamp: data.result?.metadata?.duration?.timestamp || data.result?.metadata?.timestamp || '0:00'
                        },
                        ago: data.result?.metadata?.ago || '',
                        views: data.result?.metadata?.views || 0,
                        views_formatted: formatViews(data.result?.metadata?.views || 0),
                        author: {
                            name: data.result?.metadata?.author?.name || 'Unknown Channel',
                            url: data.result?.metadata?.author?.url || ''
                        }
                    },
                    download: data.result?.download || {
                        status: data.result?.download?.status || true,
                        message: data.result?.download?.message || 'Video download available',
                        quality: requestedQuality,
                        format: 'MP4',
                        size: data.result?.download?.size || 'unknown',
                        url: data.result?.download?.url || null,
                        available_qualities: data.result?.download?.available_qualities || [requestedQuality]
                    }
                }
            })
        }

        return res.status(response.status).json({
            status: false,
            status_code: response.status,
            creator: global.creator,
            message: 'YouTube Video API returned an error',
            processing_time: `${processingTime}ms`,
            timestamp: new Date().toISOString(),
            error: response.data?.message || 'Unknown error from external API',
            video_id: videoId,
            note: 'The video might be unavailable, private, restricted, or the quality is not available'
        })
    } catch (error) {
        console.error('YouTube Video API error:', error.message)
        
        return res.status(200).json({
            status: false,
            status_code: 500,
            creator: global.creator,
            message: 'Failed to fetch YouTube video data',
            processing_time: '0ms',
            timestamp: new Date().toISOString(),
            error: error.message
        })
    }
})

// Deepseek AI
router.get('/deepseek', async (req, res) => {
    const q = req.query.q
    const model = req.query.model || 'deepseek-chat'

    if (!q || q.trim() === '') {
        return errorResponse(res, 'Query parameter "q" is required', 400)
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
        }
        return errorResponse(res, 'Deepseek API returned an error', response.status)
    } catch (error) {
        console.error('Deepseek API error:', error.message)
        
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

// Microsoft Copilot AI
router.get('/copilot', async (req, res) => {
    const text = req.query.text
    const model = req.query.model || 'copilot-default'

    if (!text || text.trim() === '') {
        return errorResponse(res, 'Query parameter "text" is required', 400)
    }

    try {
        const response = await axios.get(`https://api.yupra.my.id/api/ai/copilot?text=${encodeURIComponent(text)}`, {
            timeout: 30000,
            headers
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
        }
        return errorResponse(res, 'Copilot API returned an error', response.status)
    } catch (error) {
        console.error('Copilot API error:', error.message)
        
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

// GPT-5 AI
router.get('/gpt5', async (req, res) => {
    const text = req.query.text
    const model = req.query.model || 'gpt-5-smart'

    if (!text || text.trim() === '') {
        return errorResponse(res, 'Query parameter "text" is required', 400)
    }

    try {
        const response = await axios.get(`https://api.yupra.my.id/api/ai/gpt5?text=${encodeURIComponent(text)}`, {
            timeout: 30000,
            headers
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
        }
        return errorResponse(res, 'GPT-5 API returned an error', response.status)
    } catch (error) {
        console.error('GPT-5 API error:', error.message)
        
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

// Instagram Downloader
router.get('/instagram', async (req, res) => {
    const url = req.query.url

    if (!url || url.trim() === '') {
        return errorResponse(res, 'Query parameter "url" is required', 400)
    }

    if (!validateInstagramUrl(url)) {
        return errorResponse(res, 'URL must be a valid Instagram link', 400)
    }

    try {
        const startTime = Date.now()
        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/instagram?url=${encodeURIComponent(url)}`, {
            timeout: 30000,
            headers: { ...headers, 'Referer': 'https://www.instagram.com/' }
        })

        if (response.status === 200) {
            const data = response.data
            const processingTime = Date.now() - startTime
            
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
        }
        return errorResponse(res, 'Instagram API returned an error', response.status)
    } catch (error) {
        console.error('Instagram API error:', error.message)
        return errorResponse(res, 'Failed to fetch Instagram data')
    }
})

// Facebook Downloader
router.get('/facebook', async (req, res) => {
    const url = req.query.url

    if (!url || url.trim() === '') {
        return errorResponse(res, 'Query parameter "url" is required', 400)
    }

    if (!validateFacebookUrl(url)) {
        return errorResponse(res, 'URL must be a valid Facebook link', 400)
    }

    try {
        const startTime = Date.now()
        const response = await axios.get(`https://api.vreden.my.id/api/v1/download/facebook?url=${encodeURIComponent(url)}`, {
            timeout: 45000,
            headers: { ...headers, 'Referer': 'https://www.facebook.com/' },
            validateStatus: status => status < 500
        })

        const processingTime = Date.now() - startTime
        
        if (response.status === 200) {
            const data = response.data
            
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
                    download: data.result?.download || { hd: null, sd: null, audio: null },
                    metadata: {
                        url_provided: url,
                        has_hd: !!data.result?.download?.hd,
                        has_sd: !!data.result?.download?.sd,
                        duration_formatted: data.result?.durasi || 'unknown',
                        video_type: data.result?.title?.includes('Video') ? 'video' : 'post'
                    }
                }
            })
        }

        return res.status(response.status).json({
            status: false,
            status_code: response.status,
            creator: global.creator,
            message: 'Facebook API returned an error',
            processing_time: `${processingTime}ms`,
            timestamp: new Date().toISOString(),
            error: response.data?.message || 'Unknown error from external API'
        })
    } catch (error) {
        console.error('Facebook API error:', error.message)
        return errorResponse(res, 'Failed to fetch Facebook data')
    }
})

// Advanced AI Chat
router.get('/ai/chat', async (req, res) => {
    const { text, model = 'auto' } = req.query

    if (!text || text.trim() === '') {
        return errorResponse(res, 'Query parameter "text" is required', 400)
    }

    try {
        let aiResponse
        let selectedModel = model

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

// Social Media Tools
router.get('/social/media', async (req, res) => {
    const { url, platform = 'auto', type = 'auto' } = req.query

    if (!url || url.trim() === '') {
        return errorResponse(res, 'Query parameter "url" is required', 400)
    }

    try {
        let result
        let detectedPlatform = platform
        let detectedType = type

        if (platform === 'auto') {
            if (url.includes('instagram.com')) {
                detectedPlatform = 'instagram'
                detectedType = 'video'
            } else if (validateFacebookUrl(url)) {
                detectedPlatform = 'facebook'
                detectedType = 'video'
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                detectedPlatform = 'youtube'
                detectedType = type === 'auto' ? 'video' : type
            } else if (validateSpotifyUrl(url)) {
                detectedPlatform = 'spotify'
                detectedType = 'audio'
            } else if (validateThreadsUrl(url)) {
                detectedPlatform = 'threads'
                detectedType = 'image'
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
        } else if (detectedPlatform === 'youtube') {
            if (detectedType === 'audio') {
                const response = await axios.get(`https://api.vreden.my.id/api/v1/download/youtube/audio?url=${encodeURIComponent(url)}&quality=128`, {
                    timeout: 60000
                })
                result = response.data
            } else {
                const response = await axios.get(`https://api.vreden.my.id/api/v1/download/youtube/video?url=${encodeURIComponent(url)}&quality=360`, {
                    timeout: 60000
                })
                result = response.data
            }
        } else if (detectedPlatform === 'threads') {
            const response = await axios.get(`https://api.vreden.my.id/api/v1/download/threads?url=${encodeURIComponent(url)}`, {
                timeout: 60000
            })
            result = response.data
        } else {
            return errorResponse(res, `Platform '${detectedPlatform}' is not supported yet. Currently supported: Instagram, Facebook, Spotify, YouTube, Threads.`, 400)
        }

        return successResponse(res, `${detectedPlatform} ${detectedType} data fetched successfully`, {
            platform: detectedPlatform,
            content_type: detectedType,
            url: url,
            result: result.result || result
        })
    } catch (error) {
        console.error('Social Media endpoint error:', error.message)
        return errorResponse(res, 'Failed to fetch social media data')
    }
})

// Unified Downloader
router.get('/download', async (req, res) => {
    const { url, quality = 'best', platform = 'auto', type = 'auto' } = req.query

    if (!url || url.trim() === '') {
        return errorResponse(res, 'Query parameter "url" is required', 400)
    }

    try {
        let result
        let detectedPlatform = platform
        let detectedType = type

        if (platform === 'auto') {
            if (url.includes('instagram.com')) {
                detectedPlatform = 'instagram'
                detectedType = 'video'
            } else if (validateFacebookUrl(url)) {
                detectedPlatform = 'facebook'
                detectedType = 'video'
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                detectedPlatform = 'youtube'
                detectedType = type === 'auto' ? 'video' : type
            } else if (validateSpotifyUrl(url)) {
                detectedPlatform = 'spotify'
                detectedType = 'audio'
            } else if (validateThreadsUrl(url)) {
                detectedPlatform = 'threads'
                detectedType = 'image'
            } else {
                detectedPlatform = 'unknown'
            }
        }

        const startTime = Date.now()
        
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
        } else if (detectedPlatform === 'youtube') {
            if (detectedType === 'audio') {
                const audioQuality = quality === 'best' ? '128' : quality
                const response = await axios.get(`https://api.vreden.my.id/api/v1/download/youtube/audio?url=${encodeURIComponent(url)}&quality=${audioQuality}`, {
                    timeout: 60000
                })
                result = response.data
            } else {
                const videoQuality = quality === 'best' ? '360' : quality
                const response = await axios.get(`https://api.vreden.my.id/api/v1/download/youtube/video?url=${encodeURIComponent(url)}&quality=${videoQuality}`, {
                    timeout: 60000
                })
                result = response.data
            }
        } else if (detectedPlatform === 'threads') {
            const response = await axios.get(`https://api.vreden.my.id/api/v1/download/threads?url=${encodeURIComponent(url)}`, {
                timeout: 60000
            })
            result = response.data
        } else {
            return errorResponse(res, `Platform '${detectedPlatform}' is not supported. Currently supported: Instagram, Facebook, Spotify, YouTube, Threads.`, 400)
        }

        const processingTime = Date.now() - startTime
        
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
            result: result.result || result
        })
    } catch (error) {
        console.error('Download endpoint error:', error.message)
        return errorResponse(res, `Failed to fetch data from ${platform}`)
    }
})

// Health Check
router.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        endpoints: {
            total: 15,
            available: [
                '/api/status',
                '/api/ping',
                '/api/deepseek',
                '/api/copilot',
                '/api/gpt5',
                '/api/instagram',
                '/api/facebook',
                '/api/spotify',
                '/api/youtube/audio',
                '/api/youtube/video',
                '/api/threads',
                '/api/social/media',
                '/api/download',
                '/api/ai/chat'
            ]
        },
        services: {
            ai_models: ['Deepseek', 'Copilot', 'GPT-5'],
            downloaders: ['Instagram', 'Facebook', 'Spotify', 'YouTube Audio', 'YouTube Video', 'Threads'],
            status: 'operational'
        },
        rate_limit: {
            window: '1 minute',
            max_requests: 2000
        }
    }

    return res.status(200).json(healthData)
})

// API Information
router.get('/info', (req, res) => {
    const apiInfo = {
        name: 'API Teguh - Advanced REST API Server',
        version: '3.6.0',
        creator: global.creator,
        description: 'Multi-model AI API server with social media, audio, and video download tools',
        endpoints: {
            status: { path: '/api/status', method: 'GET', description: 'Get server status and system information' },
            ping: { path: '/api/ping', method: 'GET', description: 'Simple health check endpoint' },
            deepseek: { path: '/api/deepseek', method: 'GET', description: 'Deepseek AI chat endpoint' },
            copilot: { path: '/api/copilot', method: 'GET', description: 'Microsoft Copilot AI endpoint' },
            gpt5: { path: '/api/gpt5', method: 'GET', description: 'GPT-5 AI endpoint' },
            instagram: { path: '/api/instagram', method: 'GET', description: 'Instagram downloader and metadata' },
            facebook: { path: '/api/facebook', method: 'GET', description: 'Facebook video downloader' },
            spotify: { path: '/api/spotify', method: 'GET', description: 'Spotify track downloader and metadata' },
            youtube_audio: { path: '/api/youtube/audio', method: 'GET', description: 'YouTube audio downloader (MP3)' },
            youtube_video: { path: '/api/youtube/video', method: 'GET', description: 'YouTube video downloader (MP4)' },
            threads: { path: '/api/threads', method: 'GET', description: 'Threads posts downloader (images)' },
            social_media: { path: '/api/social/media', method: 'GET', description: 'Social media tools' },
            download: { path: '/api/download', method: 'GET', description: 'Unified downloader for audio, video, and images' },
            ai_chat: { path: '/api/ai/chat', method: 'GET', description: 'Multi-model AI chat endpoint' }
        },
        features: [
            'AI Chat with multiple models (Deepseek, Copilot, GPT-5)',
            'Instagram video/photo downloader',
            'Facebook video downloader',
            'Spotify audio downloader',
            'YouTube audio downloader (MP3)',
            'YouTube video downloader (MP4)',
            'Threads images downloader',
            'Social media metadata extraction',
            'Unified audio/video/image download endpoint',
            'Server monitoring'
        ],
        rate_limiting: '2000 requests per minute per IP'
    }

    return successResponse(res, 'API information retrieved successfully', apiInfo)
})

// Catch-all for undefined routes
router.all('*', (req, res) => 
    res.status(404).json({
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
            'GET /api/youtube/audio?url=youtube_url&quality=128',
            'GET /api/youtube/video?url=youtube_url&quality=360',
            'GET /api/threads?url=threads_url',
            'GET /api/social/media?url=social_media_url&platform=auto',
            'GET /api/download?url=media_url&quality=best',
            'GET /api/ai/chat?text=message&model=auto',
            'GET /api/health',
            'GET /api/info'
        ],
        timestamp: new Date().toISOString()
    })
)

module.exports = router
