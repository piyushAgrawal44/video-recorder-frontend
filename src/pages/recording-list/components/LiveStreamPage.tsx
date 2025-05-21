// src/pages/LiveStreamPage.tsx
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../../../context/SocketContext';

function LiveStreamPage() {
  const { streamId } = useParams();
  const { socket } = useSocket();
  const [messages, setMessages] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!socket || !streamId) return;

    // Join stream
    socket.emit('join-stream', streamId);

    // Listen to chat
    socket.on('stream-chat', (msg: string) => {
      setMessages((prev) => [...prev, msg]);
    });

    if (videoRef.current) {

      const video = videoRef.current;
      const mediaSource = new MediaSource();
      let sourceBuffer: SourceBuffer | null = null;

      video.src = URL.createObjectURL(mediaSource);

      mediaSource.addEventListener('sourceopen', () => {
        if (mediaSource.sourceBuffers.length > 0) return;

        sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8,opus"');

        socket.on('video-chunk', (data: ArrayBuffer) => {
          if (
            sourceBuffer &&
            mediaSource.readyState === 'open' &&
            !sourceBuffer.updating
          ) {
            try {
              sourceBuffer.appendBuffer(new Uint8Array(data));
            } catch (err) {
              console.error('Error appending buffer:', err);
            }
          }
        });
      });

    }
    return () => {
      socket.emit('leave-room', streamId);
      socket.off('chat-message');
    };
  }, [socket, streamId]);

  const sendMessage = () => {
    if (newMessage.trim() && socket) {
      socket.emit('stream-chat', { streamId: streamId, message: newMessage });
      setMessages((prev) => [...prev, `You: ${newMessage}`]);
      setNewMessage('');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Live Stream - {streamId}</h2>

      {/* Video Placeholder */}
      <video
        ref={videoRef}
        controls
        autoPlay
        className="w-full max-w-3xl bg-black rounded"
      // In real-time app, set srcObject from WebRTC or media stream
      >
        <p>Your browser does not support HTML video.</p>
      </video>

      {/* Chat Box */}
      <div className="max-w-3xl bg-white shadow rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Live Chat</h3>
        <div className="h-64 overflow-y-auto border rounded p-2 mb-2 bg-gray-50">
          {messages.map((msg, idx) => (
            <p key={idx} className="text-sm text-gray-700">{msg}</p>
          ))}
        </div>
        <div className="flex space-x-2">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            className="flex-1 border p-2 rounded"
          />
          <button
            onClick={sendMessage}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default LiveStreamPage;
