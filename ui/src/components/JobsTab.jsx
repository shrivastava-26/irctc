import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Chip, IconButton, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, Divider
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';

const API = '/api';

export default function JobsTab() {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API}/jobs`);
      if (res.ok) setJobs(await res.json());
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'RUNNING': return 'info';
      case 'COMPLETED': return 'success';
      case 'FAILED': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" color="primary" sx={{ fontSize: '1.1rem', fontWeight: 'bold' }}>AUTOMATION JOBS</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchJobs} variant="outlined" size="small">
          Refresh
        </Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
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
            {[...jobs].reverse().map(j => {
               const pnrEvent = j.progressEvents?.find(e => e.pnr);
               return (
                <TableRow 
                  key={j.id} 
                  hover 
                  sx={{ cursor: 'pointer', '& td': { py: 0.5, height: '44px' } }}
                  onClick={() => setSelectedJob(j)}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{new Date(j.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{j.request?.source} → {j.request?.destination}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{j.request?.trainNumber}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{j.request?.quota}</TableCell>
                  <TableCell>
                    <Chip label={j.status} color={getStatusColor(j.status)} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{j.currentState}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'success.main', fontSize: '0.8rem' }}>{pnrEvent ? pnrEvent.pnr : '-'}</TableCell>
                </TableRow>
               );
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

      {/* Job Details Dialog */}
      <Dialog open={!!selectedJob} onClose={() => setSelectedJob(null)} maxWidth="md" fullWidth>
        {selectedJob && (
          <>
            <DialogTitle sx={{ bgcolor: '#f5f5f5', py: 1.5 }}>
              <Typography variant="subtitle1" fontWeight="bold">Job Details</Typography>
            </DialogTitle>
            <DialogContent sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
              
              <Box>
                <Typography variant="caption" fontWeight="bold">REQUEST SUMMARY</Typography>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f8f9fa' }}>
                  <Typography variant="body2"><strong>Route:</strong> {selectedJob.request?.source} → {selectedJob.request?.destination}</Typography>
                  <Typography variant="body2"><strong>Train:</strong> {selectedJob.request?.trainNumber} ({selectedJob.request?.coach}) - {selectedJob.request?.quota}</Typography>
                  <Typography variant="body2"><strong>Date:</strong> {selectedJob.request?.travelDate}</Typography>
                  <Typography variant="body2"><strong>Passengers:</strong> {selectedJob.request?.passengers?.length}</Typography>
                </Paper>
              </Box>
              
              <Divider />

              <Box>
                <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>EXECUTION LOGS</Typography>
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    height: 240, 
                    overflowY: 'auto', 
                    bgcolor: '#1e1e1e', 
                    color: '#d4d4d4', 
                    p: 1.5,
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '0.75rem'
                  }}
                >
                  {(selectedJob.progressEvents || []).map((ev, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1.5, py: 0.2 }}>
                      <Box sx={{ color: '#858585', flexShrink: 0 }}>
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </Box>
                      <Box sx={{ color: '#ce9178', wordBreak: 'break-word' }}>
                        {ev.message || ev.jobStatus || ev.state}
                      </Box>
                    </Box>
                  ))}
                </Paper>
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setSelectedJob(null)} variant="outlined" size="small">Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
