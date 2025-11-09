const { v4: uuidv4 } = require('uuid');

class DrawingStateManager {
  constructor() {
    this.canvasStates = new Map();
  }

  getOrCreateState(roomId) {
    if (!this.canvasStates.has(roomId)) {
      this.canvasStates.set(roomId, {
        operations: [],
        undoStack: [],
        redoStack: []
      });
    }
    return this.canvasStates.get(roomId);
  }

  startDraw(roomId, data) {
    const state = this.getOrCreateState(roomId);
    
    // Clear redo stack when new operation starts
    state.redoStack = [];
    
    const operation = {
      id: data.operationId || uuidv4(),
      userId: data.userId,
      tool: data.tool,
      color: data.color,
      strokeWidth: data.strokeWidth,
      points: [{
        x: data.x,
        y: data.y,
        timestamp: Date.now()
      }],
      startTime: Date.now()
    };
    
    state.operations.push(operation);
    return operation;
  }

  addPoint(roomId, operationId, x, y) {
    const state = this.getOrCreateState(roomId);
    const operation = state.operations.find(op => op.id === operationId);
    
    if (!operation) return null;
    
    const point = {
      x,
      y,
      timestamp: Date.now()
    };
    
    operation.points.push(point);
    return point;
  }

  endDraw(roomId, operationId) {
    const state = this.getOrCreateState(roomId);
    const operation = state.operations.find(op => op.id === operationId);
    
    if (!operation) return null;
    
    operation.endTime = Date.now();
    return operation;
  }

  undo(roomId) {
    const state = this.getOrCreateState(roomId);
    
    if (state.operations.length === 0) return null;
    
    // Remove last operation
    const operation = state.operations.pop();
    state.undoStack.push(operation);
    
    return operation;
  }

  redo(roomId) {
    const state = this.getOrCreateState(roomId);
    
    if (state.undoStack.length === 0) return null;
    
    // Restore last undone operation
    const operation = state.undoStack.pop();
    state.operations.push(operation);
    
    return operation;
  }

  getCanvasState(roomId) {
    const state = this.getOrCreateState(roomId);
    return state.operations;
  }

  // For conflict resolution: merge operations by timestamp
  getOperationsAfter(roomId, timestamp) {
    const state = this.getOrCreateState(roomId);
    return state.operations.filter(op => op.startTime > timestamp);
  }
}

module.exports = { DrawingStateManager };

