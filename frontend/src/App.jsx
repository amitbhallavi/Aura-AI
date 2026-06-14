import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import Calls from "./pages/Calls";
import Messages from "./pages/Messages";
import Tasks from "./pages/Tasks";
import AdminDashboard from "./pages/AdminDashboard";
import Layout from "./components/Layout/Layout";
import Pricing from "./pages/Pricing";
import PhoneConfigPage from "./pages/PhoneConfigPage";


function PrivateRoute({ children }) {
  const { token } = useSelector((s) => s.auth);
  return token ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { token } = useSelector((s) => s.auth);
  return !token ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        {/* Admin — outside Layout */}
        <Route path="/admin" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />

        {/* Protected pages inside Layout */}
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="calls" element={<Calls />} />
          <Route path="messages" element={<Messages />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="settings/phone-config" element={<PhoneConfigPage />} />
          <Route path="phone-config" element={<Navigate to="/settings/phone-config" replace />} />
          <Route path="settings/caller-id" element={<Navigate to="/settings/phone-config" replace />} />
          <Route path="caller-id" element={<Navigate to="/settings/phone-config" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
