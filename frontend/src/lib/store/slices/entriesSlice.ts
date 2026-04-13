import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Entry, EntryStatus } from '@/lib/types'
import api from '@/lib/api'
import { fetchTopics } from './topicsSlice'

export interface UserProject {
  id: number
  name: string
  description: string | null
  entry_count: number
  latest_date: string
  is_completed: boolean
  assigned_users?: { id: number; email: string; full_name: string | null }[]
  key_modules?: string[]
  features?: any[]
  module_status?: { module: string; status: 'untouched' | 'in_progress' | 'completed'; entry_count: number; total_hours: number; users: string[] }[]
  start_date?: string | null
  end_date?: string | null
}

export interface DashboardStats {
  counts: {
    total: number
    approved: number
    flagged: number
    needsReview: number
    processing: number
    error: number
    totalHours: number
    totalLearners: number
    pendingLeaves: number
  }
  avgConfidence: number
  weeklyActivity: { date: string; label: string; approved: number; pending: number; flagged: number }[]
  topTopics: { name: string; hours: number; entries: number }[]
}

export interface TopicSummaryItem {
  id: number
  name: string
  created_at: string
  entries: number
  hours: number
  flagged: number
  userCount: number
}

export interface TopicSummaryResponse {
  count: number
  page: number
  page_size: number
  results: TopicSummaryItem[]
}

export interface TopicSummaryParams {
  page?: number
  page_size?: number
  search?: string
  sort?: string
  order?: 'asc' | 'desc'
  flagged?: 'all' | 'has_flagged' | 'no_flagged'
  min_entries?: number
}

interface EntriesState {
  entries: Entry[]
  selectedEntry: Entry | null
  userProjects: UserProject[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null
  dashboardStats: DashboardStats | null
  dashboardStatsLoading: boolean
  topicSummary: TopicSummaryResponse | null
  topicSummaryLoading: boolean
  filters: {
    status: EntryStatus | 'all'
    dateRange: { start: string; end: string } | null
    userId: number | null
    topic: number | null
  }
}

const initialState: EntriesState = {
  entries: [],
  selectedEntry: null,
  userProjects: [],
  isLoading: false,
  error: null,
  lastFetched: null,
  dashboardStats: null,
  dashboardStatsLoading: false,
  topicSummary: null,
  topicSummaryLoading: false,
  filters: {
    status: 'all',
    dateRange: null,
    userId: null,
    topic: null,
  },
}

// Async Thunks
export const fetchEntries = createAsyncThunk(
  'entries/fetchEntries',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/entries/', { params })
      // Handle both paginated and non-paginated responses
      const data = Array.isArray(response.data) ? response.data : (response.data.results || [])
      return data
    } catch (error: any) {
      console.error('fetchEntries error:', error)
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch entries')
    }
  }
)

export const fetchDashboardStats = createAsyncThunk(
  'entries/fetchDashboardStats',
  async (force: boolean = false, { rejectWithValue }) => {
    try {
      const response = await api.get('/entries/dashboard_stats/')
      return response.data as DashboardStats
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch dashboard stats')
    }
  },
  {
    condition: (force, { getState }) => {
      const { entries } = getState() as { entries: { dashboardStatsLoading: boolean } }
      return !entries.dashboardStatsLoading
    },
  }
)

export const createEntry = createAsyncThunk(
  'entries/createEntry',
  async (data: Partial<Entry>, thunkAPI) => {
    try {
      const response = await api.post('/entries/', data)
      const newEntry = response.data

      // Refetch topics to update the hierarchy mastery across the app
      await thunkAPI.dispatch(fetchTopics())

      return newEntry
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data || 'Failed to create entry')
    }
  }
)

export const updateEntryThunk = createAsyncThunk(
  'entries/updateEntry',
  async ({ id, data }: { id: number; data: Partial<Entry> }, thunkAPI) => {
    try {
      const response = await api.put(`/entries/${id}/`, data)
      const updatedEntry = response.data

      // Refetch topics to update the hierarchy mastery across the app
      await thunkAPI.dispatch(fetchTopics())

      return updatedEntry
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data || 'Failed to update entry')
    }
  }
)

export const deleteEntryThunk = createAsyncThunk(
  'entries/deleteEntry',
  async (id: number, thunkAPI) => {
    try {
      await api.delete(`/entries/${id}/`)

      // On delete, refetch topics to handle hierarchy masteries cascading
      await thunkAPI.dispatch(fetchTopics())

      return id
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data || 'Failed to delete entry')
    }
  }
)

export const overrideEntry = createAsyncThunk(
  'entries/override',
  async ({ entryId, status, reason, comment }: { entryId: number; status: string; reason: string; comment: string }, thunkAPI) => {
    try {
      const response = await api.post(`/entries/${entryId}/override/`, { status, reason, comment })
      return response.data
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data || 'Failed to override entry')
    }
  }
)

export const fetchUserProjects = createAsyncThunk(
  'entries/fetchUserProjects',
  async (_, thunkAPI) => {
    try {
      const response = await api.get('/entries/user_projects/')
      return response.data as UserProject[]
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data || 'Failed to fetch projects')
    }
  }
)

export const fetchTopicSummary = createAsyncThunk(
  'entries/fetchTopicSummary',
  async (params: TopicSummaryParams = {}, { rejectWithValue }) => {
    try {
      // Filter out undefined values to avoid sending them as query params
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined)
      )
      const response = await api.get('/entries/topic_summary/', { params: cleanParams })
      return response.data as TopicSummaryResponse
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch topic summary')
    }
  }
)

const entriesSlice = createSlice({
  name: 'entries',
  initialState,
  reducers: {
    selectEntry: (state, action: PayloadAction<Entry | null>) => {
      state.selectedEntry = action.payload
    },
    setFilters: (
      state,
      action: PayloadAction<Partial<EntriesState['filters']>>
    ) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearFilters: (state) => {
      state.filters = initialState.filters
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isLoading = false
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Entries
      .addCase(fetchEntries.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchEntries.fulfilled, (state, action) => {
        state.entries = action.payload
        state.isLoading = false
        state.lastFetched = Date.now()
      })
      .addCase(fetchEntries.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Create Entry
      .addCase(createEntry.fulfilled, (state, action) => {
        state.entries.unshift(action.payload)
        // Note: We don't dispatch here directly but could. 
        // However, the component already has the result.
        // To be safe and cross-slice, we'll rely on the component or a middleware.
        // Actually, with Redux Template, we can't dispatch from extraReducers easily.
        // Let's use thunk response handling in the component or update thunk.
      })
      // Update Entry
      .addCase(updateEntryThunk.fulfilled, (state, action) => {
        const index = state.entries.findIndex((e) => e.id === action.payload.id)
        if (index !== -1) {
          state.entries[index] = action.payload
        }
        if (state.selectedEntry?.id === action.payload.id) {
          state.selectedEntry = action.payload
        }
      })
      // Delete Entry
      .addCase(deleteEntryThunk.fulfilled, (state, action) => {
        state.entries = state.entries.filter((e) => e.id !== action.payload)
        if (state.selectedEntry?.id === action.payload) {
          state.selectedEntry = null
        }
      })
      // Override Entry
      .addCase(overrideEntry.pending, (state) => {
        state.isLoading = true
      })
      .addCase(overrideEntry.fulfilled, (state, action) => {
        const index = state.entries.findIndex((e) => e.id === action.payload.id)
        if (index !== -1) {
          state.entries[index] = action.payload
        }
        if (state.selectedEntry?.id === action.payload.id) {
          state.selectedEntry = action.payload
        }
        state.isLoading = false
      })
      .addCase(overrideEntry.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Fetch User Projects
      .addCase(fetchUserProjects.fulfilled, (state, action) => {
        state.userProjects = action.payload
      })
      // Dashboard Stats
      .addCase(fetchDashboardStats.pending, (state) => {
        state.dashboardStatsLoading = true
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.dashboardStats = action.payload
        state.dashboardStatsLoading = false
      })
      .addCase(fetchDashboardStats.rejected, (state) => {
        state.dashboardStatsLoading = false
      })
      // Topic Summary
      .addCase(fetchTopicSummary.pending, (state) => {
        state.topicSummaryLoading = true
      })
      .addCase(fetchTopicSummary.fulfilled, (state, action) => {
        state.topicSummary = action.payload
        state.topicSummaryLoading = false
      })
      .addCase(fetchTopicSummary.rejected, (state) => {
        state.topicSummaryLoading = false
      })
  },
})

export const {
  selectEntry,
  setFilters,
  clearFilters,
  setError,
} = entriesSlice.actions

export default entriesSlice.reducer
