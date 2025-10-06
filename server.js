// --- DEPENDENCIES (Assumes 'express' and 'node-fetch' are installed via npm) ---
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch'); // Used for making HTTP requests

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, 'cache');
const TOKEN_URL = 'https://rolexcoderz.in/api/get-token';
const CONTENT_URL = 'https://rolexcoderz.in/api/get-live-classes';
const CACHE_INTERVAL_MS = 60000; // 1 minute (60,000 milliseconds)

// Standard headers for API calls, ENHANCED TO AVOID 403 ERRORS
const HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Standard desktop Chrome UA
    'Referer': 'https://rolexcoderz.in/live-classes',
    'Accept': 'application/json, text/plain, */*', // Tells the server we accept JSON
    'Accept-Language': 'en-US,en;q=0.9', // Standard language preference
    'Connection': 'keep-alive', // Keeps the connection open
};

// Define the three class types we need to fetch
const REQUEST_TYPES = [
    { type: 'up', filename: 'upcoming.json', label: 'Upcoming' },
    { type: 'live', filename: 'live.json', label: 'Live' },
    { type: 'completed', filename: 'completed.json', label: 'Completed' },
];

let lastUpdateTime = "Never";

/**
 * Executes a single API request, decodes the response, and caches it.
 * @param {string} type The class type ('up', 'live', 'completed').
 * @param {string} filename The file to save the decoded content to.
 * @param {string} ts The dynamic timestamp.
 * @param {string} sig The dynamic signature.
 */
async function fetchAndCacheData(type, filename, ts, sig) {
    const payload = JSON.stringify({ type });
    const filePath = path.join(CACHE_DIR, filename);

    try {
        const response = await fetch(CONTENT_URL, {
            method: 'POST',
            headers: {
                ...HEADERS,
                'x-timestamp': ts,
                'x-signature': sig,
            },
            body: payload,
        });

        if (!response.ok) {
            // Include status text for better debugging
            throw new Error(`Content API failed! Status: ${response.status} ${response.statusText}`);
        }

        const rawJson = await response.json();
        const base64Data = rawJson.data;

        if (!base64Data) {
            throw new Error(`Data field missing in response for type: ${type}`);
        }

        // Base64 decoding in Node.js
        const decodedContent = Buffer.from(base64Data, 'base64').toString('utf8');
        
        // Cache the decoded content
        await fs.writeFile(filePath, decodedContent, 'utf8');
        console.log(`[SUCCESS] Cached ${type} data to ${filename}`);

    } catch (error) {
        console.error(`[ERROR] Failed to fetch or decode ${type} data: ${error.message}`);
    }
}

/**
 * Main update routine: Fetches token, then fetches all three content types.
 */
async function runUpdateCycle() {
    console.log(`\n--- Starting update cycle at ${new Date().toLocaleTimeString()} ---`);
    lastUpdateTime = new Date().toLocaleTimeString();
    
    try {
        // 1. Fetch Token
        const tokenResponse = await fetch(TOKEN_URL, { headers: HEADERS });
        if (!tokenResponse.ok) {
             // Throw specific error for token failure
             throw new Error(`Token API failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
        }
        
        const tokenData = await tokenResponse.json();
        const { timestamp, signature } = tokenData;

        if (!timestamp || !signature) {
             throw new Error('Token API did not return timestamp or signature.');
        }

        console.log(`Token fetched. TS: ${timestamp}, SIG: ${signature.substring(0, 8)}...`);

        // 2. Execute all three requests concurrently
        const updatePromises = REQUEST_TYPES.map(req => 
            fetchAndCacheData(req.type, req.filename, timestamp, signature)
        );

        await Promise.all(updatePromises);
        
        console.log('--- Update cycle finished ---');
        
    } catch (error) {
        console.error(`[CRITICAL] Major update failure: ${error.message}`);
    }
}

// --- Initialization ---

// 1. Create cache directory if it doesn't exist
fs.mkdir(CACHE_DIR, { recursive: true })
    .then(() => console.log(`Cache directory created at ${CACHE_DIR}`))
    .catch(err => console.error('Failed to create cache directory:', err));

// 2. Run the update cycle immediately on start
runUpdateCycle();

// 3. Schedule the update cycle to run every minute
setInterval(runUpdateCycle, CACHE_INTERVAL_MS);


// --- Web Server Setup ---

// Serve static files from the root directory (for index.html)
app.use(express.static(path.join(__dirname)));

// Serve static files from the cache directory (for the JSON files)
// This makes http://<URL>/cache/upcoming.json available
app.use('/cache', express.static(CACHE_DIR));

// Endpoint to display the last update time on the front-end
app.get('/status', (req, res) => {
    res.json({ lastUpdate: lastUpdateTime });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
