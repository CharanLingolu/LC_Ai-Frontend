// src/components/RoomCall.jsx
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { socket as callSocket } from "../socket";

import {
  StreamVideoClient,
  StreamVideo,
  StreamCall,
  SpeakerLayout,
  ToggleAudioPublishingButton,
  ToggleVideoPublishingButton,
  CancelCallButton,
  ScreenShareButton,
  CallParticipantsList,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";
import "../index.css";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
const STREAM_TOKEN_URL = BACKEND_URL
  ? `${BACKEND_URL}/api/stream/token`
  : "/api/stream/token";

export default function RoomCall({ room, displayName }) {
  const { user } = useAuth();

  if (!room || !room.id) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900 shadow-sm flex flex-col items-center justify-center text-center h-full min-h-[140px]">
        <div className="w-9 h-9 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center mb-2">
          <span className="text-lg">📞</span>
        </div>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          Voice & Video
        </h3>
        <p className="text-[10px] text-slate-500 mt-1">
          {room ? "This room has no ID." : "Select a room to start calling."}
        </p>
      </div>
    );
  }

  const roomId = room._id || room.id || room.code;
  const currentUserName = displayName || user?.name || "User";
  const currentUserId =
    user?._id ||
    user?.id ||
    user?.email ||
    currentUserName.replace(/\s+/g, "_").toLowerCase();

  const [videoClient, setVideoClient] = useState(null);
  const [call, setCall] = useState(null);

  const [loading, setLoading] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [participantCount, setParticipantCount] = useState(0);

  // incoming banner
  const [incomingCallInfo, setIncomingCallInfo] = useState(null);

  const isOwner = user?.email && room.ownerId === user.email;

  // Init Stream client + call (robust: re-use existing client instances)
  useEffect(() => {
    if (!STREAM_API_KEY) return;
    if (!currentUserId) return;

    let cancelled = false;
    let clientInstance = null;
    let callInstance = null;
    let createdClientHere = false;

    const initStream = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(STREAM_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUserId,
            name: currentUserName,
          }),
        });

        if (!res.ok) throw new Error("Token fetch failed");
        const data = await res.json();
        const token = data.token;

        if (cancelled) return;

        if (typeof StreamVideoClient.getOrCreateInstance === "function") {
          clientInstance = StreamVideoClient.getOrCreateInstance({
            apiKey: STREAM_API_KEY,
            user: { id: currentUserId, name: currentUserName },
            token,
          });
          createdClientHere = false;
        } else {
          const key = `streamClient_${currentUserId}`;
          window.__streamVideoClients = window.__streamVideoClients || {};

          if (window.__streamVideoClients[key]) {
            clientInstance = window.__streamVideoClients[key];
            createdClientHere = false;
          } else {
            clientInstance = new StreamVideoClient({
              apiKey: STREAM_API_KEY,
              user: { id: currentUserId, name: currentUserName },
              token,
            });
            window.__streamVideoClients[key] = clientInstance;
            createdClientHere = true;
          }
        }

        if (cancelled) return;

        callInstance = clientInstance.call("default", String(roomId));

        setVideoClient(clientInstance);
        setCall(callInstance);
      } catch (err) {
        console.error("[Stream] init error:", err);
        if (!cancelled) setError("Failed to init video.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initStream();

    return () => {
      cancelled = true;

      const cleanup = async () => {
        try {
          if (callInstance) {
            await callInstance.leave().catch(() => {});
          }
        } catch (_) {}

        try {
          if (
            createdClientHere &&
            clientInstance &&
            typeof clientInstance.disconnectUser === "function"
          ) {
            await clientInstance.disconnectUser().catch(() => {});
            const key = `streamClient_${currentUserId}`;
            if (
              window.__streamVideoClients &&
              window.__streamVideoClients[key]
            ) {
              delete window.__streamVideoClients[key];
            }
          }
        } catch (_) {}
      };

      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentUserId, currentUserName]);

  // Socket events: participants + incoming banner
  useEffect(() => {
    if (!roomId) return;

    const handleUpdate = ({ participantCount }) =>
      setParticipantCount(participantCount || 0);

    callSocket.on("existing_peers", handleUpdate);
    callSocket.on("user_joined_call", handleUpdate);
    callSocket.on("user_left_call", handleUpdate);

    const handleCallStarted = ({ roomId: startedRoomId, startedBy }) => {
      if (String(startedRoomId) !== String(roomId)) return;
      if (!startedBy) return;

      let starterId = null;
      let starterName = null;

      if (typeof startedBy === "string") {
        starterName = startedBy;
      } else if (typeof startedBy === "object") {
        starterName =
          startedBy.displayName ||
          startedBy.name ||
          (startedBy.id ? String(startedBy.id) : null);
        starterId = startedBy.id || null;
      }

      if (starterId && String(starterId) === String(currentUserId)) return;
      if (!starterId && starterName && starterName === currentUserName) return;

      if (!starterName) starterName = "Someone";
      setIncomingCallInfo({
        callerId: starterId,
        callerName: starterName,
      });
    };

    const handleCallEnded = ({ roomId: endedRoomId }) => {
      if (String(endedRoomId) !== String(roomId)) return;
      setIncomingCallInfo(null);
    };

    callSocket.on("call_started", handleCallStarted);
    callSocket.on("call_ended", handleCallEnded);

    return () => {
      callSocket.off("existing_peers", handleUpdate);
      callSocket.off("user_joined_call", handleUpdate);
      callSocket.off("user_left_call", handleUpdate);
      callSocket.off("call_started", handleCallStarted);
      callSocket.off("call_ended", handleCallEnded);
    };
  }, [roomId, currentUserId, currentUserName]);

  // Join / leave handlers
  const handleJoin = async (fromBanner = false) => {
    if (!call) return;
    try {
      setLoading(true);
      await call.join({ create: true });

      callSocket.emit("join_call", {
        roomId,
        isOwner,
        displayName: currentUserName,
      });

      if (!fromBanner) {
        callSocket.emit("call_started", {
          roomId,
          startedBy: {
            id: currentUserId,
            name: currentUserName,
            displayName: currentUserName,
          },
        });
      }

      setIncomingCallInfo(null);
      setInCall(true);
      setFullscreen(true);
    } catch (err) {
      console.error(err);
      setError("Could not join call.");
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    try {
      if (call) await call.leave();
    } catch {
    } finally {
      callSocket.emit("leave_call", { roomId });
      callSocket.emit("call_ended", { roomId });
      setInCall(false);
      setFullscreen(false);
    }
  };

  // Compact widget UI
  return (
    <>
      {/* Incoming call banner */}
      {incomingCallInfo && !inCall && (
        <div className="mb-2 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/90 dark:bg-blue-900/30 px-3 py-2 flex items-center justify-between text-[11px] animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-[11px] font-semibold animate-pulse">
              {(incomingCallInfo.callerName || "S").charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {incomingCallInfo.callerName} started a call
              </span>
              <span className="text-[10px] text-slate-600 dark:text-slate-300">
                Tap Join to enter the room call
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIncomingCallInfo(null)}
              className="px-2 py-1 rounded-full text-[10px] border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => handleJoin(true)}
              disabled={loading || !STREAM_API_KEY || !call}
              className="px-3 py-1 rounded-full text-[10px] font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-all active:scale-95"
            >
              Join
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-between transition-all hover:shadow-md h-[64px]">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              inCall
                ? "bg-green-500 animate-pulse"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
          ></div>
          <div className="flex flex-col">
            <h3 className="text-[11px] font-semibold tracking-wide text-slate-700 dark:text-slate-300">
              Video Call
            </h3>
            <p className="text-[10px] text-slate-500">
              {inCall ? "Call in progress" : "Tap Join to start"}
              {participantCount > 0 && (
                <span className="ml-1 text-[9px] text-slate-400">
                  • {participantCount} in call
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {inCall ? (
            <>
              <button
                onClick={() => setFullscreen(true)}
                className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition active:scale-95 border border-gray-200 dark:border-gray-700"
                title="Expand"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>
              <button
                onClick={handleLeave}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-500/20 active:scale-95 transition"
              >
                End
              </button>
            </>
          ) : (
            <button
              onClick={() => handleJoin(false)}
              disabled={loading || !STREAM_API_KEY || !call}
              className="px-3.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-500/20 active:scale-95 transition flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Connecting
                </>
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Join
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 text-[10px] text-red-500 bg-red-50 dark:bg-red-900/10 p-2 rounded border border-red-100 dark:border-red-900/30">
          {error}
        </div>
      )}

      {fullscreen && inCall && videoClient && call && (
        <FullscreenCallOverlay
          client={videoClient}
          call={call}
          roomName={room.name}
          onMinimize={() => setFullscreen(false)}
          onLeave={handleLeave}
        />
      )}

      {/* Floating mini-player: appears while inCall && !fullscreen */}
      {inCall && !fullscreen && videoClient && call && (
        <FloatingMiniCall
          client={videoClient}
          call={call}
          roomName={room.name}
          onOpen={() => setFullscreen(true)}
          onLeave={handleLeave}
        />
      )}
    </>
  );
}

// --- FULLSCREEN COMPONENT ---
function FullscreenCallOverlay({
  client,
  call,
  roomName,
  onMinimize,
  onLeave,
}) {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col str-video animate-in fade-in duration-300">
      <StreamVideo client={client}>
        <StreamCall call={call}>
          {/* TOP HEADER */}
          <div className="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3 bg-slate-900/80 backdrop-blur-md border-b border-white/10 shrink-0 z-50 absolute top-0 left-0 right-0">
            <div className="flex items-center gap-2.5 md:gap-3">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-[11px] md:text-xs font-bold shadow-lg text-white">
                {(roomName || "R").charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <h2 className="text-xs md:text-sm font-semibold text-white tracking-tight line-clamp-1 max-w-[180px] md:max-w-xs">
                  {roomName}
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  <p className="text-[9px] md:text-[10px] text-gray-300 font-medium">
                    Live Connection
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={onMinimize}
              className="group p-1.5 md:p-2 rounded-full hover:bg-white/10 transition-colors"
              title="Minimize"
            >
              <svg
                className="w-5 h-5 md:w-6 md:h-6 text-gray-300 group-hover:text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>

          {/* MAIN VIDEO AREA - Adjusted spacing to show local preview */}
          <div className="flex-1 relative bg-black flex items-center justify-center pt-[52px] md:pt-[60px] pb-[100px] md:pb-[110px] w-full h-full overflow-hidden">
            <div className="w-full h-full max-w-[1200px] mx-auto px-2 sm:px-3 md:px-4">
              <SpeakerLayout participantsBarPosition="bottom" />
            </div>

            {/* Participant List - show on md+ */}
            <div className="absolute top-16 md:top-20 right-2 md:right-4 hidden md:block z-40 max-w-[200px] lg:max-w-[240px]">
              <div className="bg-black/60 backdrop-blur-md rounded-xl p-2 max-h-[240px] lg:max-h-[300px] overflow-y-auto border border-white/10 scrollbar-thin scrollbar-thumb-white/20">
                <h4 className="text-[9px] font-bold text-gray-400 mb-2 px-1.5 uppercase tracking-wide">
                  Participants
                </h4>
                <CallParticipantsList />
              </div>
            </div>
          </div>

          {/* BOTTOM CONTROLS - Higher position to not cover local video */}
          <div className="absolute bottom-5 md:bottom-7 left-0 right-0 z-50 flex justify-center px-2 sm:px-4 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2.5 md:gap-4 px-4 md:px-5 py-2.5 md:py-3 bg-slate-900/80 backdrop-blur-xl border border-white/20 rounded-full shadow-2xl shadow-black/60 transition-all hover:bg-slate-900/95 duration-300 max-w-[85vw] md:max-w-md">
              {/* Mic */}
              <div className="flex flex-col items-center gap-0.5 group">
                <div className="custom-stream-btn-wrapper">
                  <ToggleAudioPublishingButton />
                </div>
              </div>

              {/* Cam */}
              <div className="flex flex-col items-center gap-0.5 group">
                <div className="custom-stream-btn-wrapper">
                  <ToggleVideoPublishingButton />
                </div>
              </div>

              {/* Screen share - hidden on very small screens */}
              <div className="hidden sm:flex flex-col items-center gap-0.5 group">
                <div className="custom-stream-btn-wrapper">
                  <ScreenShareButton />
                </div>
              </div>

              <div className="w-px h-6 md:h-7 bg-white/30 mx-0.5 md:mx-1"></div>

              {/* End Call */}
              <div className="flex flex-col items-center gap-0.5 group">
                <CancelCallButton
                  onClick={onLeave}
                  style={{
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                  }}
                  className="!bg-red-600 hover:!bg-red-700 !text-white !border-none rounded-full w-10 h-10 md:w-11 md:h-11 flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform hover:scale-105 active:scale-95"
                />
              </div>
            </div>
          </div>
        </StreamCall>
      </StreamVideo>

      {/* Stream button style overrides */}
      <style>{`
        .custom-stream-btn-wrapper .str-video__btn {
          background-color: rgba(255, 255, 255, 0.12) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 9999px !important;
          width: 42px !important;
          height: 42px !important;
          color: white !important;
          transition: all 0.2s ease;
        }
        @media (min-width: 768px) {
          .custom-stream-btn-wrapper .str-video__btn {
            width: 46px !important;
            height: 46px !important;
          }
        }
        .custom-stream-btn-wrapper .str-video__btn:hover {
          background-color: rgba(255, 255, 255, 0.22) !important;
          transform: scale(1.08);
        }
        .custom-stream-btn-wrapper .str-video__btn-enabled {
          background-color: rgba(255, 255, 255, 0.2) !important;
        }
        .str-video__participant-list {
          background: transparent !important;
        }
        .str-video__participant-list-item {
          color: white !important;
          font-size: 11px !important;
        }
        
        /* Ensure local video preview stays visible */
        .str-video__speaker-layout__wrapper {
          height: 100% !important;
          padding-bottom: 0 !important;
        }
        
        /* Scrollbar styling for participant list */
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3);
        }

        /* Mini-player resize handle fix (visible and easy to grab) */
        .mini-resize-handle {
          pointer-events: auto !important;
          z-index: 99999 !important;
          background: rgba(255,255,255,0.08);
          width: 28px !important;
          height: 28px !important;
          border-radius: 6px !important;
          display: flex;
          align-items: center;
          justify-content: center;
          right: 6px !important;
          bottom: 6px !important;
        }
      `}</style>
    </div>
  );
}

// --- Floating mini-player component (Instagram-like) with resize fix ---
function FloatingMiniCall({ client, call, roomName, onOpen, onLeave }) {
  // Guard: if no client or call provided, don't render the mini-player.
  if (!client || !call || typeof document === "undefined") return null;

  const rootRef = useRef(null);
  const posKey = "miniCallPos_v1";
  const sizeKey = "miniCallSize_v1";

  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(posKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { right: 24, bottom: 100 };
  });

  // Increased default size so it's much more usable by default
  const [size, setSize] = useState(() => {
    try {
      const raw = localStorage.getItem(sizeKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    // default to a bigger size that's easier to read/interact with
    return { width: 360, height: 220 };
  });

  const dragging = useRef(false);
  const resizing = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const startPos = useRef(pos);
  const startSize = useRef(size);

  useEffect(() => {
    function up() {
      dragging.current = false;
      resizing.current = false;
      try {
        localStorage.setItem(posKey, JSON.stringify(pos));
        localStorage.setItem(sizeKey, JSON.stringify(size));
      } catch (e) {}
    }
    function move(e) {
      // Prevent default to avoid touch scrolling while resizing
      if (resizing.current) e.preventDefault?.();

      if (resizing.current) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - start.current.x;
        const dy = clientY - start.current.y;
        // Increased max sizes and min sizes for usability
        const newW = Math.max(220, Math.min(820, startSize.current.width + dx));
        const newH = Math.max(
          140,
          Math.min(520, startSize.current.height + dy)
        );
        setSize({ width: newW, height: newH });
        return;
      }
      if (!dragging.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - start.current.x;
      const dy = clientY - start.current.y;
      const newRight = Math.max(8, startPos.current.right - dx);
      const newBottom = Math.max(8, startPos.current.bottom - dy);
      setPos({ right: newRight, bottom: newBottom });
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [pos, size]);

  const onPointerDown = (e) => {
    if (resizing.current) return;
    // stop text selection
    e.preventDefault?.();
    dragging.current = true;
    start.current.x = e.touches ? e.touches[0].clientX : e.clientX;
    start.current.y = e.touches ? e.touches[0].clientY : e.clientY;
    startPos.current = pos;
  };

  const onResizeDown = (e) => {
    // stop propagation and selection
    e.stopPropagation?.();
    e.preventDefault?.();
    resizing.current = true;
    start.current.x = e.touches ? e.touches[0].clientX : e.clientX;
    start.current.y = e.touches ? e.touches[0].clientY : e.clientY;
    startSize.current = size;
  };

  // Render the mini window. Controls are inside StreamCall so SDK hooks are safe.
  const mini = (
    <div
      ref={rootRef}
      className="fixed z-[9998] rounded-xl overflow-hidden shadow-2xl bg-black/88 backdrop-blur-md border border-white/10 flex flex-col"
      style={{
        right: pos.right,
        bottom: pos.bottom,
        width: size.width,
        height: size.height,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-move"
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        title="Drag to move"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-sm font-bold text-white">
            {(roomName || "R").charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-semibold text-white line-clamp-1 max-w-[200px]">
              {roomName}
            </div>
            <div className="text-[11px] text-gray-300">Live</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpen}
            className="p-1.5 rounded-md hover:bg-white/10 text-white"
            title="Open"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
          <button
            onClick={onLeave}
            className="p-1.5 rounded-md hover:bg-white/10 text-white"
            title="End"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <StreamVideo client={client}>
        <StreamCall call={call}>
          <div className="flex-1 bg-black relative">
            {/* video preview: keep the inner preview non-interactive so it doesn't steal pointer events */}
            <div className="w-full h-full">
              <div className="w-full h-full pointer-events-none">
                <SpeakerLayout participantsBarPosition="bottom" />
              </div>
            </div>

            {/* Controls INSIDE StreamCall context so SDK hooks are safe */}
            <div className="absolute left-3 bottom-3 flex items-center gap-2 pointer-events-auto">
              <div className="custom-mini-btn">
                <ToggleAudioPublishingButton />
              </div>
              <div className="custom-mini-btn">
                <ToggleVideoPublishingButton />
              </div>
            </div>

            {/* Bigger visible Resize handle (bottom-right). Easy to grab and touch friendly. */}
            <div
              onMouseDown={onResizeDown}
              onTouchStart={onResizeDown}
              className="mini-resize-handle absolute"
              title="Resize"
              style={{ right: 8, bottom: 8 }}
            >
              <svg
                className="w-4 h-4 text-white opacity-85"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 16l4 4M12 16l8 8"
                />
              </svg>
            </div>
          </div>
        </StreamCall>
      </StreamVideo>

      <style>{`
        .custom-mini-btn .str-video__btn { width:36px !important; height:36px !important; border-radius:10px !important; }
      `}</style>
    </div>
  );

  return createPortal(mini, document.body);
}
