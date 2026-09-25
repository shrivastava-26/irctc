import React, { useState } from 'react'
import {
  Alert, Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Chip, Stack
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AddIcon from '@mui/icons-material/Add'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { toast } from 'react-toastify'
import { exportBackup } from '../storage'

export default function AccountsTab({ accounts, selectedAccountId, onSave, onSelect }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showPasswords, setShowPasswords] = useState(false)
  const [form, setForm] = useState({ label: '', username: '', password: '' })

  const handleOpen = (account = null) => {
    if (account) {
      setEditing(account.id)
      setForm({
        label: account.label || '',
        username: account.username || '',
        password: account.password || '',
      })
    } else {
      setEditing(null)
      setForm({ label: '', username: '', password: '' })
    }
    setOpen(true)
  }

  const closeDialog = () => {
    setOpen(false)
    setEditing(null)
    setForm({ label: '', username: '', password: '' })
  }

  const handleSave = () => {
    if (!form.label.trim() || !form.username.trim() || !form.password) {
      toast.error('Account name, username and password are required')
      return
    }

    const safeAccount = {
      id: editing || Date.now().toString(),
      label: form.label.trim(),
      username: form.username.trim(),
      password: form.password,
    }

    const updated = editing
      ? accounts.map(account => account.id === editing ? safeAccount : account)
      : accounts.concat(safeAccount)

    onSave(updated)
    toast.success(editing ? 'Account updated' : 'Account saved locally')
    closeDialog()
  }

  const handleDelete = (id) => {
    onSave(accounts.filter(account => account.id !== id))
    toast.success('Account removed from this browser')
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
        This MVP stores usernames and passwords in browser local storage.
        Anyone or any script running on this origin can read them. Use it only on a device/browser you trust.
      </Alert>

      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 1,
        mb: 2,
        flexWrap: 'wrap',
      }}>
        <Typography variant="h6" color="primary" sx={{ fontSize: { xs: '1rem', sm: '1.1rem' }, fontWeight: 'bold' }}>
          IRCTC ACCOUNTS
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            startIcon={<FileDownloadIcon />}
            variant="outlined"
            size="small"
            onClick={exportBackup}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            Backup
          </Button>

          <Button
            startIcon={<AddIcon />}
            variant="contained"
            color="secondary"
            size="small"
            onClick={() => handleOpen()}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            Add Account
          </Button>
        </Box>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ width: '100%', overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 560 }}>
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Password</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {accounts.map(account => (
              <TableRow key={account.id} hover>
                <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {account.label}
                </TableCell>
                <TableCell sx={{ maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {account.username}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {showPasswords ? account.password : '••••••••'}
                </TableCell>
                <TableCell>
                  {account.id === selectedAccountId ? (
                    <Chip icon={<CheckCircleIcon />} label="SELECTED" color="success" size="small" sx={{ height: 20, fontSize: '0.68rem' }} />
                  ) : (
                    <Button size="small" onClick={() => onSelect(account.id)} sx={{ fontSize: '0.7rem', py: 0 }}>
                      SELECT
                    </Button>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" onClick={() => handleOpen(account)} aria-label="Edit account">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(account.id)} aria-label="Delete account">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}

            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No accounts saved.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Button size="small" sx={{ mt: 1 }} onClick={() => setShowPasswords(value => !value)}>
        {showPasswords ? 'Hide passwords' : 'Show passwords'}
      </Button>

      <Dialog
        open={open}
        onClose={closeDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { m: { xs: 1, sm: 2 }, width: 'calc(100% - 16px)', maxWidth: 420 } }}
      >
        <DialogTitle sx={{ py: 1.5, px: { xs: 2, sm: 3 }, fontSize: '1rem' }}>
          {editing ? 'Edit Account' : 'Add Account'}
        </DialogTitle>

        <DialogContent sx={{ mt: 2, px: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <TextField label="Account Name" fullWidth value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
            <TextField label="IRCTC Username" fullWidth value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="username" />
            <TextField label="Password" type="password" fullWidth value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2, gap: 1 }}>
          <Button onClick={closeDialog} variant="outlined" sx={{ flex: { xs: 1, sm: 'none' } }}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" color="primary" sx={{ flex: { xs: 1, sm: 'none' } }}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
