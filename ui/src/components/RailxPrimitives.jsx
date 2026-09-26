import React from 'react'
import { Box, Button, Chip, Paper } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import SearchIcon from '@mui/icons-material/Search'
import ScheduleIcon from '@mui/icons-material/Schedule'

const STATUS_META = {
  READY: { icon: CheckCircleOutlineIcon, tone: 'success' },
  AVAILABLE: { icon: CheckCircleOutlineIcon, tone: 'success' },
  CONFIRMED: { icon: CheckCircleOutlineIcon, tone: 'success' },
  SEARCHING: { icon: SearchIcon, tone: 'info' },
  BOOKING: { icon: AutorenewIcon, tone: 'info' },
  PAYMENT: { icon: ScheduleIcon, tone: 'warning' },
  RETRYING: { icon: AutorenewIcon, tone: 'warning' },
  FAILED: { icon: ErrorOutlineIcon, tone: 'danger' },
  CANCELLED: { icon: ErrorOutlineIcon, tone: 'muted' },
  TIMEOUT: { icon: ErrorOutlineIcon, tone: 'danger' },
  RUNNING: { icon: AutorenewIcon, tone: 'info' },
  STARTING: { icon: ScheduleIcon, tone: 'info' },
}

export function GlassPanel({ children, className = '', ...props }) {
  return <Paper className={'railx-glass ' + className} {...props}>{children}</Paper>
}

export function Surface({ children, className = '', ...props }) {
  return <Paper className={'railx-surface ' + className} {...props}>{children}</Paper>
}

export function StatusBadge({ status = 'READY', compact = false }) {
  const normalized = String(status || 'READY').toUpperCase()
  const meta = STATUS_META[normalized] || STATUS_META.READY
  const Icon = meta.icon

  return (
    <Chip
      className={'railx-status railx-status-' + meta.tone}
      icon={<Icon aria-hidden="true" />}
      label={normalized.replace(/_/g, ' ')}
      size={compact ? 'small' : 'medium'}
      variant="outlined"
      sx={{ fontWeight: 750 }}
    />
  )
}

export function NeoButton({ children, className = '', ...props }) {
  return <Button className={'railx-neo-button ' + className} {...props}>{children}</Button>
}

export function FieldLabel({ children }) {
  return <Box component="div" className="railx-field-label">{children}</Box>
}
