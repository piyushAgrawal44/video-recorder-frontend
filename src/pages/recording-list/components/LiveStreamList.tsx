// src/components/LiveStreamList.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface LiveStream {
  socketId: string;
  startedAt: number;
}

function LiveStreamList() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStreams = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_APP_BACKEND_URL}/live-streams`);
        const data = await res.json();
        setStreams(data.streams);
      } catch (error) {
        console.error("Failed to load live streams:", error);
      }
    };

    fetchStreams();

    const interval = setInterval(fetchStreams, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const handleJoinStream = (streamId: string) => {
    navigate(`/live/${streamId}`);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-lg font-bold mb-4">Active Live Streams</h2>
      {streams.length === 0 ? (
        <p className="text-gray-500">No live streams available.</p>
      ) : (
        <ul className="space-y-3">
          {streams.map((stream) => (
            <li key={stream.socketId}>
              <button
                className="w-full text-left p-4 bg-indigo-50 hover:bg-indigo-100 rounded"
                onClick={() => handleJoinStream(stream.socketId)}
              >
                <div className="flex flex-wrap justify-between items-center break-words w-full overflow-hidden">
                  <p className='break-words'>ID: {stream.socketId}</p>
                  <span className="text-sm text-gray-500">
                    Started {Math.floor((Date.now() - stream.startedAt) / 1000)}s ago
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LiveStreamList;
