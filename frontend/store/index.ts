import { configureStore } from "@reduxjs/toolkit";
import gameReducer from "./slices/gameSlice";
import roomReducer from "./slices/roomSlice";
import userReducer from "./slices/userSlice";

export const store = configureStore({
  reducer: {
    game: gameReducer,
    room: roomReducer,
    user: userReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
