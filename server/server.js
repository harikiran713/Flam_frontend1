const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { RoomManager } = require('./rooms');
const { DrawingStateManager } = require('./drawing-state');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager();
const drawingStateManager = new DrawingStateManager();

// Serve static files
app.use(express.static('client'));

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join room
  socket.on('join-room', (roomId, userName) => {
    socket.join(roomId);
    const user = roomManager.addUser(socket.id, roomId, userName);
    
    // Send current canvas state to new user
    const canvasState = drawingStateManager.getCanvasState(roomId);
    socket.emit('canvas-state', canvasState);
    
    // Send user info back to the client (so it knows its own userId)
    socket.emit('joined', {
      userId: user.id,
      userName: user.name,
      color: user.color,
      roomId: roomId
    });
    
    // Notify others in room
    socket.to(roomId).emit('user-joined', {
      userId: user.id,
      userName: user.name,
      color: user.color
    });
    
    // Send list of current users
    const users = roomManager.getRoomUsers(roomId);
    socket.emit('users-list', users);
    socket.to(roomId).emit('users-list', users);
    
    console.log(`User ${userName} (${socket.id}) joined room ${roomId}`);
  });

  // Drawing events
  socket.on('draw-start', (data) => {
    const user = roomManager.getUser(socket.id);
    if (!user) return;
    
    const operation = drawingStateManager.startDraw(data.roomId, {
      operationId: data.operationId,
      userId: user.id,
      x: data.x,
      y: data.y,
      color: data.color,
      strokeWidth: data.strokeWidth,
      tool: data.tool
    });
    
    socket.to(data.roomId).emit('draw-start', {
      ...operation,
      userName: user.name,
      userColor: user.color
    });
  });

  socket.on('draw-move', (data) => {
    const user = roomManager.getUser(socket.id);
    if (!user) return;
    
    const point = drawingStateManager.addPoint(data.roomId, data.operationId, data.x, data.y);
    
    if (point) {
      socket.to(data.roomId).emit('draw-move', {
        operationId: data.operationId,
        x: point.x,
        y: point.y,
        userName: user.name
      });
    }
  });

  socket.on('draw-end', (data) => {
    const user = roomManager.getUser(socket.id);
    if (!user) return;
    
    const operation = drawingStateManager.endDraw(data.roomId, data.operationId);
    
    if (operation) {
      socket.to(data.roomId).emit('draw-end', {
        operationId: data.operationId,
        userName: user.name
      });
    }
  });

  // Cursor position tracking
  socket.on('cursor-move', (data) => {
    const user = roomManager.getUser(socket.id);
    if (!user) return;
    
    socket.to(data.roomId).emit('cursor-move', {
      userId: user.id,
      userName: user.name,
      userColor: user.color,
      x: data.x,
      y: data.y
    });
  });

  // Undo/Redo
  socket.on('undo', (data) => {
    const user = roomManager.getUser(socket.id);
    if (!user) return;
    
    const operation = drawingStateManager.undo(data.roomId);
    
    if (operation) {
      io.to(data.roomId).emit('undo', {
        operationId: operation.id,
        userId: user.id,
        userName: user.name
      });
    }
  });

  socket.on('redo', (data) => {
    const user = roomManager.getUser(socket.id);
    if (!user) return;
    
    const operation = drawingStateManager.redo(data.roomId);
    
    if (operation) {
      io.to(data.roomId).emit('redo', {
        operationId: operation.id,
        userId: user.id,
        userName: user.name
      });
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    const user = roomManager.getUser(socket.id);
    if (user) {
      roomManager.removeUser(socket.id);
      socket.to(user.roomId).emit('user-left', {
        userId: user.id,
        userName: user.name
      });
      
      const users = roomManager.getRoomUsers(user.roomId);
      socket.to(user.roomId).emit('users-list', users);
      
      console.log(`User ${user.name} (${socket.id}) disconnected`);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

