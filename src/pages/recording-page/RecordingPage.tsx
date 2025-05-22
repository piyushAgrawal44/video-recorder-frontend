import { useEffect, useState } from 'react';
import CameraRecorder from '../../components/CameraRecorder';
import { useSocket } from '../../context/SocketContext';
function RecordingPage() {
  const { socket } = useSocket();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (data: { text: string }) => {
      setMsg(data.text);
    };

    socket.on("message", handleMessage);

    return () => {
      socket.off("message", handleMessage); // ✅ Cleanup
    };

  }, [socket]);

  return (
    <>
      <div className='p-5'>
        <p className='my-3 text-xl max-w-[200px] mx-auto text-wrap text-center font-semibold text-red-400'>{msg}</p>
        {socket && <CameraRecorder socket={socket} />}
      </div>
    </>
  );
}

export default RecordingPage;
