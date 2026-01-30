const axios = require('axios')
const cheerio = require('cheerio')

const headers = {
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
'Accept-Language': 'en-US,en;q=0.9',
'Cache-Control': 'no-cache',
'Pragma': 'no-cache',
'Referer': 'https://melolo.com/'
}

async function melolohome() {
const get = await axios.get('https://melolo.com', { headers })
const $ = cheerio.load(get.data)
const data = []
const seen = new Set()

const push = v => {
if (v.url && !seen.has(v.url)) {
seen.add(v.url)
data.push(v)
}
}

$('div.min-w-82').each((_, e) => {
const t = $(e).find('a[href^="https://melolo.com/dramas/"][class*="font-bold"]')
if (!t.length) return
push({
type: 'banner',
title: t.text().trim(),
url: t.attr('href'),
image: $(e).find('img').last().attr('src') || $(e).find('img').last().attr('data-src'),
description: $(e).find('div[class*="opacity-80"]').text().trim(),
category: $(e).find('a[href^="https://melolo.com/category/"]').text().trim()
})
})

$('div.bg-white.rounded-xl').each((_, e) => {
const t = $(e).find('a.text-Title')
if (!t.length) return
push({
type: 'list',
title: t.text().trim(),
url: t.attr('href'),
image: $(e).find('img').attr('src') || $(e).find('img').attr('data-src'),
description: $(e).find('.text-slate-500').first().text().trim(),
rating: $(e).find('.text-orange-500.font-bold').text().trim(),
episodes: $(e).find('.text-slate-500.font-medium').text().trim(),
category: $(e).find('a[href^="https://melolo.com/category/"]').text().trim()
})
})

$('div.min-w-45').each((_, e) => {
const t = $(e).find('a.text-Title')
if (!t.length) return
push({
type: 'card',
title: t.text().trim(),
url: t.attr('href'),
image: $(e).find('img').attr('src') || $(e).find('img').attr('data-src'),
rating: $(e).find('.bg-yellow-bg .text-text-blue').text().trim(),
episodes: $(e).find('.text-Text').text().trim()
})
})

return data
}

async function melolosearch(query) {
const get = await axios.get(`https://melolo.com/search?q=${encodeURIComponent(query)}`,
{ headers }
)

const $ = cheerio.load(get.data)
const data = []

$('.grid > div').each((_, e) => {
const t = $(e).find('a.text-Title')
if (!t.length) return

const info = $(e).find('.text-Text').text().trim()
const eps = info.split('·')[0]?.replace(/Eps?/i, '').trim() || null
const cat = $(e).find('.text-Text a').text().trim() || null

data.push({
title: t.text().trim(),
url: 'https://melolo.com' + t.attr('href'),
image: $(e).find('img').attr('src') || $(e).find('img').attr('data-src'),
rating: $(e).find('.bg-yellow-bg').text().trim() || null,
episodes: eps,
category: cat
})
})

return data
}

async function melolodetail(url) {
const get = await axios.get(url, { headers })
const html = get.data

const data = {
title: null,
description: null,
cover_image: null,
genres: [],
rating: null,
total_episodes: 0
}

const ld = /<script type="application\/ld\+json">(.*?)<\/script>/gs
let m
while ((m = ld.exec(html)) !== null) {
try {
const j = JSON.parse(m[1])
if (j.name) data.title = j.name
if (j.description) data.description = j.description
if (j.image) data.cover_image = j.image
if (j.genre) data.genres = [].concat(j.genre)
if (j.numberOfEpisodes) data.total_episodes = j.numberOfEpisodes
} catch {}
}

return data
}

async function melolodl(url) {
const get = await axios.get(url, { headers })
const html = get.data

const title = html.match(/<title>(.*?)<\/title>/)?.[1]?.split('|')[0].trim() || 'unknown'

let episodes = []
const m = html.match(/\\"episode_list\\":(\[.*?\])/)

if (m?.[1]) {
try {
episodes = JSON.parse(m[1].replace(/\\"/g, '"'))
} catch {
const r = /"episode_id":(\d+),"url":"(.*?)"/g
let x
while ((x = r.exec(m[1])) !== null) episodes.push({ episode_id: +x[1], url: x[2] })
}
} else {
const r = /"episode_id":(\d+),"url":"(https:[^"]+)"/g
let x
while ((x = r.exec(html)) !== null) episodes.push({ episode_id: +x[1], url: x[2] })
episodes = [...new Map(episodes.map(v => [v.episode_id, v])).values()]
}

if (!episodes.length) throw new Error('episode not found')

return {
title,
total_episodes: episodes.length,
episodes
}
}

async function melolocategory(url) {
const get = await axios.get(url, { headers })
const $ = cheerio.load(get.data)
const data = {}

$('h2').each((_, h) => {
const name = $(h).text().trim()
const box = $(h).closest('a').next('div')
const list = []
box.find('div.relative').each((_, d) => {
const a = $(d).find('a').first()
const title = a.text().trim()
if (!title) return
const href = a.attr('href')
list.push({
title,
url: href?.startsWith('http') ? href : 'https://melolo.com' + href,
image: $(d).find('img').attr('src') || $(d).find('img').attr('data-src'),
rating: $(d).find('svg.lucide-star').parent().text().trim(),
episodes: $(d).find('div.text-Text').text().trim()
})
})
if (list.length) data[name] = list
})

if (!Object.keys(data).length) {
const list = []
$('div.grid div.relative').each((_, d) => {
const a = $(d).find('a').first()
const title = a.text().trim()
if (!title) return
const href = a.attr('href')
list.push({
title,
url: href?.startsWith('http') ? href : 'https://melolo.com' + href,
image: $(d).find('img').attr('src') || $(d).find('img').attr('data-src'),
rating: $(d).find('svg.lucide-star').parent().text().trim(),
episodes: $(d).find('div.text-Text').text().trim()
})
})
data[$('h1').text().trim() || 'Dramas'] = list
}

return data
}

melolodl('https://melolo.com/dramas/becoming-the-wolf')
.then(console.log)
.catch(console.error)
/*
Usage
melolo category
melolocategory('https://melolo.com/category/fantasy')
.then(console.log)
.catch(console.error)

melolo home
melolocategory('')
.then(console.log)
.catch(console.error)

melolo dl
melolodl('https://melolo.com/dramas/becoming-the-wolf')
.then(console.log)
.catch(console.error)

melolo detail
melolodetail('https://melolo.com/dramas/becoming-the-wolf')
.then(console.log)
.catch(console.error)

melolo search
melolosearch('ceo')
.then(console.log)
.catch(console.error)

How to download with curl
curl -L \
  'https://v.melolo.com/36234c29vodtranssgp1318177724/abd711811397757898894157019/v.f101303.mp4?sign=1769523706-lqpxgR36Q36eyKLeNc8XxHmKE4wQihIhmoC2k7fvojb9CLfNdzv2xNoC8LTajNZiiisucAcLPDDizb6MQQPpYDoTfa0l-0-37e9eb616efc174a83242c9e6160fde3' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Cache-Control: no-cache' \
  -H 'Pragma: no-cache' \
  -H 'Referer: https://melolo.com/' \
  -o zenn.mp4
*/

