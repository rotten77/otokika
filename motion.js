// Motion detection module
class MotionDetector {
    constructor(app) {
        this.app = app;
        this.video = app.videoElement;
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        this.previousFrame = null;
        this.isRunning = false;
        this.processingFrame = false;
        this.flipHorizontal = false;
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.detectMotion();
    }

    stop() {
        this.isRunning = false;
    }

    setFlipHorizontal(flip) {
        this.flipHorizontal = flip;
    }

    async detectMotion() {
        if (!this.isRunning || this.processingFrame) {
            requestAnimationFrame(() => this.detectMotion());
            return;
        }

        try {
            this.processingFrame = true;
            
            // Set canvas dimensions to match video
            const videoWidth = this.video.videoWidth;
            const videoHeight = this.video.videoHeight;
            
            if (!videoWidth || !videoHeight) {
                this.processingFrame = false;
                requestAnimationFrame(() => this.detectMotion());
                return;
            }
            
            this.canvas.width = videoWidth;
            this.canvas.height = videoHeight;
            
            // Capture current frame
            this.context.save();
            if (this.flipHorizontal) {
                this.context.translate(videoWidth, 0);
                this.context.scale(-1, 1);
            }
            this.context.drawImage(this.video, 0, 0, videoWidth, videoHeight);
            this.context.restore();
            
            const currentFrame = this.context.getImageData(0, 0, videoWidth, videoHeight);
            
            // Skip first frame (no previous frame to compare)
            if (!this.previousFrame) {
                this.previousFrame = currentFrame;
                this.processingFrame = false;
                requestAnimationFrame(() => this.detectMotion());
                return;
            }
            
            // Check each trigger for motion
            for (const trigger of this.app.triggers) {
                const motionPercentage = this.analyzeMotionInZone(
                    trigger,
                    currentFrame,
                    this.previousFrame,
                    videoWidth,
                    videoHeight
                );
                
                // If motion exceeds threshold, play sound
                if (motionPercentage >= trigger.threshold) {
                    this.app.playSound(trigger);
                }
            }
            
            // Save current frame for next comparison
            this.previousFrame = currentFrame;
            
        } catch (error) {
            console.error('Error in motion detection:', error);
        }
        
        this.processingFrame = false;
        requestAnimationFrame(() => this.detectMotion());
    }

    analyzeMotionInZone(trigger, currentFrame, previousFrame, width, height) {
        // Convert trigger coordinates to video coordinates
        const scaleX = width / this.app.canvas.width;
        const scaleY = height / this.app.canvas.height;
        
        const centerX = trigger.x * scaleX;
        const centerY = trigger.y * scaleY;
        const radius = trigger.radius * scaleX;
        
        // Count changed pixels and total pixels in zone
        let changedPixels = 0;
        let totalPixels = 0;
        const threshold = 30; // Sensitivity for pixel difference
        
        // Analyze pixels in a square bounding the circle for efficiency
        const startX = Math.max(0, Math.floor(centerX - radius));
        const endX = Math.min(width - 1, Math.ceil(centerX + radius));
        const startY = Math.max(0, Math.floor(centerY - radius));
        const endY = Math.min(height - 1, Math.ceil(centerY + radius));
        
        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                // Check if point is inside circle
                const distSquared = Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2);
                if (distSquared <= radius * radius) {
                    // Get pixel index
                    const index = (y * width + x) * 4;
                    
                    // Compare RGB values
                    const rDiff = Math.abs(currentFrame.data[index] - previousFrame.data[index]);
                    const gDiff = Math.abs(currentFrame.data[index + 1] - previousFrame.data[index + 1]);
                    const bDiff = Math.abs(currentFrame.data[index + 2] - previousFrame.data[index + 2]);
                    
                    // Average difference
                    const diff = (rDiff + gDiff + bDiff) / 3;
                    
                    if (diff > threshold) {
                        changedPixels++;
                    }
                    
                    totalPixels++;
                }
            }
        }
        
        // Calculate percentage of changed pixels
        return totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0;
    }
}