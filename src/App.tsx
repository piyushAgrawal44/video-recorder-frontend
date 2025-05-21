import { BrowserRouter as Router, Routes, Route,} from 'react-router-dom';
import RecordingPage from './pages/recording-page/RecordingPage';
import BasicLayout from './layouts/BasicLayout';
import RecordingListPage from './pages/recording-list';
import LiveStreamPage from './pages/recording-list/components/LiveStreamPage';

function App() {
  return (
    <>
      <Router>
        <BasicLayout>
          <Routes>
            <Route path="/" element={<RecordingPage />} />
            <Route path="/recordings" element={<RecordingListPage />} />
            <Route path="/live/:streamId" element={<LiveStreamPage />} />
          </Routes>
        </BasicLayout>
      </Router>
    </>
  );
}
export default App;
