const { v4: uuidv4 } = require('uuid');

const USER_COLORS = [
  '#667eea', '#f093fb', '#4facfe', '#43e97b',
  '#fa709a', '#30cfd0', '#a8edea', '#ff9a9e',
  '#ffecd2', '#ff6b6b', '#c471ed', '#12c2e9',
  '#764ba2', '#f5576c', '#00f2fe', '#38f9d7'
];

class RoomManager {
  constructor() {
    this.users = new Map();
    this.roomUsers = new Map();
    this.colorIndex = 0;
  }

  addUser(socketId, roomId, userName) {
    const userId = uuidv4();
    const color = this.getNextColor();
    
    const user = {
      id: userId,
      socketId,
      roomId,
      name: userName || `User ${userId.substring(0, 8)}`,
      color
    };
    
    this.users.set(socketId, user);
    
    if (!this.roomUsers.has(roomId)) {
      this.roomUsers.set(roomId, new Set());
    }
    this.roomUsers.get(roomId).add(socketId);
    
    return user;
  }

  getUser(socketId) {
    return this.users.get(socketId);
  }

  removeUser(socketId) {
    const user = this.users.get(socketId);
    if (user) {
      this.users.delete(socketId);
      const roomSet = this.roomUsers.get(user.roomId);
      if (roomSet) {
        roomSet.delete(socketId);
        if (roomSet.size === 0) {
          this.roomUsers.delete(user.roomId);
        }
      }
    }
  }

  getRoomUsers(roomId) {
    const socketIds = this.roomUsers.get(roomId);
    if (!socketIds) return [];
    
    return Array.from(socketIds)
      .map(socketId => this.users.get(socketId))
      .filter(user => user !== undefined);
  }

  getNextColor() {
    const color = USER_COLORS[this.colorIndex % USER_COLORS.length];
    this.colorIndex++;
    return color;
  }
}

module.exports = { RoomManager };

