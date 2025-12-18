import { useState } from 'react';

interface Props {
  onCapture: (screenshot: string) => void; // Base64 data URL
}

export function ScreenshotCapture({ onCapture }: Props) {
  const [capturing, setCapturing] = useState(false);

  const captureScreen = async () => {
    try {
      setCapturing(true);

      // Request screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' } as MediaStreamConstraints['video'],
      });

      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Wait for video to load
      await new Promise(resolve => {
        video.onloadedmetadata = resolve;
      });

      // Create canvas and capture frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);

      // Stop stream
      stream.getTracks().forEach(track => track.stop());

      // Convert to base64
      const dataUrl = canvas.toDataURL('image/png');
      onCapture(dataUrl);

      console.log('[ScreenshotCapture] Captured screenshot');
    } catch (err) {
      // User cancelled or error occurred
      if ((err as Error).name === 'NotAllowedError') {
        console.log('[ScreenshotCapture] User cancelled');
      } else {
        console.error('[ScreenshotCapture] Error:', err);
      }
    } finally {
      setCapturing(false);
    }
  };

  return (
    <button
      onClick={captureScreen}
      disabled={capturing}
      className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
      title="Capture screenshot"
    >
      📷
    </button>
  );
}
