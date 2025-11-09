// WebSocket client for real-time synchronization

import { CanvasManager } from './canvas.js';

class WebSocketClient {
  constructor(canvasManager) {
    this.canvasManager = canvasManager;
    this.roomId = '';
    this.userId = '';
    this.userName = '';
    
    this.isConnected = false;
    this.drawMoveThrottle = 16; // ~60fps
    this.lastDrawMoveTime = 0;
    this.cursorMoveThrottle = 100; // 10fps for cursor
    this.lastCursorMoveTime = 0;
    
    this.pendingOperations = new Map();
    this.socket = null;
    
    this.setupCanvasCallbacks();
  }

  setupCanvasCallbacks() {
    this.canvasManager.onDrawStart((operation) => {
      if (this.isConnected && this.roomId) {
        this.socket.emit('draw-start', {
          roomId: this.roomId,
          operationId: operation.id,
          x: operation.points[0].x,
          y: operation.points[0].y,
          color: operation.color,
          strokeWidth: operation.strokeWidth,
          tool: operation.tool
        });
      }
    });

    this.canvasManager.onDrawMove((operationId, x, y) => {
      if (this.isConnected && this.roomId) {
        const now = Date.now();
        if (now - this.lastDrawMoveTime >= this.drawMoveThrottle) {
          this.socket.emit('draw-move', {
            roomId: this.roomId,
            operationId,
            x,
            y
          });
          this.lastDrawMoveTime = now;
        }
      }
    });

    this.canvasManager.onDrawEnd((operationId) => {
      if (this.isConnected && this.roomId) {
        this.socket.emit('draw-end', {
          roomId: this.roomId,
          operationId
        });
      }
    });

    this.canvasManager.onUndo(() => {
      if (this.isConnected && this.roomId) {
        this.socket.emit('undo', { roomId: this.roomId });
      }
    });

    this.canvasManager.onRedo(() => {
      if (this.isConnected && this.roomId) {
        this.socket.emit('redo', { roomId: this.roomId });
      }
    });
  }

  connect(serverUrl = window.location.origin) {
    // Socket.IO is loaded via script tag
    const io = window.io;
    if (!io) {
      console.error('Socket.IO not loaded. Make sure socket.io.js is included in HTML.');
      return;
    }
    this.socket = io(serverUrl);
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.isConnected = true;
      this.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.isConnected = false;
      this.updateConnectionStatus(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.updateConnectionStatus(false);
    });

    // Receive own user info after joining
    this.socket.on('joined', (data) => {
      this.userId = data.userId;
      this.userName = data.userName;
      this.roomId = data.roomId;
      console.log('Joined as:', data.userName, 'with ID:', data.userId, 'in room:', data.roomId);
      // Update status to show room number
      this.updateConnectionStatus(true, data.roomId);
    });

    // Canvas state synchronization
    this.socket.on('canvas-state', (operations) => {
      console.log('Received canvas state:', operations.length, 'operations');
      this.canvasManager.loadCanvasState(operations);
    });

    // Drawing events from other users
    this.socket.on('draw-start', (data) => {
      if (data.userId === this.userId) return; // Ignore own events
      
      const operation = {
        id: data.id,
        userId: data.userId,
        tool: data.tool,
        color: data.color,
        strokeWidth: data.strokeWidth,
        points: [{ x: data.x, y: data.y, timestamp: Date.now() }],
        startTime: Date.now()
      };
      
      this.pendingOperations.set(data.id, operation);
      this.canvasManager.drawRemoteStart(operation);
    });

    this.socket.on('draw-move', (data) => {
      this.canvasManager.drawRemoteMove(data.operationId, data.x, data.y);
    });

    this.socket.on('draw-end', (data) => {
      this.canvasManager.drawRemoteEnd(data.operationId);
      this.pendingOperations.delete(data.operationId);
    });

    // Cursor tracking
    this.socket.on('cursor-move', (data) => {
      if (data.userId === this.userId) return;
      
      this.canvasManager.updateUserCursor(
        data.userId,
        data.x,
        data.y,
        data.userColor,
        data.userName
      );
    });

    // Undo/Redo
    this.socket.on('undo', (data) => {
      this.canvasManager.remoteUndo(data.operationId);
    });

    this.socket.on('redo', (data) => {
      // Note: Server should send full operation data for redo
      // For now, we'll handle it via canvas-state if needed
    });

    // User management
    this.socket.on('user-joined', (data) => {
      console.log('User joined:', data.userName);
      this.updateUsersList();
    });

    this.socket.on('user-left', (data) => {
      console.log('User left:', data.userName);
      this.canvasManager.removeUserCursor(data.userId);
      this.updateUsersList();
    });

    this.socket.on('users-list', (users) => {
      this.updateUsersList(users);
    });
  }

  joinRoom(roomId, userName) {
    if (!this.isConnected) {
      console.error('Not connected to server');
      return;
    }

    const finalRoomId = roomId || this.generateRoomId();
    const finalUserName = userName || `User ${Math.random().toString(36).substr(2, 6)}`;
    
    this.socket.emit('join-room', finalRoomId, finalUserName);
    console.log(`Joining room: ${finalRoomId} as ${finalUserName}`);
    // Note: roomId and userName will be set when 'joined' event is received
  }

  sendCursorPosition(x, y) {
    if (!this.isConnected || !this.roomId) return;
    
    const now = Date.now();
    if (now - this.lastCursorMoveTime >= this.cursorMoveThrottle) {
      this.socket.emit('cursor-move', {
        roomId: this.roomId,
        x,
        y
      });
      this.lastCursorMoveTime = now;
    }
  }

  undo() {
    this.canvasManager.undo();
  }

  redo() {
    this.canvasManager.redo();
  }

  clear() {
    this.canvasManager.clear();
    // Note: Clear is local only for now
    // Could add server-side clear if needed
  }

  updateConnectionStatus(connected, roomId = null) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
      if (connected) {
        if (roomId) {
          statusEl.textContent = `Connected - Room: ${roomId}`;
        } else {
          statusEl.textContent = 'Connected';
        }
        statusEl.className = 'status connected';
      } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'status disconnected';
      }
    }
  }

  updateUsersList(users) {
    const usersListEl = document.getElementById('usersList');
    if (!usersListEl) return;
    
    if (!users) {
      // Request users list from server
      return;
    }
    
    usersListEl.innerHTML = '';
    
    for (const user of users) {
      const userEl = document.createElement('div');
      userEl.className = 'user-item';
      userEl.style.borderLeftColor = user.color;
      
      const colorIndicator = document.createElement('div');
      colorIndicator.className = 'user-color-indicator';
      colorIndicator.style.background = user.color;
      
      const nameEl = document.createElement('span');
      nameEl.textContent = user.name;
      
      userEl.appendChild(colorIndicator);
      userEl.appendChild(nameEl);
      usersListEl.appendChild(userEl);
    }
  }

  generateRoomId() {
    return Math.random().toString(36).substr(2, 9);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
    }
  }
}

export { WebSocketClient };

