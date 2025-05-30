import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../../../context/SocketContext';

function LiveStreamPage() {
  const { streamId } = useParams();
  const { socket } = useSocket();

  const [messages, setMessages] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSourceBufferReady, setIsSourceBufferReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const chunkQueueRef = useRef<Uint8Array[]>([]);
  const isAppendingRef = useRef(false);
  const isFirstChunkAppended = useRef(false);

  const tryAppendChunks = useCallback(() => {

    if (isAppendingRef.current) {
      return;
    }
    isAppendingRef.current = true;

    const mediaSource = mediaSourceRef.current;
    const sourceBuffer = sourceBufferRef.current;
    const queue = chunkQueueRef.current;

    if (
      mediaSource?.readyState === 'open' &&
      sourceBuffer &&
      !sourceBuffer.updating &&
      queue.length > 0 &&
      isSourceBufferReady
    ) {
      const chunk: any = queue.shift();

      try {
        if (chunk) sourceBuffer.appendBuffer(chunk);
      } catch (e: any) {

        queue.unshift(chunk);

        if (e.name === 'QuotaExceededError' && sourceBuffer.buffered.length > 0) {
          const currentTime = videoRef.current?.currentTime || 0;
          const removeEnd = Math.max(0, currentTime - 30);
          if (removeEnd > 0) {
            sourceBuffer.remove(0, removeEnd);
          }
        }

        isAppendingRef.current = false;
      }
    }
    else {
      console.log("mediaSource is not open", mediaSource?.readyState)
    }
  }, [isSourceBufferReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || mediaSourceRef.current) return;

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    video.src = URL.createObjectURL(mediaSource);

    const onSourceOpen = () => {
      const mimeTypes = [
        'video/webm; codecs="vp9,opus"',
        'video/webm; codecs="vp8,opus"',
        'video/webm',
        'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
        'video/mp4'
      ];

      for (const type of mimeTypes) {
        if (MediaSource.isTypeSupported(type)) {
          try {
            const sb = mediaSource.addSourceBuffer(type);
            sourceBufferRef.current = sb;

            sb.addEventListener('updateend', () => {
              isAppendingRef.current = false;
              if (!isFirstChunkAppended.current && sb.buffered.length > 0) {
                isFirstChunkAppended.current = true;
                console.log('First chunk successfully appended!');
              }
            });
            sb.addEventListener('error', (e) => console.error('SourceBuffer error:', e));
            sb.addEventListener('abort', () => console.warn('SourceBuffer aborted'));

            setIsSourceBufferReady(true);
            return;
          } catch (e) {
            console.warn(`Failed to create SourceBuffer with ${type}:`, e);
          }
        }
      }

      console.error('No supported MIME types found for SourceBuffer.');
    };

    mediaSource.addEventListener('sourceopen', onSourceOpen);
    mediaSource.addEventListener('sourceclose', () => setIsSourceBufferReady(false));
    mediaSource.addEventListener('sourceended', () => setIsSourceBufferReady(false));

    return () => {
      URL.revokeObjectURL(video.src);
    };
  }, [tryAppendChunks]);

  useEffect(() => {
    if (!socket || !streamId) return;

    socket.emit('join-room', streamId);

    const handleChat = (msg: string) => setMessages((prev) => [...prev, msg]);

    const handleChunk = (data: {
      currentChunk: ArrayBuffer,
      completeChunk: ArrayBuffer
    }) => {

      if (chunkQueueRef.current?.length == 0 && !isFirstChunkAppended.current) {
        const completeChunk = new Uint8Array(data.completeChunk);
        if (completeChunk.byteLength > 0) {
          console.log("Enters here")
          chunkQueueRef.current.push(completeChunk)
        };
      }
      else {
        console.log("Enter in else")
        const chunk = new Uint8Array(data.currentChunk);
        if (chunk.byteLength > 0) {
          chunkQueueRef.current.push(chunk);
        }
      }
      if (chunkQueueRef.current?.length > 0) {
        tryAppendChunks();
      }
    };

    socket.on('stream-chat', handleChat);
    socket.on('live-stream-video-chunk', handleChunk);

    return () => {
      socket.emit('leave-room', streamId);
      socket.off('stream-chat', handleChat);
      socket.off('live-stream-video-chunk', handleChunk);
    };
  }, [socket, streamId, tryAppendChunks]);

  const sendMessage = () => {
    if (newMessage.trim() && socket) {
      socket.emit('stream-chat', { streamId, message: newMessage });
      setMessages((prev) => [...prev, `You: ${newMessage}`]);
      setNewMessage('');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Live Stream - {streamId}</h2>
      <div className="text-sm text-gray-600">
        MediaSource State: {mediaSourceRef.current?.readyState || 'null'} |{' '}
        SourceBuffer Ready: {isSourceBufferReady ? 'Yes' : 'No'} |{' '}
        Queue Length: {chunkQueueRef.current.length}
      </div>

      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        className="w-full max-w-3xl bg-black rounded"
      >
        <p>Your browser does not support HTML video.</p>
      </video>

      <div className="max-w-3xl bg-white shadow rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Live Chat</h3>
        <div className="h-64 overflow-y-auto border rounded p-2 mb-2 bg-gray-50">
          {messages.map((msg, idx) => (
            <p key={idx} className="text-sm text-gray-700">
              {msg}
            </p>
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
