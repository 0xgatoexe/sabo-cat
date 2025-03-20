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

async function loadData() {
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600; // 1 hour = 3600 seconds
    const points = 120; // 1 hour at 30-second intervals

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
        fgDataPoints1 = fgDataPoints1.filter(p => p.time >= now - 36000); // Keep 10 hours max

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
        fgDataPoints2 = fgDataPoints2.filter(p => p.time >= now - 36000); // Keep 10 hours max

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ fgDataPoints1, fgDataPoints2 }));
            }
        });

        console.log(`Updated data at ${new Date(estTimestamp * 1000).toISOString()}: Chart 1 - ${fgScore1}, Chart 2 - ${fgScore2}`);
    } catch (error) {
        console.error('Error updating data:', error);
    }
}

app.get('/api/chart1', (req, res) => res.json(fgDataPoints1));
app.get('/api/chart2', (req, res) => res.json(fgDataPoints2));
app.get('/data', (req, res) => res.json({ fgDataPoints1, fgDataPoints2 }));

app.use(express.static('public'));

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ fgDataPoints1, fgDataPoints2 }));
});

async function startServer() {
    await loadData();
    setInterval(updateData, 30000);
    updateData();
}

startServer();