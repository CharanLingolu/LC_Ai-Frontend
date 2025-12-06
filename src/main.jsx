import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";

import { ThemeProvider } from "./context/ThemeContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { RoomProvider } from "./context/RoomContext";

import MainLayout from "./layout/MainLayout";

import Home from "./pages/Home";
import PromptEngineer from "./pages/PromptEngineer";
import TextTools from "./pages/TextTools";
import FriendMode from "./pages/FriendMode";
import Rooms from "./pages/Rooms";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import JoinRoom from "./pages/JoinRoom";

import { GoogleOAuthProvider } from "@react-oauth/google";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId="487497643654-ve9eheqj03qotm6qeih2ktetmol34012.apps.googleusercontent.com">
      <ThemeProvider>
        <AuthProvider>
          <RoomProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<MainLayout />}>
                  <Route index element={<Home />} />
                  <Route path="prompt" element={<PromptEngineer />} />
                  <Route path="text-tools" element={<TextTools />} />
                  <Route path="friend" element={<FriendMode />} />
                  <Route path="rooms" element={<Rooms />} />
                  <Route path="login" element={<Login />} />
                  <Route path="signup" element={<Signup />} />
                  {/* 🔽 no props here, JoinRoom uses context */}
                  <Route path="join/:roomId" element={<JoinRoom />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </RoomProvider>
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
