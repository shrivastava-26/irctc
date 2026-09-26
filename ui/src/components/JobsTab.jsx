import React, { useEffect, useState } from 'react'
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

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

  const getStatusColor = (status) => {
    switch (status) {
      case 'RUNNING': return 'info'
      case 'COMPLETED': return 'success'
      case 'FAILED': return 'error'
      default: return 'default'
    }
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
        <Typography className="railx-kicker" sx={{
          fontSize: { xs: '1rem', sm: '1.1rem' },
          fontWeight: 'bold',
        }}>
          AUTOMATION JOBS
        </Typography>

        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchJobs}
          variant="outlined"
          size="small"
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Refresh
        </Button>
      </Box>

      <TableContainer
        component={Paper}
        className="railx-table-wrap"
        variant="outlined"
        sx={{ width: '100%', overflowX: 'auto' }}
      >
        <Table size="small" sx={{ minWidth: 760 }}>
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Route</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Train</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Quota</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Stage</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>PNR</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {jobs.slice().reverse().map(job => {
              const pnrEvent = (job.progressEvents || []).find(event => event.pnr)

              return (
                <TableRow
                  key={job.id}
                  hover
                  sx={{ cursor: 'pointer', '& td': { py: 0.5, height: '44px' } }}
                  onClick={() => setSelectedJob(job)}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {new Date(job.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>

                  <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {job.request?.source} → {job.request?.destination}
                  </TableCell>

                  <TableCell sx={{ fontSize: '0.8rem' }}>{job.request?.trainNumber}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{job.request?.quota}</TableCell>

                  <TableCell>
                    <Chip
                      label={job.status}
                      color={getStatusColor(job.status)}
                      size="small"
                      sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                  </TableCell>

                  <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {job.currentState}
                  </TableCell>

                  <TableCell sx={{ fontWeight: 'bold', color: 'success.main', fontSize: '0.8rem' }}>
                    {pnrEvent ? pnrEvent.pnr : '-'}
                  </TableCell>
                </TableRow>
              )
            })}

            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No historical jobs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
            <DialogTitle sx={{
              bgcolor: '#f5f5f5',
              py: 1.5,
              px: { xs: 2, sm: 3 },
            }}>
              <Typography variant="subtitle1" fontWeight="bold">Job Details</Typography>
            </DialogTitle>

            <DialogContent sx={{
              mt: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              p: { xs: 2, sm: 3 },
              overflowX: 'hidden',
            }}>
              <Box>
                <Typography variant="caption" fontWeight="bold">REQUEST SUMMARY</Typography>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f8f9fa', overflowWrap: 'anywhere' }}>
                  <Typography variant="body2">
                    <strong>Route:</strong> {selectedJob.request?.source} → {selectedJob.request?.destination}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Train:</strong> {selectedJob.request?.trainNumber} ({selectedJob.request?.coach}) - {selectedJob.request?.quota}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Date:</strong> {selectedJob.request?.travelDate}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Passengers:</strong> {selectedJob.request?.passengerCount || 0}
                  </Typography>
                </Paper>
              </Box>

              <Divider />

              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                  EXECUTION LOGS
                </Typography>

                <Paper
                  variant="outlined"
                  sx={{
                    height: { xs: 220, sm: 280 },
                    overflowY: 'auto',
                    bgcolor: '#1e1e1e',
                    color: '#d4d4d4',
                    p: 1.5,
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '0.75rem',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {(selectedJob.progressEvents || []).map((event, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1.5, py: 0.2 }}>
                      <Box sx={{
                        color: '#858585',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}>
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </Box>
                      <Box sx={{ color: '#ce9178', wordBreak: 'break-word', minWidth: 0 }}>
                        {event.message || event.jobStatus || event.state}
                      </Box>
                    </Box>
                  ))}
                </Paper>
              </Box>
            </DialogContent>

            <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
              <Button onClick={() => setSelectedJob(null)} variant="outlined" size="small">
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
}
