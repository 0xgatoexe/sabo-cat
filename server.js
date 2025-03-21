const express = require('express');
const fetch = require('node-fetch');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const wss = new WebSocket.Server({ server });

const coins1 = ["solana", "bittensor", "render-token"]; // Note: "render-network" might need to be "render-token"
const coins2 = ["bitcoin", "ethereum", "ripple", "binancecoin", "solana", "dogecoin"]; // Adjusted for CoinGecko IDs

let fgDataPoints1 = [];
let fgDataPoints2 = [];
let prevPrices1 = {};
let prevPrices2 = [];
let leaderboard = [];

async function loadData() {
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;
    const points = 120;

    if (fgDataPoints1.length === 0) {
        console.log('Preloading fgDataPoints1 with 1 hour of simulated data');
        let currentValue = 50;
        for (let i = 0; i < points; i++) {
            const time = oneHourAgo + i * 30;
            currentValue += Math.random() > 0.5 ? 2 : -2;
            currentValue = Math.max(0, Math.min(100, currentValue));
            fgDataPoints1.push({ time, value: Math.round(currentValue), volume: Math.floor(Math.random() * 1000) });
        }
    }

    if (fgDataPoints2.length === 0) {
        console.log('Preloading fgDataPoints2 with 1 hour of simulated data');
        let currentValue = 50;
        for (let i = 0; i < points; i++) {
            const time = oneHourAgo + i * 30;
            currentValue += Math.random() > 0.5 ? 2 : -2;
            currentValue = Math.max(0, Math.min(100, currentValue));
            fgDataPoints2.push({ time, value: Math.round(currentValue), volume: Math.floor(Math.random() * 1000) });
        }
    }
}

async function updateData() {
    console.log('Starting updateData at', new Date().toISOString());
    const url1 = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coins1.join(",")}`;
    const url2 = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coins2.join(",")}`;

    try {
        const now = Date.now() / 1000;
        const estTimestamp = Math.floor(now / 30) * 30;

        const res1 = await fetch(url1);
        const data1 = await res1.json();
        let numUp1 = 0, numDown1 = 0, totalVolume1 = 0;
        for (let coin of data1) {
            let price = coin.current_price;
            let volume = coin.total_volume; // Fetch real volume
            totalVolume1 += volume;
            if (prevPrices1[coin.id] !== undefined) {
                if (price > prevPrices1[coin.id]) numUp1++;
                else if (price < prevPrices1[coin.id]) numDown1++;
            }
            prevPrices1[coin.id] = price;
        }
        let fgScore1 = fgDataPoints1.length > 0 ? fgDataPoints1[fgDataPoints1.length - 1].value : 50;
        if (numUp1 > numDown1) fgScore1 = Math.min(100, fgScore1 + 2);
        else if (numDown1 > numUp1) fgScore1 = Math.max(0, fgScore1 - 2);
        fgDataPoints1.push({ time: estTimestamp, value: fgScore1, volume: totalVolume1 });
        fgDataPoints1 = fgDataPoints1.filter(p => p.time >= now - 36000);

        const res2 = await fetch(url2);
        const data2 = await res2.json();
        let numUp2 = 0, numDown2 = 0, totalVolume2 = 0;
        for (let coin of data2) {
            let price = coin.current_price;
            let volume = coin.total_volume; // Fetch real volume
            totalVolume2 += volume;
            if (prevPrices2[coin.id] !== undefined) {
                if (price > prevPrices2[coin.id]) numUp2++;
                else if (price < prevPrices2[coin.id]) numDown2++;
            }
            prevPrices2[coin.id] = price;
        }
        let fgScore2 = fgDataPoints2.length > 0 ? fgDataPoints2[fgDataPoints2.length - 1].value : 50;
        if (numUp2 > numDown2) fgScore2 = Math.min(100, fgScore2 + 2);
        else if (numDown2 > numUp2) fgScore2 = Math.max(0, fgScore2 - 2);
        fgDataPoints2.push({ time: estTimestamp, value: fgScore2, volume: totalVolume2 });
        fgDataPoints2 = fgDataPoints2.filter(p => p.time >= now - 36000);

        console.log(`Broadcasting to ${wss.clients.size} clients`);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ fgDataPoints1, fgDataPoints2, leaderboard: getTop10Leaderboard() }));
            }
        });
    } catch (error) {
        console.error('Error updating data:', error);
    }
}

// Rest of your server.js remains unchanged...

function updateLeaderboard(userId, clicks) {
    const existing = leaderboard.find(entry => entry.id === userId);
    if (existing) {
        existing.clicks = clicks;
    } else {
        leaderboard.push({ id: userId, clicks });
    }
    leaderboard.sort((a, b) => b.clicks - a.clicks);
}

function getTop10Leaderboard() {
    return leaderboard.slice(0, 10);
}

app.get('/api/chart1', (req, res) => res.json(fgDataPoints1));
app.get('/api/chart2', (req, res) => res.json(fgDataPoints2));
app.get('/data', (req, res) => res.json({ fgDataPoints1, fgDataPoints2, leaderboard: getTop10Leaderboard() }));

app.post('/api/click', express.json(), (req, res) => {
    const { userId, clicks } = req.body;
    console.log('Received click update:', { userId, clicks }); // Debug log
    if (userId && typeof clicks === 'number') {
        updateLeaderboard(userId, clicks);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ leaderboard: getTop10Leaderboard() }));
            }
        });
        res.status(200).json({ success: true });
    } else {
        res.status(400).json({ error: 'Invalid request' });
    }
});

app.use(express.static('public'));

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    ws.send(JSON.stringify({ fgDataPoints1, fgDataPoints2, leaderboard: getTop10Leaderboard() }));
});

async function startServer() {
    await loadData();
    setInterval(updateData, 30000);
    updateData();
}

startServer();