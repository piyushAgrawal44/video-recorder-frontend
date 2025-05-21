import { useState, useEffect, useRef } from 'react';

import { io } from 'socket.io-client';
import CameraRecorder from '../../components/CameraPreview';

// Define types for our recordings
interface Recording {
  filename: string;
  timestamp: number;
  duration: number;
  size: number;
  url: string;
}

function DashboardPage() {
  // Socket connection
  const [socket, setSocket] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [socketMessages, setSocketMessages] = useState<string[]>([]);

  // Recordings state
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'live' | 'recordings'>('live');
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  
  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:4000');
    
    newSocket.on('connect', () => {
      console.log('Socket connected!');
      setConnected(true);
    });
    
    newSocket.on('disconnect', () => {
      console.log('Socket disconnected!');
      setConnected(false);
    });
    
    newSocket.on('message', (message: any) => {
      setSocketMessages(prev => [...prev, `Message: ${message.text}`]);
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, []);
  
  // Fetch available recordings
  const fetchRecordings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:4000/recordings');
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      // Process the data
      const processedRecordings = data.recordings.map((filename: string) => {
        // Extract timestamp from filename format: recording_socketId_timestamp.webm
        const timestampMatch = filename.match(/_(\d+)\.webm$/);
        const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : Date.now();
        
        return {
          filename,
          timestamp,
          url: `http://localhost:4000/recordings/${filename}`,
          // These will be populated when the recording is selected
          duration: 0,
          size: 0
        };
      });
      
      // Sort by timestamp (newest first)
      processedRecordings.sort((a: Recording, b: Recording) => b.timestamp - a.timestamp);
      
      setRecordings(processedRecordings);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch recordings:', err);
      setError('Failed to load recordings. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // When recording is selected, load its metadata
  const handleSelectRecording = async (recording: Recording) => {
    setSelectedRecording(recording);
    
    if (videoPlayerRef.current) {
      videoPlayerRef.current.src = recording.url;
      videoPlayerRef.current.load();
      
      // Get file size using HEAD request
      try {
        const response = await fetch(recording.url, { method: 'HEAD' });
        const size = parseInt(response.headers.get('content-length') || '0');
        
        // Update the recording with file size
        setSelectedRecording(prev => prev ? {...prev, size} : null);
      } catch (err) {
        console.error('Failed to get file size:', err);
      }
    }
  };
  
  // Load recordings on mount
  useEffect(() => {
    if (socket) {
      fetchRecordings();
    }
  }, [socket]);
  
  // Handle metadata load for video player
  const handleMetadataLoaded = () => {
    if (videoPlayerRef.current && selectedRecording) {
      const duration = videoPlayerRef.current.duration;
      setSelectedRecording(prev => prev ? {...prev, duration} : null);
    }
  };

  // Format timestamp to human-readable date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };
  
  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  
  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Video Recording Dashboard</h1>
          <div className="flex items-center space-x-2">
            <div className={`h-3 w-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium text-gray-700">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-grow container mx-auto px-4 py-8">
        {/* Tab navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('live')}
              className={`${
                activeTab === 'live'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Live Recording
            </button>
            <button
              onClick={() => setActiveTab('recordings')}
              className={`${
                activeTab === 'recordings'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Past Recordings
            </button>
          </nav>
        </div>
        
        {/* Content area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main panel */}
          <div className="lg:col-span-2">
            {activeTab === 'live' ? (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Live Camera Feed</h2>
                  {socket ? <CameraRecorder socket={socket} /> : <p>Connecting to server...</p>}
                </div>
                
                {/* Socket messages */}
                {socketMessages.length > 0 && (
                  <div className="bg-gray-50 p-4 border-t">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Server Messages</h3>
                    <div className="bg-gray-100 rounded p-3 max-h-32 overflow-y-auto text-xs">
                      {socketMessages.map((msg, idx) => (
                        <div key={idx} className="mb-1">{msg}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">
                    Video Playback
                    {selectedRecording && (
                      <span className="text-sm font-normal text-gray-500 ml-2">
                        {formatDate(selectedRecording.timestamp)}
                      </span>
                    )}
                  </h2>
                  
                  {selectedRecording ? (
                    <div>
                      <video
                        ref={videoPlayerRef}
                        className="w-full h-auto rounded bg-black"
                        controls
                        onLoadedMetadata={handleMetadataLoaded}
                      />
                      
                      {/* Recording details */}
                      {selectedRecording.duration > 0 && (
                        <div className="mt-4 bg-gray-50 p-4 rounded grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Duration</p>
                            <p className="font-medium">{formatDuration(selectedRecording.duration)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">File Size</p>
                            <p className="font-medium">{formatFileSize(selectedRecording.size)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Filename</p>
                            <p className="font-medium text-xs truncate">{selectedRecording.filename}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center bg-gray-100 rounded-lg h-64">
                      <p className="text-gray-500">Select a recording to play</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-900">Recording History</h2>
                  <button 
                    onClick={fetchRecordings} 
                    className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                  >
                    Refresh
                  </button>
                </div>
                
                {isLoading ? (
                  <div className="py-8 flex justify-center">
                    <svg className="animate-spin h-6 w-6 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : error ? (
                  <div className="py-8 text-center">
                    <p className="text-red-500">{error}</p>
                    <button 
                      onClick={fetchRecordings}
                      className="mt-4 text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                    >
                      Try Again
                    </button>
                  </div>
                ) : recordings.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-gray-500">No recordings found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {recordings.map((recording) => (
                      <button
                        key={recording.filename}
                        onClick={() => {
                          handleSelectRecording(recording);
                          setActiveTab('recordings');
                        }}
                        className={`w-full text-left p-3 rounded-lg text-sm ${
                          selectedRecording?.filename === recording.filename
                            ? 'bg-indigo-50 border border-indigo-200'
                            : 'hover:bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="font-medium mb-1 truncate">
                          {recording.filename.replace(/^recording_[^_]+_/, '').replace(/\.webm$/, '')}
                        </div>
                        <div className="text-gray-500 text-xs">
                          {formatDate(recording.timestamp)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow mt-6">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Stats</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="text-gray-500 text-sm">Total Recordings</p>
                    <p className="text-2xl font-bold">{recordings.length}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="text-gray-500 text-sm">Server Status</p>
                    <p className={`text-sm font-medium ${connected ? 'text-green-600' : 'text-red-600'}`}>
                      {connected ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            Video Recording Dashboard • {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default DashboardPage;