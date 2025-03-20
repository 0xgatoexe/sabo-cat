const express = require('express');
const fetch = require('node-fetch');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const wss = new WebSocket.Server({ server });

const coins1 = ["solana", "bittensor", "render-network"];
const coins2 = ["bitcoin", "ethereum", "ripple", "binance-coin", "solana", "dogecoin"];

let fgDataPoints1 = [];
let fgDataPoints2 = [];
let prevPrices1 = {};
let prevPrices2 = {};
let leaderboard = []; // Array to store { id, clicks }

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
            fgDataPoints1.push({ time, value: Math.round(currentValue) });
        }
    }

    if (fgDataPoints2.length === 0) {
        console.log('Preloading fgDataPoints2 with 1 hour of simulated data');
        let currentValue = 50;
        for (let i = 0; i < points; i++) {
            const time = oneHourAgo + i * 30;
            currentValue += Math.random() > 0.5 ? 2 : -2;
            currentValue = Math.max(0, Math.min(100, currentValue));
            fgDataPoints2.push({ time, value: Math.round(currentValue) });
        }
    }
}

async function updateData() {
    console.log('Starting updateData at', new Date().toISOString());
    const url1 = `https://api.coingecko.com/api/v3/simple/price?ids=${coins1.join(",")}&vs_currencies=usd`;
    const url2 = `https://api.coingecko.com/api/v3/simple/price?ids=${coins2.join(",")}&vs_currencies=usd`;

    try {
        const res1 = await fetch(url1);
        const data1 = await res1.json();
        const now = Date.now() / 1000;
        const estTimestamp = Math.floor(now / 30) * 30;
        let numUp1 = 0, numDown1 = 0;
        for (let coin of coins1) {
            if (data1[coin] && data1[coin].usd !== undefined) {
                let price = data1[coin].usd;
                if (prevPrices1[coin] !== undefined) {
                    if (price > prevPrices1[coin]) numUp1++;
                    else if (price < prevPrices1[coin]) numDown1++;
                }
                prevPrices1[coin] = price;
            }
        }
        let fgScore1 = fgDataPoints1.length > 0 ? fgDataPoints1[fgDataPoints1.length - 1].value : 50;
        if (numUp1 > numDown1) fgScore1 = Math.min(100, fgScore1 + 2);
        else if (numDown1 > numUp1) fgScore1 = Math.max(0, fgScore1 - 2);
        fgDataPoints1.push({ time: estTimestamp, value: fgScore1 });
        fgDataPoints1 = fgDataPoints1.filter(p => p.time >= now - 36000);

        const res2 = await fetch(url2);
        const data2 = await res2.json();
        let numUp2 = 0, numDown2 = 0;
        for (let coin of coins2) {
            if (data2[coin] && data2[coin].usd !== undefined) {
                let price = data2[coin].usd;
                if (prevPrices2[coin] !== undefined) {
                    if (price > prevPrices2[coin]) numUp2++;
                    else if (price < prevPrices2[coin]) numDown2++;
                }
                prevPrices2[coin] = price;
            }
        }
        let fgScore2 = fgDataPoints2.length > 0 ? fgDataPoints2[fgDataPoints2.length - 1].value : 50;
        if (numUp2 > numDown2) fgScore2 = Math.min(100, fgScore2 + 2);
        else if (numDown2 > numUp2) fgScore2 = Math.max(0, fgScore2 - 2);
        fgDataPoints2.push({ time: estTimestamp, value: fgScore2 });
        fgDataPoints2 = fgDataPoints2.filter(p => p.time >= now - 36000);

        console.log(`Broadcasting to ${wss.clients.size} clients`);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ fgDataPoints1, fgDataPoints2, leaderboard: getTop10Leaderboard() }));
            }
        });

        console.log(`Updated data at ${new Date(estTimestamp * 1000).toISOString()}: Chart 1 - ${fgScore1}, Chart 2 - ${fgScore2}`);
    } catch (error) {
        console.error('Error updating data:', error);
    }
}

// Leaderboard functions
function updateLeaderboard(userId, clicks) {
    const existing = leaderboard.find(entry => entry.id === userId);
    if (existing) {
        existing.clicks = clicks;
    } else {
        leaderboard.push({ id: userId, clicks });
    }
    leaderboard.sort((a, b) => b.clicks - a.clicks); // Sort descending by clicks
}

function getTop10Leaderboard() {
    return leaderboard.slice(0, 10); // Return top 10
}

// Endpoints
app.get('/api/chart1', (req, res) => res.json(fgDataPoints1));
app.get('/api/chart2', (req, res) => res.json(fgDataPoints2));
app.get('/data', (req, res) => res.json({ fgDataPoints1, fgDataPoints2, leaderboard: getTop10Leaderboard() }));

// New endpoint to update clicks
app.post('/api/click', express.json(), (req, res) => {
    const { userId, clicks } = req.body;
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