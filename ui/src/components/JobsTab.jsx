import React, { useMemo, useState } from 'react'
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Stack, Typography
} from '@mui/material'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { toast } from 'react-toastify'

export default function JobsTab({ jobs, onSave }) {
  const [selectedJob, setSelectedJob] = useState(null)

  const readyCount = useMemo(
    () => jobs.filter(job => job.status === 'READY').length,
    [jobs],
  )

  const copyJob = async (job) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(job, null, 2))
      toast.success('Job JSON copied')
    } catch {
      toast.error('Clipboard access is unavailable')
    }
  }

  const clearAll = () => {
    onSave([])
    toast.success('Local jobs cleared')
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        flexWrap: 'wrap',
        gap: 1,
        mb: 2,
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" color="primary" sx={{ fontSize: { xs: '1rem', sm: '1.1rem' }, fontWeight: 'bold' }}>
            LOCAL AUTOMATION PLANS
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {readyCount} ready · stored in this browser
          </Typography>
        </Box>

        <Button
          startIcon={<DeleteSweepIcon />}
          color="error"
          variant="outlined"
          size="small"
          onClick={clearAll}
          disabled={jobs.length === 0}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Clear Jobs
        </Button>
      </Box>

      <Stack spacing={1.25}>
        {jobs.slice().reverse().map(job => (
          <Paper key={job.id} variant="outlined" sx={{ p: { xs: 1.25, sm: 1.5 }, minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight="bold" sx={{ overflowWrap: 'anywhere' }}>
                  {job.journey?.trainNumber} · {job.journey?.source} → {job.journey?.destination}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {job.journey?.travelDate} · {job.journey?.coach} · {job.journey?.quota}
                </Typography>
              </Box>
              <Chip label={job.status} color="info" size="small" />
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Account: {job.username}
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copyJob(job)} variant="outlined">
                Copy JSON
              </Button>
              <Button size="small" onClick={() => setSelectedJob(job)} variant="text">
                Details
              </Button>
            </Box>
          </Paper>
        ))}

        {jobs.length === 0 && (
          <Paper variant="outlined" sx={{ py: 4, px: 2, textAlign: 'center', color: 'text.secondary' }}>
            No local automation plans.
          </Paper>
        )}
      </Stack>

      <Dialog
        open={Boolean(selectedJob)}
        onClose={() => setSelectedJob(null)}
        maxWidth="md"
        fullWidth
        scroll="paper"
        PaperProps={{
          sx: {
            m: { xs: 1, sm: 2 },
            width: 'calc(100% - 16px)',
            maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' },
          },
        }}
      >
        {selectedJob && (
          <>
            <DialogTitle>Local Automation Plan</DialogTitle>
            <DialogContent sx={{ overflowX: 'hidden' }}>
              <Typography variant="caption" color="text.secondary">
                Prepared {new Date(selectedJob.createdAt).toLocaleString()}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Stack spacing={0.75}>
                <Typography variant="body2"><strong>Account:</strong> {selectedJob.username}</Typography>
                <Typography variant="body2"><strong>Route:</strong> {selectedJob.journey?.source} → {selectedJob.journey?.destination}</Typography>
                <Typography variant="body2"><strong>Train:</strong> {selectedJob.journey?.trainNumber}</Typography>
                <Typography variant="body2"><strong>Date:</strong> {selectedJob.journey?.travelDate}</Typography>
                <Typography variant="body2"><strong>Class:</strong> {selectedJob.journey?.coach}</Typography>
                <Typography variant="body2"><strong>Quota:</strong> {selectedJob.journey?.quota}</Typography>
                <Typography variant="body2"><strong>Passengers:</strong> {selectedJob.journey?.passengers?.length || 0}</Typography>
                <Typography variant="body2" color="text.secondary">
                  This MVP stores the plan locally; it does not report a server-side browser run.
                </Typography>
              </Stack>

              <Paper
                variant="outlined"
                sx={{
                  mt: 2,
                  p: 1.5,
                  bgcolor: '#1e1e1e',
                  color: '#d4d4d4',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  overflowX: 'auto',
                }}
              >
                {JSON.stringify(selectedJob, null, 2)}
              </Paper>
            </DialogContent>

            <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
              <Button onClick={() => setSelectedJob(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
}
