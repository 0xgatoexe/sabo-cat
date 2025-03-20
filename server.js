const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const coins1 = ['solana', 'bittensor', 'render-network'];
const coins2 = ['bitcoin', 'ethereum', 'ripple', 'binance-coin', 'solana', 'dogecoin'];

async function fetchHistoricalData(coins) {
    const hours = 10;
    const secondsInHour = 3600;
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (hours * secondsInHour);
    const interval = 300; // 5-minute intervals

    console.log(`Fetching data for ${coins.join(', ')} from ${startTime} to ${now}`);

    const priceHistories = await Promise.all(coins.map(async (coin) => {
        try {
            const url = `${COINGECKO_API}/coins/${coin}/market_chart/range?vs_currency=usd&from=${startTime}&to=${now}`;
            const response = await axios.get(url);
            const prices = response.data.prices.map(([time, price]) => ({
                time: Math.floor(time / 1000),
                price
            }));
            console.log(`${coin}: Fetched ${prices.length} price points`);
            return { coin, prices };
        } catch (error) {
            console.error(`Error fetching data for ${coin}:`, error.message);
            return { coin, prices: [] };
        }
    }));

    const dataPoints = [];
    const pointsCount = Math.floor((hours * secondsInHour) / interval);
    console.log(`Generating ${pointsCount} data points`);

    for (let i = 0; i < pointsCount; i++) {
        const timestamp = startTime + (i * interval);
        let numUp = 0, numDown = 0;
        const prevPrices = {};

        coins.forEach((coin, idx) => {
            const history = priceHistories[idx].prices;
            const current = history.find(p => p.time >= timestamp - 150 && p.time <= timestamp + 150);
            if (current && prevPrices[coin] !== undefined) {
                if (current.price > prevPrices[coin]) numUp++;
                else if (current.price < prevPrices[coin]) numDown++;
            }
            if (current) prevPrices[coin] = current.price;
        });

        let score = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].value : 50;
        if (numUp > numDown) score = Math.min(100, score + 2);
        else if (numDown > numUp) score = Math.max(0, score - 2);
        dataPoints.push({ time: timestamp, value: score });
    }

    console.log(`Generated ${dataPoints.length} data points`);
    return dataPoints;
}

app.get('/api/chart1', async (req, res) => {
    try {
        const data = await fetchHistoricalData(coins1);
        res.json(data);
    } catch (error) {
        console.error('Error in /api/chart1:', error);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

app.get('/api/chart2', async (req, res) => {
    try {
        const data = await fetchHistoricalData(coins2);
        res.json(data);
    } catch (error) {
        console.error('Error in /api/chart2:', error);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});