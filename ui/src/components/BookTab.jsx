import React from 'react'
import { Alert, Box, Paper, Stack, Typography, Button, Chip } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'

export default function BookTab({ accounts, selectedAccountId, journeys, onStart, activeJobsCount }) {
  const selectedAccount = accounts.find(account => account.id === selectedAccountId)

  return (
    <Box sx={{ width: '100%', maxWidth: 820, mx: 'auto', minWidth: 0 }}>
      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>Frontend-only MVP:</strong> account, journey and automation-plan data stays in this browser.
        No API/backend is required for setup.
      </Alert>

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.25, sm: 1.5 },
          mb: 2,
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 0.75,
          overflowWrap: 'anywhere',
        }}
      >
        <Typography variant="body2" color="text.secondary">Account:</Typography>
        <Typography variant="body2" sx={{ fontWeight: 'bold', overflowWrap: 'anywhere' }}>
          {selectedAccount
            ? selectedAccount.label + ' (' + selectedAccount.username + ')'
            : 'None selected'}
        </Typography>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6" color="primary" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
            READY JOURNEYS
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {journeys.length} configured
          </Typography>
        </Box>
        {activeJobsCount > 0 && (
          <Chip label={activeJobsCount + ' local job' + (activeJobsCount > 1 ? 's' : '') + ' ready'} color="info" size="small" />
        )}
      </Box>

      <Stack spacing={1} sx={{ mb: 3 }}>
        {journeys.map(journey => (
          <Paper
            key={journey.id}
            variant="outlined"
            sx={{
              p: { xs: 1.25, sm: 1.5 },
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', sm: 'center' },
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
              minWidth: 0,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.85rem', overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                {journey.trainNumber} · {journey.source} → {journey.destination} · {journey.travelDate} · {journey.coach} · {journey.quota}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {(journey.passengers && journey.passengers.length) || 0} Passenger(s)
                {journey.upiId ? ' · UPI configured' : ''}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'success.main', px: 1, py: 0.5, bgcolor: '#e8f5e9', borderRadius: 1, flexShrink: 0 }}>
              READY
            </Typography>
          </Paper>
        ))}

        {journeys.length === 0 && (
          <Paper variant="outlined" sx={{ py: 3, px: 2, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No ready journeys.</Typography>
            <Typography variant="caption">Plan your journey in JOURNEYS.</Typography>
          </Paper>
        )}
      </Stack>

      <Box sx={{ display: 'flex', justifyContent: 'center', px: 1 }}>
        <Button
          fullWidth
          variant="contained"
          color="secondary"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={onStart}
          disabled={!selectedAccount || journeys.length === 0}
          sx={{ maxWidth: 460, minHeight: 50 }}
        >
          START AUTOMATION
        </Button>
      </Box>
    </Box>
  )
}
