import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import AddIcon from '@mui/icons-material/Add'
import { StatusBadge } from './RailxPrimitives'

const API = '/api'

const STAGES = [
  'LOAD_CONFIG',
  'RESTORE_SESSION',
  'VALIDATE_SESSION',
  'PRELOAD_MASTER_DATA',
  'PREPARE_JOURNEY',
  'SEARCH',
  'FILTER',
  'SELECT_TRAIN',
  'VERIFY_AVAILABILITY',
  'LOAD_PASSENGERS',
  'FILL_PASSENGERS',
  'VALIDATE_BOOKING',
  'SUBMIT',
  'VERIFY_TRANSACTION',
  'VERIFY_BOOKING',
  'SUCCESS',
]

export default function AutomationDialog({ open, activeJobs, onClose, onAddJourney }) {
  const [jobsData, setJobsData] = useState([])
  const pollRef = useRef(null)
  const logsEndRef = useRef(null)

  useEffect(() => {
    if (!open || !activeJobs || activeJobs.length === 0) return undefined

    let cancelled = false
    let timer = null

    const poll = async () => {
      try {
        const results = await Promise.allSettled(
          activeJobs.map(id =>
            fetch(API + '/jobs/' + id, { cache: 'no-store' }).then(res => {
              if (!res.ok) throw new Error('Job status unavailable')
              return res.json()
            })
          )
        )

        if (cancelled) return

        const fulfilled = results
          .filter(result => result.status === 'fulfilled')
          .map(result => result.value)

        if (fulfilled.length > 0) {
          setJobsData(fulfilled)
          const allDone = fulfilled.every(job => job.status === 'COMPLETED' || job.status === 'FAILED')
          if (allDone) return
        }
      } catch {
        // Ignore transient polling errors.
      }

      if (!cancelled) timer = window.setTimeout(poll, 1200)
    }

    poll()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      pollRef.current = null
    }
  }, [activeJobs, open])

  const activeJob =
    jobsData.find(job => job.status === 'RUNNING') ||
    jobsData.find(job => job.status === 'STARTING') ||
    jobsData[jobsData.length - 1]

  const activeIndex = jobsData.findIndex(job => job.id === activeJob?.id)

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' })
  }, [activeJob?.progressEvents?.length])

  if (!open) return null

  const currentStageIndex = activeJob ? STAGES.indexOf(activeJob.currentState) : -1
  const pnrEvent = activeJob ? (activeJob.progressEvents || []).find(event => event.pnr) : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      PaperProps={{ className: 'railx-modal', sx: { m: { xs: 1, sm: 2 }, width: 'calc(100% - 16px)', maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          {activeJob?.status === 'RUNNING' || activeJob?.status === 'STARTING'
            ? <CircularProgress size={18} thickness={4} />
          {activeJob?.status === 'STARTING'
            ? 'Waiting for local browser'
            : activeJob?.status === 'RUNNING'
              ? 'Automation running'
              : activeJob?.status === 'COMPLETED'
                ? 'Automation completed'
                : 'Automation failed'}
              ? <CheckCircleIcon color="success" />
              : <ErrorIcon color="error" />}
          <Box minWidth={0}>
            <Typography fontWeight={800}>
              {activeJob?.status === 'RUNNING'
                ? 'Automation running'
                : activeJob?.status === 'COMPLETED'
                  ? 'Automation completed'
                  : 'Automation failed'}
            </Typography>
            {activeJob && <Typography variant="caption" color="text.secondary">{activeJob.request?.source} → {activeJob.request?.destination}</Typography>}
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 0.5, pb: 1 }}>
        {activeJob && (
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.4 }}>
            <Typography variant="caption" color="text.secondary">Journey {activeIndex + 1} / {jobsData.length}</Typography>
            <StatusBadge status={activeJob.status} compact />
          </Stack>
        )}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.55, mb: 1.6 }}>
          {STAGES.map((label, idx) => {
            const isCompleted = currentStageIndex > idx || activeJob?.status === 'COMPLETED'
            const isActive = currentStageIndex === idx && activeJob?.status !== 'COMPLETED' && activeJob?.status !== 'FAILED'
            const isFailed = currentStageIndex === idx && activeJob?.status === 'FAILED'

            return (
              <Typography
                key={label}
                variant="caption"
                sx={{
                  px: 0.75,
                  py: 0.32,
                  borderRadius: 99,
                  border: '1px solid',
                  borderColor: isFailed ? 'rgba(182,83,88,0.25)' : isCompleted || isActive ? 'rgba(19,141,135,0.20)' : 'divider',
                  color: isFailed ? 'error.main' : isCompleted || isActive ? 'primary.main' : 'text.disabled',
                  background: isFailed ? 'rgba(182,83,88,0.06)' : isCompleted || isActive ? 'rgba(19,141,135,0.05)' : 'rgba(255,255,255,0.34)',
                  fontWeight: isActive ? 800 : 650,
                }}
              >
                {isCompleted ? '✓ ' : isActive ? '• ' : isFailed ? '× ' : ''}{label.replace(/_/g, ' ')}
              </Typography>
            )
          })}
        </Box>

        {activeJob?.status === 'COMPLETED' && (
          <Box sx={{ mb: 1.5, p: 1.25, borderRadius: 12, background: 'rgba(39,135,110,0.07)', border: '1px solid rgba(39,135,110,0.18)' }}>
            <Typography variant="subtitle2" color="success.dark">Booking confirmed</Typography>
            {pnrEvent && <Typography variant="body2" sx={{ mt: 0.3 }}>PNR: <strong>{pnrEvent.pnr}</strong></Typography>}
          </Box>
        )}

        {activeJob?.status === 'FAILED' && (
          <Box sx={{ mb: 1.5, p: 1.25, borderRadius: 12, background: 'rgba(182,83,88,0.06)', border: '1px solid rgba(182,83,88,0.18)' }}>
            <Typography variant="subtitle2" color="error.dark">Automation failed</Typography>
            <Typography variant="body2" sx={{ mt: 0.3 }}>Stage: {activeJob.currentState}</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.3, overflowWrap: 'anywhere' }}>Error: {activeJob.errorInformation}</Typography>
          </Box>
        )}

        <Typography className="railx-kicker" sx={{ mb: 0.6 }}>Live log</Typography>
        <Paper className="railx-modal-log" elevation={0}>
          {(activeJob?.progressEvents || []).map((event, index) => (
            <Box key={index} sx={{ display: 'flex', gap: 1, py: 0.2, minWidth: 0 }}>
              <Box sx={{ color: '#9aa8b4', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}
              </Box>
              <Box sx={{ overflowWrap: 'anywhere' }}>{event.message || event.jobStatus || event.state}</Box>
            </Box>
          ))}
          <div ref={logsEndRef} />
        </Paper>

        {jobsData.length > 1 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography className="railx-kicker" sx={{ mb: 0.7 }}>Queue</Typography>
            <Stack spacing={0.4}>
              {jobsData.map((job, index) => (
                <Stack key={job.id} direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                  <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
                    {index + 1}. {job.request?.source} → {job.request?.destination}
                  </Typography>
                  <StatusBadge status={job.status} compact />
                </Stack>
              ))}
            </Stack>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2, pt: 1, gap: 0.75 }}>
        <Button onClick={onAddJourney} startIcon={<AddIcon />} variant="outlined" size="small">Plan another</Button>
        <Button onClick={onClose} variant="contained" color="primary" size="small">Close</Button>
      </DialogActions>
    </Dialog>
  )
}
