import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import entriesReducer from './slices/entriesSlice'
import topicsReducer from './slices/topicsSlice'
import usersReducer from './slices/usersSlice'
import trainingPlansReducer from './slices/trainingPlansSlice'
import leaveRequestsReducer from './slices/leaveRequestsSlice'
import projectsReducer from './slices/projectsSlice'
import uiReducer from './slices/uiSlice'
import lndDashboardReducer from './slices/lndDashboardSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    entries: entriesReducer,
    topics: topicsReducer,
    users: usersReducer,
    trainingPlans: trainingPlansReducer,
    leaveRequests: leaveRequestsReducer,
    projects: projectsReducer,
    ui: uiReducer,
    // LND Integration
    lndDashboard: lndDashboardReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
