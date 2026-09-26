import React, { useState } from 'react'
import { Box, Typography, Button, Stack, IconButton, Dialog, DialogContent, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import TrainOutlinedIcon from '@mui/icons-material/TrainOutlined'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined'
import { toast } from 'react-toastify'
import JourneyEditor from './JourneyEditor'
import { GlassPanel, StatusBadge } from './RailxPrimitives'

export default function JourneysTab({ journeys, onSave }) {
  const [open, setOpen] = useState(false)
  const [editingJourney, setEditingJourney] = useState(null)

  const handleOpen = (journey = null) => {
    setEditingJourney(journey)
    setOpen(true)
  }

  const handleDuplicate = journey => {
    onSave(journeys.concat({ ...journey, id: Date.now().toString() }))
    toast.success('Journey duplicated')
  }

  const handleDelete = id => {
    onSave(journeys.filter(journey => journey.id !== id))
    toast.success('Journey deleted')
  }

  const handleSaveJourney = data => {
    if (editingJourney) {
      onSave(journeys.map(journey => journey.id === data.id ? data : journey))
      toast.success('Journey updated')
    } else {
      onSave(journeys.concat({ ...data, id: Date.now().toString() }))
      toast.success('Journey added')
    }
    setOpen(false)
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <GlassPanel className="railx-page-intro">
        <div className="railx-section-header" style={{ marginBottom: 0 }}>
          <Box minWidth={0}>
            <Typography className="railx-kicker">Journeys</Typography>
            <Typography component="h1" className="railx-section-title">Planned journeys</Typography>
            <Typography className="railx-section-copy">Saved routes and booking preferences.</Typography>
          </Box>
          <Button startIcon={<AddIcon />} variant="contained" color="primary" onClick={() => handleOpen()}>
            Add journey
          </Button>
        </div>
      </GlassPanel>

      <section className="railx-section" aria-label="Planned journeys list">
        {journeys.length > 0 ? (
          <div className="railx-journey-list">
            {journeys.map(journey => (
              <div key={journey.id} className="railx-journey-row">
                <div className="railx-row-grid">
                  <Box className="railx-brand-mark" sx={{ width: 36, height: 36, flexShrink: 0 }}>
                    <TrainOutlinedIcon fontSize="small" />
                  </Box>

                  <Box minWidth={0}>
                    <div className="railx-route">
                      {journey.trainNumber ? journey.trainNumber + ' · ' : ''}{journey.source} → {journey.destination}
                    </div>
                    <div className="railx-route-meta">{journey.travelDate} · {journey.coach} · {journey.quota}</div>
                    <div className="railx-meta-line">
                      <span className="railx-meta-item"><EventOutlinedIcon sx={{ fontSize: 14 }} />{journey.passengers?.length || 0} passenger{journey.passengers?.length === 1 ? '' : 's'}</span>
                      <span className="railx-divider-dot">•</span>
                      <span className="railx-meta-item"><PaymentsOutlinedIcon sx={{ fontSize: 14 }} />{journey.upiId ? 'UPI configured' : 'Payment not configured'}</span>
                      {journey.boardingStation ? <><span className="railx-divider-dot">•</span><span>Boarding {journey.boardingStation}</span></> : null}
                    </div>
                  </Box>

                  <div className="railx-row-actions">
                    <StatusBadge status="READY" compact />
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => handleOpen(journey)} aria-label="Edit journey"><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Duplicate"><IconButton size="small" onClick={() => handleDuplicate(journey)} aria-label="Duplicate journey"><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(journey.id)} aria-label="Delete journey"><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="railx-empty-state">
            <Typography variant="body2" fontWeight={750}>No journeys planned.</Typography>
            <Typography variant="caption">Add a journey to make it available for automation.</Typography>
          </div>
        )}
      </section>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth scroll="paper"
        PaperProps={{ sx: { m: { xs: 1, sm: 2 }, width: 'calc(100% - 16px)', maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' } } }}>
        <DialogContent sx={{ p: 0, overflowX: 'hidden' }}>
          <JourneyEditor initialData={editingJourney} onSave={handleSaveJourney} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </Box>
  )
}
