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
}

interface EntriesState {
  entries: Entry[]
  selectedEntry: Entry | null
  userProjects: UserProject[]
  isLoading: boolean
  error: string | null
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
      // If DRF returns results in 'results' key because of pagination
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch entries')
    }
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
  },
})

export const {
  selectEntry,
  setFilters,
  clearFilters,
  setError,
} = entriesSlice.actions

export default entriesSlice.reducer
