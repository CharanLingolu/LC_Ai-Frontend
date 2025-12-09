// src/components/RoomCall.jsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { socket as callSocket } from "../socket";

// 🚀 Stream Video React SDK
import {
  StreamVideoClient,
  StreamVideo,
  StreamCall,
  StreamTheme,
  CallControls,
  SpeakerLayout,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";

// 👉 Your Stream API key (Frontend)
const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;
// 👉 Your backend base URL (for token endpoint)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
const STREAM_TOKEN_URL = BACKEND_URL
  ? `${BACKEND_URL}/api/stream/token`
  : "/api/stream/token"; // fallback for local dev with proxy

export default function RoomCall({ room, displayName }) {
  const { user } = useAuth();

  // --- SAFETY GUARD: if no room yet, show neutral UI ---
  if (!room) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Voice &amp; Video
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Select a room to enable calling.
            </p>
          </div>
          <button
            disabled
            className="px-4 py-1.5 rounded-md text-xs font-semibold bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-not-allowed"
          >
            Join Call
          </button>
        </div>
      </div>
    );
  }

  // Use whatever identifier we have for the room
  const roomId = room._id || room.id || room.code;
  if (!roomId) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Voice &amp; Video
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              This room has no id yet. Try opening it again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Identify user for Stream
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

  // 🔔 socket-based presence + notification
  const [participantCount, setParticipantCount] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null); // { startedBy }

  const isOwner = user?.email && room.ownerId === user.email;

  // ---------- Initialize Stream client + Call ----------
  useEffect(() => {
    if (!STREAM_API_KEY) {
      console.warn(
        "STREAM_API_KEY missing. Set VITE_STREAM_API_KEY in your frontend .env"
      );
      return;
    }
    if (!currentUserId) return;

    let cancelled = false;
    let clientInstance;
    let callInstance;

    const initStream = async () => {
      try {
        setLoading(true);
        setError("");

        // 👉 Fetch Stream user token from your backend
        const res = await fetch(STREAM_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUserId,
            name: currentUserName,
          }),
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Token fetch failed [${res.status}]: ${txt}`);
        }

        const data = await res.json();
        const token = data.token;

        if (cancelled) return;

        // Create Stream Video client
        clientInstance = new StreamVideoClient({
          apiKey: STREAM_API_KEY,
          user: {
            id: currentUserId,
            name: currentUserName,
          },
          token,
        });

        // One Stream call per room; type "default"
        callInstance = clientInstance.call("default", String(roomId));

        setVideoClient(clientInstance);
        setCall(callInstance);
      } catch (err) {
        console.error("[Stream] init error:", err);
        if (!cancelled) {
          setError("Failed to initialize video client.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initStream();

    return () => {
      cancelled = true;
      (async () => {
        try {
          if (callInstance) {
            await callInstance.leave();
          }
        } catch {}
        try {
          if (clientInstance) {
            await clientInstance.disconnectUser();
          }
        } catch {}
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentUserId]);

  // ---------- Socket.io: call presence + notifications ----------
  useEffect(() => {
    if (!roomId) return;

    const handleExistingPeers = ({ participantCount }) => {
      setParticipantCount(participantCount || 1);
    };

    const handleUserJoinedCall = ({ participantCount }) => {
      setParticipantCount(participantCount || 1);
    };

    const handleUserLeftCall = ({ participantCount }) => {
      if (typeof participantCount === "number") {
        setParticipantCount(participantCount);
      } else {
        setParticipantCount((prev) => Math.max(prev - 1, 0));
      }
    };

    const handleCallStarted = ({ roomId: startedRoomId, startedBy }) => {
      if (String(startedRoomId) === String(roomId) && !inCall) {
        setIncomingCall({ startedBy: startedBy || "Someone" });
      }
    };

    const handleCallEnded = ({ roomId: endedRoomId }) => {
      if (String(endedRoomId) !== String(roomId)) return;
      setIncomingCall(null);
      setParticipantCount(0);
      if (inCall) {
        setInCall(false);
        setFullscreen(false);
      }
    };

    callSocket.on("existing_peers", handleExistingPeers);
    callSocket.on("user_joined_call", handleUserJoinedCall);
    callSocket.on("user_left_call", handleUserLeftCall);
    callSocket.on("call_started", handleCallStarted);
    callSocket.on("call_ended", handleCallEnded);

    return () => {
      callSocket.off("existing_peers", handleExistingPeers);
      callSocket.off("user_joined_call", handleUserJoinedCall);
      callSocket.off("user_left_call", handleUserLeftCall);
      callSocket.off("call_started", handleCallStarted);
      callSocket.off("call_ended", handleCallEnded);
    };
  }, [roomId, inCall]);

  // ---------- Join / Leave call (Stream + socket presence) ----------
  const handleJoin = async () => {
    if (!call) return;
    setError("");
    try {
      setLoading(true);
      // create: true => create call room if doesn't exist
      await call.join({ create: true });

      // 🔔 notify other room members via your existing socket.io logic
      callSocket.emit("join_call", {
        roomId,
        isOwner,
        displayName: currentUserName,
      });

      setInCall(true);
      setIncomingCall(null);
      if (participantCount === 0) setParticipantCount(1);
    } catch (err) {
      console.error("[Stream] join error:", err);
      setError("Unable to join call. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    try {
      setLoading(true);
      if (call) {
        await call.leave();
      }
    } catch (err) {
      console.error("[Stream] leave error:", err);
    } finally {
      // 🔔 notify socket server that this user left the call
      callSocket.emit("leave_call", { roomId });

      setInCall(false);
      setFullscreen(false);
      setLoading(false);
      setParticipantCount(0);
      setIncomingCall(null);
    }
  };

  const liveCount = inCall
    ? participantCount || 1
    : participantCount > 0
    ? participantCount
    : 0;

  return (
    <>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Voice &amp; Video (Stream)
              </h3>
              {liveCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  Live · {liveCount}
                </span>
              )}
            </div>
            {!inCall && (
              <p className="text-[10px] text-slate-500 truncate mt-0.5">
                {STREAM_API_KEY
                  ? isOwner
                    ? 'Tap Join to start a Stream call. Others see a "Call started" banner.'
                    : "You’ll see a banner when someone starts a call."
                  : "Stream API key not configured."}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {inCall ? (
              <>
                <button
                  onClick={() => setFullscreen(true)}
                  className="p-1.5 rounded-md text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700"
                  title="Open call view"
                >
                  ⛶
                </button>
                <button
                  onClick={handleLeave}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:opacity-60"
                >
                  {loading ? "Leaving..." : "End"}
                </button>
              </>
            ) : (
              <button
                onClick={handleJoin}
                disabled={loading || !STREAM_API_KEY || !call}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition disabled:opacity-60"
              >
                {loading ? "Connecting..." : "Join Call"}
              </button>
            )}
          </div>
        </div>

        {/* 🔔 Incoming call banner (socket-based) */}
        {incomingCall && !inCall && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-600 text-white px-3 py-2 text-xs shadow-md">
            <span className="font-medium">
              📞 {incomingCall.startedBy} started a call.
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleJoin}
                className="px-2 py-0.5 rounded bg-white text-blue-700 font-bold hover:bg-gray-100"
              >
                Join
              </button>
              <button
                onClick={() => setIncomingCall(null)}
                className="px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-800"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {error && <div className="mt-2 text-[10px] text-red-500">{error}</div>}

        {!STREAM_API_KEY && (
          <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">
            Set <code>VITE_STREAM_API_KEY</code> in your frontend{" "}
            <code>.env</code>.
          </div>
        )}
      </div>

      {/* Fullscreen overlay with Instagram-style layout + all controls */}
      {fullscreen && inCall && videoClient && call && (
        <FullscreenCallOverlay
          client={videoClient}
          call={call}
          roomName={room.name || "Room"}
          currentUserName={currentUserName}
          onMinimize={() => setFullscreen(false)}
          onLeave={handleLeave}
        />
      )}
    </>
  );
}

/**
 * Full-screen overlay that renders Stream's video call UI:
 * - SpeakerLayout: active speaker big, others in smaller tiles (Instagram-ish)
 * - CallControls: mic toggle, camera toggle, flip camera on mobile, screen share, etc.
 */
function FullscreenCallOverlay({
  client,
  call,
  roomName,
  currentUserName,
  onMinimize,
  onLeave,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black">
      <StreamVideo client={client}>
        <StreamCall call={call}>
          {/* Top bar overlay */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-black/70 text-white text-xs">
            <div>
              <div className="font-semibold">Room Call – {roomName}</div>
              <div className="text-[10px] text-gray-300">
                You are connected as {currentUserName}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onMinimize}
                className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px]"
              >
                ⛶ Minimize
              </button>
              <button
                onClick={onLeave}
                className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-[11px]"
              >
                End Call
              </button>
            </div>
          </div>

          {/* Stream built-in layout & controls */}
          <StreamTheme>
            <div className="w-full h-full flex flex-col pt-10">
              {/* Big video layout (active speaker style) */}
              <div className="flex-1 min-h-0">
                <SpeakerLayout />
              </div>

              {/* Bottom controls: mic, cam, flip, screenshare, etc. */}
              <div className="shrink-0 px-4 pb-4">
                <CallControls
                  onLeave={onLeave}
                  // you can customize which buttons show here later if you want
                />
              </div>
            </div>
          </StreamTheme>
        </StreamCall>
      </StreamVideo>
    </div>
  );
}
