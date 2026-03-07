import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CreateStablecoin from './pages/CreateStablecoin';
import Manage from './pages/Manage';
import MintBurn from './pages/MintBurn';
import Compliance from './pages/Compliance';
import Holders from './pages/Holders';
import ActivityPage from './pages/Activity';

const App: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create" element={<CreateStablecoin />} />
        <Route path="/manage" element={<Manage />} />
        <Route path="/mint-burn" element={<MintBurn />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/holders" element={<Holders />} />
        <Route path="/activity" element={<ActivityPage />} />
      </Routes>
    </Layout>
  );
};

export default App;
