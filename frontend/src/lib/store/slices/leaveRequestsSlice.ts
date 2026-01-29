import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { LeaveRequest } from '@/lib/types'
import api from '@/lib/api'

interface LeaveRequestsState {
  requests: LeaveRequest[]
  selectedRequest: LeaveRequest | null
  isLoading: boolean
  error: string | null
}

const initialState: LeaveRequestsState = {
  requests: [],
  selectedRequest: null,
  isLoading: false,
  error: null,
}

// Async Thunks
export const fetchLeaveRequests = createAsyncThunk(
  'leaveRequests/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/leaves/requests/')
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch leaves')
    }
  }
)

export const createLeaveRequest = createAsyncThunk(
  'leaveRequests/create',
  async (data: { start_date: string; end_date: string }, { rejectWithValue }) => {
    try {
      const response = await api.post('/leaves/requests/', data)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to submit leave')
    }
  }
)

export const rejectLeaveRequest = createAsyncThunk(
  'leaveRequests/reject',
  async ({ id, admin_comment }: { id: number; admin_comment: string }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/leaves/requests/${id}/reject/`, { admin_comment })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to reject leave')
    }
  }
)

export const cancelLeaveRequest = createAsyncThunk(
  'leaveRequests/cancel',
  async (id: number, { rejectWithValue }) => {
    try {
      const response = await api.post(`/leaves/requests/${id}/cancel/`)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to cancel leave')
    }
  }
)

export const updateLeaveRequest = createAsyncThunk(
  'leaveRequests/update',
  async ({ id, data }: { id: number; data: Partial<LeaveRequest> }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/leaves/requests/${id}/`, data)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to update leave')
    }
  }
)

const leaveRequestsSlice = createSlice({
  name: 'leaveRequests',
  initialState,
  reducers: {
    selectRequest: (state, action: PayloadAction<LeaveRequest | null>) => {
      state.selectedRequest = action.payload
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch
      .addCase(fetchLeaveRequests.pending, (state) => {
        state.isLoading = true
      })
      .addCase(fetchLeaveRequests.fulfilled, (state, action) => {
        state.requests = action.payload
        state.isLoading = false
      })
      .addCase(fetchLeaveRequests.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Create
      .addCase(createLeaveRequest.fulfilled, (state, action) => {
        state.requests.unshift(action.payload)
      })
      // Reject
      .addCase(rejectLeaveRequest.fulfilled, (state, action) => {
        const index = state.requests.findIndex(r => r.id === action.payload.id)
        if (index !== -1) {
          state.requests[index] = action.payload
        }
      })
      // Cancel
      .addCase(cancelLeaveRequest.fulfilled, (state, action) => {
        const index = state.requests.findIndex(r => r.id === action.payload.id)
        if (index !== -1) {
          state.requests[index] = action.payload
        }
      })
      // Update
      .addCase(updateLeaveRequest.fulfilled, (state, action) => {
        const index = state.requests.findIndex(r => r.id === action.payload.id)
        if (index !== -1) {
          state.requests[index] = action.payload
        }
      })
  }
})

export const { selectRequest, clearError } = leaveRequestsSlice.actions
export default leaveRequestsSlice.reducer
