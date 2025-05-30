import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../../../context/SocketContext';
import { Play, Users, MessageCircle, Send, Wifi, WifiOff } from 'lucide-react';

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

  const isConnected = mediaSourceRef.current?.readyState === 'open' && isSourceBufferReady;

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Header */}
      <div className="bg-black/50 backdrop-blur-sm border-b border-gray-700/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Play className="w-6 h-6 text-red-500" />
                <h1 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-pink-500 bg-clip-text text-transparent">
                  Live Stream
                </h1>
              </div>
              <div className="hidden md:flex items-center space-x-2 px-3 py-1 bg-gray-800/50 rounded-full border border-gray-700/50">
                <span className="text-sm text-gray-300">ID:</span>
                <span className="text-sm font-mono text-white">{streamId}</span>
              </div>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
                isConnected ? 'bg-green-900/30 border border-green-500/30' : 'bg-red-900/30 border border-red-500/30'
              }`}>
                {isConnected ? (
                  <Wifi className="w-4 h-4 text-green-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-400" />
                )}
                <span className={`text-xs font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isConnected ? 'LIVE' : 'CONNECTING'}
                </span>
              </div>
              <div className="flex items-center space-x-2 px-3 py-1 bg-gray-800/50 rounded-full border border-gray-700/50">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-300">Queue: {chunkQueueRef.current.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Video Section */}
          <div className="lg:col-span-2">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-pink-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
              <div className="relative bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden">
                <video
                  ref={videoRef}
                  controls
                  autoPlay
                  muted
                  playsInline
                  className="w-full aspect-video bg-black object-cover"
                  style={{ minHeight: '400px' }}
                >
                  <p>Your browser does not support HTML video.</p>
                </video>
                
                {/* Video Overlay */}
                {!isConnected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-gray-300">Connecting to stream...</p>
                    </div>
                  </div>
                )}
                
                {/* Live Indicator */}
                {isConnected && (
                  <div className="absolute top-4 left-4">
                    <div className="flex items-center space-x-2 bg-red-600 px-3 py-1 rounded-full">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-white">LIVE</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chat Section */}
          <div className="lg:col-span-2">
            <div className="sticky top-24">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden">
                {/* Chat Header */}
                <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-gray-700/50 p-4">
                  <div className="flex items-center space-x-2">
                    <MessageCircle className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-white">Live Chat</h3>
                    <div className="ml-auto bg-gray-800/50 px-2 py-1 rounded-full">
                      <span className="text-xs text-gray-400">{messages.length}</span>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="h-80 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                      <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => (
                      <div key={idx} className="group">
                        <div className={`p-3 rounded-xl max-w-full break-words ${
                          msg.startsWith('You:') 
                            ? 'bg-blue-600/20 border border-blue-500/30 ml-4' 
                            : 'bg-gray-800/50 border border-gray-700/30 mr-4'
                        }`}>
                          <p className="text-sm text-gray-100">{msg}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Message Input */}
                <div className="border-t border-gray-700/50 p-4">
                  <div className="flex space-x-2">
                    <input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type your message..."
                      className="flex-1 bg-gray-800/50 border border-gray-600/50 rounded-xl px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim()}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white p-2 rounded-xl transition-all duration-200 disabled:cursor-not-allowed group"
                    >
                      <Send className="w-5 h-5 group-disabled:opacity-50" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveStreamPage;