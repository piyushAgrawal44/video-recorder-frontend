import CameraRecorder from '../../components/CameraRecorder';
import { useSocket } from '../../context/SocketContext';
function RecordingPage() {
  const { socket } = useSocket();

  return (
    <>
      <div className='p-5'>
        
        {socket && <CameraRecorder socket={socket} />}
      </div>
    </>
  );
}

export default RecordingPage;
