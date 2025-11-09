// Canvas drawing logic with efficient path optimization

class CanvasManager {
  constructor(drawingCanvasId, cursorCanvasId) {
    this.drawingCanvas = document.getElementById(drawingCanvasId);
    this.cursorCanvas = document.getElementById(cursorCanvasId);
    
    if (!this.drawingCanvas || !this.cursorCanvas) {
      throw new Error('Canvas elements not found');
    }
    
    const drawingCtx = this.drawingCanvas.getContext('2d');
    const cursorCtx = this.cursorCanvas.getContext('2d');
    
    if (!drawingCtx || !cursorCtx) {
      throw new Error('Could not get canvas context');
    }
    
    this.drawingCtx = drawingCtx;
    this.cursorCtx = cursorCtx;
    
    this.currentTool = 'brush';
    this.currentColor = '#667eea';
    this.currentStrokeWidth = 5;
    
    this.isDrawing = false;
    this.currentOperation = null;
    this.operations = new Map();
    
    this.undoStack = [];
    this.redoStack = [];
    
    // For smooth drawing - store last point for line interpolation
    this.lastPoint = null;
    
    // Cursor tracking for other users
    this.userCursors = new Map();
    
    // Callbacks
    this.onDrawStartCallback = null;
    this.onDrawMoveCallback = null;
    this.onDrawEndCallback = null;
    this.onUndoCallback = null;
    this.onRedoCallback = null;
    
    this.setupCanvas();
    this.setupEventListeners();
  }

  setupCanvas() {
    const resizeCanvas = () => {
      const container = this.drawingCanvas.parentElement;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      this.drawingCanvas.width = rect.width;
      this.drawingCanvas.height = rect.height;
      this.cursorCanvas.width = rect.width;
      this.cursorCanvas.height = rect.height;
      
      // Redraw all operations after resize
      this.redrawAll();
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Set canvas styles for smooth drawing
    this.drawingCtx.lineCap = 'round';
    this.drawingCtx.lineJoin = 'round';
    this.drawingCtx.imageSmoothingEnabled = true;
  }

  setupEventListeners() {
    // Mouse events
    this.drawingCanvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.drawingCanvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.drawingCanvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.drawingCanvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
    
    // Touch events for mobile
    this.drawingCanvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.drawingCanvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.drawingCanvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    this.drawingCanvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
    
    // Cursor tracking
    this.drawingCanvas.addEventListener('mousemove', this.handleCursorMove.bind(this));
  }

  getCanvasCoordinates(e) {
    const rect = this.drawingCanvas.getBoundingClientRect();
    const scaleX = this.drawingCanvas.width / rect.width;
    const scaleY = this.drawingCanvas.height / rect.height;
    
    if ('touches' in e || 'clientX' in e) {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }
    
    return { x: e.clientX, y: e.clientY };
  }

  handleMouseDown(e) {
    e.preventDefault();
    const coords = this.getCanvasCoordinates(e);
    this.startDrawing(coords.x, coords.y);
  }

  handleMouseMove(e) {
    if (this.isDrawing) {
      e.preventDefault();
      const coords = this.getCanvasCoordinates(e);
      this.continueDrawing(coords.x, coords.y);
    }
  }

  handleMouseUp(e) {
    if (this.isDrawing) {
      e.preventDefault();
      this.stopDrawing();
    }
  }

  handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const coords = this.getCanvasCoordinates(e.touches[0]);
      this.startDrawing(coords.x, coords.y);
    }
  }

  handleTouchMove(e) {
    e.preventDefault();
    if (this.isDrawing && e.touches.length > 0) {
      const coords = this.getCanvasCoordinates(e.touches[0]);
      this.continueDrawing(coords.x, coords.y);
    }
  }

  handleTouchEnd(e) {
    e.preventDefault();
    if (this.isDrawing) {
      this.stopDrawing();
    }
  }

  handleCursorMove(e) {
    // This will be handled by WebSocket client for sending cursor position
  }

  startDrawing(x, y) {
    this.isDrawing = true;
    this.lastPoint = { x, y };
    
    const operation = {
      id: this.generateId(),
      userId: 'local', // Will be set by WebSocket client
      tool: this.currentTool,
      color: this.currentColor,
      strokeWidth: this.currentStrokeWidth,
      points: [{ x, y, timestamp: Date.now() }],
      startTime: Date.now()
    };
    
    this.currentOperation = operation;
    this.operations.set(operation.id, operation);
    
    // Clear redo stack when new operation starts
    this.redoStack = [];
    
    // Draw initial point
    this.drawPoint(x, y, operation);
    
    // Notify callback
    if (this.onDrawStartCallback) {
      this.onDrawStartCallback(operation);
    }
  }

  continueDrawing(x, y) {
    if (!this.currentOperation) return;
    
    // Add point to operation
    const point = { x, y, timestamp: Date.now() };
    this.currentOperation.points.push(point);
    
    // Draw line from last point to current point for smoothness
    if (this.lastPoint) {
      this.drawLine(this.lastPoint.x, this.lastPoint.y, x, y, this.currentOperation);
    } else {
      this.drawPoint(x, y, this.currentOperation);
    }
    
    this.lastPoint = { x, y };
    
    // Notify callback (throttled in WebSocket client)
    if (this.onDrawMoveCallback) {
      this.onDrawMoveCallback(this.currentOperation.id, x, y);
    }
  }

  stopDrawing() {
    if (!this.currentOperation) return;
    
    this.currentOperation.endTime = Date.now();
    this.isDrawing = false;
    this.lastPoint = null;
    
    // Add to undo stack
    this.undoStack.push(this.currentOperation);
    
    // Notify callback
    if (this.onDrawEndCallback) {
      this.onDrawEndCallback(this.currentOperation.id);
    }
    
    this.currentOperation = null;
  }

  drawPoint(x, y, operation) {
    this.drawingCtx.save();
    
    if (operation.tool === 'eraser') {
      this.drawingCtx.globalCompositeOperation = 'destination-out';
      this.drawingCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.drawingCtx.globalCompositeOperation = 'source-over';
      this.drawingCtx.strokeStyle = operation.color;
    }
    
    this.drawingCtx.lineWidth = operation.strokeWidth;
    this.drawingCtx.beginPath();
    this.drawingCtx.arc(x, y, operation.strokeWidth / 2, 0, Math.PI * 2);
    this.drawingCtx.fill();
    this.drawingCtx.restore();
  }

  drawLine(x1, y1, x2, y2, operation) {
    this.drawingCtx.save();
    
    if (operation.tool === 'eraser') {
      this.drawingCtx.globalCompositeOperation = 'destination-out';
      this.drawingCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.drawingCtx.globalCompositeOperation = 'source-over';
      this.drawingCtx.strokeStyle = operation.color;
    }
    
    this.drawingCtx.lineWidth = operation.strokeWidth;
    this.drawingCtx.beginPath();
    this.drawingCtx.moveTo(x1, y1);
    this.drawingCtx.lineTo(x2, y2);
    this.drawingCtx.stroke();
    this.drawingCtx.restore();
  }

  // Public methods for external drawing operations (from other users)
  drawRemoteStart(operation) {
    this.operations.set(operation.id, operation);
    
    if (operation.points.length > 0) {
      const firstPoint = operation.points[0];
      this.drawPoint(firstPoint.x, firstPoint.y, operation);
    }
  }

  drawRemoteMove(operationId, x, y) {
    const operation = this.operations.get(operationId);
    if (!operation) return;
    
    const lastPoint = operation.points[operation.points.length - 1];
    if (lastPoint) {
      operation.points.push({ x, y, timestamp: Date.now() });
      this.drawLine(lastPoint.x, lastPoint.y, x, y, operation);
    }
  }

  drawRemoteEnd(operationId) {
    const operation = this.operations.get(operationId);
    if (!operation) return;
    
    operation.endTime = Date.now();
  }

  // Undo/Redo
  undo() {
    if (this.undoStack.length === 0) return false;
    
    const operation = this.undoStack.pop();
    this.operations.delete(operation.id);
    this.redoStack.push(operation);
    
    // Redraw all remaining operations
    this.redrawAll();
    
    if (this.onUndoCallback) {
      this.onUndoCallback();
    }
    
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    
    const operation = this.redoStack.pop();
    this.operations.set(operation.id, operation);
    this.undoStack.push(operation);
    
    // Redraw the operation
    this.redrawOperation(operation);
    
    if (this.onRedoCallback) {
      this.onRedoCallback();
    }
    
    return true;
  }

  remoteUndo(operationId) {
    const operation = this.operations.get(operationId);
    if (operation) {
      this.operations.delete(operation.id);
      this.redrawAll();
    }
  }

  remoteRedo(operationId, operation) {
    this.operations.set(operationId, operation);
    this.redrawOperation(operation);
  }

  redrawAll() {
    // Clear canvas
    this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
    
    // Redraw all operations in order
    for (const operation of this.operations.values()) {
      this.redrawOperation(operation);
    }
  }

  redrawOperation(operation) {
    if (operation.points.length === 0) return;
    
    this.drawingCtx.save();
    
    if (operation.tool === 'eraser') {
      this.drawingCtx.globalCompositeOperation = 'destination-out';
      this.drawingCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.drawingCtx.globalCompositeOperation = 'source-over';
      this.drawingCtx.strokeStyle = operation.color;
    }
    
    this.drawingCtx.lineWidth = operation.strokeWidth;
    this.drawingCtx.beginPath();
    
    const firstPoint = operation.points[0];
    this.drawingCtx.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < operation.points.length; i++) {
      const point = operation.points[i];
      this.drawingCtx.lineTo(point.x, point.y);
    }
    
    this.drawingCtx.stroke();
    this.drawingCtx.restore();
  }

  clear() {
    this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
    this.operations.clear();
    this.undoStack = [];
    this.redoStack = [];
  }

  // Cursor management
  updateUserCursor(userId, x, y, color, name) {
    this.userCursors.set(userId, { x, y, color, name });
    this.drawCursors();
  }

  removeUserCursor(userId) {
    this.userCursors.delete(userId);
    this.drawCursors();
  }

  drawCursors() {
    // Clear cursor canvas
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
    
    // Draw all user cursors
    for (const [userId, cursor] of this.userCursors.entries()) {
      this.cursorCtx.save();
      this.cursorCtx.strokeStyle = cursor.color;
      this.cursorCtx.fillStyle = cursor.color;
      this.cursorCtx.lineWidth = 2;
      
      // Draw cursor circle
      this.cursorCtx.beginPath();
      this.cursorCtx.arc(cursor.x, cursor.y, 10, 0, Math.PI * 2);
      this.cursorCtx.stroke();
      
      // Draw label
      this.cursorCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      this.cursorCtx.font = '12px Arial';
      this.cursorCtx.textAlign = 'center';
      this.cursorCtx.fillText(cursor.name, cursor.x, cursor.y - 15);
      
      this.cursorCtx.restore();
    }
  }

  // Setters
  setTool(tool) {
    this.currentTool = tool;
  }

  setColor(color) {
    this.currentColor = color;
  }

  setStrokeWidth(width) {
    this.currentStrokeWidth = width;
  }

  // Callback setters
  onDrawStart(callback) {
    this.onDrawStartCallback = callback;
  }

  onDrawMove(callback) {
    this.onDrawMoveCallback = callback;
  }

  onDrawEnd(callback) {
    this.onDrawEndCallback = callback;
  }

  onUndo(callback) {
    this.onUndoCallback = callback;
  }

  onRedo(callback) {
    this.onRedoCallback = callback;
  }

  // Load canvas state from server
  loadCanvasState(operations) {
    this.operations.clear();
    for (const op of operations) {
      this.operations.set(op.id, op);
    }
    this.redrawAll();
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export { CanvasManager };

