import { createContext, useContext, useState } from "react";

const RoomContext = createContext();

export function RoomProvider({ children }) {
  const [rooms, setRooms] = useState([]);

  return (
    <RoomContext.Provider value={{ rooms, setRooms }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRooms() {
  return useContext(RoomContext);
}
