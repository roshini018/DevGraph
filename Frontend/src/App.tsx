import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { ConnectPage } from './pages/ConnectPage';
import { ReposPage } from './pages/ReposPage';
import { IndexingPage } from './pages/IndexingPage';
import { WorkspaceLayout } from './components/workspace/WorkspaceLayout';
import { CodeViewPage } from './pages/workspace/CodeViewPage';
import { GraphViewPage } from './pages/workspace/GraphViewPage';
import { ImpactViewPage } from './pages/workspace/ImpactViewPage';
import { ConnectionsViewPage } from './pages/workspace/ConnectionsViewPage';
import { AssistantViewPage } from './pages/workspace/AssistantViewPage';
import { RequireAuth, RequireRepo } from './routes/guards';
import { GettingStartedPage } from './pages/docs/GettingStartedPage';
import { ArchitecturePage } from './pages/docs/ArchitecturePage';
import { SpecificationsPage } from './pages/docs/SpecificationsPage';


export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/docs/getting-started" element={<GettingStartedPage />} />
        <Route path="/docs/architecture" element={<ArchitecturePage />} />
        <Route path="/docs/specifications" element={<SpecificationsPage />} />

        {/* Protected Repository Routes */}
        <Route
          path="/repos"
          element={
            <RequireAuth>
              <ReposPage />
            </RequireAuth>
          }
        />
        <Route
          path="/repos/:repoId/indexing"
          element={
            <RequireAuth>
              <IndexingPage />
            </RequireAuth>
          }
        />

        {/* Protected Workspace Routes (Layout with center outlet) */}
        <Route
          path="/w/:repoId"
          element={
            <RequireAuth>
              <RequireRepo>
                <WorkspaceLayout />
              </RequireRepo>
            </RequireAuth>
          }
        >
          <Route index element={<CodeViewPage />} />
          <Route path="graph" element={<GraphViewPage />} />
          <Route path="impact" element={<ImpactViewPage />} />
          <Route path="connections" element={<ConnectionsViewPage />} />
          <Route path="assistant" element={<AssistantViewPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

    </BrowserRouter>
  );
};

export default App;
