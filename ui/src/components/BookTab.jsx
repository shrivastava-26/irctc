import React, { useEffect, useMemo } from 'react'
import { Box, Button, Checkbox, Stack, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import TrainOutlinedIcon from '@mui/icons-material/TrainOutlined'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import QueuePlayNextOutlinedIcon from '@mui/icons-material/QueuePlayNextOutlined'
import LaptopMacOutlinedIcon from '@mui/icons-material/LaptopMacOutlined'
import { NeoButton, StatusBadge } from './RailxPrimitives'

export default function BookTab({
  accounts,
  selectedAccountId,
  journeys,
  onStart,
  activeJobsCount,
  selectedJourneyIds = [],
  onSelectionChange,
  onOpenDialog,
  railApiConfigured = false,
}) {
  const selectedAcc = accounts.find(account => String(account.id) === String(selectedAccountId))
  const selectedSet = useMemo(() => new Set(selectedJourneyIds.map(String)), [selectedJourneyIds])

  useEffect(() => {
    const validIds = new Set(journeys.map(journey => String(journey.id)))
    const cleaned = selectedJourneyIds.filter(id => validIds.has(String(id)))
    if (cleaned.length !== selectedJourneyIds.length) onSelectionChange?.(cleaned)
  }, [journeys, selectedJourneyIds, onSelectionChange])

  const toggleJourney = id => {
    const key = String(id)
    const next = selectedSet.has(key)
      ? selectedJourneyIds.filter(item => String(item) !== key)
      : selectedJourneyIds.concat(id)
    onSelectionChange?.(next)
  }

  const selectAll = () => onSelectionChange?.(journeys.map(journey => journey.id))
  const clearAll = () => onSelectionChange?.([])
  const selectedCount = selectedJourneyIds.length
  const paymentReadyCount = journeys.filter(journey => Boolean(journey.upiId)).length

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <div className="railx-context-bar">
        <Stack className="railx-context-account" direction="row" spacing={1} alignItems="center" minWidth={0}>
          <Box className="railx-brand-mark" sx={{ width: 36, height: 36, flexShrink: 0 }}>
            <ManageAccountsOutlinedIcon fontSize="small" />
          </Box>
          <Box className="railx-account-identity" minWidth={0}>
            <Typography className="railx-kicker">Active account</Typography>
            <Typography className="railx-context-name" variant="body2" sx={{ mt: 0.15, fontWeight: 800 }}>
              {selectedAcc ? selectedAcc.label + ' · ' + selectedAcc.username : 'No account selected'}
            </Typography>
          </Box>
        </Stack>

        <Stack className="railx-context-status" direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
          <span className="railx-summary-pill">
            Hosted rail API
          </span>
          <span className="railx-summary-pill">
            <QueuePlayNextOutlinedIcon sx={{ fontSize: 14 }} />
            {activeJobsCount} active
          </span>
          <StatusBadge status={selectedAcc ? 'READY' : 'CANCELLED'} compact />
        </Stack>
      </div>

      <section className="railx-section" aria-label="Automation queue">
        <div className="railx-section-header">
          <Box minWidth={0}>
            <Typography className="railx-kicker">Automation queue</Typography>
            <Typography component="h1" className="railx-section-title">Ready to run</Typography>
          </Box>

          <Stack className="railx-section-actions" direction="row" spacing={0.2} flexWrap="wrap" justifyContent="flex-end">
            <Button variant="text" size="small" onClick={selectAll} disabled={!journeys.length}>Select all</Button>
            <Button variant="text" size="small" onClick={clearAll} disabled={!selectedCount}>Clear</Button>
            {activeJobsCount > 0 && <Button variant="outlined" size="small" onClick={onOpenDialog}>Running {activeJobsCount}</Button>}
          </Stack>
        </div>

        {journeys.length ? (
          <div className="railx-journey-list">
            {journeys.map(journey => {
              const checked = selectedSet.has(String(journey.id))
              const paymentReady = Boolean(journey.upiId)
              const trainValue = journey.trainNumber || (journey.preferredTrains?.[0] ? 'Priority' : 'Auto')

              return (
                <div
                  key={journey.id}
                  className={checked ? 'railx-journey-row is-selected' : 'railx-journey-row'}
                  onClick={() => toggleJourney(journey.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      toggleJourney(journey.id)
                    }
                  }}
                  aria-pressed={checked}
                >
                  <div className="railx-row-grid">
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleJourney(journey.id)}
                      onClick={event => event.stopPropagation()}
                      inputProps={{ 'aria-label': 'Select journey ' + journey.source + ' to ' + journey.destination }}
                      size="small"
                    />

                    <Box minWidth={0}>
                      <div className="railx-route">
                        {journey.trainNumber ? journey.trainNumber + ' · ' : ''}{journey.source} → {journey.destination}
                      </div>
                      <div className="railx-route-meta">{journey.travelDate} · {journey.coach} · {journey.quota}</div>
                      <div className="railx-meta-line">
                        <span className="railx-meta-item"><EventNoteOutlinedIcon sx={{ fontSize: 14 }} />{journey.passengers?.length || 0} passenger{journey.passengers?.length === 1 ? '' : 's'}</span>
                        <span className="railx-divider-dot">•</span>
                        <span className="railx-meta-item"><TrainOutlinedIcon sx={{ fontSize: 14 }} />{journey.trainNumber ? 'Fixed train' : trainValue}</span>
                        <span className="railx-divider-dot">•</span>
                        <span className="railx-meta-item"><AccountBalanceWalletOutlinedIcon sx={{ fontSize: 14 }} />{paymentReady ? 'UPI ready' : 'Payment not set'}</span>
                      </div>
                    </Box>

                    <div className="railx-row-status">
                      <StatusBadge status="READY" compact />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="railx-empty-state">
            <Typography variant="body2" fontWeight={750}>No journeys are ready yet.</Typography>
            <Typography variant="caption">Add one in Journeys to make it available for automation.</Typography>
          </div>
        )}

        <div className="railx-inline-summary">
          <span><strong>{journeys.length}</strong> saved</span>
          <span><strong>{selectedCount}</strong> selected</span>
          <span><strong>{paymentReadyCount}/{journeys.length || 0}</strong> UPI ready</span>
        </div>
      </section>

      <div className="railx-command-bar">
        <div className="railx-action-area">
          <Typography variant="body2" sx={{ fontWeight: 750 }}>
            {selectedCount === 0
              ? 'Select a journey to enable automation.'
              : selectedCount === 1
                ? '1 journey selected.'
                : selectedCount + ' journeys selected.'}
          </Typography>
          {!railApiConfigured && (
            <div className="railx-worker-notice" role="status">
              <span>Hosted rail API is not configured. Add provider credentials on Render before automation.</span>
            </div>
          )}
        </div>

        <NeoButton
          variant="contained"
          color="primary"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={() => onStart(selectedJourneyIds)}
          disabled={!selectedAcc || selectedCount === 0 || !railApiConfigured}
          sx={{ minHeight: 46, minWidth: { xs: 0, sm: 220 } }}
        >
          Start automation
        </NeoButton>
      </div>
    </Box>
  )
}
