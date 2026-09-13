import React, { useState } from 'react';
import { 
  Box, Typography, Button, Paper, Stack, IconButton, Dialog, DialogContent
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { toast } from 'react-toastify';
import JourneyEditor from './JourneyEditor';

export default function JourneysTab({ journeys, onSave }) {
  const [open, setOpen] = useState(false);
  const [editingJourney, setEditingJourney] = useState(null);

  const handleOpen = (journey = null) => {
    setEditingJourney(journey);
    setOpen(true);
  };

  const handleDuplicate = (journey) => {
    const dup = { ...journey, id: Date.now().toString() };
    onSave([...journeys, dup]);
    toast.success('Journey duplicated');
  };

  const handleDelete = (id) => {
    onSave(journeys.filter(j => j.id !== id));
    toast.success('Journey deleted');
  };

  const handleSaveJourney = (data) => {
    if (editingJourney) {
      onSave(journeys.map(j => j.id === data.id ? data : j));
      toast.success('Journey updated');
    } else {
      onSave([...journeys, { ...data, id: Date.now().toString() }]);
      toast.success('Journey added');
    }
    setOpen(false);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" color="primary" sx={{ fontSize: '1.1rem', fontWeight: 'bold' }}>PLANNED JOURNEYS</Typography>
        <Button startIcon={<AddIcon />} variant="contained" color="secondary" size="small" onClick={() => handleOpen()}>
          Add Journey
        </Button>
      </Box>

      <Stack spacing={1.5}>
        {journeys.map((j) => (
          <Paper key={j.id} variant="outlined" sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                {j.trainNumber} &nbsp; {j.source} → {j.destination} &nbsp; {j.travelDate}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {j.coach} • {j.quota} • {j.passengers?.length || 0} Passenger(s)
              </Typography>
              {(j.boardingStation || j.upiId) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {j.boardingStation && `Boarding: ${j.boardingStation}`}
                  {j.boardingStation && j.upiId && ' • '}
                  {j.upiId && `UPI: ${j.upiId}`}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" onClick={() => handleOpen(j)} title="Edit"><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => handleDuplicate(j)} title="Duplicate"><ContentCopyIcon fontSize="small" /></IconButton>
              <IconButton size="small" color="error" onClick={() => handleDelete(j.id)} title="Delete"><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          </Paper>
        ))}

        {journeys.length === 0 && (
          <Paper variant="outlined" sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
            No journeys planned. Click "Add Journey" to create one.
          </Paper>
        )}
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 0 }}>
          <JourneyEditor 
            initialData={editingJourney} 
            onSave={handleSaveJourney} 
            onCancel={() => setOpen(false)} 
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
