import React, { useState, useEffect, useRef } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, 
  Box, CircularProgress, Paper, Divider, Stack
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AddIcon from '@mui/icons-material/Add';

const API = '/api';

const STAGES = [
  'JOB_CREATED',
  'LOGIN',
  'SEARCH',
  'TRAIN_FOUND',
  'TRAIN_SELECTION',
  'COACH_SELECTION',
  'AVAILABILITY',
  'BOOKING_FORM',
  'REVIEW',
  'PAYMENT',
  'BOOKING_CONFIRMED'
];

export default function AutomationDialog({ open, activeJobs, onClose, onAddJourney }) {
  const [jobsData, setJobsData] = useState([]);
  const pollRef = useRef(null);
  const logsEndRef = useRef(null);

  const fetchJobs = async () => {
    if (!activeJobs || activeJobs.length === 0) return;
    try {
      const promises = activeJobs.map(id => fetch(`${API}/jobs/${id}`).then(res => res.json()));
      const results = await Promise.all(promises);
      setJobsData(results);

      // Stop polling if all jobs are COMPLETED or FAILED
      const allDone = results.every(j => j.status === 'COMPLETED' || j.status === 'FAILED');
      if (allDone && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (open && activeJobs && activeJobs.length > 0) {
      fetchJobs();
      pollRef.current = setInterval(fetchJobs, 1000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeJobs, open]);

  // Find active or last job to display main context
  const activeJob = jobsData.find(j => j.status === 'RUNNING') 
                 || jobsData.find(j => j.status === 'STARTING') 
                 || jobsData[jobsData.length - 1];

  const activeIndex = jobsData.findIndex(j => j.id === activeJob?.id);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeJob?.progressEvents?.length]);

  if (!open) return null;

  const currentStageIndex = activeJob ? STAGES.indexOf(activeJob.currentState) : -1;

  return (
    <Dialog open={open} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {(activeJob?.status === 'RUNNING' || activeJob?.status === 'STARTING') ? (
            <CircularProgress size={20} thickness={5} />
          ) : activeJob?.status === 'COMPLETED' ? (
            <CheckCircleIcon color="success" />
          ) : (
             <ErrorIcon color="error" />
          )}
          <Typography variant="subtitle1" fontWeight="bold">
            {activeJob?.status === 'RUNNING' ? 'Automation running' : 
             activeJob?.status === 'COMPLETED' ? 'Automation completed' : 
             'Automation failed'}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pb: 1, pt: 0 }}>
        {activeJob && (
          <Box sx={{ mb: 2 }}>
             <Typography variant="body2" color="text.secondary">
               Journey {activeIndex + 1} / {jobsData.length}
             </Typography>
             <Typography variant="body1" fontWeight="bold">
               {activeJob.request?.source} → {activeJob.request?.destination} · {activeJob.request?.trainNumber}
             </Typography>
          </Box>
        )}

        {/* Compact Vertical Stepper Alternative */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {STAGES.map((label, idx) => {
            const isCompleted = currentStageIndex > idx || activeJob?.status === 'COMPLETED';
            const isActive = currentStageIndex === idx && activeJob?.status !== 'COMPLETED' && activeJob?.status !== 'FAILED';
            const isFailed = currentStageIndex === idx && activeJob?.status === 'FAILED';
            
            let icon = '○';
            if (isCompleted) icon = '✓';
            if (isActive) icon = '●';
            if (isFailed) icon = '✕';

            return (
              <Typography key={label} variant="caption" sx={{ 
                color: isFailed ? 'error.main' : (isCompleted || isActive) ? 'text.primary' : 'text.disabled',
                fontWeight: isActive ? 'bold' : 'normal',
                fontSize: '0.75rem'
              }}>
                {icon} {label.replace('_', ' ')}
              </Typography>
            );
          })}
        </Box>

        {activeJob?.status === 'COMPLETED' && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: '#e8f5e9', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="success.dark">✓ BOOKING CONFIRMED</Typography>
            {activeJob.progressEvents?.find(e => e.pnr) && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>PNR: <strong>{activeJob.progressEvents.find(e => e.pnr).pnr}</strong></Typography>
            )}
          </Box>
        )}
        
        {activeJob?.status === 'FAILED' && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: '#ffebee', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="error.dark">✕ AUTOMATION FAILED</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>Stage: {activeJob.currentState}</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, wordBreak: 'break-word' }}>
              Error: {activeJob.errorInformation}
            </Typography>
          </Box>
        )}

        <Typography variant="caption" fontWeight="bold" sx={{ display: 'block', mb: 0.5 }}>LIVE LOG</Typography>
        <Paper 
          variant="outlined" 
          sx={{ 
            height: 200, 
            overflowY: 'auto', 
            bgcolor: '#1e1e1e', 
            color: '#d4d4d4', 
            p: 1,
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: '0.75rem',
            mb: 2
          }}
        >
          {(activeJob?.progressEvents || []).map((ev, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, py: 0.2 }}>
              <Box sx={{ color: '#858585', flexShrink: 0 }}>
                {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false })}
              </Box>
              <Box sx={{ color: '#ce9178', wordBreak: 'break-word' }}>
                {ev.message || ev.jobStatus || ev.state}
              </Box>
            </Box>
          ))}
          <div ref={logsEndRef} />
        </Paper>

        {jobsData.length > 1 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>QUEUE</Typography>
            <Stack spacing={0.5}>
              {jobsData.map((j, idx) => (
                <Typography key={j.id} variant="caption" sx={{ 
                  color: j.status === 'FAILED' ? 'error.main' : 'text.primary',
                  fontWeight: j.id === activeJob?.id ? 'bold' : 'normal'
                }}>
                  {j.status === 'COMPLETED' ? '✓' : j.status === 'FAILED' ? '✕' : j.status === 'RUNNING' ? '●' : '○'} &nbsp;
                  Journey {idx + 1}: {j.request?.source} → {j.request?.destination} — {j.status}
                </Typography>
              ))}
            </Stack>
          </>
        )}

      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1, justifyContent: 'space-between' }}>
        <Button onClick={onAddJourney} startIcon={<AddIcon />} variant="outlined" size="small">
          PLAN ANOTHER
        </Button>
        <Button onClick={onClose} variant="contained" color="primary" size="small">
          CLOSE
        </Button>
      </DialogActions>
    </Dialog>
  );
}
