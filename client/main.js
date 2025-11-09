// Main application initialization

import { CanvasManager } from './canvas.js';
import { WebSocketClient } from './websocket.js';

let canvasManager;
let wsClient;

function initializeApp() {
  try {
    // Initialize canvas manager
    canvasManager = new CanvasManager('drawingCanvas', 'cursorCanvas');
    
    // Initialize WebSocket client
    wsClient = new WebSocketClient(canvasManager);
    wsClient.connect();
    
    // Setup UI event listeners
    setupToolbar();
    setupJoinButton();
    setupCanvasCursorTracking();
    
    console.log('Application initialized');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    alert('Failed to initialize application. Please refresh the page.');
  }
}

function setupToolbar() {
  // Tool selection
  const brushTool = document.getElementById('brushTool');
  const eraserTool = document.getElementById('eraserTool');
  
  brushTool?.addEventListener('click', () => {
    canvasManager.setTool('brush');
    brushTool.classList.add('active');
    eraserTool?.classList.remove('active');
  });
  
  eraserTool?.addEventListener('click', () => {
    canvasManager.setTool('eraser');
    eraserTool.classList.add('active');
    brushTool?.classList.remove('active');
  });
  
  // Color picker
  const colorPicker = document.getElementById('colorPicker');
  const colorPresets = document.querySelectorAll('.color-preset');
  
  colorPicker?.addEventListener('input', (e) => {
    const color = e.target.value;
    canvasManager.setColor(color);
  });
  
  colorPresets.forEach(preset => {
    preset.addEventListener('click', () => {
      const color = preset.getAttribute('data-color');
      if (color) {
        canvasManager.setColor(color);
        if (colorPicker) {
          colorPicker.value = color;
        }
      }
    });
  });
  
  // Stroke width
  const strokeWidthSlider = document.getElementById('strokeWidth');
  const strokeWidthValue = document.getElementById('strokeWidthValue');
  
  strokeWidthSlider?.addEventListener('input', (e) => {
    const width = parseInt(e.target.value);
    canvasManager.setStrokeWidth(width);
    if (strokeWidthValue) {
      strokeWidthValue.textContent = `${width}px`;
    }
  });
  
  // Action buttons
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const clearBtn = document.getElementById('clearBtn');
  
  undoBtn?.addEventListener('click', () => {
    wsClient.undo();
  });
  
  redoBtn?.addEventListener('click', () => {
    wsClient.redo();
  });
  
  clearBtn?.addEventListener('click', () => {
    if (confirm('Clear the entire canvas? This action cannot be undone.')) {
      wsClient.clear();
    }
  });
}

function setupJoinButton() {
  const joinBtn = document.getElementById('joinBtn');
  const userNameInput = document.getElementById('userName');
  const roomIdInput = document.getElementById('roomId');
  
  joinBtn?.addEventListener('click', () => {
    const userName = userNameInput?.value.trim() || `User${Math.random().toString(36).substr(2, 6)}`;
    const roomId = roomIdInput?.value.trim() || '';
    
    if (userName) {
      wsClient.joinRoom(roomId, userName);
      
      // Disable inputs after joining
      if (userNameInput) userNameInput.disabled = true;
      if (roomIdInput) roomIdInput.disabled = true;
      if (joinBtn) joinBtn.disabled = true;
    }
  });
  
  // Allow Enter key to join
  userNameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinBtn?.click();
    }
  });
  
  roomIdInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinBtn?.click();
    }
  });
}

function setupCanvasCursorTracking() {
  const canvas = document.getElementById('drawingCanvas');
  if (!canvas) return;
  
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    wsClient.sendCursorPosition(x, y);
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Export for debugging
window.canvasManager = canvasManager;
window.wsClient = wsClient;

