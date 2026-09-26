import React, { useEffect, useRef, useState } from 'react'
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Stack, Typography
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import AddIcon from '@mui/icons-material/Add'

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

      if (!cancelled) {
        timer = window.setTimeout(poll, 1200)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [activeJobs, open])

  const activeJob =
    jobsData.find(job => job.status === 'RUNNING') ||
    jobsData.find(job => job.status === 'STARTING') ||
    jobsData[jobsData.length - 1]

  const activeIndex = jobsData.findIndex(job => job.id === activeJob?.id)

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeJob?.progressEvents?.length])

  if (!open) return null

  const currentStageIndex = activeJob ? STAGES.indexOf(activeJob.currentState) : -1
  const pnrEvent = activeJob
    ? (activeJob.progressEvents || []).find(event => event.pnr)
    : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      PaperProps={{
        className: 'railx-modal',
        sx: {
          m: { xs: 1, sm: 2 },
          width: 'calc(100% - 16px)',
          maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' },
          borderRadius: { xs: 1, sm: 2 },
        },
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 1.5,
        px: { xs: 2, sm: 3 },
      }}>
        {activeJob?.status === 'RUNNING' || activeJob?.status === 'STARTING'
          ? <CircularProgress size={20} thickness={5} />
          : activeJob?.status === 'COMPLETED'
            ? <CheckCircleIcon color="success" />
            : <ErrorIcon color="error" />}

        <Typography variant="subtitle1" fontWeight="bold">
          {activeJob?.status === 'RUNNING'
            ? 'Automation running'
            : activeJob?.status === 'COMPLETED'
              ? 'Automation completed'
              : 'Automation failed'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pb: 1, pt: 0, px: { xs: 2, sm: 3 }, overflowX: 'hidden' }}>
        {activeJob && (
          <Box sx={{ mb: 2, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Journey {activeIndex + 1} / {jobsData.length}
            </Typography>
            <Typography variant="body1" fontWeight="bold" sx={{ overflowWrap: 'anywhere' }}>
              {activeJob.request?.source} → {activeJob.request?.destination} · {activeJob.request?.trainNumber || 'AUTO-SELECT'}
            </Typography>
          </Box>
        )}

        <Box sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.75,
          mb: 2,
        }}>
          {STAGES.map((label, idx) => {
            const isCompleted = currentStageIndex > idx || activeJob?.status === 'COMPLETED'
            const isActive = currentStageIndex === idx &&
              activeJob?.status !== 'COMPLETED' &&
              activeJob?.status !== 'FAILED'
            const isFailed = currentStageIndex === idx && activeJob?.status === 'FAILED'

            let icon = '○'
            if (isCompleted) icon = '✓'
            if (isActive) icon = '●'
            if (isFailed) icon = '✕'

            return (
              <Typography
                key={label}
                variant="caption"
                sx={{
                  color: isFailed
                    ? 'error.main'
                    : (isCompleted || isActive)
                      ? 'text.primary'
                      : 'text.disabled',
                  fontWeight: isActive ? 'bold' : 'normal',
                  fontSize: { xs: '0.68rem', sm: '0.75rem' },
                }}
              >
                {icon} {label.replace('_', ' ')}
              </Typography>
            )
          })}
        </Box>

        {activeJob?.status === 'COMPLETED' && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: '#e8f5e9', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="success.dark">✓ BOOKING CONFIRMED</Typography>
            {pnrEvent && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                PNR: <strong>{pnrEvent.pnr}</strong>
              </Typography>
            )}
          </Box>
        )}

        {activeJob?.status === 'FAILED' && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: '#ffebee', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="error.dark">✕ AUTOMATION FAILED</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Stage: {activeJob.currentState}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, wordBreak: 'break-word' }}>
              Error: {activeJob.errorInformation}
            </Typography>
          </Box>
        )}

        <Typography variant="caption" fontWeight="bold" sx={{ display: 'block', mb: 0.5 }}>
          LIVE LOG
        </Typography>

        <Paper sx={{
          height: { xs: 190, sm: 240 },
          overflowY: 'auto',
          bgcolor: '#1e1e1e',
          color: '#dce8f6',
          p: { xs: 1, sm: 1.5 },
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '0.72rem',
          overflowWrap: 'anywhere',
        }}>
          {(activeJob?.progressEvents || []).map((event, index) => (
            <Box key={index} sx={{ display: 'flex', gap: 1, py: 0.2, minWidth: 0 }}>
              <Box sx={{ color: '#858585', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}
              </Box>
              <Box sx={{ color: '#ce9178', wordBreak: 'break-word', minWidth: 0 }}>
                {event.message || event.jobStatus || event.state}
              </Box>
            </Box>
          ))}
          <div ref={logsEndRef} />
        </Paper>

        {jobsData.length > 1 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
              QUEUE
            </Typography>
            <Stack spacing={0.5}>
              {jobsData.map((job, index) => (
                <Typography
                  key={job.id}
                  variant="caption"
                  sx={{
                    color: job.status === 'FAILED' ? 'error.main' : 'text.primary',
                    fontWeight: job.id === activeJob?.id ? 'bold' : 'normal',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {job.status === 'COMPLETED'
                    ? '✓'
                    : job.status === 'FAILED'
                      ? '✕'
                      : job.status === 'RUNNING'
                        ? '●'
                        : '○'}
                  &nbsp; Journey {index + 1}: {job.request?.source} → {job.request?.destination} — {job.status}
                </Typography>
              ))}
            </Stack>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{
        px: { xs: 2, sm: 3 },
        pb: 2,
        pt: 1,
        gap: 1,
        flexWrap: 'wrap',
      }}>
        <Button
          onClick={onAddJourney}
          startIcon={<AddIcon />}
          variant="outlined"
          size="small"
          sx={{ flex: { xs: 1, sm: 'none' } }}
        >
          PLAN ANOTHER
        </Button>

        <Button
          onClick={onClose}
          variant="contained"
          color="primary"
          size="small"
          sx={{ flex: { xs: 1, sm: 'none' } }}
        >
          CLOSE
        </Button>
      </DialogActions>
    </Dialog>
  )
}
