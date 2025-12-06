import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRooms } from "../context/RoomContext";

export default function JoinRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { rooms, setRooms } = useRooms(); // 👈 get from context

  const room = rooms.find((r) => r.id === roomId);

  const [guestName, setGuestName] = useState("");

  useEffect(() => {
    if (!room) return; // room not found yet / invalid

    if (isAuthenticated && user?.email) {
      // Logged-in users auto-join if not already member
      if (!room.members) {
        room.members = [];
      }
      if (!room.members.some((m) => m.id === user.email)) {
        const updatedRoom = {
          ...room,
          members: [
            ...room.members,
            {
              id: user.email,
              name: user.name,
              role: "member",
            },
          ],
        };

        setRooms((prev) =>
          prev.map((r) => (r.id === room.id ? updatedRoom : r))
        );
      }
    }
  }, [room, user, isAuthenticated, setRooms, rooms]);

  const handleGuestJoin = () => {
    if (!guestName.trim()) return alert("Please enter a name");
    if (!room) return;

    const updatedRoom = {
      ...room,
      members: [
        ...(room.members || []),
        {
          id: `guest-${Date.now()}`,
          name: guestName.trim(),
          role: "guest",
        },
      ],
    };

    setRooms((prev) => prev.map((r) => (r.id === room.id ? updatedRoom : r)));

    navigate("/rooms", { replace: true });
  };

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="p-6 border rounded-xl bg-white dark:bg-gray-800 text-center">
          <h2 className="text-lg font-semibold text-red-500">
            ❌ Room Not Found
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            This room link is invalid or expired.
          </p>
          <button
            onClick={() => navigate("/rooms")}
            className="mt-4 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="p-6 border rounded-xl bg-white dark:bg-gray-800 text-center w-80">
        <h2 className="text-xl font-semibold">{room.name}</h2>
        <p className="text-xs text-gray-500 mb-4">Room Code: {room.code}</p>

        {isAuthenticated ? (
          <>
            <p className="text-sm text-green-600">
              You are joining as {user.name} ✔
            </p>
            <button
              className="mt-4 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => navigate("/rooms")}
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-2">Join as a guest</p>
            <input
              placeholder="Enter your name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full px-3 py-2 border rounded mb-3 dark:bg-gray-900"
            />

            <button
              onClick={handleGuestJoin}
              className="w-full px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
            >
              Join Room
            </button>

            <p className="text-xs mt-3 text-gray-400">
              Want to save chat history?{" "}
              <span
                className="text-blue-500 cursor-pointer hover:underline"
                onClick={() => navigate("/login")}
              >
                Sign in
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
