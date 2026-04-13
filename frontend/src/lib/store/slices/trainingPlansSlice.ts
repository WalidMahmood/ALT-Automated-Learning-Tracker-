import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { TrainingPlan, PlanAssignment, RoadmapTemplate } from '@/lib/types'
import api from '@/lib/api'

interface TrainingPlansState {
  plans: TrainingPlan[]
  selectedPlan: TrainingPlan | null
  userAssignments: PlanAssignment[]
  isLoading: boolean
  isImporting: boolean
  error: string | null
  lastFetched: number | null
}

const initialState: TrainingPlansState = {
  plans: [],
  selectedPlan: null,
  userAssignments: [],
  isLoading: false,
  isImporting: false,
  error: null,
  lastFetched: null,
}

// Async Thunks
export const fetchTrainingPlans = createAsyncThunk(
  'trainingPlans/fetchPlans',
  async (force: boolean = false, { rejectWithValue }) => {
    try {
      const response = await api.get('/training-plans/')
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch training plans')
    }
  },
  {
    condition: (force, { getState }) => {
      const { trainingPlans } = getState() as { trainingPlans: TrainingPlansState }
      if (trainingPlans.isLoading) return false
      if (!force && trainingPlans.lastFetched && Date.now() - trainingPlans.lastFetched < 30000) return false
      return true
    },
  }
)

export const fetchUserAssignments = createAsyncThunk(
  'trainingPlans/fetchUserAssignments',
  async (force: boolean = false, { rejectWithValue }) => {
    try {
      const response = await api.get('/training-plans/assignments/my_assignments/')
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch assignments')
    }
  },
  {
    condition: (force, { getState }) => {
      const { trainingPlans } = getState() as { trainingPlans: TrainingPlansState }
      // Allow parallel fetch with plans - don't block on isLoading
      // Only skip if we have fresh data and not forcing
      if (!force && trainingPlans.userAssignments.length > 0 && trainingPlans.lastFetched && Date.now() - trainingPlans.lastFetched < 30000) return false
      return true
    },
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

export const importTemplate = createAsyncThunk(
  'trainingPlans/importTemplate',
  async (template: RoadmapTemplate, { rejectWithValue }) => {
    try {
      const response = await api.post('/training-plans/import-template/', {
        template_id: template.id,
        template_data: {
          name: template.name,
          description: template.description,
          sections: template.sections,
        }
      })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to import template')
    }
  }
)

export const fetchPlanDetails = createAsyncThunk(
  'trainingPlans/fetchPlanDetails',
  async (planId: number, { rejectWithValue }) => {
    try {
      const response = await api.get(`/training-plans/${planId}/`)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch plan details')
    }
  }
)

export const fetchPlanProgress = createAsyncThunk(
  'trainingPlans/fetchPlanProgress',
  async (planId: number, { rejectWithValue }) => {
    try {
      const response = await api.get(`/training-plans/${planId}/progress/`)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch plan progress')
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
        state.lastFetched = Date.now()
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
      // Import Template
      .addCase(importTemplate.pending, (state) => {
        state.isImporting = true
        state.error = null
      })
      .addCase(importTemplate.fulfilled, (state, action) => {
        state.plans.unshift(action.payload)
        state.isImporting = false
      })
      .addCase(importTemplate.rejected, (state, action) => {
        state.isImporting = false
        state.error = action.payload as string
      })
      // Fetch Single Plan Details — merge to preserve list-API fields like topic_count
      .addCase(fetchPlanDetails.fulfilled, (state, action) => {
        const index = state.plans.findIndex(p => p.id === action.payload.id)
        if (index !== -1) {
          state.plans[index] = { ...state.plans[index], ...action.payload }
        } else {
          state.plans.push(action.payload)
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

