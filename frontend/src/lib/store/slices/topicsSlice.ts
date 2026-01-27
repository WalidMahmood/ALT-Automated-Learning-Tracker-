import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Topic } from '@/lib/types'

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
    deleteTopic: (state, action: PayloadAction<number>) => {
      state.topics = state.topics.filter((t) => t.id !== action.payload)
      state.topicsTree = buildTopicsTree(state.topics)
    },
    selectTopic: (state, action: PayloadAction<Topic | null>) => {
      state.selectedTopic = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const {
  setLoading,
  setTopics,
  addTopic,
  updateTopic,
  deleteTopic,
  selectTopic,
  setError,
} = topicsSlice.actions

export default topicsSlice.reducer
