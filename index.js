const http = require('http'); 
const httpProxy = require('http-proxy');
const url = require('url');
const fs = require('fs');

// Common handler for all servers
function requestHandler(port) {
    return (req, res) => {
        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`Welcome to the server on port ${port}\n`);
        } else if (req.url === '/special') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`Special route handled by server on port ${port}\n`);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Route not found\n');
        }
    };
}

// Server on port 8080
const server8080 = http.createServer(requestHandler(8080));
server8080.listen(8080, () => {
    console.log('Test server running on port 8080');
});

// Server on port 5000
const server5000 = http.createServer(requestHandler(5000));
server5000.listen(5000, () => {
    console.log('Test server running on port 5000');
});






// Define your port mappings
const portMappings = {
    8080: 'http://127.0.0.1:8080',
    5000: 'http://127.0.0.1:5000',
    // Add more ports as needed
};

// Create a proxy server
const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    autoRewrite: true,
    protocolRewrite: 'http',
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
    console.error('Proxy Error:', err);
    logRequest(req, 500, 'Proxy request failed');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Proxy request failed' }));
});

// Middleware for remembering dynamic port target
const activeTargets = new Map(); // To store active targets per client

// Function to log requests
function logRequest(req, statusCode, statusMessage) {
    const log = {
        time: new Date().toISOString(),
        method: req.method,
        url: req.url,
        clientIp: req.socket.remoteAddress,
        statusCode: statusCode,
        statusMessage: statusMessage,
    };

    // Log to a file (or you could use a database if preferred)
    fs.appendFile('requests.log', JSON.stringify(log) + '\n', (err) => {
        if (err) console.error('Error logging request:', err);
    });
}

// Create the main server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    const clientIp = req.socket.remoteAddress; // Unique client identifier

    // Check if the request is for the logging endpoint
    if (parsedUrl.pathname === '/logs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const logFile = fs.readFileSync('requests.log', 'utf8');
        const logs = logFile.split('\n').filter(Boolean).map(line => JSON.parse(line));
        res.end(JSON.stringify(logs));
        return;
    }

    // Check if a new port is specified in the URL
    const potentialPort = pathParts[0] && /^[0-9]{4}$/.test(pathParts[0])
        ? pathParts[0]
        : null;

    if (potentialPort && portMappings[potentialPort]) {
        // Update the active target for the client
        activeTargets.set(clientIp, portMappings[potentialPort]);
        console.log(`Client ${clientIp} switched to port ${potentialPort}`);

        // Rewrite the URL without the port path part
        req.url = '/' + pathParts.slice(1).join('/');

        // Proxy the request to the new target
        proxy.web(req, res, { target: portMappings[potentialPort] });
        logRequest(req, 200, `Proxying to ${portMappings[potentialPort]}`);
    } else if (activeTargets.has(clientIp)) {
        // Continue to proxy subsequent requests to the active target
        const activeTarget = activeTargets.get(clientIp);
        console.log(`Proxying request for ${clientIp} to ${activeTarget}`);

        proxy.web(req, res, { target: activeTarget });
        logRequest(req, 200, `Proxying to active target: ${activeTarget}`);
    } else {
        // No valid port found, return 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'No valid port found and no active proxy target set.' }));
        logRequest(req, 404, 'No valid port found and no active proxy target set.');
    }
});

// Define the proxy server's listening port
const PROXY_PORT = 6000;
server.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`Proxy server running on port ${PROXY_PORT}`);
    console.log(`Access URLs:`);
    Object.keys(portMappings).forEach(key => {
        console.log(`- http://localhost:${PROXY_PORT}/${key}`);
    });
});

console.log('Proxy mapping initialized now');
