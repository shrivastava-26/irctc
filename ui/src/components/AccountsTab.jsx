import React, { useState } from 'react';
import { 
  Box, Typography, Button, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Chip, Stack
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import { toast } from 'react-toastify';

export default function AccountsTab({ accounts, selectedAccountId, onSave, onSelect }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({ label: '', username: '', password: '' });

  const handleOpen = (acc = null) => {
    if (acc) {
      setEditing(acc.id);
      setForm({ label: acc.label, username: acc.username, password: acc.password });
    } else {
      setEditing(null);
      setForm({ label: '', username: '', password: '' });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.label || !form.username || !form.password) {
      toast.error('All fields are required');
      return;
    }
    
    // Save to Job Manager Keytar store
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName: form.username, password: form.password })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save credentials in backend');
      }
    } catch (err) {
      toast.error(`Backend Error: ${err.message}`);
      return;
    }

    let updated;
    if (editing) {
      updated = accounts.map(a => a.id === editing ? { ...a, ...form } : a);
      toast.success('Account updated');
    } else {
      updated = [...accounts, { ...form, id: Date.now().toString() }];
      toast.success('Account added');
    }
    
    onSave(updated);
    setOpen(false);
  };

  const handleDelete = (id) => {
    onSave(accounts.filter(a => a.id !== id));
    toast.success('Account deleted');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" color="primary" sx={{ fontSize: '1.1rem', fontWeight: 'bold' }}>IRCTC ACCOUNTS</Typography>
        <Button startIcon={<AddIcon />} variant="contained" color="secondary" size="small" onClick={() => handleOpen()}>
          Add Account
        </Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map(a => {
              const isSelected = a.id === selectedAccountId;
              return (
                <TableRow key={a.id} hover sx={{ '& td': { py: 1 } }}>
                  <TableCell>{a.label}</TableCell>
                  <TableCell>{a.username}</TableCell>
                  <TableCell>
                    {isSelected ? (
                      <Chip icon={<CheckCircleIcon />} label="SELECTED" color="success" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                    ) : (
                      <Button size="small" sx={{ fontSize: '0.7rem', py: 0 }} onClick={() => onSelect(a.id)}>SELECT</Button>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpen(a)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(a.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No accounts saved. Click "Add Account" to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ py: 1.5, fontSize: '1rem', bgcolor: '#f5f5f5' }}>
          {editing ? 'Edit Account' : 'Add Account'}
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Stack spacing={2}>
            <TextField 
              label="Account Name" 
              size="small" 
              fullWidth 
              value={form.label} 
              onChange={e => setForm({...form, label: e.target.value})} 
              placeholder="e.g. My Primary Account"
            />
            <TextField 
              label="IRCTC Username" 
              size="small" 
              fullWidth 
              value={form.username} 
              onChange={e => setForm({...form, username: e.target.value})} 
            />
            <TextField 
              label="Password" 
              type="password"
              size="small" 
              fullWidth 
              value={form.password} 
              onChange={e => setForm({...form, password: e.target.value})} 
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} size="small" variant="outlined">Cancel</Button>
          <Button onClick={handleSave} size="small" variant="contained" color="primary">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
