// Audio export handling module
class AudioExporter {
  constructor() {
      // Sample rate for WAV export (standard CD quality)
      this.sampleRate = 44100;
  }

  /**
   * Export recorded audio chunks to WAV or WEBM
   * @param {Array} recordedChunks - The recorded audio chunks from MediaRecorder
   * @param {String} prefix - File name prefix
   * @returns {Promise<void>}
   */
  async exportAudio(recordedChunks, prefix = 'otokika-recording') {
      if (!recordedChunks || recordedChunks.length === 0) {
          alert('No recording available to export');
          return;
      }

      try {
          console.log("Starting export process with", recordedChunks.length, "chunks");
          
          // First attempt: Try to convert to WAV
          try {
              await this.exportToWAV(recordedChunks, prefix);
              console.log("WAV export successful");
          } catch (wavError) {
              console.error("WAV export failed:", wavError);
              
              // Fallback: Export as WEBM (original format)
              try {
                  this.exportToWEBM(recordedChunks, prefix);
                  console.log("Fallback to WEBM export successful");
              } catch (webmError) {
                  console.error("WEBM export also failed:", webmError);
                  throw new Error("Both WAV and WEBM export failed");
              }
          }
      } catch (error) {
          console.error('Error exporting recording:', error);
          alert('Error exporting recording: ' + error.message);
      }
  }

  /**
   * Export audio to WAV format
   * @param {Array} recordedChunks - The recorded audio chunks
   * @param {String} prefix - File name prefix
   * @returns {Promise<void>}
   */
  async exportToWAV(recordedChunks, prefix) {
      // Create a blob from the recording chunks
      const webmBlob = new Blob(recordedChunks, { type: 'audio/webm' });
      console.log("Created WEBM blob of size:", webmBlob.size);
      
      // Convert WEBM to WAV using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Read the blob as an array buffer
      const arrayBuffer = await webmBlob.arrayBuffer();
      
      // Decode the audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log("Decoded audio buffer:", audioBuffer);
      
      // Convert to WAV
      const wavBlob = this.audioBufferToWAV(audioBuffer);
      console.log("Created WAV blob of size:", wavBlob.size);
      
      // Create a download link
      const url = URL.createObjectURL(wavBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.wav';
      
      // Add to DOM, click, and remove
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up
      URL.revokeObjectURL(url);
  }

  /**
   * Export audio to WEBM format (original format)
   * @param {Array} recordedChunks - The recorded audio chunks
   * @param {String} prefix - File name prefix
   */
  exportToWEBM(recordedChunks, prefix) {
      // Create a blob from the recording chunks
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      console.log("Created WEBM blob of size:", blob.size);
      
      // Create a download link
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
      
      // Add to DOM, click, and remove
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up
      URL.revokeObjectURL(url);
  }

  /**
   * Convert an AudioBuffer to a WAV blob
   * @param {AudioBuffer} audioBuffer - The audio buffer to convert
   * @returns {Blob} - WAV blob
   */
  audioBufferToWAV(audioBuffer) {
      const numOfChannels = audioBuffer.numberOfChannels;
      const length = audioBuffer.length * numOfChannels * 2; // 2 bytes per sample (16-bit)
      const sampleRate = audioBuffer.sampleRate || this.sampleRate;
      
      // Create the WAV file
      const buffer = new ArrayBuffer(44 + length);
      const view = new DataView(buffer);
      
      // RIFF identifier
      this.writeString(view, 0, 'RIFF');
      // File length
      view.setUint32(4, 36 + length, true);
      // RIFF type
      this.writeString(view, 8, 'WAVE');
      // Format chunk identifier
      this.writeString(view, 12, 'fmt ');
      // Format chunk length
      view.setUint32(16, 16, true);
      // Sample format (1 = PCM)
      view.setUint16(20, 1, true);
      // Channels
      view.setUint16(22, numOfChannels, true);
      // Sample rate
      view.setUint32(24, sampleRate, true);
      // Byte rate (sample rate * block align)
      view.setUint32(28, sampleRate * numOfChannels * 2, true);
      // Block align (channel count * bytes per sample)
      view.setUint16(32, numOfChannels * 2, true);
      // Bits per sample
      view.setUint16(34, 16, true);
      // Data chunk identifier
      this.writeString(view, 36, 'data');
      // Data chunk length
      view.setUint32(40, length, true);
      
      // Write the PCM samples
      const offset = 44;
      const channelData = [];
      
      // Extract channel data
      for (let i = 0; i < numOfChannels; i++) {
          channelData.push(audioBuffer.getChannelData(i));
      }
      
      // Interleave channel data and convert to 16-bit PCM
      let index = 0;
      for (let i = 0; i < audioBuffer.length; i++) {
          for (let c = 0; c < numOfChannels; c++) {
              const sample = Math.max(-1, Math.min(1, channelData[c][i])); // Clamp
              const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // Scale to 16-bit
              view.setInt16(offset + index, value, true);
              index += 2;
          }
      }
      
      return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Write a string to a DataView at the specified offset
   * @param {DataView} view - DataView to write to
   * @param {Number} offset - Offset to write at
   * @param {String} string - String to write
   */
  writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
      }
  }
}