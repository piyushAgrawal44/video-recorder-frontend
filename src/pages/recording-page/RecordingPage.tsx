import { useEffect, useState } from 'react';
import CameraPreview from '../../components/CameraPreview';
import { useSocket } from '../../context/SocketContext';
function RecordingPage() {
  const { socket } = useSocket();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!socket) return;

    socket.on("message", (data: { text: string }) => {
      setMsg(data.text);
    });

  }, []);

  return (
    <>
      <div className='p-5'>
        <p className='my-3 text-lg text-center font-semibold text-red-400'>{msg}</p>
        <CameraPreview socket={socket} />
      </div>
    </>
  );
}

export default RecordingPage;
