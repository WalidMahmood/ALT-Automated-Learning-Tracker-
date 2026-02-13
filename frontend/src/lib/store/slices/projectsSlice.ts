import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Project, ProjectDetail } from '@/lib/types'
import api from '@/lib/api'

interface ProjectsState {
  projects: Project[]
  selectedProject: ProjectDetail | null
  isLoading: boolean
  error: string | null
}

const initialState: ProjectsState = {
  projects: [],
  selectedProject: null,
  isLoading: false,
  error: null,
}

// Async Thunks
export const fetchProjects = createAsyncThunk(
  'projects/fetchProjects',
  async (params: Record<string, any> = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/projects/', { params })
      return Array.isArray(response.data) ? response.data : response.data.results
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch projects')
    }
  }
)

export const fetchProjectDetail = createAsyncThunk(
  'projects/fetchProjectDetail',
  async (id: number, { rejectWithValue }) => {
    try {
      const response = await api.get(`/projects/${id}/`)
      return response.data as ProjectDetail
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch project')
    }
  }
)

export const createProject = createAsyncThunk(
  'projects/createProject',
  async (data: { name: string; description: string }, { rejectWithValue }) => {
    try {
      const response = await api.post('/projects/', data)
      return response.data as Project
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to create project')
    }
  }
)

export const updateProject = createAsyncThunk(
  'projects/updateProject',
  async ({ id, data }: { id: number; data: Partial<Project> }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/projects/${id}/`, data)
      return response.data as Project
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to update project')
    }
  }
)

export const deleteProject = createAsyncThunk(
  'projects/deleteProject',
  async (id: number, { rejectWithValue }) => {
    try {
      await api.delete(`/projects/${id}/`)
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to delete project')
    }
  }
)

export const toggleProjectComplete = createAsyncThunk(
  'projects/toggleComplete',
  async (id: number, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/projects/${id}/toggle_complete/`)
      return response.data as Project
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to toggle project')
    }
  }
)

export const fetchAllProjects = createAsyncThunk(
  'projects/fetchAllProjects',
  async (params: Record<string, any> = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/projects/all_projects/', { params })
      return response.data as Project[]
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch all projects')
    }
  }
)

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    clearSelectedProject: (state) => {
      state.selectedProject = null
    },
    setProjectError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Projects
      .addCase(fetchProjects.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.projects = action.payload
        state.isLoading = false
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Fetch All Projects (admin)
      .addCase(fetchAllProjects.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchAllProjects.fulfilled, (state, action) => {
        state.projects = action.payload
        state.isLoading = false
      })
      .addCase(fetchAllProjects.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Fetch Detail
      .addCase(fetchProjectDetail.pending, (state) => {
        state.isLoading = true
      })
      .addCase(fetchProjectDetail.fulfilled, (state, action) => {
        state.selectedProject = action.payload
        state.isLoading = false
      })
      .addCase(fetchProjectDetail.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // Create
      .addCase(createProject.fulfilled, (state, action) => {
        state.projects.unshift(action.payload)
      })
      // Update
      .addCase(updateProject.fulfilled, (state, action) => {
        const idx = state.projects.findIndex((p) => p.id === action.payload.id)
        if (idx !== -1) state.projects[idx] = action.payload
      })
      // Delete
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projects = state.projects.filter((p) => p.id !== action.payload)
        if (state.selectedProject?.id === action.payload) {
          state.selectedProject = null
        }
      })
      // Toggle Complete
      .addCase(toggleProjectComplete.fulfilled, (state, action) => {
        const idx = state.projects.findIndex((p) => p.id === action.payload.id)
        if (idx !== -1) state.projects[idx] = action.payload
        if (state.selectedProject?.id === action.payload.id) {
          state.selectedProject = { ...state.selectedProject, ...action.payload }
        }
      })
  },
})

export const { clearSelectedProject, setProjectError } = projectsSlice.actions
export default projectsSlice.reducer
