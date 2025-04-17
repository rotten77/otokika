// Main application file
class App {
    constructor() {
        this.triggers = [];
        this.currentTriggerId = 0;
        this.selectedTrigger = null;
        this.cameraStream = null;
        this.videoElement = document.getElementById('cameraView');
        this.canvas = document.getElementById('canvasOverlay');
        this.context = this.canvas.getContext('2d');
        this.motionDetector = new MotionDetector(this);
        this.ui = new UI(this);
        this.audioExporter = new AudioExporter();

        // Recording properties
        this.isRecording = false;
        this.audioContext = null;
        this.recordingDestination = null;
        this.recordingStream = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        
        // Initialize the application
        this.init();
    }

    async init() {
        try {
            // Load saved triggers
            this.loadTriggers();
            
            // Set up camera devices dropdown
            await this.setupCameras();
            
            // Start camera with first available device
            if (this.videoDevices && this.videoDevices.length > 0) {
                await this.startCamera(this.videoDevices[0].deviceId);
            }
            
            // Setup event listeners
            this.ui.setupEventListeners();
            
            // Handle canvas resizing
            window.addEventListener('resize', () => this.resizeCanvas());

            // Show the trigger config now that everything is loaded
        document.getElementById('triggerConfig').classList.add('loaded');
        } catch (error) {
            console.error('Initialization error:', error);
            alert('Error initializing the application: ' + error.message);
        }
    }

    async setupCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            const cameraSelect = document.getElementById('cameraSelect');
            cameraSelect.innerHTML = '';
            
            this.videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${cameraSelect.options.length + 1}`;
                cameraSelect.appendChild(option);
            });
            
            // Event listener for camera change
            cameraSelect.addEventListener('change', async (e) => {
                await this.startCamera(e.target.value);
            });
        } catch (error) {
            console.error('Error setting up cameras:', error);
            alert('Unable to access camera devices. Please ensure you have granted camera permissions.');
        }
    }

    async startCamera(deviceId) {
        try {
            // Stop any existing stream
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => track.stop());
            }
            
            // Get new stream
            const constraints = {
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.cameraStream;
            
            // Wait for video to be ready
            await new Promise(resolve => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    resolve();
                };
            });
            
            // Set up canvas
            this.resizeCanvas();
            
            // Start motion detection
            this.motionDetector.start();
        } catch (error) {
            console.error('Error starting camera:', error);
            alert('Unable to start camera: ' + error.message);
        }
    }

    resizeCanvas() {
        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;
        const containerWidth = this.videoElement.clientWidth;
        
        if (videoWidth && videoHeight) {
            const aspectRatio = videoWidth / videoHeight;
            const height = containerWidth / aspectRatio;
            
            this.canvas.width = containerWidth;
            this.canvas.height = height;
            
            // Redraw triggers
            this.ui.drawTriggers();
        }
    }

    addTrigger(x, y) {
        const triggerId = this.currentTriggerId++;
        const newTrigger = {
            id: triggerId,
            x: x,
            y: y,
            radius: 100,
            threshold: 10,
            cooldown: 0.5, // Default 1 second cooldown
            sound: null,
            soundData: null,
            audioBuffer: null
        };
        
        this.triggers.push(newTrigger);
        this.selectTrigger(newTrigger);
        this.saveTriggers();
        return newTrigger;
    }

    selectTrigger(trigger) {
        this.selectedTrigger = trigger;
        this.ui.updateTriggerConfig();
        this.ui.drawTriggers();
    }

    deleteTrigger(trigger) {
        const index = this.triggers.findIndex(t => t.id === trigger.id);
        if (index !== -1) {
            this.triggers.splice(index, 1);
            if (this.selectedTrigger === trigger) {
                this.selectedTrigger = null;
                this.ui.updateTriggerConfig();
            }
            this.saveTriggers();
            this.ui.drawTriggers();
        }
    }

    updateTriggerSound(soundFile) {
        if (!this.selectedTrigger) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                this.selectedTrigger.soundData = arrayBuffer;
                this.selectedTrigger.sound = soundFile.name;
                
                // Create audio buffer for playback
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.selectedTrigger.audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                
                this.ui.updateTriggerConfig();
                this.saveTriggers();
            } catch (error) {
                console.error('Error processing sound file:', error);
                alert('Error processing sound file. Please try another file.');
            }
        };
        reader.readAsArrayBuffer(soundFile);
    }

    updateTriggerThreshold(threshold) {
        if (!this.selectedTrigger) return;
        this.selectedTrigger.threshold = threshold;
        this.saveTriggers();
    }

    updateTriggerRadius(radius) {
        if (!this.selectedTrigger) return;
        this.selectedTrigger.radius = radius;
        this.ui.drawTriggers();
        this.saveTriggers();
    }

    updateTriggerCooldown(cooldown) {
        if (!this.selectedTrigger) return;
        this.selectedTrigger.cooldown = cooldown;
        this.saveTriggers();
    }

    saveTriggers() {
        // Create a saveable version of triggers with base64 encoded sound data
        const saveableTriggers = this.triggers.map(trigger => {
            const { audioBuffer, ...saveTrigger } = trigger;
            
            // Convert ArrayBuffer to base64 string for storage
            if (trigger.soundData && trigger.soundData instanceof ArrayBuffer) {
                const uint8Array = new Uint8Array(trigger.soundData);
                let binaryString = '';
                uint8Array.forEach(byte => {
                    binaryString += String.fromCharCode(byte);
                });
                saveTrigger.soundData = btoa(binaryString);
                saveTrigger.soundDataFormat = 'base64';
            }
            
            return saveTrigger;
        });
        
        // Save to localStorage
        try {
            localStorage.setItem('otokikaTriggers', JSON.stringify(saveableTriggers));
        } catch (error) {
            console.error('Error saving triggers:', error);
            alert('Error saving triggers. Your browser may have insufficient storage space.');
        }
    }

    async loadTriggers() {
        try {
            const savedTriggersJSON = localStorage.getItem('otokikaTriggers');
            if (savedTriggersJSON) {
                const savedTriggers = JSON.parse(savedTriggersJSON);
                
                // Find highest ID for new trigger counting
                let maxId = -1;
                
                // Process each saved trigger
                for (const trigger of savedTriggers) {
                    if (trigger.id > maxId) maxId = trigger.id;
                    
                    // Recreate audioBuffer if soundData exists
                    if (trigger.soundData) {
                        try {
                            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                            
                            // Convert base64 back to ArrayBuffer
                            let arrayBuffer;
                            if (trigger.soundDataFormat === 'base64' && typeof trigger.soundData === 'string') {
                                const binaryString = atob(trigger.soundData);
                                const bytes = new Uint8Array(binaryString.length);
                                for (let i = 0; i < binaryString.length; i++) {
                                    bytes[i] = binaryString.charCodeAt(i);
                                }
                                arrayBuffer = bytes.buffer;
                            } else {
                                // Handle legacy data or direct ArrayBuffer
                                arrayBuffer = trigger.soundData;
                            }
                            
                            // Store the converted ArrayBuffer back in the trigger
                            trigger.soundData = arrayBuffer;
                            
                            // Create audio buffer from the sound data
                            trigger.audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                            console.log('Successfully loaded sound for trigger:', trigger.id);
                        } catch (error) {
                            console.error('Error loading sound data for trigger:', trigger.id, error);
                            // Reset sound data if loading fails
                            trigger.sound = null;
                            trigger.soundData = null;
                        }
                    }
                }
                
                this.currentTriggerId = maxId + 1;
                this.triggers = savedTriggers;
                
                console.log('Loaded triggers:', this.triggers.length);
            }
            
            // Load flip setting (keep this part from previous fix)
            const flipSetting = localStorage.getItem('otokikaFlipCamera');
            if (flipSetting !== null) {
                const flipCheckbox = document.getElementById('flipCamera');
                const isFlipped = flipSetting === 'true';
                flipCheckbox.checked = isFlipped;
                
                // Apply flip to video element
                this.videoElement.style.transform = isFlipped ? 'scaleX(-1)' : 'scaleX(1)';
                
                // Set flip setting in motion detector
                this.motionDetector.setFlipHorizontal(isFlipped);
            }
        } catch (error) {
            console.error('Error loading triggers:', error);
            // Start fresh if loading fails
            this.triggers = [];
            this.currentTriggerId = 0;
        }
    }

    playSound(trigger) {
        if (!trigger.audioBuffer) return;
        
        // Check if the trigger is in cooldown
        const now = Date.now();
        const cooldownMs = (trigger.cooldown || 1) * 1000; // Convert seconds to milliseconds
        
        if (trigger.lastPlayed && (now - trigger.lastPlayed) < cooldownMs) {
            // Still in cooldown period
            return;
        }
        
        try {
            // Use the recording context if recording, otherwise create a new one
            const audioContext = this.isRecording ? this.audioContext : 
                                new (window.AudioContext || window.webkitAudioContext)();
            
            const source = audioContext.createBufferSource();
            source.buffer = trigger.audioBuffer;
            
            console.log("Playing sound, recording active:", this.isRecording);
            
            // If recording, connect to both speakers and recorder
            if (this.isRecording && this.recordingDestination) {
                console.log("Connecting sound to recording destination");
                source.connect(audioContext.destination); // Connect to speakers
                source.connect(this.recordingDestination); // Connect to recorder
            } else {
                source.connect(audioContext.destination); // Just connect to speakers
            }
            
            source.start(0);
            
            // Set last played timestamp
            trigger.lastPlayed = now;
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }

    saveFlipSetting(isFlipped) {
        try {
            localStorage.setItem('otokikaFlipCamera', isFlipped);
        } catch (error) {
            console.error('Error saving flip setting:', error);
        }
    }

    startRecording() {
        if (this.isRecording) return;
        
        try {
            console.log("Starting recording setup...");
            
            // Initialize audio context if needed
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Create a new destination for recording
            this.recordingDestination = this.audioContext.createMediaStreamDestination();
            this.recordingStream = this.recordingDestination.stream;
            
            console.log("Recording stream tracks:", this.recordingStream.getTracks().length);
            
            // Add a silent oscillator to ensure we have audio flowing
            // This ensures MediaRecorder has something to record even if no sounds are triggered
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            oscillator.frequency.value = 440; // 440 Hz
            gainNode.gain.value = 0.001; // Nearly silent
            oscillator.connect(gainNode);
            gainNode.connect(this.recordingDestination);
            oscillator.start();
            this.silentOscillator = oscillator; // Save reference to stop it later
            
            // Create MediaRecorder with specific MIME type
            const options = { mimeType: 'audio/webm' };
            this.mediaRecorder = new MediaRecorder(this.recordingStream, options);
            this.recordedChunks = [];
            
            // Set up event listeners
            this.mediaRecorder.ondataavailable = (e) => {
                console.log("Data available event fired, data size:", e.data.size);
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                    console.log("Total chunks now:", this.recordedChunks.length);
                }
            };
            
            this.mediaRecorder.onstart = () => {
                console.log("MediaRecorder started successfully");
            };
            
            this.mediaRecorder.onerror = (err) => {
                console.error("MediaRecorder error:", err);
            };
            
            // Start recording with a timeslice to get data regularly
            this.mediaRecorder.start(1000); // Request data every 1 second
            this.isRecording = true;
            
            // Update UI
            this.ui.updateRecordingStatus(true);
        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Error starting recording: ' + error.message);
        }
    }
    
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return Promise.resolve();
        
        console.log("Stopping recording...");
        
        return new Promise(resolve => {
            // Request final data chunk
            try {
                this.mediaRecorder.requestData();
            } catch (e) {
                console.log("Error requesting final data:", e);
            }
            
            this.mediaRecorder.onstop = () => {
                console.log("MediaRecorder stopped, total chunks:", this.recordedChunks.length);
                
                // Stop the silent oscillator
                if (this.silentOscillator) {
                    this.silentOscillator.stop();
                    this.silentOscillator = null;
                }
                
                this.isRecording = false;
                
                // Update UI
                this.ui.updateRecordingStatus(false);
                resolve();
            };
            
            // Stop the recording
            this.mediaRecorder.stop();
        });
    }
    
    exportRecording() {
        if (this.isRecording) {
            console.log("Stopping recording before export");
            this.stopRecording().then(() => this.doExport());
        } else {
            this.doExport();
        }
    }
    
    doExport() {
        console.log("Exporting recording, chunks:", this.recordedChunks.length);
        
        if (!this.recordedChunks.length) {
            alert('No recording available to export');
            return;
        }
        
        try {
            // Use the audio exporter to export as WAV with WEBM fallback
            this.audioExporter.exportAudio(this.recordedChunks, 'otokika-recording');
        } catch (error) {
            console.error('Error exporting recording:', error);
            alert('Error exporting recording: ' + error.message);
        }
    }
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});