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
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch users')
    }
  }
)

export const createUserThunk = createAsyncThunk(
  'users/createUser',
  async (data: any, { rejectWithValue }) => {
    try {
      const response = await api.post('/users/', data)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to create user')
    }
  }
)

export const updateUserThunk = createAsyncThunk(
  'users/updateUser',
  async ({ id, data }: { id: number; data: any }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/users/${id}/`, data)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to update user')
    }
  }
)

export const deleteUserThunk = createAsyncThunk(
  'users/deleteUser',
  async (id: number, { rejectWithValue }) => {
    try {
      await api.delete(`/users/${id}/`)
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to delete user')
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
      // Create User
      .addCase(createUserThunk.fulfilled, (state, action) => {
        state.users.unshift(action.payload)
      })
      // Update User
      .addCase(updateUserThunk.fulfilled, (state, action) => {
        const index = state.users.findIndex(u => u.id === action.payload.id)
        if (index !== -1) {
          state.users[index] = action.payload
        }
      })
      // Delete User
      .addCase(deleteUserThunk.fulfilled, (state, action) => {
        state.users = state.users.filter(u => u.id !== action.payload)
      })
  }
})

export const {
  setLoading,
  selectUser,
  setError,
} = usersSlice.actions

export default usersSlice.reducer
