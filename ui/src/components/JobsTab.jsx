import React, { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Typography, Stack } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined'
import TrainOutlinedIcon from '@mui/icons-material/TrainOutlined'
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined'
import { GlassPanel, StatusBadge } from './RailxPrimitives'

const API = '/api'

export default function JobsTab() {
  const [jobs, setJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)

  const fetchJobs = async () => {
    try {
      const res = await fetch(API + '/jobs')
      if (res.ok) setJobs(await res.json())
    } catch {
      // Ignore transient network errors.
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  const getPnr = job => (job.progressEvents || []).find(event => event.pnr)?.pnr || ''

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <GlassPanel className="railx-page-intro">
        <div className="railx-section-header" style={{ marginBottom: 0 }}>
          <Box minWidth={0}>
            <Typography className="railx-kicker">Jobs</Typography>
            <Typography component="h1" className="railx-section-title">Automation history</Typography>
            <Typography className="railx-section-copy">Recent execution records.</Typography>
          </Box>
          <Button startIcon={<RefreshIcon />} onClick={fetchJobs} variant="outlined" size="small">Refresh</Button>
        </div>
      </GlassPanel>

      <section className="railx-section" aria-label="Automation history">
        {jobs.length ? (
          <div>
            {jobs.slice().reverse().map(job => {
              const pnr = getPnr(job)
              return (
                <button
                  key={job.id}
                  type="button"
                  className="railx-job-row"
                  onClick={() => setSelectedJob(job)}
                  style={{ width: '100%', border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
                >
                  <div className="railx-job-grid">
                    <div minwidth="0">
                      <div className="railx-inline-data">
                        <span className="primary">
                          <RouteOutlinedIcon sx={{ fontSize: 14, verticalAlign: 'text-bottom', mr: 0.25 }} />
                          {job.request?.source} → {job.request?.destination}
                        </span>
                        <span className="railx-divider-dot">•</span>
                        <span>{new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="railx-divider-dot">•</span>
                        <span><TrainOutlinedIcon sx={{ fontSize: 14, verticalAlign: 'text-bottom', mr: 0.2 }} />{job.request?.trainNumber || 'AUTO'}</span>
                        <span className="railx-divider-dot">•</span>
                        <span>{job.request?.quota || 'GENERAL'}</span>
                        <span className="railx-divider-dot">•</span>
                        <span><ConfirmationNumberOutlinedIcon sx={{ fontSize: 14, verticalAlign: 'text-bottom', mr: 0.2 }} />{pnr || '—'}</span>
                      </div>
                    </div>
                    <div className="railx-row-status">
                      <StatusBadge status={job.status} compact />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="railx-empty-state">
            <Typography variant="body2" fontWeight={750}>No historical jobs</Typography>
            <Typography variant="caption">Completed and failed automation records will appear here.</Typography>
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(selectedJob)}
        onClose={() => setSelectedJob(null)}
        maxWidth="md"
        fullWidth
        scroll="paper"
        PaperProps={{ sx: { m: { xs: 1, sm: 2 }, width: 'calc(100% - 16px)', maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' } } }}
      >
        {selectedJob && (
          <>
            <DialogTitle sx={{ py: 1.5, px: { xs: 2, sm: 3 }, fontWeight: 800 }}>Job details</DialogTitle>
            <DialogContent sx={{ p: { xs: 2, sm: 3 }, overflowX: 'hidden' }}>
              <Stack spacing={2}>
                <Box>
                  <Typography className="railx-kicker" sx={{ mb: 0.7 }}>Request</Typography>
                  <Paper variant="outlined" sx={{ p: 1.4, background: 'rgba(255,255,255,0.52)' }}>
                    <Typography variant="body2"><strong>Route:</strong> {selectedJob.request?.source} → {selectedJob.request?.destination}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.4 }}><strong>Train:</strong> {selectedJob.request?.trainNumber || 'AUTO'} · {selectedJob.request?.coach} · {selectedJob.request?.quota}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.4 }}><strong>Date:</strong> {selectedJob.request?.travelDate}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.4 }}><strong>Passengers:</strong> {selectedJob.request?.passengerCount || 0}</Typography>
                  </Paper>
                </Box>

                <Divider />

                <Box sx={{ minWidth: 0 }}>
                  <Typography className="railx-kicker" sx={{ mb: 0.7 }}>Execution logs</Typography>
                  <div className="railx-modal-log">
                    {(selectedJob.progressEvents || []).map((event, index) => (
                      <div key={index} style={{ display: 'flex', gap: 10, padding: '2px 0', minWidth: 0 }}>
                        <span style={{ color: '#9aa8b4', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}
                        </span>
                        <span style={{ overflowWrap: 'anywhere' }}>{event.message || event.jobStatus || event.state}</span>
                      </div>
                    ))}
                  </div>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
              <Button onClick={() => setSelectedJob(null)} variant="outlined">Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
}
