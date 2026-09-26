import React, { useEffect, useMemo } from 'react'
import { Box, Checkbox, Chip, Divider, Paper, Stack, Typography, Button } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import TrainOutlinedIcon from '@mui/icons-material/TrainOutlined'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import QueuePlayNextOutlinedIcon from '@mui/icons-material/QueuePlayNextOutlined'
import { BentoCard, BentoGrid, GlassPanel, NeoButton, StatusBadge } from './RailxPrimitives'

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
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <GlassPanel className="railx-page-intro" sx={{ p: { xs: 1.5, sm: 2 }, mb: 1.75 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={1.5}>
          <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2.5,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                bgcolor: 'rgba(98,217,255,0.10)',
                color: 'primary.main',
                border: '1px solid rgba(98,217,255,0.18)',
              }}
            >
              <ManageAccountsOutlinedIcon />
            </Box>
            <Box minWidth={0}>
              <Typography className="railx-kicker">ACTIVE ACCOUNT</Typography>
              <Typography variant="body2" sx={{ mt: 0.35, fontWeight: 850, overflowWrap: 'anywhere' }}>
                {selectedAcc
                  ? selectedAcc.label + ' (' + selectedAcc.username + ')'
                  : 'No account selected'}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={0.8} flexWrap="wrap" justifyContent="flex-end">
            <Chip
              label="LOCAL BROWSER"
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontWeight: 850 }}
            />
            <Chip
              icon={<QueuePlayNextOutlinedIcon />}
              label={activeJobsCount + ' active job' + (activeJobsCount === 1 ? '' : 's')}
              size="small"
              variant="outlined"
              sx={{ borderColor: 'divider' }}
            />
            <StatusBadge status={selectedAcc ? 'READY' : 'CANCELLED'} compact />
          </Stack>
        </Stack>
      </GlassPanel>

      <BentoGrid>
        <BentoCard className="railx-span-8">
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.25}>
            <Box>
              <Typography className="railx-kicker">AUTOMATION QUEUE</Typography>
              <Typography variant="h2" sx={{ mt: 0.5 }}>Ready journeys</Typography>
              <Typography variant="caption" color="text.secondary">
                Select exactly the journeys that should enter the existing automation flow.
              </Typography>
            </Box>

            <Stack direction="row" spacing={0.5} justifyContent={{ xs: 'flex-end', sm: 'initial' }}>
              <Button variant="text" size="small" onClick={selectAll} disabled={journeys.length === 0}>Select all</Button>
              <Button variant="text" size="small" onClick={clearAll} disabled={selectedCount === 0}>Clear</Button>
              {activeJobsCount > 0 && (
                <Button variant="outlined" size="small" onClick={onOpenDialog}>Running ({activeJobsCount})</Button>
              )}
            </Stack>
          </Stack>

          <Divider sx={{ my: 1.5 }} />

          <Stack spacing={1}>
            {journeys.map(journey => {
              const checked = selectedSet.has(String(journey.id))
              const paymentReady = Boolean(journey.upiId)
              const trainValue = journey.trainNumber || (journey.preferredTrains?.[0] ? 'PRIORITY LIST' : 'AUTO')

              return (
                <Paper
                  key={journey.id}
                  variant="outlined"
                  onClick={() => toggleJourney(journey.id)}
                  className={checked ? 'railx-journey-card is-selected' : 'railx-journey-card'}
                  sx={{
                    p: { xs: 1.25, sm: 1.5 },
                    cursor: 'pointer',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleJourney(journey.id)}
                      onClick={event => event.stopPropagation()}
                      inputProps={{ 'aria-label': 'Select journey ' + journey.source + ' to ' + journey.destination }}
                      color="primary"
                      size="small"
                    />

                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={0.8}>
                        <Box minWidth={0}>
                          <Typography variant="body2" sx={{ fontWeight: 900, overflowWrap: 'anywhere', lineHeight: 1.45 }}>
                            {trainValue} · {journey.source} → {journey.destination}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2 }}>
                            {journey.travelDate} · {journey.coach} · {journey.quota}
                          </Typography>
                        </Box>
                        <StatusBadge status="READY" compact />
                      </Stack>

                      <Stack direction="row" spacing={0.6} flexWrap="wrap" sx={{ mt: 0.85 }}>
                        <Chip icon={<EventNoteOutlinedIcon />} label={(journey.passengers?.length || 0) + ' passenger' + ((journey.passengers?.length || 0) === 1 ? '' : 's')} size="small" variant="outlined" />
                        <Chip icon={<TrainOutlinedIcon />} label={journey.trainNumber ? 'Train locked' : 'Train policy ' + (journey.trainSelectionPolicy || 'AUTO')} size="small" variant="outlined" />
                        <Chip icon={<AccountBalanceWalletOutlinedIcon />} label={paymentReady ? 'UPI ready' : 'Payment not configured'} size="small" variant={paymentReady ? 'outlined' : 'filled'} color={paymentReady ? 'success' : 'default'} />
                      </Stack>
                    </Box>
                  </Stack>
                </Paper>
              )
            })}

            {journeys.length === 0 && (
              <Paper className="railx-empty-state" variant="outlined">
                <AddCircleOutlineIcon sx={{ fontSize: 42, mb: 0.6 }} />
                <Typography variant="body2" fontWeight={800}>No ready journeys</Typography>
                <Typography variant="caption" color="text.secondary">
                  Create one in the Journeys tab before starting automation.
                </Typography>
              </Paper>
            )}
          </Stack>
        </BentoCard>

        <BentoCard className="railx-span-4 railx-console-card">
          <Typography className="railx-kicker">AUTOMATION ENGINE</Typography>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.75 }}>
            <Typography variant="h3">Control state</Typography>
            <StatusBadge status={activeJobsCount > 0 ? 'RUNNING' : 'READY'} compact />
          </Stack>

          <Box sx={{ mt: 2 }} className="railx-metric-stack">
            <Box><Typography className="railx-kicker">SELECTED</Typography><Typography variant="h2">{selectedCount}</Typography></Box>
            <Box><Typography className="railx-kicker">ACTIVE JOBS</Typography><Typography variant="h2">{activeJobsCount}</Typography></Box>
            <Box><Typography className="railx-kicker">ACCOUNT</Typography><Typography variant="body2" fontWeight={800}>{selectedAcc ? 'READY' : 'NOT SELECTED'}</Typography></Box>
          </Box>

          <Paper variant="outlined" className="railx-engine-note">
            <Typography variant="caption" color="text.secondary">
              Existing workers, scheduling, polling, payment handling and API contracts remain untouched by this presentation layer.
            </Typography>
          </Paper>

          {activeJobsCount > 0 && (
            <Button sx={{ mt: 1.25 }} fullWidth variant="outlined" onClick={onOpenDialog}>
              OPEN LIVE CONSOLE
            </Button>
          )}
        </BentoCard>

        <BentoCard className="railx-span-4 railx-stat-card">
          <Typography className="railx-kicker">TRAIN PRIORITY</Typography>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mt: 0.8 }}>
            <Box>
              <Typography variant="h3">{journeys.some(j => j.preferredTrains?.length) ? 'P1 configured' : 'AUTO'}</Typography>
              <Typography variant="caption" color="text.secondary">
                Priority configuration remains in the journey editor.
              </Typography>
            </Box>
            <TrainOutlinedIcon color="primary" />
          </Stack>
        </BentoCard>

        <BentoCard className="railx-span-4 railx-stat-card">
          <Typography className="railx-kicker">BOOKING</Typography>
          <Typography variant="h3" sx={{ mt: 0.8 }}>READY</Typography>
          <Typography variant="caption" color="text.secondary">Selection stays explicit before automation starts.</Typography>
        </BentoCard>

        <BentoCard className="railx-span-4 railx-stat-card">
          <Typography className="railx-kicker">PAYMENT</Typography>
          <Typography variant="h3" sx={{ mt: 0.8 }}>
            {journeys.filter(j => j.upiId).length}/{journeys.length || 0} UPI ready
          </Typography>
          <Typography variant="caption" color="text.secondary">Read from the existing saved journey configuration.</Typography>
        </BentoCard>
      </BentoGrid>

      <Paper
        variant="outlined"
        className="railx-command-bar"
        sx={{
          mt: 1.5,
          p: { xs: 1.25, sm: 1.5 },
          position: 'sticky',
          bottom: 12,
          zIndex: 3,
          background: 'rgba(10,17,29,0.90)',
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography className="railx-kicker">EXECUTION SCOPE</Typography>
            <Typography variant="body2" sx={{ mt: 0.35, fontWeight: 800 }}>
              {selectedCount === 0
                ? 'Select a journey to enable automation.'
                : selectedCount === 1
                  ? '1 journey selected — only that journey will run.'
                  : selectedCount + ' journeys selected — all selected journeys will run.'}
            </Typography>
          </Box>

          <NeoButton
            variant="contained"
            color="primary"
            size="large"
            startIcon={<PlayArrowIcon />}
            onClick={() => onStart(selectedJourneyIds)}
            disabled={!selectedAcc || selectedCount === 0}
            sx={{ minHeight: 50, minWidth: { xs: '100%', sm: 240 } }}
          >
            START AUTOMATION
          </NeoButton>
        </Stack>
      </Paper>
    </Box>
  )
}
