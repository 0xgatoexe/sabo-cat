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
        const [res1, res2] = await Promise.all([
            fetch(url1).then(res => res.json()),
            fetch(url2).then(res => res.json())
        ]);

        const now = Date.now() / 1000;
        const estTimestamp = Math.floor(now / 30) * 30;

        // Update Chart 1
        let numUp1 = 0, numDown1 = 0;
        for (let coin of coins1) {
            if (res1[coin] && res1[coin].usd !== undefined) {
                let price = res1[coin].usd;
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

        // Update Chart 2
        let numUp2 = 0, numDown2 = 0;
        for (let coin of coins2) {
            if (res2[coin] && res2[coin].usd !== undefined) {
                let price = res2[coin].usd;
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

        // Broadcast to clients
        console.log(`Broadcasting to ${wss.clients.size} clients`);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ fgDataPoints1, fgDataPoints2, leaderboard: getTop10Leaderboard() }));
            }
        });

        console.log(`Updated data at ${new Date(estTimestamp * 1000).toISOString()}: Chart 1 - ${fgScore1}, Chart 2 - ${fgScore2}`);
    } catch (error) {
        console.error('Error updating data:', error);
        // Simulate data if API fails to ensure continuity
        const now = Date.now() / 1000;
        const estTimestamp = Math.floor(now / 30) * 30;
        let fgScore1 = fgDataPoints1.length > 0 ? fgDataPoints1[fgDataPoints1.length - 1].value : 50;
        let fgScore2 = fgDataPoints2.length > 0 ? fgDataPoints2[fgDataPoints2.length - 1].value : 50;
        fgScore1 += Math.random() > 0.5 ? 2 : -2;
        fgScore2 += Math.random() > 0.5 ? 2 : -2;
        fgScore1 = Math.max(0, Math.min(100, fgScore1));
        fgScore2 = Math.max(0, Math.min(100, fgScore2));
        fgDataPoints1.push({ time: estTimestamp, value: fgScore1 });
        fgDataPoints2.push({ time: estTimestamp, value: fgScore2 });
        fgDataPoints1 = fgDataPoints1.filter(p => p.time >= now - 36000);
        fgDataPoints2 = fgDataPoints2.filter(p => p.time >= now - 36000);

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ fgDataPoints1, fgDataPoints2, leaderboard: getTop10Leaderboard() }));
            }
        });
    }
}

// Rest of your server.js remains unchanged (leaderboard functions, routes, etc.)

async function startServer() {
    await loadData();
    setInterval(updateData, 30000);
    updateData(); // Initial call
}

startServer();