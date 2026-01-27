import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { CalendarView } from '@/lib/types'

import { formatDateToISO } from '@/lib/utils'

interface UIState {
  theme: 'light' | 'dark'
  sidebarOpen: boolean
  calendarView: CalendarView
  selectedDate: string
  entryModalOpen: boolean
  leaveModalOpen: boolean
  overrideModalOpen: boolean
  isLoading: boolean
  toast: {
    message: string
    type: 'success' | 'error' | 'info'
    visible: boolean
  }
}

const initialState: UIState = {
  theme: 'light',
  sidebarOpen: true,
  calendarView: 'month',
  selectedDate: formatDateToISO(new Date()),
  entryModalOpen: false,
  leaveModalOpen: false,
  overrideModalOpen: false,
  isLoading: false,
  toast: {
    message: '',
    type: 'info',
    visible: false,
  },
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload
    },
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light'
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen
    },
    setCalendarView: (state, action: PayloadAction<CalendarView>) => {
      state.calendarView = action.payload
    },
    setSelectedDate: (state, action: PayloadAction<string>) => {
      state.selectedDate = action.payload
    },
    setEntryModalOpen: (state, action: PayloadAction<boolean>) => {
      state.entryModalOpen = action.payload
    },
    setLeaveModalOpen: (state, action: PayloadAction<boolean>) => {
      state.leaveModalOpen = action.payload
    },
    setOverrideModalOpen: (state, action: PayloadAction<boolean>) => {
      state.overrideModalOpen = action.payload
    },
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    showToast: (
      state,
      action: PayloadAction<{
        message: string
        type: 'success' | 'error' | 'info'
      }>
    ) => {
      state.toast = {
        message: action.payload.message,
        type: action.payload.type,
        visible: true,
      }
    },
    hideToast: (state) => {
      state.toast.visible = false
    },
  },
})

export const {
  setTheme,
  toggleTheme,
  setSidebarOpen,
  toggleSidebar,
  setCalendarView,
  setSelectedDate,
  setEntryModalOpen,
  setLeaveModalOpen,
  setOverrideModalOpen,
  setIsLoading,
  showToast,
  hideToast,
} = uiSlice.actions

export default uiSlice.reducer
