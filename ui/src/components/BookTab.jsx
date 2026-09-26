import React, { useEffect, useMemo } from 'react'
import { Box, Paper, Stack, Typography, Button, Checkbox, Chip } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'

export default function BookTab({
  accounts,
  selectedAccountId,
  journeys,
  onStart,
  activeJobsCount,
  selectedJourneyIds = [],
  onSelectionChange,
  onOpenDialog,
}) {
  const selectedAcc = accounts.find(account => String(account.id) === String(selectedAccountId))
  const selectedSet = useMemo(() => new Set(selectedJourneyIds.map(String)), [selectedJourneyIds])

  useEffect(() => {
    const validIds = new Set(journeys.map(journey => String(journey.id)))
    const cleaned = selectedJourneyIds.filter(id => validIds.has(String(id)))
    if (cleaned.length !== selectedJourneyIds.length) {
      onSelectionChange?.(cleaned)
    }
  }, [journeys, selectedJourneyIds, onSelectionChange])

  const toggleJourney = (id) => {
    const key = String(id)
    const next = selectedSet.has(key)
      ? selectedJourneyIds.filter(item => String(item) !== key)
      : selectedJourneyIds.concat(id)
    onSelectionChange?.(next)
  }

  const selectAll = () => onSelectionChange?.(journeys.map(journey => journey.id))
  const clearAll = () => onSelectionChange?.([])
  const selectedCount = selectedJourneyIds.length

  return (
    <Box sx={{ width: '100%', maxWidth: 920, mx: 'auto', minWidth: 0 }}>
      <Paper
        variant="outlined"
        sx={{
          mb: 2,
          p: { xs: 1.5, sm: 2 },
          borderRadius: 3,
          background: 'linear-gradient(135deg, rgba(33,61,119,0.08), rgba(251,121,43,0.06))',
          borderColor: 'rgba(33,61,119,0.12)',
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.main',
              color: 'common.white',
              flexShrink: 0,
            }}
          >
            <ManageAccountsOutlinedIcon />
          </Box>
          <Box minWidth={0}>
            <Typography variant="caption" color="text.secondary">Account</Typography>
            <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
              {selectedAcc
                ? selectedAcc.label + ' (' + selectedAcc.username + ')'
                : 'No account selected'}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 1,
          mb: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h6" color="primary" sx={{ fontSize: { xs: '1rem', sm: '1.15rem' }, fontWeight: 800 }}>
            Ready journeys
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Tick one journey or multiple journeys to automate.
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.5} sx={{ width: { xs: '100%', sm: 'auto' }, justifyContent: { xs: 'flex-end', sm: 'initial' } }}>
          <Button variant="text" size="small" onClick={selectAll} disabled={journeys.length === 0}>Select all</Button>
          <Button variant="text" size="small" onClick={clearAll} disabled={selectedCount === 0}>Clear</Button>
          {activeJobsCount > 0 && (
            <Button variant="outlined" size="small" onClick={onOpenDialog}>
              Running ({activeJobsCount})
            </Button>
          )}
        </Stack>
      </Box>

      <Stack spacing={1.25} sx={{ mb: 3 }}>
        {journeys.map(journey => {
          const checked = selectedSet.has(String(journey.id))
          return (
            <Paper
              key={journey.id}
              variant="outlined"
              onClick={() => toggleJourney(journey.id)}
              sx={{
                p: { xs: 1.25, sm: 1.5 },
                borderRadius: 3,
                display: 'flex',
                alignItems: { xs: 'flex-start', sm: 'center' },
                gap: 1,
                minWidth: 0,
                cursor: 'pointer',
                transition: 'border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
                borderColor: checked ? 'secondary.main' : 'divider',
                boxShadow: checked ? '0 6px 18px rgba(251,121,43,0.12)' : 'none',
                '&:hover': { boxShadow: '0 8px 22px rgba(33,61,119,0.08)' },
              }}
            >
              <Checkbox
                checked={checked}
                onChange={() => toggleJourney(journey.id)}
                onClick={event => event.stopPropagation()}
                inputProps={{ 'aria-label': 'Select journey ' + journey.source + ' to ' + journey.destination }}
                color="secondary"
                size="small"
                sx={{ mt: { xs: -0.5, sm: 0 } }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 800, fontSize: '0.87rem', overflowWrap: 'anywhere', lineHeight: 1.5 }}
                >
                  {journey.trainNumber || 'AUTO'} · {journey.source} → {journey.destination}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>
                  {journey.travelDate} · {journey.coach} · {journey.quota}
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mt: 0.6 }}>
                  <Chip
                    icon={<EventNoteOutlinedIcon />}
                    label={(journey.passengers?.length || 0) + ' passenger' + ((journey.passengers?.length || 0) === 1 ? '' : 's')}
                    size="small"
                    variant="outlined"
                    sx={{ height: 24, fontSize: '0.68rem' }}
                  />
                  {journey.upiId && (
                    <Chip label="UPI ready" size="small" color="success" variant="outlined" sx={{ height: 24, fontSize: '0.68rem' }} />
                  )}
                </Stack>
              </Box>

              <Typography
                variant="caption"
                sx={{
                  fontWeight: 800,
                  color: 'success.dark',
                  px: 1,
                  py: 0.55,
                  bgcolor: 'success.light',
                  borderRadius: 99,
                  flexShrink: 0,
                  alignSelf: { xs: 'flex-start', sm: 'center' },
                }}
              >
                READY
              </Typography>
            </Paper>
          )
        })}

        {journeys.length === 0 && (
          <Paper variant="outlined" sx={{ py: 7, px: 2, textAlign: 'center', borderRadius: 3 }}>
            <AddCircleOutlineIcon sx={{ fontSize: 42, color: 'text.disabled', mb: 0.5 }} />
            <Typography variant="body2" fontWeight={700}>No ready journeys</Typography>
            <Typography variant="caption" color="text.secondary">
              Create one in the Journeys tab before starting automation.
            </Typography>
          </Paper>
        )}
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.25, sm: 1.5 },
          borderRadius: 3,
          position: 'sticky',
          bottom: 12,
          zIndex: 3,
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(255,255,255,0.92)',
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 700 }}>
            {selectedCount === 0
              ? 'Select a journey to enable automation.'
              : selectedCount === 1
                ? '1 journey selected — only that journey will run.'
                : selectedCount + ' journeys selected — all selected journeys will run.'}
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            size="large"
            startIcon={<PlayArrowIcon />}
            onClick={() => onStart(selectedJourneyIds)}
            disabled={!selectedAcc || selectedCount === 0}
            sx={{
              minHeight: 48,
              minWidth: { xs: '100%', sm: 230 },
              fontWeight: 800,
              boxShadow: '0 8px 22px rgba(251,121,43,0.22)',
            }}
          >
            Start automation
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
