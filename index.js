const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// Create an express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {};  // To store multiple rooms

// Function to broadcast data to both players in a room
function broadcast(roomId, data) {
    rooms[roomId].players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(data));
        }
    });
}

// Function to check if the game has a winner
function checkWinner(gameState) {
    const winningCombos = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    
    for (let combo of winningCombos) {
        const [a, b, c] = combo;
        if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
            return gameState[a]; // Return the winner ('X' or 'O')
        }
    }
    return null;
}

// Function to check if the board is full
function isBoardFull(gameState) {
    return gameState.every(cell => cell !== null);
}

// Handle new connections
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Handle room joining/creation
        if (data.type === 'join') {
            const roomId = data.roomId || `room-${Math.random().toString(36).substr(2, 9)}`;
            if (!rooms[roomId]) {
                rooms[roomId] = {
                    players: [],
                    gameState: Array(9).fill(null), // Tic-Tac-Toe board
                    nextTurn: 'X', // X always goes first
                };
            }

            const room = rooms[roomId];
            if (room.players.length < 2) {
                const playerIndex = room.players.length;
                const symbol = playerIndex === 0 ? 'X' : 'O';
                room.players.push({ ws, symbol });

                ws.send(JSON.stringify({ type: 'init', symbol, board: room.gameState, roomId }));

                if (room.players.length === 2) {
                    broadcast(roomId, { type: 'start', message: 'Game Start! Player X goes first.' });
                }
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Room is full. Try another room.' }));
            }
        }

        // Handle player moves
        if (data.type === 'move' && rooms[data.roomId]) {
            const room = rooms[data.roomId];
            const player = room.players.find(p => p.ws === ws);
            if (player && room.players.length === 2 && !room.gameState[data.index] && room.nextTurn === player.symbol) {
                room.gameState[data.index] = player.symbol;
                room.nextTurn = player.symbol === 'X' ? 'O' : 'X'; // Switch turns
                broadcast(data.roomId, { type: 'update', board: room.gameState, nextTurn: room.nextTurn });

                const winner = checkWinner(room.gameState);
                if (winner) {
                    broadcast(data.roomId, { type: 'end', message: `Player ${winner} wins!` });
                    room.gameState = Array(9).fill(null); // Reset game for rematch
                    room.nextTurn = 'X'; // Reset turn
                } else if (isBoardFull(room.gameState)) {
                    broadcast(data.roomId, { type: 'end', message: 'It\'s a draw!' });
                    room.gameState = Array(9).fill(null); // Reset game
                    room.nextTurn = 'X'; // Reset turn
                }
            }
        }
    });

    ws.on('close', () => {
        // Clean up disconnected players
        for (let roomId in rooms) {
            const room = rooms[roomId];
            room.players = room.players.filter(player => player.ws !== ws);
            if (room.players.length === 0) {
                delete rooms[roomId]; // Remove room if empty
            } else {
                broadcast(roomId, { type: 'end', message: 'Player disconnected. Game over.' });
                room.gameState = Array(9).fill(null); // Reset game for rematch
                room.nextTurn = 'X'; // Reset turn
            }
        }
    });
});

// Serve static files for the frontend
app.use(express.static('public'));

// Start the server
server.listen(3000, () => {
    console.log('Server running on port 3000');
});
