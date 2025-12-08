// src/components/RoomCall.jsx
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { socket as callSocket } from "../socket";

// 🔐 Replace these with the credentials from your TURN provider
const TURN_USERNAME = "08aee90ff5c8bfbd9615dbdd";
const TURN_PASSWORD = "prTQoftlLOTt6lR8";

// WebRTC ICE config: STUN + TURN
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:80?transport=tcp",
        "turn:global.relay.metered.ca:443",
        "turns:global.relay.metered.ca:443?transport=tcp",
      ],
      username: TURN_USERNAME,
      credential: TURN_PASSWORD,
    },
  ],
  iceCandidatePoolSize: 10,
  // For debugging TURN-only:
  // iceTransportPolicy: "relay",
};

export default function RoomCall({ room, displayName }) {
  const { user } = useAuth();

  // --- SAFETY GUARD: if no room yet, don't crash ---
  if (!room) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Voice &amp; Video
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Select a room and join to start a call.
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

  // use whatever identifier we have
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

  const localVideoRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const localStreamRef = useRef(null);

  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream
  const peerConnectionsRef = useRef({}); // peerId -> RTCPeerConnection

  const [inCall, setInCall] = useState(false);
  const [error, setError] = useState("");
  const [participantCount, setParticipantCount] = useState(0);

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);

  const [incomingCall, setIncomingCall] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const [peerNames, setPeerNames] = useState({}); // peerId -> name

  // 🔁 camera switching state
  const [videoDevices, setVideoDevices] = useState([]); // list of videoinput devices
  const [activeVideoDeviceId, setActiveVideoDeviceId] = useState(null);

  const isOwner = user?.email && room.ownerId === user.email;
  const currentUserName = displayName || user?.name || "User";

  // keep local video element in sync
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, fullscreen, inCall]);

  // ---------- helpers ----------
  const addRemoteStream = (peerId, stream) => {
    console.log("[RTC] got remote stream from", peerId, stream);
    setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
  };

  const removeRemoteStream = (peerId) => {
    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[peerId];
      return copy;
    });
  };

  const createPeerConnection = (peerId, isInitiator) => {
    // Clean up any existing PC for this peer
    if (peerConnectionsRef.current[peerId]) {
      try {
        peerConnectionsRef.current[peerId].close();
      } catch {}
      delete peerConnectionsRef.current[peerId];
    }

    removeRemoteStream(peerId);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    console.log("[RTC] created RTCPeerConnection for", peerId, RTC_CONFIG);

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    pc.ontrack = (event) => {
      console.log("[RTC] ontrack from", peerId, event.streams[0]);
      addRemoteStream(peerId, event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(
          "[RTC] local ICE candidate for",
          peerId,
          event.candidate.candidate
        );
        callSocket.emit("webrtc_ice_candidate", {
          to: peerId,
          candidate: event.candidate,
        });
      } else {
        console.log("[RTC] all local ICE candidates sent for", peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[RTC] ICE state for", peerId, "=>", pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log(
        "[RTC] connection state for",
        peerId,
        "=>",
        pc.connectionState
      );
    };

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          console.log("[RTC] sending offer to", peerId);
          callSocket.emit("webrtc_offer", {
            to: peerId,
            sdp: pc.localDescription,
          });
        })
        .catch((err) => console.error("Offer error:", err));
    }

    peerConnectionsRef.current[peerId] = pc;
    return pc;
  };

  // 🔎 helper: load available video devices (front/back)
  const loadVideoDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videos = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(videos);

      // if we don't have an active id, pick first available
      if (!activeVideoDeviceId && videos[0]?.deviceId) {
        setActiveVideoDeviceId(videos[0].deviceId);
      }
    } catch (err) {
      console.warn("Could not enumerate devices:", err);
    }
  };

  // ---------- start / leave ----------
  const startCall = async () => {
    setError("");
    try {
      console.log("[RTC] requesting getUserMedia...");

      // If we already know which camera to use, try that; otherwise generic
      let constraints;
      if (activeVideoDeviceId) {
        constraints = {
          video: { deviceId: { exact: activeVideoDeviceId } },
          audio: true,
        };
      } else {
        // facingMode helps mobile pick front cam first
        constraints = {
          video: { facingMode: "user" },
          audio: true,
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // start with camera off
      stream.getVideoTracks().forEach((t) => (t.enabled = false));

      // detect which device we actually got
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings?.deviceId) {
          setActiveVideoDeviceId(settings.deviceId);
        }
      }

      // load list of devices (after permission is granted)
      loadVideoDevices();

      localStreamRef.current = stream;
      setLocalStream(stream);

      // reset any old peer connections
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      peerConnectionsRef.current = {};
      setRemoteStreams({});
      setPeerNames({});
      setParticipantCount(1);

      console.log("[RTC] join_call emit for room", roomId);
      callSocket.emit("join_call", {
        roomId,
        isOwner,
        displayName: currentUserName,
      });

      setInCall(true);
      setIsMuted(false);
      setIsCameraOff(true);
      setIncomingCall(null);
    } catch (err) {
      console.error("getUserMedia error:", err);
      setError("Unable to access camera/mic. Please check permissions.");
    }
  };

  const leaveCall = () => {
    console.log("[RTC] leave_call for room", roomId);
    setInCall(false);
    setParticipantCount(0);
    setFullscreen(false);

    callSocket.emit("leave_call", { roomId });

    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    setRemoteStreams({});
    setPeerNames({});
    setIncomingCall(null);
  };

  // ---------- controls ----------
  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newMuted = !isMuted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
    setIsMuted(newMuted);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newOff = !isCameraOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !newOff));
    setIsCameraOff(newOff);
  };

  // 🔁 Flip / reverse camera (front <-> back) on mobile
  const switchCameraDevice = async () => {
    if (!inCall) return;
    if (!navigator.mediaDevices?.getUserMedia) return;

    // Need at least 2 cameras to make this meaningful
    if (!videoDevices || videoDevices.length < 2) {
      alert("No second camera found on this device.");
      return;
    }

    try {
      // Ensure we know current device
      let currentId = activeVideoDeviceId;
      if (!currentId && localStreamRef.current) {
        const track = localStreamRef.current.getVideoTracks()[0];
        const settings = track?.getSettings();
        currentId = settings?.deviceId || null;
      }

      const currentIndex = videoDevices.findIndex(
        (d) => d.deviceId === currentId
      );
      const nextIndex =
        currentIndex >= 0 ? (currentIndex + 1) % videoDevices.length : 0;
      const nextDevice = videoDevices[nextIndex];

      if (!nextDevice?.deviceId) {
        alert("Could not find alternate camera.");
        return;
      }

      console.log(
        "[RTC] switching camera from",
        currentId,
        "to",
        nextDevice.deviceId
      );

      // Get new stream from the other camera
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId } },
        audio: true, // include audio too (or you can keep old audio if you want)
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (!newVideoTrack) {
        console.warn("No video track from new camera");
        return;
      }

      // Replace tracks in existing peer connections (no full renegotiation)
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === "video" && newVideoTrack) {
            sender
              .replaceTrack(newVideoTrack)
              .catch((err) =>
                console.error("Error replacing video track:", err)
              );
          }
          if (sender.track?.kind === "audio" && newAudioTrack) {
            sender
              .replaceTrack(newAudioTrack)
              .catch((err) =>
                console.error("Error replacing audio track:", err)
              );
          }
        });
      });

      // Stop old stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      localStreamRef.current = newStream;
      setLocalStream(newStream);
      setActiveVideoDeviceId(nextDevice.deviceId);
      setIsCameraOff(false); // when switching, assume we turn it on

      console.log("[RTC] camera switched successfully");
    } catch (err) {
      console.error("Error switching camera:", err);
      setError("Failed to switch camera. Please try again.");
    }
  };

  // ---------- socket wiring ----------
  useEffect(() => {
    if (!roomId) return;

    const handleExistingPeers = ({ peers, participantCount }) => {
      console.log("[RTC] existing_peers", peers, "count", participantCount);
      setParticipantCount(participantCount || 1);

      setPeerNames((prev) => {
        const copy = { ...prev };
        (peers || []).forEach((p) => {
          if (typeof p === "string") {
            if (!copy[p]) copy[p] = "User";
          } else if (p && typeof p === "object") {
            const id = p.peerId || p.id;
            if (id) {
              copy[id] = p.name || p.displayName || copy[id] || "User";
            }
          }
        });
        return copy;
      });

      (peers || []).forEach((p) => {
        const id = typeof p === "string" ? p : p.peerId || p.id;
        if (id) createPeerConnection(id, true);
      });
    };

    const handleUserJoined = ({
      peerId,
      name,
      displayName,
      participantCount,
    }) => {
      const label = name || displayName || "User";
      console.log("[RTC] user_joined_call", peerId, label, participantCount);
      setParticipantCount(participantCount || 1);
      setPeerNames((prev) => ({ ...prev, [peerId]: label }));
      createPeerConnection(peerId, false);
    };

    const handleOffer = async ({ from, sdp }) => {
      console.log("[RTC] webrtc_offer from", from);
      let pc = peerConnectionsRef.current[from];
      if (!pc) {
        pc = createPeerConnection(from, false);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        callSocket.emit("webrtc_answer", {
          to: from,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("Error handling offer:", err);
      }
    };

    const handleAnswer = async ({ from, sdp }) => {
      console.log("[RTC] webrtc_answer from", from);
      const pc = peerConnectionsRef.current[from];
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error("Error handling answer:", err);
      }
    };

    const handleIceCandidate = async ({ from, candidate }) => {
      const pc = peerConnectionsRef.current[from];
      if (pc && candidate) {
        try {
          console.log(
            "[RTC] remote ICE candidate for",
            from,
            candidate.candidate
          );
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ICE candidate", err);
        }
      }
    };

    const handleUserLeft = ({ peerId, participantCount }) => {
      console.log("[RTC] user left call", peerId);
      peerConnectionsRef.current[peerId]?.close();
      delete peerConnectionsRef.current[peerId];
      removeRemoteStream(peerId);
      setPeerNames((prev) => {
        const copy = { ...prev };
        delete copy[peerId];
        return copy;
      });

      if (typeof participantCount === "number") {
        setParticipantCount(participantCount);
      } else {
        setParticipantCount((prev) => Math.max(prev - 1, 1));
      }
    };

    const handleCallStarted = ({ roomId: startedRoomId, startedBy }) => {
      if (String(startedRoomId) === String(roomId) && !inCall) {
        console.log("[RTC] call_started by", startedBy);
        setIncomingCall({ startedBy });
      }
    };

    const handleCallEnded = ({ roomId: endedRoomId }) => {
      if (String(endedRoomId) !== String(roomId)) return;
      console.log("[RTC] call ended");
      leaveCall();
    };

    callSocket.on("existing_peers", handleExistingPeers);
    callSocket.on("user_joined_call", handleUserJoined);
    callSocket.on("webrtc_offer", handleOffer);
    callSocket.on("webrtc_answer", handleAnswer);
    callSocket.on("webrtc_ice_candidate", handleIceCandidate);
    callSocket.on("user_left_call", handleUserLeft);
    callSocket.on("call_started", handleCallStarted);
    callSocket.on("call_ended", handleCallEnded);

    return () => {
      callSocket.off("existing_peers", handleExistingPeers);
      callSocket.off("user_joined_call", handleUserJoined);
      callSocket.off("webrtc_offer", handleOffer);
      callSocket.off("webrtc_answer", handleAnswer);
      callSocket.off("webrtc_ice_candidate", handleIceCandidate);
      callSocket.off("user_left_call", handleUserLeft);
      callSocket.off("call_started", handleCallStarted);
      callSocket.off("call_ended", handleCallEnded);
    };
  }, [roomId, isOwner, inCall]);

  // ---------- fullscreen ----------
  const renderFullscreen = () => {
    if (!fullscreen || !inCall) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white border-b border-gray-800">
          <div>
            <div className="font-semibold text-sm">Room Call – {room.name}</div>
            <div className="text-xs text-gray-400">
              In call: {participantCount || 1}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleMute}
              className={`px-3 py-1 rounded text-xs transition ${
                isMuted ? "bg-red-600" : "bg-gray-700"
              }`}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={toggleCamera}
              className={`px-3 py-1 rounded text-xs transition ${
                isCameraOff ? "bg-red-600" : "bg-gray-700"
              }`}
            >
              {isCameraOff ? "Start Video" : "Stop Video"}
            </button>
            {/* 🔁 Flip camera button (fullscreen) */}
            <button
              onClick={switchCameraDevice}
              className="px-3 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600"
            >
              🔁 Flip
            </button>
            <button
              onClick={() => setFullscreen(false)}
              className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs"
            >
              ⛶ Minimize
            </button>
            <button
              onClick={leaveCall}
              className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-xs"
            >
              Leave
            </button>
          </div>
        </div>

        {/* All videos in one grid: local + remotes */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {/* Local tile */}
            <div className="flex flex-col h-full relative rounded-lg overflow-hidden bg-gray-800 ring-1 ring-gray-700">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  isCameraOff ? "hidden" : "block"
                }`}
              />
              {isCameraOff && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <span className="text-4xl mb-2">📷</span>
                    <span className="text-xs">Camera is Off</span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-0.5 rounded text-xs">
                You
              </div>
            </div>

            {/* Remote tiles */}
            {Object.entries(remoteStreams).map(([peerId, stream]) => (
              <RemoteVideo
                key={peerId}
                stream={stream}
                name={peerNames[peerId]}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ---------- compact main UI ----------
  return (
    <>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Voice &amp; Video
              </h3>
              {inCall && (
                <span className="flex items-center gap-1 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  Live · {participantCount || 1}
                </span>
              )}
            </div>
            {!inCall && (
              <p className="text-[10px] text-slate-500 truncate mt-0.5">
                {isOwner ? "Tap Join to start." : "Wait for owner or join."}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {inCall ? (
              <>
                <button
                  onClick={toggleMute}
                  className={`p-1.5 rounded-md text-xs transition ${
                    isMuted
                      ? "bg-red-100 text-red-600"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  }`}
                  title="Toggle Mic"
                >
                  {isMuted ? "🎤❌" : "🎤"}
                </button>
                <button
                  onClick={toggleCamera}
                  className={`p-1.5 rounded-md text-xs transition ${
                    isCameraOff
                      ? "bg-red-100 text-red-600"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  }`}
                  title="Toggle Camera"
                >
                  {isCameraOff ? "📷❌" : "📷"}
                </button>
                {/* 🔁 Flip button (compact mode) */}
                <button
                  onClick={switchCameraDevice}
                  className="p-1.5 rounded-md text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700"
                  title="Flip camera"
                >
                  🔁
                </button>
                <button
                  onClick={() => setFullscreen(true)}
                  className="p-1.5 rounded-md text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700"
                  title="Fullscreen"
                >
                  ⛶
                </button>
                <button
                  onClick={leaveCall}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm"
                >
                  End
                </button>
              </>
            ) : (
              <button
                onClick={startCall}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition"
              >
                Join Call
              </button>
            )}
          </div>
        </div>

        {incomingCall && !inCall && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-600 text-white px-3 py-2 text-xs shadow-md">
            <span className="font-medium">
              📞 {incomingCall.startedBy} started a call.
            </span>
            <div className="flex gap-2">
              <button
                onClick={startCall}
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

        {/* small preview strip only when in call */}
        {inCall && !fullscreen && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
            <div className="relative shrink-0 w-28 h-20 rounded-lg overflow-hidden bg-black ring-1 ring-gray-200 dark:ring-gray-700">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  isCameraOff ? "hidden" : "block"
                }`}
              />
              {isCameraOff && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-[10px]">
                  (Cam Off)
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-[9px] text-white truncate">
                You
              </div>
            </div>

            {Object.entries(remoteStreams).map(([peerId, stream]) => (
              <div
                key={peerId}
                className="relative shrink-0 w-28 h-20 rounded-lg overflow-hidden bg-black ring-1 ring-gray-200 dark:ring-gray-700"
              >
                <RemoteVideoSmall stream={stream} />
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 text-[9px] text-white truncate">
                  {peerNames[peerId] || "Guest"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {renderFullscreen()}
    </>
  );
}

function RemoteVideoSmall({ stream }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
}

function RemoteVideo({ stream, name }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div className="relative rounded-lg overflow-hidden bg-black ring-1 ring-gray-700">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-0.5 rounded text-xs">
        {name ? `User: ${name}` : "User"}
      </div>
    </div>
  );
}
