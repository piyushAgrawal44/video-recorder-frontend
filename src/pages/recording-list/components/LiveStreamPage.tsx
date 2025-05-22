import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../../../context/SocketContext';

function LiveStreamPage() {
  const { streamId } = useParams();
  const { socket } = useSocket();

  const [messages, setMessages] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Use refs to keep MediaSource and SourceBuffer persistent
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  // Use a ref for the chunk queue to avoid stale closure issues
  const chunkQueueRef = useRef<Uint8Array[]>([]);

  // Add state to track initialization
  const [isSourceBufferReady, setIsSourceBufferReady] = useState(false);

  // Helper to append chunks from queue if possible
  const tryAppendChunks = useCallback(() => {
    const mediaSource = mediaSourceRef.current;
    const sourceBuffer = sourceBufferRef.current;
    const queue = chunkQueueRef.current;

    console.log("tryAppendChunks", {
      mediaSourceState: mediaSource?.readyState,
      sourceBufferUpdating: sourceBuffer?.updating,
      queueLength: queue.length,
      isReady: isSourceBufferReady
    });

    if (
      mediaSource &&
      mediaSource.readyState === 'open' &&
      sourceBuffer &&
      !sourceBuffer.updating &&
      queue.length > 0 &&
      isSourceBufferReady
    ) {
      const chunk:any = queue.shift();
      if (chunk) {
        try {
          console.log('Appending chunk of size:', chunk.byteLength);
          sourceBuffer.appendBuffer(chunk);
        } catch (e:any) {
          console.error('Error appending chunk:', e);
          // Put chunk back if failed
          queue.unshift(chunk);

          // If we get a QuotaExceeded error, try to remove old data
          if (e.name === 'QuotaExceededError' && sourceBuffer.buffered.length > 0) {
            try {
              // Remove data older than 30 seconds
              const currentTime = videoRef.current?.currentTime || 0;
              const removeEnd = Math.max(0, currentTime - 30);
              if (removeEnd > 0) {
                sourceBuffer.remove(0, removeEnd);
              }
            } catch (removeError) {
              console.error('Error removing old buffer data:', removeError);
            }
          }
        }
      }
    }
  }, [isSourceBufferReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && !mediaSourceRef.current) {
      mediaSourceRef.current = new MediaSource();
      video.src = URL.createObjectURL(mediaSourceRef.current);

      // Add error handler for MediaSource
      mediaSourceRef.current.addEventListener('sourceclose', () => {
        console.warn('MediaSource closed unexpectedly');
        setIsSourceBufferReady(false);
      });

      mediaSourceRef.current.addEventListener('sourceended', () => {
        console.log('MediaSource ended');
      });
    }

    return () => {
      // Cleanup URL object when component unmounts
      if (video && video.src) {
        URL.revokeObjectURL(video.src);
      }
    };
  }, []);

  useEffect(() => {
    if (!socket || !streamId) return;

    socket.emit('join-room', streamId);

    // Chat message handler
    const handleChat = (msg: string) => {
      setMessages((prev) => [...prev, msg]);
    };

    // Video chunk handler
    const handleChunk = (data: ArrayBuffer) => {
      console.log("Chunk coming in")



      const chunk = new Uint8Array(data);

      if (!(chunk instanceof Uint8Array)) {
        console.error("Invalid chunk type:", typeof chunk);
        return;
      }
      if (chunk.byteLength === 0) {
        console.warn("Received empty chunk, skipping");
        return;
      }
      console.log('Received chunk:', chunk.byteLength, 'bytes');

      const mediaSource = mediaSourceRef.current;
      const sourceBuffer = sourceBufferRef.current;

      // Check MediaSource state
      if (mediaSource && mediaSource.readyState === 'closed') {
        console.error('MediaSource is closed, cannot append chunk');
        return;
      }

      if (
        mediaSource &&
        mediaSource.readyState === 'open' &&
        sourceBuffer &&
        !sourceBuffer.updating &&
        isSourceBufferReady
      ) {
        try {
          console.log('Direct appending chunk of size:', chunk.byteLength);
          sourceBuffer.appendBuffer(chunk);
        } catch (e) {
          console.error('Direct appendBuffer error:', e);
          // If error, queue the chunk
          chunkQueueRef.current.push(chunk);
        }
      } else {
        // Queue chunk if we can't append now
        console.log('Queueing chunk, current state:', {
          mediaSourceState: mediaSource?.readyState,
          sourceBufferUpdating: sourceBuffer?.updating,
          isReady: isSourceBufferReady
        });
        chunkQueueRef.current.push(chunk);
      }
    };

    socket.on('stream-chat', handleChat);
    socket.on('live-stream-video-chunk', handleChunk);

    const mediaSource = mediaSourceRef.current;
    if (mediaSource) {
      // Add listener only once
      const onSourceOpen = () => {
        console.log('MediaSource opened');

        if (!mediaSource || mediaSource.sourceBuffers.length > 0) {
          console.log('MediaSource already has source buffers or is null');
          return;
        }

        // Try multiple MIME types in order of preference
        const mimeTypes = [
          'video/webm; codecs="vp9,opus"',
          'video/webm; codecs="vp8,opus"',
          'video/webm; codecs="vp9"',
          'video/webm; codecs="vp8"',
          'video/webm',
          'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
          'video/mp4'
        ];

        let sourceBuffer = null;
        let usedMimeType = '';

        for (const mimeType of mimeTypes) {
          if (MediaSource.isTypeSupported(mimeType)) {
            try {
              sourceBuffer = mediaSource.addSourceBuffer(mimeType);
              usedMimeType = mimeType;
              console.log('Successfully created SourceBuffer with:', mimeType);
              break;
            } catch (e) {
              console.warn('Failed to create SourceBuffer with', mimeType, ':', e);
            }
          } else {
            console.log('MIME type not supported:', mimeType);
          }
        }
        console.log(usedMimeType)
        if (!sourceBuffer) {
          console.error('Failed to create SourceBuffer with any supported MIME type');
          return;
        }

        sourceBufferRef.current = sourceBuffer;

        sourceBuffer.addEventListener('updateend', () => {
          console.log('SourceBuffer update ended');
          tryAppendChunks();
        });

        sourceBuffer.addEventListener('error', (e) => {
          console.error('SourceBuffer error:', e);
          console.log('Current SourceBuffer state:', {
            updating: sourceBuffer.updating,
            buffered: sourceBuffer.buffered,
            timestampOffset: sourceBuffer.timestampOffset,
            readyState: mediaSource?.readyState,
          });
        });

        sourceBuffer.addEventListener('abort', () => {
          console.warn('SourceBuffer operation aborted');
        });

        console.log("Starting chunk ")
        // Mark as ready and start listening for chunks
        setIsSourceBufferReady(true);


        // Try to append any queued chunks
        tryAppendChunks();
      };

      const onSourceClose = () => {
        console.warn('MediaSource closed');
        setIsSourceBufferReady(false);
      };

      const onSourceEnded = () => {
        console.log('MediaSource ended');
      };

      mediaSource.addEventListener('sourceopen', onSourceOpen);
      mediaSource.addEventListener('sourceclose', onSourceClose);
      mediaSource.addEventListener('sourceended', onSourceEnded);

      return () => {
        socket.emit('leave-room', streamId);
        socket.off('stream-chat', handleChat);
        socket.off('live-stream-video-chunk', handleChunk);

        if (mediaSource) {
          mediaSource.removeEventListener('sourceopen', onSourceOpen);
          mediaSource.removeEventListener('sourceclose', onSourceClose);
          mediaSource.removeEventListener('sourceended', onSourceEnded);
        }
      };
    }
  }, [socket, streamId, tryAppendChunks, isSourceBufferReady]);

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

      {/* Add debug info */}
      <div className="text-sm text-gray-600">
        MediaSource State: {mediaSourceRef.current?.readyState || 'null'} |
        SourceBuffer Ready: {isSourceBufferReady ? 'Yes' : 'No'} |
        Queue Length: {chunkQueueRef.current?.length || 0}
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