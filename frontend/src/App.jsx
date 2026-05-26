import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Analytics from "./pages/Analytics";
import Upload from "./pages/analytics/Upload";
import Records from "./pages/analytics/Records";
import Jobs from "./pages/analytics/Jobs";
import Mapping from "./pages/Mapping";
import DataEntry from "./pages/mapping/DataEntry";
import RangeList from "./pages/mapping/RangeList";
import MapSearch from "./pages/mapping/MapSearch";
import ViewMap from "./pages/mapping/ViewMap";
import MapEditor from "./pages/mapping/MapEditor";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="analytics/upload" element={<Upload />} />
          <Route path="analytics/records" element={<Records />} />
          <Route path="analytics/jobs" element={<Jobs />} />
          <Route path="mapping" element={<Mapping />} />
          <Route path="mapping/data-entry" element={<DataEntry />} />
          <Route path="mapping/ranges" element={<RangeList />} />
          <Route path="mapping/search" element={<MapSearch />} />
          <Route path="mapping/view" element={<ViewMap />} />
          <Route path="mapping/editor" element={<MapEditor />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
