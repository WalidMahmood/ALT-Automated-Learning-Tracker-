import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Topic } from '@/lib/types'
import api from '@/lib/api'
import { fetchTrainingPlans } from './trainingPlansSlice'

interface TopicsState {
  topics: Topic[]
  topicsTree: Topic[]
  selectedTopic: Topic | null
  isLoading: boolean
  error: string | null
}

// Build hierarchical tree from flat topics list
function buildTopicsTree(topics: Topic[]): Topic[] {
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
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/topics/')
      // Handle pagination results
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch topics')
    }
  }
)

export const deleteTopicThunk = createAsyncThunk(
  'topics/deleteTopic',
  async (id: number, thunkAPI) => {
    try {
      await api.delete(`/topics/${id}/`)
      // Refresh training plans to update hours if this topic was included
      thunkAPI.dispatch(fetchTrainingPlans())
      return id
    } catch (error: any) {
      return thunkAPI.rejectWithValue(error.response?.data?.message || 'Failed to delete topic')
    }
  }
)

const initialState: TopicsState = {
  topics: [],
  topicsTree: [],
  selectedTopic: null,
  isLoading: false,
  error: null,
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
      state.topicsTree = buildTopicsTree(action.payload)
      state.isLoading = false
    },
    addTopic: (state, action: PayloadAction<Topic>) => {
      state.topics.push(action.payload)
      state.topicsTree = buildTopicsTree(state.topics)
    },
    updateTopic: (state, action: PayloadAction<Topic>) => {
      const index = state.topics.findIndex((t) => t.id === action.payload.id)
      if (index !== -1) {
        state.topics[index] = action.payload
        state.topicsTree = buildTopicsTree(state.topics)
      }
    },
    updateTopicMastery: (state, action: PayloadAction<{ id: number; mastery: Topic['mastery'] }>) => {
      const index = state.topics.findIndex((t) => t.id === action.payload.id)
      if (index !== -1) {
        state.topics[index] = {
          ...state.topics[index],
          mastery: action.payload.mastery
        }
        state.topicsTree = buildTopicsTree(state.topics)
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
        state.topicsTree = buildTopicsTree(action.payload)
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
