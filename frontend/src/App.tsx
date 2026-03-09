import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { LoadingSpinner } from "./components/shared/LoadingSpinner";

// Lazy-load pages for code splitting
const DashboardPage  = lazy(() => import("./pages/DashboardPage"));
const OperationsPage = lazy(() => import("./pages/OperationsPage"));
const CompliancePage = lazy(() => import("./pages/CompliancePage"));
const RolesPage      = lazy(() => import("./pages/RolesPage"));
const AdminPage      = lazy(() => import("./pages/AdminPage"));
const InfoPage       = lazy(() => import("./pages/InfoPage"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <LoadingSpinner size={32} centered />
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/"           element={<DashboardPage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/roles"      element={<RolesPage />} />
          <Route path="/admin"      element={<AdminPage />} />
          <Route path="/info"       element={<InfoPage />} />
          {/* 404 fallback */}
          <Route
            path="*"
            element={
              <div className="card p-10 text-center space-y-3">
                <p className="text-4xl font-bold text-slate-600">404</p>
                <p className="text-slate-400 text-sm">Page not found.</p>
                <a href="/" className="btn-primary inline-flex">
                  Go to Dashboard
                </a>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </Layout>
  );
}
