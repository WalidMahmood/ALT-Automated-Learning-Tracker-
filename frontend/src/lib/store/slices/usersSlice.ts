import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { User } from '@/lib/types'
import api from '@/lib/api'

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

// Async Thunks
export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/users/profile/list_all/')
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch users')
    }
  }
)

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    selectUser: (state, action: PayloadAction<User | null>) => {
      state.selectedUser = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isLoading = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.users = action.payload
        state.isLoading = false
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
  }
})

export const {
  setLoading,
  selectUser,
  setError,
} = usersSlice.actions

export default usersSlice.reducer
