import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { LeaveRequest, LeaveStatus } from '@/lib/types'

interface LeaveRequestsState {
  requests: LeaveRequest[]
  selectedRequest: LeaveRequest | null
  isLoading: boolean
  error: string | null
}

import { mockLeaveRequests } from '@/lib/mock-data'

const initialState: LeaveRequestsState = {
  requests: mockLeaveRequests,
  selectedRequest: null,
  isLoading: false,
  error: null,
}

const leaveRequestsSlice = createSlice({
  name: 'leaveRequests',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setRequests: (state, action: PayloadAction<LeaveRequest[]>) => {
      state.requests = action.payload
      state.isLoading = false
    },
    addRequest: (state, action: PayloadAction<LeaveRequest>) => {
      state.requests.push(action.payload)
    },
    updateRequestStatus: (
      state,
      action: PayloadAction<{
        requestId: number
        status: LeaveStatus
        adminId: number
        comment?: string
      }>
    ) => {
      const request = state.requests.find(
        (r) => r.id === action.payload.requestId
      )
      if (request) {
        request.status = action.payload.status
        request.admin_id = action.payload.adminId
        request.admin_comment = action.payload.comment || null
        request.reviewed_at = new Date().toISOString()
      }
    },
    cancelRequest: (state, action: PayloadAction<number>) => {
      const request = state.requests.find((r) => r.id === action.payload)
      if (request && request.status === 'pending') {
        request.status = 'cancelled'
      }
    },
    deleteRequest: (state, action: PayloadAction<number>) => {
      state.requests = state.requests.filter((r) => r.id !== action.payload)
    },
    selectRequest: (state, action: PayloadAction<LeaveRequest | null>) => {
      state.selectedRequest = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const {
  setLoading,
  setRequests,
  addRequest,
  updateRequestStatus,
  cancelRequest,
  deleteRequest,
  selectRequest,
  setError,
} = leaveRequestsSlice.actions

export default leaveRequestsSlice.reducer
