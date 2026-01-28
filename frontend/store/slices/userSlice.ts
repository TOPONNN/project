import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface UserState {
  id: string | null;
  name: string | null;
  email: string | null;
  profileImage: string | null;
  token: string | null;
  isAuthenticated: boolean;
}

const initialState: UserState = {
  id: null,
  name: null,
  email: null,
  profileImage: null,
  token: null,
  isAuthenticated: false,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<{ id: string; name: string; email: string; profileImage?: string; token: string }>) => {
      state.id = action.payload.id;
      state.name = action.payload.name;
      state.email = action.payload.email;
      state.profileImage = action.payload.profileImage || null;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    },
    updateProfile: (state, action: PayloadAction<{ name?: string; profileImage?: string }>) => {
      if (action.payload.name) state.name = action.payload.name;
      if (action.payload.profileImage !== undefined) state.profileImage = action.payload.profileImage;
    },
    logout: () => initialState,
  },
});

export const { setUser, updateProfile, logout } = userSlice.actions;
export default userSlice.reducer;
