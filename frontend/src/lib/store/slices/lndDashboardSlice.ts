/**
 * LND Dashboard Redux Slice
 * 
 * Manages state for the LND Dashboard page (stats, health status)
 * and the LND Courses listing.
 */
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { lndDashboardAPI, lndCoursesAPI } from '@/lib/lnd-api';
import { lndHealthAPI } from '@/lib/lnd-bridge-api';
import type { LNDDashboardStats, LNDCourse, LNDHealthStatus } from '@/lib/lnd-types';

interface LndDashboardState {
  stats: LNDDashboardStats | null;
  health: LNDHealthStatus | null;
  courses: LNDCourse[];
  selectedCourse: LNDCourse | null;
  loading: boolean;
  coursesLoading: boolean;
  error: string | null;
}

const initialState: LndDashboardState = {
  stats: null,
  health: null,
  courses: [],
  selectedCourse: null,
  loading: false,
  coursesLoading: false,
  error: null,
};

// ── Thunks ──────────────────────────────────────────────────────────

export const fetchLndDashboardStats = createAsyncThunk(
  'lndDashboard/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await lndDashboardAPI.getStats();
      return response.data;
    } catch (error: any) {
      const msg = error.response?.status === 503
        ? 'L&D service is offline. Please start the LND sidecar.'
        : error.response?.data?.detail || 'Failed to fetch L&D dashboard stats';
      return rejectWithValue(msg);
    }
  }
);

export const fetchLndHealth = createAsyncThunk(
  'lndDashboard/fetchHealth',
  async (_, { rejectWithValue }) => {
    try {
      const response = await lndHealthAPI.check();
      return response.data;
    } catch {
      return rejectWithValue('Health check failed');
    }
  }
);

export const fetchLndCourses = createAsyncThunk(
  'lndDashboard/fetchCourses',
  async (params: { status?: string; course_type?: string } | undefined, { rejectWithValue }) => {
    try {
      const response = await lndCoursesAPI.getAll(params);
      return response.data;
    } catch (error: any) {
      const msg = error.response?.status === 503
        ? 'L&D service is offline'
        : error.response?.data?.detail || 'Failed to fetch courses';
      return rejectWithValue(msg);
    }
  }
);

export const fetchLndCourseById = createAsyncThunk(
  'lndDashboard/fetchCourseById',
  async (id: number | string, { rejectWithValue }) => {
    try {
      const response = await lndCoursesAPI.getById(id);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Failed to fetch course');
    }
  }
);

// ── Slice ────────────────────────────────────────────────────────────

const lndDashboardSlice = createSlice({
  name: 'lndDashboard',
  initialState,
  reducers: {
    clearLndError: (state) => {
      state.error = null;
    },
    clearSelectedCourse: (state) => {
      state.selectedCourse = null;
    },
  },
  extraReducers: (builder) => {
    // Dashboard stats
    builder
      .addCase(fetchLndDashboardStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLndDashboardStats.fulfilled, (state, action: PayloadAction<LNDDashboardStats>) => {
        state.loading = false;
        state.stats = action.payload;
      })
      .addCase(fetchLndDashboardStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Health
    builder
      .addCase(fetchLndHealth.fulfilled, (state, action: PayloadAction<LNDHealthStatus>) => {
        state.health = action.payload;
      })
      .addCase(fetchLndHealth.rejected, (state) => {
        state.health = { lnd_sidecar: 'offline', proxy_status: 'error' };
      });

    // Courses
    builder
      .addCase(fetchLndCourses.pending, (state) => {
        state.coursesLoading = true;
      })
      .addCase(fetchLndCourses.fulfilled, (state, action: PayloadAction<LNDCourse[]>) => {
        state.coursesLoading = false;
        state.courses = action.payload;
      })
      .addCase(fetchLndCourses.rejected, (state, action) => {
        state.coursesLoading = false;
        state.error = action.payload as string;
      });

    // Single course
    builder
      .addCase(fetchLndCourseById.fulfilled, (state, action: PayloadAction<LNDCourse>) => {
        state.selectedCourse = action.payload;
      });
  },
});

export const { clearLndError, clearSelectedCourse } = lndDashboardSlice.actions;
export default lndDashboardSlice.reducer;
