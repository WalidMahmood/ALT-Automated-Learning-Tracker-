import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { TrainingPlan, PlanAssignment } from '@/lib/types'
import api from '@/lib/api'

interface TrainingPlansState {
  plans: TrainingPlan[]
  selectedPlan: TrainingPlan | null
  userAssignments: PlanAssignment[]
  isLoading: boolean
  error: string | null
}

const initialState: TrainingPlansState = {
  plans: [],
  selectedPlan: null,
  userAssignments: [],
  isLoading: false,
  error: null,
}

// Async Thunks
export const fetchTrainingPlans = createAsyncThunk(
  'trainingPlans/fetchPlans',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/training-plans/')
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch training plans')
    }
  }
)

export const fetchUserAssignments = createAsyncThunk(
  'trainingPlans/fetchUserAssignments',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/training-plans/assignments/my_assignments/')
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch assignments')
    }
  }
)

export const assignPlanThunk = createAsyncThunk(
  'trainingPlans/assignPlan',
  async ({ planId, userIds }: { planId: number; userIds: number[] }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/training-plans/${planId}/assign/`, { user_ids: userIds })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to assign plan')
    }
  }
)

const trainingPlansSlice = createSlice({
  name: 'trainingPlans',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    selectPlan: (state, action: PayloadAction<TrainingPlan | null>) => {
      state.selectedPlan = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isLoading = false
    },
  },
  extraReducers: (builder) => {
    builder
      // Plans
      .addCase(fetchTrainingPlans.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchTrainingPlans.fulfilled, (state, action) => {
        state.plans = action.payload
        state.isLoading = false
      })
      .addCase(fetchTrainingPlans.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Assignments
      .addCase(fetchUserAssignments.pending, (state) => {
        state.isLoading = true
      })
      .addCase(fetchUserAssignments.fulfilled, (state, action) => {
        state.userAssignments = action.payload
        state.isLoading = false
      })
      .addCase(fetchUserAssignments.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Assign Plan
      .addCase(assignPlanThunk.fulfilled, (state, action) => {
        const updatedPlan = action.payload.plan
        if (updatedPlan) {
          const index = state.plans.findIndex(p => p.id === updatedPlan.id)
          if (index !== -1) {
            state.plans[index] = updatedPlan
          }
        }
      })
  }
})

export const {
  setLoading,
  selectPlan,
  setError,
} = trainingPlansSlice.actions

export default trainingPlansSlice.reducer
