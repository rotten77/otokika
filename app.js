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
        this.videoFiles = []; // Array to store multiple video files
        this.lastSelectedValue = null; // Track the last selected input source
        
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
                // Store this as the last selected value
                this.lastSelectedValue = this.videoDevices[0].deviceId;
                // Select the first camera in the dropdown
                const cameraSelect = document.getElementById('cameraSelect');
                cameraSelect.value = this.videoDevices[0].deviceId;
            }
            
            // Setup event listeners
            this.ui.setupEventListeners();
            
            // Setup video file input handler
            this.setupVideoFileInput();
            
            // Setup progress bar for video/camera
            this.setupProgressBar();
            
            // Handle canvas resizing
            window.addEventListener('resize', () => this.resizeCanvas());

            // Show the trigger config now that everything is loaded
            document.getElementById('triggerConfig').classList.add('loaded');
            
            // Ensure video always loops
            this.setupVideoLooping();
        } catch (error) {
            console.error('Initialization error:', error);
            alert('Error initializing the application: ' + error.message);
        }
    }
    
    setupVideoLooping() {
        // Ensure videos always loop
        this.videoElement.loop = true;
        
        // Add event listener to handle looping issues
        this.videoElement.addEventListener('ended', () => {
            // If for any reason the video ends (loop fails), restart it
            this.videoElement.currentTime = 0;
            this.videoElement.play().catch(error => {
                console.error('Error restarting video:', error);
            });
        });
    }
    
    setupProgressBar() {
        // Create progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        
        // Create the progress bar itself
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressContainer.appendChild(progressBar);
        
        // Add to the camera container
        const cameraContainer = document.querySelector('.camera-container');
        cameraContainer.appendChild(progressContainer);
        
        // Store references
        this.progressContainer = progressContainer;
        this.progressBar = progressBar;
        
        // Add timeupdate event listener to video element
        this.videoElement.addEventListener('timeupdate', () => this.updateProgressBar());
    }
    
    updateProgressBar() {
        if (!this.progressBar) return;
        
        // If using camera stream, show full red bar
        if (this.cameraStream && this.videoElement.srcObject === this.cameraStream) {
            this.progressBar.classList.add('camera-active');
            // Reset the width style to ensure it's not using the previous video's position
            this.progressBar.style.width = '100%';
        } else if (this.videoElement.src) {
            // If using video file, show progress based on current time
            this.progressBar.classList.remove('camera-active');
            
            // Calculate width percentage
            if (this.videoElement.duration) {
                const percentage = (this.videoElement.currentTime / this.videoElement.duration) * 100;
                this.progressBar.style.width = percentage + '%';
            }
        }
    }

    setupVideoFileInput() {
        // Create a hidden file input element for video selection
        const videoFileInput = document.createElement('input');
        videoFileInput.type = 'file';
        videoFileInput.accept = 'video/*';
        videoFileInput.style.display = 'none';
        videoFileInput.id = 'videoFileInput';
        document.body.appendChild(videoFileInput);
        
        // Handle file selection
        videoFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.handleVideoFileSelection(e.target.files[0]);
                // Reset the input so the same file can be selected again if needed
                videoFileInput.value = '';
            }
        });
        
        // Store reference to the element
        this.videoFileInput = videoFileInput;
        
        // Handle page unload to clean up object URLs
        window.addEventListener('beforeunload', () => {
            // Clean up any created object URLs
            if (this.videoFiles && this.videoFiles.length > 0) {
                // Only release the object URL if it's from our video files
                if (this.videoElement.src && this.videoElement.src.startsWith('blob:')) {
                    URL.revokeObjectURL(this.videoElement.src);
                }
            }
        });
    }

    async setupCameras() {
        try {
            // Track video files added by user
            this.videoFiles = this.videoFiles || [];
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            const cameraSelect = document.getElementById('cameraSelect');
            cameraSelect.innerHTML = '';
            
            // Add camera options first
            if (this.videoDevices.length > 0) {
                this.videoDevices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label || `Camera ${cameraSelect.options.length + 1}`;
                    cameraSelect.appendChild(option);
                });
            } else {
                // No camera available
                const noCameraOption = document.createElement('option');
                noCameraOption.value = 'no-camera';
                noCameraOption.text = 'No webcam found';
                cameraSelect.appendChild(noCameraOption);
            }
            
            // Add separator
            const separatorOption = document.createElement('option');
            separatorOption.disabled = true;
            separatorOption.text = '───────────────';
            cameraSelect.appendChild(separatorOption);
            
            // Add previously loaded video files
            if (this.videoFiles.length > 0) {
                this.videoFiles.forEach((videoFile, index) => {
                    const option = document.createElement('option');
                    option.value = `video-file-${index}`;
                    option.text = `Video: ${videoFile.name}`;
                    cameraSelect.appendChild(option);
                });
            }
            
            // Add option to select a new video file
            const videoFileOption = document.createElement('option');
            videoFileOption.value = 'add-video-file';
            videoFileOption.text = '+ Add video file';
            cameraSelect.appendChild(videoFileOption);
            
            // Event listener for camera/video file change
            cameraSelect.addEventListener('change', async (e) => {
                if (e.target.value === 'add-video-file') {
                    // Trigger file input when "Add video file" is chosen
                    this.videoFileInput.click();
                    // Revert selection to previous item to prevent showing "+ Add video file" as selected
                    if (this.lastSelectedValue) {
                        cameraSelect.value = this.lastSelectedValue;
                    } else {
                        // Default to first camera or "No webcam found"
                        cameraSelect.selectedIndex = 0;
                    }
                } else if (e.target.value.startsWith('video-file-')) {
                    // User selected a previously added video file
                    const fileIndex = parseInt(e.target.value.split('-')[2]);
                    if (this.videoFiles[fileIndex]) {
                        this.loadVideoFile(this.videoFiles[fileIndex]);
                        this.lastSelectedValue = e.target.value;
                    }
                } else if (e.target.value !== 'no-camera') {
                    // User selected a camera
                    await this.startCamera(e.target.value);
                    this.lastSelectedValue = e.target.value;
                }
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
            
            // Clear any video file source
            if (this.videoElement.src) {
                this.videoElement.src = '';
                // Don't revoke URL here as we want to keep videos available
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
            
            // Reset progress bar to camera mode immediately
            if (this.progressBar) {
                this.progressBar.classList.add('camera-active');
                this.progressBar.style.width = '100%';
            }
            
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
            
            // Update progress bar to show full red (camera mode)
            this.updateProgressBar();
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

    handleVideoFileSelection(file) {
        // Stop any existing camera stream
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        // Initialize videoFiles array if needed
        this.videoFiles = this.videoFiles || [];
        
        // Add the file to the collection
        this.videoFiles.push(file);
        const fileIndex = this.videoFiles.length - 1;
        
        // Load the selected video file
        this.loadVideoFile(file);
        
        // Update dropdown with the new video file
        const cameraSelect = document.getElementById('cameraSelect');
        
        // Find the position to insert before "Add video file" option
        const addVideoOption = Array.from(cameraSelect.options).findIndex(option => 
            option.value === 'add-video-file');
        
        // Create new option for this video
        const newOption = document.createElement('option');
        newOption.value = `video-file-${fileIndex}`;
        newOption.text = `Video: ${file.name}`;
        
        // Insert the new option before the "Add video file" option
        const beforeOption = cameraSelect.options[addVideoOption];
        cameraSelect.insertBefore(newOption, beforeOption);
        
        // Select the newly added video
        cameraSelect.value = `video-file-${fileIndex}`;
        this.lastSelectedValue = `video-file-${fileIndex}`;
        
        // Notify user about the file not being saved
        alert('Note: The video file will be used for this session only and will not be stored.');
    }
    
    loadVideoFile(file) {
        // Set video source to the file
        const videoURL = URL.createObjectURL(file);
        this.videoElement.srcObject = null;
        this.videoElement.src = videoURL;
        
        // Ensure loop property is set
        this.videoElement.loop = true;
        
        // Force autoplay
        this.videoElement.autoplay = true;
        
        // Play the video
        this.videoElement.play().then(() => {
            console.log('Video playback started successfully');
            // Set up canvas once video is playing
            this.resizeCanvas();
            
            // Start motion detection
            this.motionDetector.start();
            
            // Initialize progress bar
            this.updateProgressBar();
        }).catch(error => {
            console.error('Error playing video:', error);
            alert('Unable to play video: ' + error.message);
        });
        
        // Add event listeners to ensure continuous playback
        this.videoElement.onended = () => {
            console.log('Video ended event triggered, restarting...');
            this.videoElement.currentTime = 0;
            this.videoElement.play().catch(e => console.error('Error restarting video:', e));
        };
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
            
            // Redraw triggers to show active state
            this.ui.drawTriggers();
            
            // Create a timeout to redraw again after the active state period
            setTimeout(() => {
                this.ui.drawTriggers();
            }, 300); // Match the duration in UI.drawTriggers
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