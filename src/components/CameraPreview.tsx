import { useEffect, useRef, useState } from "react";

const CameraRecorder = ({ socket }: any) => {
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const recordedVideoRef = useRef<HTMLVideoElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedURL, setRecordedURL] = useState<string | null>(null);
  const [timer, setTimer] = useState<number>(0);
  const timerRef = useRef<any | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [message, setMessage] = useState("");

  const requestCameraAccess = async () => {
    setIsCameraLoading(true); // show loader
    try {
      console.log("first")
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      console.log("second", mediaStream, liveVideoRef.current)
      setStream(mediaStream);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = mediaStream;
        liveVideoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setStatus("Camera access failed. Please check permissions.");
    }
    finally {
      setIsCameraLoading(false); // hide loader
    }
  };

  const startRecording = () => {
    if (!stream) {
      setStatus("No camera stream available");
      return;
    }

    try {
      // Check for supported MIME types
      const mimeType = MediaRecorder.isTypeSupported("video/webm; codecs=vp9,opus")
        ? "video/webm; codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm; codecs=vp8,opus")
          ? "video/webm; codecs=vp8,opus"
          : "video/webm";

      console.log(`Using MIME type: ${mimeType}`);

      // Clear previous recorded chunks
      const chunks: Blob[] = [];
      setRecordedChunks([]);

      // Create media recorder with explicit settings
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      });

      setMediaRecorder(recorder);
      setIsRecording(true);
      setTimer(0);
      setStatus("Recording started");

      // Start timer
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);

      // Handle data available event - critical for WebM format
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          // Add to local array for preview
          chunks.push(event.data);
          setRecordedChunks(prevChunks => [...prevChunks, event.data]);

          // Send to server
          const reader = new FileReader();

          reader.onload = () => {
            if (reader.result) {
              // Send the buffer to the server
              socket.emit("video-chunk", reader.result);
            }
          };

          reader.onerror = () => {
            console.error("Error reading chunk data");
          };

          reader.readAsArrayBuffer(event.data);
        }
      };

      // Handle recording stop
      recorder.onstop = () => {
        console.log(`Recording stopped with ${chunks.length} chunks`);

        if (chunks.length > 0) {
          // Create local preview
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setRecordedURL(url);
          setStatus(`Recording complete: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`);

          // Signal recording end to server
          socket.emit("recording-stopped");
        } else {
          setStatus("No data recorded");
        }

        clearInterval(timerRef.current!);
      };

      // Important: We need to signal recording start AFTER setup is complete
      socket.emit("recording-start");

      // Request data every 100ms (smaller chunks for smoother streaming)
      recorder.start(100);

    } catch (err) {
      console.error("Failed to start recording:", err);
      setStatus(`Recording failed: ${err}`);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.stop();
        setIsRecording(false);
        setStatus("Finalizing recording...");
      } catch (err) {
        console.error("Error stopping recording:", err);
        setStatus("Error stopping recording");
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  useEffect(() => {
    requestCameraAccess();
  }, [])

  useEffect(() => {

    if (!socket) return;

    socket.on('message', (data: { text: string }) => {
      console.log("Received message from server:", data.text);
      setMessage(data.text);
    });

    // Add socket event listeners for server responses
    socket.on("recording-saved", (data: any) => {
      setStatus(`Recording saved on server: ${data.filename} (${(data.size / (1024 * 1024)).toFixed(2)}MB)`);
    })

    return () => {
      // Cleanup
      stream?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      socket.off("recording-saved");
    };
  }, [socket]);

  return (
    <div className="w-full max-w-xl mx-auto p-6 bg-white border shadow rounded-lg text-center">
      <h2 className="text-xl font-bold mb-4">🎥 Record from Camera</h2>

      <p className="text-red-500 my-2">{message}</p>
      {/* Live Camera */}
      {isCameraLoading && (
        <div className="text-sm animate-pulse">
          🔄 Initializing camera...
        </div>
      )}
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


      {/* Status Message */}
      {status && (
        <div className="mb-2 text-sm text-gray-600">{status}</div>
      )}

      {/* Start/Stop Buttons */}
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

      {/* Recorded Preview */}
      {recordedURL && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">📹 Recorded Video:</h3>
          <video
            ref={recordedVideoRef}
            src={recordedURL}
            controls
            className="w-full h-64 object-contain border rounded"
          />
        </div>
      )}
    </div>
  );
};

export default CameraRecorder;