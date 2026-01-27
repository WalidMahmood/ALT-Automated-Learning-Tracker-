import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { User } from '@/lib/types'

interface UsersState {
  users: User[]
  selectedUser: User | null
  isLoading: boolean
  error: string | null
}

const initialState: UsersState = {
  users: [],
  selectedUser: null,
  isLoading: false,
  error: null,
}

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setUsers: (state, action: PayloadAction<User[]>) => {
      state.users = action.payload
      state.isLoading = false
    },
    addUser: (state, action: PayloadAction<User>) => {
      state.users.push(action.payload)
    },
    updateUser: (state, action: PayloadAction<User>) => {
      const index = state.users.findIndex((u) => u.id === action.payload.id)
      if (index !== -1) {
        state.users[index] = action.payload
      }
    },
    deactivateUser: (state, action: PayloadAction<number>) => {
      const user = state.users.find((u) => u.id === action.payload)
      if (user) {
        user.is_active = false
      }
    },
    selectUser: (state, action: PayloadAction<User | null>) => {
      state.selectedUser = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const {
  setLoading,
  setUsers,
  addUser,
  updateUser,
  deactivateUser,
  selectUser,
  setError,
} = usersSlice.actions

export default usersSlice.reducer
