import React, { useState } from 'react'
import { Box, Typography, Button, Paper, Stack, IconButton, Dialog, DialogContent } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { toast } from 'react-toastify'
import JourneyEditor from './JourneyEditor'

export default function JourneysTab({ journeys, onSave }) {
  const [open, setOpen] = useState(false)
  const [editingJourney, setEditingJourney] = useState(null)

  const handleOpen = (journey = null) => {
    setEditingJourney(journey)
    setOpen(true)
  }

  const handleDuplicate = (journey) => {
    onSave(journeys.concat({ ...journey, id: Date.now().toString() }))
    toast.success('Journey duplicated')
  }

  const handleDelete = (id) => {
    onSave(journeys.filter(journey => journey.id !== id))
    toast.success('Journey deleted')
  }

  const handleSaveJourney = (data) => {
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography variant="h6" color="primary" sx={{ fontSize: { xs: '1rem', sm: '1.1rem' }, fontWeight: 'bold' }}>
          PLANNED JOURNEYS
        </Typography>

        <Button startIcon={<AddIcon />} variant="contained" color="secondary" size="small" onClick={() => handleOpen()} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          Add Journey
        </Button>
      </Box>

      <Stack spacing={1.5}>
        {journeys.map(journey => (
          <Paper key={journey.id} variant="outlined" sx={{
            p: { xs: 1.25, sm: 1.5 },
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'flex-start' },
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1.25,
            minWidth: 0,
          }}>
            <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.9rem', overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                {journey.trainNumber} · {journey.source} → {journey.destination} · {journey.travelDate}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {journey.coach} • {journey.quota} • {(journey.passengers && journey.passengers.length) || 0} Passenger(s)
              </Typography>
              {(journey.boardingStation || journey.upiId) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {journey.boardingStation ? 'Boarding: ' + journey.boardingStation : ''}
                  {journey.boardingStation && journey.upiId ? ' • ' : ''}
                  {journey.upiId ? 'UPI configured' : ''}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0, justifyContent: { xs: 'flex-end', sm: 'initial' } }}>
              <IconButton size="small" onClick={() => handleOpen(journey)} title="Edit" aria-label="Edit journey"><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => handleDuplicate(journey)} title="Duplicate" aria-label="Duplicate journey"><ContentCopyIcon fontSize="small" /></IconButton>
              <IconButton size="small" color="error" onClick={() => handleDelete(journey.id)} title="Delete" aria-label="Delete journey"><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          </Paper>
        ))}

        {journeys.length === 0 && (
          <Paper variant="outlined" sx={{ py: 4, px: 2, textAlign: 'center', color: 'text.secondary' }}>
            No journeys planned. Click "Add Journey" to create one.
          </Paper>
        )}
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth scroll="paper"
        PaperProps={{ sx: { m: { xs: 1, sm: 2 }, width: 'calc(100% - 16px)', maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' } } }}>
        <DialogContent sx={{ p: 0, overflowX: 'hidden' }}>
          <JourneyEditor initialData={editingJourney} onSave={handleSaveJourney} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </Box>
  )
}
