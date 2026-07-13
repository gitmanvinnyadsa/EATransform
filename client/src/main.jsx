import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@xyflow/react/dist/style.css';
import './styles.css';
import Dashboard from './pages/Dashboard.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import EditorPage from './pages/EditorPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { Toasts } from './components/Toasts.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        <Route path="/editor/:processId" element={<EditorPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <Toasts />
    </BrowserRouter>
  </React.StrictMode>
);
