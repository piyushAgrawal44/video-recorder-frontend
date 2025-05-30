import { useEffect, useRef, useState } from "react";
import { Camera, Play, Square, Clock, AlertTriangle, CheckCircle, Loader2, Video } from "lucide-react";

const MAX_DURATION = 120; // seconds (2 minutes)

// Mock socket for demonstration
const mockSocket = {
  emit: () => { },
  on: () => { },
  off: () => { }
};

const CameraRecorder = ({ socket = mockSocket }: { socket?: any }) => {
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
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

    const handleMessage = (data: { text: string }) => {
      setMsg(data.text);
    };

    socket.on("message", handleMessage);

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      socket.off("recording-saved");
      socket.off("recording-error");
      socket.off("cloudinary-failed");
      socket.off("message", handleMessage);
    };
  }, [socket, stream]); // Added stream to dependency array

  const getStatusIcon = () => {
    if (status.includes("saved")) return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status.includes("failed") || status.includes("error")) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (status.includes("Finalizing")) return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    return <Video className="w-4 h-4 text-blue-500" />;
  };

  const getStatusColor = () => {
    if (status.includes("saved")) return "text-green-600 bg-green-50 border-green-200";
    if (status.includes("failed") || status.includes("error")) return "text-red-600 bg-red-50 border-red-200";
    if (status.includes("Finalizing")) return "text-blue-600 bg-blue-50 border-blue-200";
    return "text-gray-600 bg-gray-50 border-gray-200";
  };

  const progressPercentage = (timer / MAX_DURATION) * 100;

  return (
    <div className="w-full max-w-2xl mx-auto bg-gradient-to-br from-gray-50 to-white border border-gray-200 shadow-xl rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Camera Recorder</h2>
            <p className="text-purple-100 text-sm">Professional video recording</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Storage Warning */}
        <div className="flex items-start space-x-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-amber-800 font-medium text-sm">Storage Limitation</p>
            <p className="text-amber-700 text-sm">
              Maximum recording time is <strong>2 minutes</strong>. Please keep your recording concise.
            </p>
          </div>
        </div>

        <p className='my-2 text-xl max-w-[200px] mx-auto text-wrap text-center font-semibold text-red-400'>{msg}</p>
        {/* Camera Loading */}
        {isCameraLoading && (
          <div className="flex items-center justify-center space-x-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <span className="text-blue-700 font-medium">Initializing camera...</span>
          </div>
        )}

        {/* Video Container */}
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
          <div className="relative bg-gray-900 rounded-2xl border-4 border-gray-200 overflow-hidden aspect-video">
            <video
              ref={liveVideoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />

            {/* Recording Overlay */}
            {isRecording && !isCameraLoading && (
              <>
                {/* Recording Indicator */}
                <div className="absolute top-4 left-4 flex items-center space-x-2 bg-red-600 px-4 py-2 rounded-full shadow-lg">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <span className="text-white font-bold text-sm">REC</span>
                </div>

                {/* Timer */}
                <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full">
                  <div className="flex items-center space-x-2 text-white">
                    <Clock className="w-4 h-4" />
                    <span className="font-mono font-bold">{formatTime(timer)}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-1000 ease-linear"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </>
            )}

            {/* No Camera Placeholder */}
            {!stream && !isCameraLoading && (
              <div className="flex items-center justify-center h-full bg-gray-100">
                <div className="text-center text-gray-500">
                  <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Camera not available</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status Message */}
        {status && (
          <div className={`flex items-center space-x-3 p-4 border rounded-xl ${getStatusColor()}`}>
            {getStatusIcon()}
            <p className="text-sm font-medium break-words flex-1">{status}</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center space-x-4">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!stream || isCameraLoading}
              className="flex items-center space-x-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 disabled:from-gray-400 disabled:to-gray-300 text-white px-8 py-4 rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:cursor-not-allowed group"
            >
              <Play className="w-5 h-5 group-disabled:opacity-50" />
              <span>Start Recording</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center space-x-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-8 py-4 rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 group"
            >
              <Square className="w-5 h-5" />
              <span>Stop Recording</span>
            </button>
          )}
        </div>

        {/* Recording Info */}
        {isRecording && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">Duration</p>
              <p className="text-xl font-bold text-gray-900 font-mono">{formatTime(timer)}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">Remaining</p>
              <p className="text-xl font-bold text-gray-900 font-mono">{formatTime(MAX_DURATION - timer)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraRecorder;