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

  const requestCameraAccess = async () => {
    setIsCameraLoading(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
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

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });
      mediaRecorderRef.current = recorder;
      setMediaRecorder(recorder);
      setIsRecording(true);
      setTimer(0);
      setStatus("Recording started (max 2 mins)");

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
          chunks.push(event.data);
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result) {
              socket.emit("video-chunk", reader.result);
            }
          };
          reader.onerror = () => {
            console.error("Error reading chunk data");
          };
          reader.readAsArrayBuffer(event.data);
        }
      };

      recorder.onstop = () => {
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: mimeType });
          setStatus(`Recording complete: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`);
          socket.emit("recording-stopped");
        } else {
          setStatus("No data recorded");
        }
        clearInterval(timerRef.current!);
      };

      socket.emit("recording-start");
      recorder.start(100); // request data every 100ms

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
        setIsRecording(false);
        setStatus("Finalizing recording...");
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
      setStatus(`Recording saved: ${data.filename} (${(data.size / (1024 * 1024)).toFixed(2)}MB)`);
    });

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      socket.off("recording-saved");
    };
  }, [socket]);

  return (
    <div className="w-full max-w-xl mx-auto p-6 bg-white border shadow rounded-lg text-center">
      <h2 className="text-xl font-bold mb-4">🎥 Record from Camera</h2>

      {/* Storage warning */}
      <div className="text-sm text-yellow-600 mb-3">
        ⚠️ Storage is limited. Maximum recording time is <strong>2 minutes</strong>. Please keep your recording concise.
      </div>

      {/* Camera loader */}
      {isCameraLoading && (
        <div className="text-sm animate-pulse mb-2">
          🔄 Initializing camera...
        </div>
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
      {status && (
        <div className="mb-2 text-sm text-gray-700">{status}</div>
      )}

      {/* Buttons */}
      <div className="mb-6">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 mr-2"
            disabled={!stream}
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
