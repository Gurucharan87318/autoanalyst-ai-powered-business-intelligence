import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./components/LandingPage";
import Pricing from "./components/Pricing";
import Login from "./components/Login";
import RequireAuth from "./components/RequireAuth";
import Welcome from "./components/Welcome";
import { Toaster } from "@/components/ui/sonner";

const FileUploaderView = lazy(() => import("./Features/FileUpload"));
const SchemaVerificationView = lazy(() => import("./Features/SchemaDetect"));
const RetailHealth = lazy(() => import("./Features/Health"));
const VisualDashboard = lazy(() => import("./Features/VisualDashboard"));
const SqlSandbox = lazy(() => import("./Features/SqlSandbox"));
const FinalDashboard = lazy(() => import("./Features/FinalVisual"));


export default function App() {
  const appFallback = (
    <div className="p-6 text-sm text-slate-500">Loading...</div>
  );

  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />

        {/* Auth routes */}
        <Route
          path="/welcome"
          element={
            <RequireAuth>
              <Welcome />
            </RequireAuth>
          }
        />

        {/* Standalone workbench pages */}
        <Route path="/app" element={<Navigate to="/app/upload" replace />} />

        <Route
          path="/app/upload"
          element={
            <RequireAuth>
              <Suspense fallback={appFallback}>
                <FileUploaderView />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/app/schema"
          element={
            <RequireAuth>
              <Suspense fallback={appFallback}>
                <SchemaVerificationView />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/app/transform"
          element={
            <RequireAuth>
              <Suspense fallback={appFallback}>
                <SqlSandbox />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/app/visuals"
          element={
            <RequireAuth>
              <Suspense fallback={appFallback}>
                <VisualDashboard />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/app/health"
          element={
            <RequireAuth>
              <Suspense fallback={appFallback}>
                <RetailHealth />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/app/final"
          element={
            <RequireAuth>
              <Suspense fallback={appFallback}>
                <FinalDashboard />
              </Suspense>
            </RequireAuth>
          }
        />

        {/* Aliases */}
        <Route path="/workbench" element={<Navigate to="/app/upload" replace />} />

        {/* Legacy feature redirects */}
        <Route path="/feature/workbench" element={<Navigate to="/app/upload" replace />} />
        <Route path="/feature/file-upload" element={<Navigate to="/app/upload" replace />} />
        <Route path="/feature/schema-detection" element={<Navigate to="/app/schema" replace />} />
        <Route path="/feature/sql-sandbox" element={<Navigate to="/app/transform" replace />} />
        <Route path="/feature/visual-dashboard" element={<Navigate to="/app/visuals" replace />} />
        <Route path="/feature/retail-health" element={<Navigate to="/app/health" replace />} />
        <Route path="/feature/final-dashboard" element={<Navigate to="/app/final" replace />} />

        {/* Older aliases / mixed casing */}
        <Route path="/feature/FileUpload" element={<Navigate to="/app/upload" replace />} />
        <Route path="/feature/DashboardView" element={<Navigate to="/app/visuals" replace />} />
        <Route path="/fileupload" element={<Navigate to="/app/upload" replace />} />
        <Route path="/schemadetect" element={<Navigate to="/app/schema" replace />} />
        <Route path="/dashboardview" element={<Navigate to="/app/visuals" replace />} />
        <Route path="/gst-preview" element={<Navigate to="/app/health" replace />} />
        <Route path="/sql-sandbox" element={<Navigate to="/app/transform" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster />
    </>
  );
}
