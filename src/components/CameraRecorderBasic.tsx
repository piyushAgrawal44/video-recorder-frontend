import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

const MAX_DURATION = 120; // seconds (2 minutes)

const CameraRecorder = ({ socket }: { socket: Socket }) => {
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState<number>(0);
  const timerRef = useRef<any | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isCameraLoading, setIsCameraLoading] = useState(true);

  // Add a ref to track if the initial header has been sent
  const hasSentInitialHeader = useRef(false);

  const requestCameraAccess = async () => {
    setIsCameraLoading(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(mediaStream);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = mediaStream;
        liveVideoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setStatus("Camera access failed. Please check permissions.");
    } finally {
      setIsCameraLoading(false);
    }
  };

  const startRecording = () => {
    if (!stream) {
      setStatus("No camera stream available");
      return;
    }

    if (mediaRecorder?.state === "recording") {
      setStatus("Already recording!");
      return;
    }

    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm; codecs=vp9,opus")
        ? "video/webm; codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm; codecs=vp8,opus")
        ? "video/webm; codecs=vp8,opus"
        : "video/webm";

      // const chunks: Blob[] = []; // This 'chunks' array is for local use if needed, not for sending
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });
      mediaRecorderRef.current = recorder;
      setMediaRecorder(recorder);
      setIsRecording(true);
      setTimer(0);
      setStatus("Recording started (max 2 mins)");
      hasSentInitialHeader.current = false; // Reset for a new recording

      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          const next = prev + 1;
          if (next >= MAX_DURATION) {
            stopRecording();
          }
          return next;
        });
      }, 1000);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result) {
              const isInitialChunk = !hasSentInitialHeader.current;
              socket.emit("video-chunk", reader.result, isInitialChunk);
              if (isInitialChunk) {
                hasSentInitialHeader.current = true; // Mark as sent
                console.log("🔥 Sent initial header chunk");
              }
            }
          };
          reader.onerror = () => {
            console.error("Error reading chunk data");
          };
          reader.readAsArrayBuffer(event.data);
        }
      };

      recorder.onstop = () => {
        // The `chunks` array here would only contain data since the last `ondataavailable`
        // before `stop()` was called, if `recorder.start(timeslice)` was used.
        // For the purpose of sending to Cloudinary, the server will concatenate all received chunks.
        clearInterval(timerRef.current!);
        setIsRecording(false); // Set to false here to avoid race conditions with status updates

        setStatus("Finalizing recording..."); // Update status immediately
        socket.emit("recording-stopped");
      };

      socket.emit("recording-start");
      recorder.start(1000); // Request data every 1000ms (1 second) for better chunking and potential keyframe alignment
    } catch (err) {
      console.error("Failed to start recording:", err);
      setStatus(`Recording failed: ${err}`);
      setIsRecording(false);
    }
  };
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (err) {
        console.error("Error stopping recording:", err);
        setStatus("Error stopping recording");
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  useEffect(() => {
    requestCameraAccess();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on("recording-saved", (data: any) => {
      setStatus(
        `Recording saved: ${data.filename} (${(data.size / (1024 * 1024)).toFixed(
          2
        )}MB)`
      );
    });
    socket.on("cloudinary-failed", (message: string) => {
      setStatus(message);
    });

    socket.on("recording-error", (data: any) => {
      setStatus(`Recording error: ${data.message}`);
    });

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      socket.off("recording-saved");
      socket.off("recording-error");
      socket.off("cloudinary-failed");
    };
  }, [socket, stream]); // Added stream to dependency array

  return (
    <div className="w-full max-w-xl mx-auto p-6 bg-white border shadow rounded-lg text-center">
      <h2 className="text-xl font-bold mb-4">🎥 Record from Camera</h2>

      {/* Storage warning */}
      <div className="text-sm text-yellow-600 mb-3">
        ⚠️ Storage is limited. Maximum recording time is{" "}
        <strong>2 minutes</strong>. Please keep your recording concise.
      </div>

      {/* Camera loader */}
      {isCameraLoading && (
        <div className="text-sm animate-pulse mb-2">🔄 Initializing camera...</div>
      )}

      {/* Live video feed */}
      <div className="w-full h-64 border rounded flex items-center justify-center relative mb-2">
        <video
          ref={liveVideoRef}
          className="w-full h-64 object-cover"
          autoPlay
          playsInline
          muted
        />
        {isRecording && !isCameraLoading && (
          <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-white px-3 py-1 rounded font-mono text-sm">
            ⏺ {formatTime(timer)}
          </div>
        )}
      </div>

      {/* Status message */}
      {status && <div className="mb-2 text-sm text-gray-700 break-words">{status}</div>}

      {/* Buttons */}
      <div className="mb-6">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 mr-2"
            disabled={!stream || isCameraLoading} // Disable if stream not available or camera loading
          >
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Stop Recording
          </button>
        )}
      </div>
    </div>
  );
};

export default CameraRecorder;