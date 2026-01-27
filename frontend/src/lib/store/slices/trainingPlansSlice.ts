import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { TrainingPlan, PlanAssignment } from '@/lib/types'

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

const trainingPlansSlice = createSlice({
  name: 'trainingPlans',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setPlans: (state, action: PayloadAction<TrainingPlan[]>) => {
      state.plans = action.payload
      state.isLoading = false
    },
    addPlan: (state, action: PayloadAction<TrainingPlan>) => {
      state.plans.push(action.payload)
    },
    updatePlan: (state, action: PayloadAction<TrainingPlan>) => {
      const index = state.plans.findIndex((p) => p.id === action.payload.id)
      if (index !== -1) {
        state.plans[index] = action.payload
      }
    },
    archivePlan: (state, action: PayloadAction<number>) => {
      const plan = state.plans.find((p) => p.id === action.payload)
      if (plan) {
        plan.is_archived = true
      }
    },
    unarchivePlan: (state, action: PayloadAction<number>) => {
      const plan = state.plans.find((p) => p.id === action.payload)
      if (plan) {
        plan.is_archived = false
      }
    },
    selectPlan: (state, action: PayloadAction<TrainingPlan | null>) => {
      state.selectedPlan = action.payload
    },
    setUserAssignments: (state, action: PayloadAction<PlanAssignment[]>) => {
      state.userAssignments = action.payload
    },
    addAssignment: (state, action: PayloadAction<PlanAssignment>) => {
      state.userAssignments.push(action.payload)
    },
    removeAssignment: (state, action: PayloadAction<number>) => {
      state.userAssignments = state.userAssignments.filter(
        (a) => a.id !== action.payload
      )
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const {
  setLoading,
  setPlans,
  addPlan,
  updatePlan,
  archivePlan,
  unarchivePlan,
  selectPlan,
  setUserAssignments,
  addAssignment,
  removeAssignment,
  setError,
} = trainingPlansSlice.actions

export default trainingPlansSlice.reducer
