import React from 'react';
import { Box, Typography, Button, Paper, Stack } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

export default function BookTab({ accounts, selectedAccountId, journeys, onStart, activeJobsCount, onOpenDialog }) {
  const selectedAcc = accounts.find(a => a.id === selectedAccountId);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      
      {/* Account Info */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 3, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f0f4f8' }}>
        <Typography variant="body2" color="text.secondary">Account:</Typography>
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {selectedAcc ? `${selectedAcc.label} (${selectedAcc.username})` : 'None Selected (Go to ACCOUNTS tab)'}
        </Typography>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6" color="primary" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>READY JOURNEYS</Typography>
        {activeJobsCount > 0 && (
          <Button variant="text" size="small" onClick={onOpenDialog}>
            VIEW RUNNING JOBS ({activeJobsCount})
          </Button>
        )}
      </Box>

      {/* Journeys List */}
      <Stack spacing={1} sx={{ mb: 3 }}>
        {journeys.map((j, i) => (
          <Paper key={j.id} variant="outlined" sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                {j.trainNumber} &nbsp; {j.source} → {j.destination} &nbsp; {j.travelDate} &nbsp; {j.coach} &nbsp; {j.quota}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {j.passengers?.length || 0} Passenger(s) {j.upiId ? `· UPI configured` : ''}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'success.main', px: 1, py: 0.5, bgcolor: '#e8f5e9', borderRadius: 1 }}>
              READY
            </Typography>
          </Paper>
        ))}
        {journeys.length === 0 && (
          <Paper variant="outlined" sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No ready journeys.</Typography>
            <Typography variant="caption">Plan your journey in the JOURNEYS tab.</Typography>
          </Paper>
        )}
      </Stack>

      {/* Action */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <Button 
          variant="contained" 
          color="secondary" 
          size="large" 
          startIcon={<PlayArrowIcon />} 
          onClick={onStart}
          disabled={!selectedAcc || journeys.length === 0}
          sx={{ px: 4, py: 1 }}
        >
          START AUTOMATION
        </Button>
      </Box>

    </Box>
  );
}
