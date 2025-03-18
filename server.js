const express = require('express');
const fetch = require('node-fetch');
const WebSocket = require('ws');
const fs = require('fs').promises;

const app = express();
const server = app.listen(3000, () => console.log('Server running on port 3000'));
const wss = new WebSocket.Server({ server }); // Use the same server as Express

const coins1 = ["solana", "bittensor", "render-network"];
const coins2 = ["bitcoin", "ethereum", "ripple", "binance-coin", "solana", "dogecoin"];

let fgDataPoints1 = [];
let fgDataPoints2 = [];
let prevPrices1 = {};
let prevPrices2 = {};

async function loadData() {
    try {
        const data1 = await fs.readFile('fgDataPoints1.json', 'utf8');
        fgDataPoints1 = JSON.parse(data1);
        console.log('Loaded fgDataPoints1 from file:', fgDataPoints1.length);
    } catch (err) {
        console.log('No initial fgDataPoints1 found, starting fresh');
    }
    try {
        const data2 = await fs.readFile('fgDataPoints2.json', 'utf8');
        fgDataPoints2 = JSON.parse(data2);
        console.log('Loaded fgDataPoints2 from file:', fgDataPoints2.length);
    } catch (err) {
        console.log('No initial fgDataPoints2 found, starting fresh');
    }

    // Ensure 10 hours of data (1200 points at 30s intervals)
    const now = Math.floor(Date.now() / 1000);
    const tenHoursAgo = now - 36000; // 10 hours in seconds
    if (fgDataPoints1.length < 1200 || fgDataPoints1[0].time > tenHoursAgo) {
        console.log('Preloading 10 hours for fgDataPoints1');
        fgDataPoints1 = [];
        for (let i = 0; i < 1200; i++) {
            const time = now - (1199 - i) * 30;
            fgDataPoints1.push({ time, value: 50 }); // Start at neutral 50
        }
    }
    if (fgDataPoints2.length < 1200 || fgDataPoints2[0].time > tenHoursAgo) {
        console.log('Preloading 10 hours for fgDataPoints2');
        fgDataPoints2 = [];
        for (let i = 0; i < 1200; i++) {
            const time = now - (1199 - i) * 30;
            fgDataPoints2.push({ time, value: 50 }); // Start at neutral 50
        }
    }
}

async function saveData() {
    // Trim to last 10 hours to avoid infinite growth
    const tenHoursAgo = Math.floor(Date.now() / 1000) - 36000;
    fgDataPoints1 = fgDataPoints1.filter(point => point.time >= tenHoursAgo);
    fgDataPoints2 = fgDataPoints2.filter(point => point.time >= tenHoursAgo);
    await fs.writeFile('fgDataPoints1.json', JSON.stringify(fgDataPoints1));
    await fs.writeFile('fgDataPoints2.json', JSON.stringify(fgDataPoints2));
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

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ fgDataPoints1, fgDataPoints2 }));
            }
        });

        if (Math.floor(now / 60) % 60 === 0) {
            await saveData();
        }

        console.log(`Updated data at ${new Date(estTimestamp * 1000).toISOString()}: Chart 1 - ${fgScore1}, Chart 2 - ${fgScore2}`);
    } catch (error) {
        console.error('Error updating data:', error);
    }
}

app.get('/data', (req, res) => {
    res.json({ fgDataPoints1, fgDataPoints2 });
});

app.use(express.static('public'));

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ fgDataPoints1, fgDataPoints2 })); // Send initial data on connect
});

async function startServer() {
    await loadData();
    setInterval(updateData, 30000);
    updateData();
}

startServer();