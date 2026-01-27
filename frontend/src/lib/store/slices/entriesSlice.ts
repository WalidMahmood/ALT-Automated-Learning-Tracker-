import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Entry, EntryStatus, AIDecision } from '@/lib/types'

interface EntriesState {
  entries: Entry[]
  selectedEntry: Entry | null
  isLoading: boolean
  error: string | null
  filters: {
    status: EntryStatus | 'all'
    dateRange: { start: string; end: string } | null
    userId: number | null
    topicId: number | null
  }
}

const initialState: EntriesState = {
  entries: [],
  selectedEntry: null,
  isLoading: false,
  error: null,
  filters: {
    status: 'all',
    dateRange: null,
    userId: null,
    topicId: null,
  },
}

const entriesSlice = createSlice({
  name: 'entries',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setEntries: (state, action: PayloadAction<Entry[]>) => {
      state.entries = action.payload
      state.isLoading = false
    },
    addEntry: (state, action: PayloadAction<Entry>) => {
      state.entries.unshift(action.payload)
    },
    updateEntry: (state, action: PayloadAction<Entry>) => {
      const index = state.entries.findIndex((e) => e.id === action.payload.id)
      if (index !== -1) {
        state.entries[index] = action.payload
      }
      if (state.selectedEntry?.id === action.payload.id) {
        state.selectedEntry = action.payload
      }
    },
    deleteEntry: (state, action: PayloadAction<number>) => {
      state.entries = state.entries.filter((e) => e.id !== action.payload)
      if (state.selectedEntry?.id === action.payload) {
        state.selectedEntry = null
      }
    },
    selectEntry: (state, action: PayloadAction<Entry | null>) => {
      state.selectedEntry = action.payload
    },
    setAIAnalysis: (
      state,
      action: PayloadAction<{
        entryId: number
        decision: AIDecision
        confidence: number
        reasoning: string
      }>
    ) => {
      const entry = state.entries.find((e) => e.id === action.payload.entryId)
      if (entry) {
        entry.ai_status = 'analyzed'
        entry.ai_decision = action.payload.decision
        entry.ai_confidence = action.payload.confidence
        entry.ai_reasoning = action.payload.reasoning
        entry.ai_analyzed_at = new Date().toISOString()
      }
    },
    overrideEntry: (
      state,
      action: PayloadAction<{
        entryId: number
        status: EntryStatus
        reason: string
        comment: string | null
        adminId: number
      }>
    ) => {
      const entry = state.entries.find((e) => e.id === action.payload.entryId)
      if (entry) {
        entry.status = action.payload.status
        entry.admin_override = true
        entry.override_reason = action.payload.reason
        entry.override_comment = action.payload.comment
        entry.admin_id = action.payload.adminId
        entry.override_at = new Date().toISOString()
      }
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
})

export const {
  setLoading,
  setEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  selectEntry,
  setAIAnalysis,
  overrideEntry,
  setFilters,
  clearFilters,
  setError,
} = entriesSlice.actions

export default entriesSlice.reducer
