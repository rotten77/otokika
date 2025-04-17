// UI handling module
class UI {
    constructor(app) {
        this.app = app;
        this.canvas = app.canvas;
        this.context = app.context;
        this.isDragging = false;
        this.dragTarget = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        
        // Make canvas overlay receive pointer events
        this.canvas.style.pointerEvents = 'auto';
    }

    setupEventListeners() {
        // Make sure canvas can receive pointer events
        this.canvas.style.pointerEvents = 'auto';
        
        // Button for adding new triggers
        document.getElementById('addTriggerBtn').addEventListener('click', () => {
            const canvasRect = this.canvas.getBoundingClientRect();
            const x = canvasRect.width / 2;
            const y = canvasRect.height / 2;
            this.app.addTrigger(x, y);
        });
        
        // Canvas click handling
        this.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.onCanvasMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.onCanvasMouseUp());
        
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => this.onCanvasTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onCanvasTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', () => this.onCanvasMouseUp());
        
        // Sound file input
        document.getElementById('soundFile').addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.app.updateTriggerSound(e.target.files[0]);
            }
        });
        
        // Test sound button
        document.getElementById('testSoundBtn').addEventListener('click', () => {
            if (this.app.selectedTrigger && this.app.selectedTrigger.audioBuffer) {
                this.app.playSound(this.app.selectedTrigger);
            }
        });
        
        // Threshold slider
        document.getElementById('thresholdSlider').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('thresholdValue').textContent = value;
            this.app.updateTriggerThreshold(value);
        });
        
        // Circle size slider
        document.getElementById('circleSizeRadius').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('circleSizeValue').textContent = value;
            this.app.updateTriggerRadius(value);
        });
        
        // Delete trigger button
        document.getElementById('deleteTriggerBtn').addEventListener('click', () => {
            if (this.app.selectedTrigger) {
                this.app.deleteTrigger(this.app.selectedTrigger);
            }
        });
        

        
        // Keyboard shortcuts for trigger actions
        document.addEventListener('keydown', (e) => {
            // Ignore keyboard shortcuts if user is typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // Delete trigger with Delete key, Backspace key, or 'D' key
            if ((e.key === 'Delete' || e.key === 'Backspace' || e.key.toUpperCase() === 'D') && this.app.selectedTrigger) {
                this.app.deleteTrigger(this.app.selectedTrigger);
            }
            
            // Add trigger with 'A' key
            if (e.key.toUpperCase() === 'A') {
                const canvasRect = this.canvas.getBoundingClientRect();
                const x = canvasRect.width / 2;
                const y = canvasRect.height / 2;
                this.app.addTrigger(x, y);
            }
            
            // Toggle recording with 'S' key
            if (e.key.toUpperCase() === 'S') {
                if (this.app.isRecording) {
                    this.app.stopRecording();
                } else {
                    this.app.startRecording();
                }
                e.preventDefault(); // Prevent 's' from being typed in any text field
            }
            
            // Export recording with 'E' key
            if (e.key.toUpperCase() === 'E') {
                this.app.exportRecording();
                e.preventDefault();
            }
        });

        // Flip checkbox
        document.getElementById('flipCamera').addEventListener('change', (e) => {
            const isFlipped = e.target.checked;
            this.app.motionDetector.setFlipHorizontal(isFlipped);
            
            // Apply CSS transform to video
            this.app.videoElement.style.transform = isFlipped ? 'scaleX(-1)' : 'scaleX(1)';
            
            // Save flip setting
            this.app.saveFlipSetting(isFlipped);
        });

        // Cooldown slider
        document.getElementById('cooldownInput').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('cooldownValue').textContent = value.toFixed(1);
            this.app.updateTriggerCooldown(value);
        });

        // Recording button
        const recordButton = document.getElementById('recordButton');
        recordButton.addEventListener('click', () => {
            if (this.app.isRecording) {
                this.app.stopRecording();
            } else {
                this.app.startRecording();
            }
        });
        
        // Export button
        const exportButton = document.getElementById('exportButton');
        exportButton.addEventListener('click', () => {
            this.app.exportRecording();
        });

        this.updateTriggerConfig();
    }

    onCanvasMouseDown(e) {
        e.preventDefault();
        const point = this.getCanvasPoint(e);
        this.handlePointerDown(point.x, point.y);
    }

    onCanvasTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const point = this.getTouchPoint(e.touches[0]);
            this.handlePointerDown(point.x, point.y);
        }
    }

    handlePointerDown(x, y) {
        // Check if click is inside a trigger
        for (const trigger of this.app.triggers) {
            const distance = Math.sqrt(Math.pow(x - trigger.x, 2) + Math.pow(y - trigger.y, 2));
            if (distance <= trigger.radius) {
                this.isDragging = true;
                this.dragTarget = trigger;
                this.dragOffsetX = x - trigger.x;
                this.dragOffsetY = y - trigger.y;
                this.app.selectTrigger(trigger);
                return;
            }
        }
        
        // If not inside a trigger, deselect
        if (this.app.selectedTrigger) {
            this.app.selectTrigger(null);
        }
    }

    onCanvasMouseMove(e) {
        e.preventDefault();
        if (this.isDragging && this.dragTarget) {
            const point = this.getCanvasPoint(e);
            this.handlePointerMove(point.x, point.y);
        }
    }

    onCanvasTouchMove(e) {
        e.preventDefault();
        if (this.isDragging && this.dragTarget && e.touches.length === 1) {
            const point = this.getTouchPoint(e.touches[0]);
            this.handlePointerMove(point.x, point.y);
        }
    }

    handlePointerMove(x, y) {
        // Update trigger position
        this.dragTarget.x = x - this.dragOffsetX;
        this.dragTarget.y = y - this.dragOffsetY;
        
        // Keep trigger inside canvas bounds
        this.dragTarget.x = Math.max(this.dragTarget.radius, Math.min(this.canvas.width - this.dragTarget.radius, this.dragTarget.x));
        this.dragTarget.y = Math.max(this.dragTarget.radius, Math.min(this.canvas.height - this.dragTarget.radius, this.dragTarget.y));
        
        // Redraw triggers
        this.drawTriggers();
        
        // Save triggers
        this.app.saveTriggers();
    }

    onCanvasMouseUp() {
        this.isDragging = false;
        this.dragTarget = null;
    }

    getCanvasPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    getTouchPoint(touch) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    drawTriggers() {
        // Clear canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw each trigger
        for (const trigger of this.app.triggers) {
            this.context.beginPath();
            this.context.arc(trigger.x, trigger.y, trigger.radius, 0, Math.PI * 2);
            this.context.strokeStyle = trigger === this.app.selectedTrigger ? '#ffff00' : '#ff0000';
            this.context.lineWidth = trigger === this.app.selectedTrigger ? 3 : 2;
            this.context.stroke();
            
            // Add sound name if available
            if (trigger.sound) {
                this.context.font = '14px Arial';
                this.context.fillStyle = '#ffffff';
                this.context.textAlign = 'center';
                
                // Create background for text
                const textMetrics = this.context.measureText(trigger.sound);
                const textWidth = textMetrics.width;
                const textHeight = 20;
                
                this.context.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.context.fillRect(
                    trigger.x - textWidth / 2 - 5,
                    trigger.y - 10,
                    textWidth + 10,
                    textHeight
                );
                
                // Draw text
                this.context.fillStyle = '#ffffff';
                this.context.fillText(trigger.sound, trigger.x, trigger.y + 5);
            }
        }
    }

    updateTriggerConfig() {
        const triggerControls = document.querySelector('.trigger-controls');
        const thresholdSlider = document.getElementById('thresholdSlider');
        const thresholdValue = document.getElementById('thresholdValue');
        const circleSizeSlider = document.getElementById('circleSizeRadius');
        const circleSizeValue = document.getElementById('circleSizeValue');
        const cooldownInput = document.getElementById('cooldownInput');
        const cooldownValue = document.getElementById('cooldownValue');
        const currentSound = document.getElementById('currentSound');
        const testSoundBtn = document.getElementById('testSoundBtn');
        const soundFileInput = document.getElementById('soundFile');
        const deleteTriggerBtn = document.getElementById('deleteTriggerBtn');
        
        // Get all form elements in the triggerConfig
        const formElements = [
            thresholdSlider, 
            circleSizeSlider, 
            cooldownInput, 
            soundFileInput, 
            testSoundBtn, 
            deleteTriggerBtn
        ];
        
        if (this.app.selectedTrigger) {
            // Enable all form controls
            formElements.forEach(el => el.disabled = false);
            triggerControls.classList.remove('disabled');
            
            // Update threshold slider
            thresholdSlider.value = this.app.selectedTrigger.threshold;
            thresholdValue.textContent = this.app.selectedTrigger.threshold;
            
            // Update circle size slider
            circleSizeSlider.value = this.app.selectedTrigger.radius;
            circleSizeValue.textContent = this.app.selectedTrigger.radius;
            
            // Update cooldown slider
            const cooldown = this.app.selectedTrigger.cooldown !== undefined ? this.app.selectedTrigger.cooldown : 1;
            cooldownInput.value = cooldown;
            cooldownValue.textContent = cooldown.toFixed(1);
            
            // Update sound display
            if (this.app.selectedTrigger.sound) {
                currentSound.textContent = this.app.selectedTrigger.sound;
                testSoundBtn.disabled = false;
            } else {
                currentSound.textContent = 'No sound selected';
                testSoundBtn.disabled = true;
            }
        } else {
            // Disable all form controls
            formElements.forEach(el => el.disabled = true);
            triggerControls.classList.add('disabled');
            
            // Reset to default values for visual consistency
            thresholdValue.textContent = thresholdSlider.value;
            circleSizeValue.textContent = circleSizeSlider.value;
            cooldownValue.textContent = parseFloat(cooldownInput.value).toFixed(1);
            currentSound.textContent = 'No trigger selected';
        }
    }

    updateRecordingStatus(isRecording) {
        const recordButton = document.getElementById('recordButton');
        const exportButton = document.getElementById('exportButton');
        const recordingStatus = document.getElementById('recordingStatus');
        
        if (isRecording) {
            recordButton.textContent = 'Stop Recording';
            recordButton.classList.add('recording');
            recordingStatus.textContent = 'Recording...';
            recordingStatus.classList.add('active');
            exportButton.disabled = true;
        } else {
            recordButton.textContent = 'Start Recording';
            recordButton.classList.remove('recording');
            recordingStatus.textContent = 'Not Recording';
            recordingStatus.classList.remove('active');
            
            // Check app for recorded chunks
            const hasChunks = this.app.recordedChunks && this.app.recordedChunks.length > 0;
            console.log("UI: Checking recorded chunks, found:", this.app.recordedChunks?.length || 0);
            exportButton.disabled = !hasChunks;
        }
    }
}