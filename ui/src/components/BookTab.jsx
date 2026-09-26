import React from 'react'
import { Box, Paper, Stack, Typography, Button } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'

export default function BookTab({
  accounts,
  selectedAccountId,
  journeys,
  onStart,
  activeJobsCount,
  onOpenDialog,
}) {
  const selectedAcc = accounts.find(account => account.id === selectedAccountId)

  return (
    <Box sx={{ width: '100%', maxWidth: 800, mx: 'auto', minWidth: 0 }}>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.25, sm: 1.5 },
          mb: { xs: 2, sm: 3 },
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 0.75,
          bgcolor: '#f0f4f8',
          overflowWrap: 'anywhere',
        }}
      >
        <Typography variant="body2" color="text.secondary">Account:</Typography>
        <Typography variant="body2" sx={{ fontWeight: 'bold', minWidth: 0, overflowWrap: 'anywhere' }}>
          {selectedAcc
            ? selectedAcc.label + ' (' + selectedAcc.username + ')'
            : 'None Selected (Go to ACCOUNTS tab)'}
        </Typography>
      </Paper>

      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' },
        gap: 1,
        mb: 1.5,
        flexWrap: 'wrap',
      }}>
        <Typography variant="h6" color="primary" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
          READY JOURNEYS
        </Typography>

        {activeJobsCount > 0 && (
          <Button
            variant="text"
            size="small"
            onClick={onOpenDialog}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            VIEW RUNNING JOBS ({activeJobsCount})
          </Button>
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
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.5,
                }}
              >
                {(Array.isArray(journey.selectedTrains)
                  ? journey.selectedTrains.filter(item => item?.selected !== false).slice().sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0)).map(item => String(item.trainNumber)).join(' → ')
                  : (journey.trainNumber || 'AUTO-SELECT')) + ' · ' +
                  journey.source + ' → ' +
                  journey.destination + ' · ' +
                  journey.travelDate + ' · ' +
                  journey.coach + ' · ' +
                  journey.quota}
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {(journey.passengers && journey.passengers.length) || 0} Passenger(s)
                {journey.useMasterPassenger ? ' · Master Passenger' : ''}
                {' · ' + (journey.paymentPreference?.method || (journey.upiId ? 'UPI' : 'UPI')) + ' configured'}
              </Typography>
            </Box>

            <Typography
              variant="caption"
              sx={{
                fontWeight: 'bold',
                color: 'success.main',
                px: 1,
                py: 0.5,
                bgcolor: '#e8f5e9',
                borderRadius: 1,
                flexShrink: 0,
              }}
            >
              READY
            </Typography>
          </Paper>
        ))}

        {journeys.length === 0 && (
          <Paper variant="outlined" sx={{ py: 3, px: 2, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No ready journeys.</Typography>
            <Typography variant="caption">Plan your journey in the JOURNEYS tab.</Typography>
          </Paper>
        )}
      </Stack>

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: { xs: 2, sm: 4 }, px: 1 }}>
        <Button
          fullWidth
          variant="contained"
          color="secondary"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={onStart}
          disabled={!selectedAcc || journeys.length === 0}
          sx={{
            maxWidth: 420,
            px: 4,
            py: 1.25,
            minHeight: 48,
          }}
        >
          START AUTOMATION
        </Button>
      </Box>
    </Box>
  )
}
