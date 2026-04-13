import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Topic } from '@/lib/types'
import api from '@/lib/api'
import { fetchTrainingPlans } from './trainingPlansSlice'

interface TopicsState {
  topics: Topic[]
  selectedTopic: Topic | null
  isLoading: boolean
  error: string | null
  lastFetched: number | null
}

// Build hierarchical tree from flat topics list
export function buildTopicsTree(topics: Topic[]): Topic[] {
  const topicMap = new Map<number, Topic>()
  const roots: Topic[] = []

  // First pass: create map of all topics
  topics.forEach((topic) => {
    topicMap.set(topic.id, { ...topic, children: [] })
  })

  // Second pass: build tree structure
  topicMap.forEach((topic) => {
    if (topic.parent_id === null) {
      roots.push(topic)
    } else {
      const parent = topicMap.get(topic.parent_id)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(topic)
      }
    }
  })

  return roots
}

// Async Thunks
export const fetchTopics = createAsyncThunk(
  'topics/fetchTopics',
  async (force: boolean | undefined, { rejectWithValue }) => {
    try {
      const response = await api.get('/topics/')
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch topics')
    }
  },
  {
    condition: (force, { getState }) => {
      const { topics } = getState() as { topics: TopicsState }
      // Block if already loading (prevents StrictMode double-fetch)
      if (topics.isLoading) return false
      // Skip if fetched recently (30s) unless forced
      if (!force && topics.lastFetched && Date.now() - topics.lastFetched < 30000) return false
      return true
    },
  }
)

export const deleteTopicThunk = createAsyncThunk(
  'topics/deleteTopic',
  async (id: number, thunkAPI) => {
    try {
      await api.delete(`/topics/${id}/`)
      // Refresh training plans to update hours if this topic was included
      thunkAPI.dispatch(fetchTrainingPlans(true))
      return id
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data?.message || 'Failed to delete topic')
    }
  }
)

const initialState: TopicsState = {
  topics: [],
  selectedTopic: null,
  isLoading: false,
  error: null,
  lastFetched: null,
}

const topicsSlice = createSlice({
  name: 'topics',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setTopics: (state, action: PayloadAction<Topic[]>) => {
      state.topics = action.payload
      state.isLoading = false
    },
    addTopic: (state, action: PayloadAction<Topic>) => {
      state.topics.push(action.payload)
    },
    updateTopic: (state, action: PayloadAction<Topic>) => {
      const index = state.topics.findIndex((t) => t.id === action.payload.id)
      if (index !== -1) {
        state.topics[index] = action.payload
      }
    },
    updateTopicMastery: (state, action: PayloadAction<{ id: number; mastery: Topic['mastery'] }>) => {
      const index = state.topics.findIndex((t) => t.id === action.payload.id)
      if (index !== -1) {
        state.topics[index] = {
          ...state.topics[index],
          mastery: action.payload.mastery
        }
      }
    },
    // deleteTopic reducer removed in favor of thunk
    selectTopic: (state, action: PayloadAction<Topic | null>) => {
      state.selectedTopic = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isLoading = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTopics.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchTopics.fulfilled, (state, action) => {
        state.topics = action.payload
        state.lastFetched = Date.now()
        state.isLoading = false
      })
      .addCase(fetchTopics.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
  }
})

export const {
  setLoading,
  setTopics,
  addTopic,
  updateTopic,
  updateTopicMastery,
  selectTopic,
  setError,
} = topicsSlice.actions

export default topicsSlice.reducer
