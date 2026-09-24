import React, { useState } from 'react'
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Chip, Stack
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AddIcon from '@mui/icons-material/Add'
import { toast } from 'react-toastify'

export default function AccountsTab({ accounts, selectedAccountId, onSave, onSelect }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ label: '', username: '', password: '' })

  const handleOpen = (account) => {
    if (account) {
      setEditing(account.id)
      setForm({
        label: account.label || '',
        username: account.username || '',
        password: '',
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

  const handleSave = async () => {
    if (!form.label || !form.username || !form.password) {
      toast.error(editing
        ? 'Enter the password again to update this account'
        : 'All fields are required')
      return
    }

    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: form.username.trim(),
          password: form.password,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save credentials')

      const safeAccount = {
        id: editing || Date.now().toString(),
        label: form.label.trim(),
        username: form.username.trim(),
      }

      const updated = editing
        ? accounts.map(account => account.id === editing ? safeAccount : account)
        : accounts.concat(safeAccount)

      onSave(updated)
      toast.success(editing ? 'Account updated' : 'Account added')
      closeDialog()
    } catch (err) {
      toast.error('Backend Error: ' + err.message)
    }
  }

  const handleDelete = (id) => {
    onSave(accounts.filter(account => account.id !== id))
    toast.success('Account removed from this browser')
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 1,
        mb: 2,
        flexWrap: 'wrap',
      }}>
        <Typography
          variant="h6"
          color="primary"
          sx={{ fontSize: { xs: '1rem', sm: '1.1rem' }, fontWeight: 'bold' }}
        >
          IRCTC ACCOUNTS
        </Typography>

        <Button
          startIcon={<AddIcon />}
          variant="contained"
          color="secondary"
          size="small"
          onClick={() => handleOpen()}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Add Account
        </Button>
      </Box>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}
      >
        <Table size="small" sx={{ minWidth: 520 }}>
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {accounts.map(account => {
              const isSelected = account.id === selectedAccountId

              return (
                <TableRow key={account.id} hover>
                  <TableCell sx={{
                    maxWidth: 170,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {account.label}
                  </TableCell>

                  <TableCell sx={{
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {account.username}
                  </TableCell>

                  <TableCell>
                    {isSelected ? (
                      <Chip
                        icon={<CheckCircleIcon />}
                        label="SELECTED"
                        color="success"
                        size="small"
                        sx={{ height: 20, fontSize: '0.68rem' }}
                      />
                    ) : (
                      <Button
                        size="small"
                        onClick={() => onSelect(account.id)}
                        sx={{ fontSize: '0.7rem', py: 0 }}
                      >
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
              )
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

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1, lineHeight: 1.4 }}
      >
        Passwords are not stored in browser local storage. Hosted credentials remain only in the active server session.
      </Typography>

      <Dialog
        open={open}
        onClose={closeDialog}
        maxWidth="xs"
        fullWidth
        scroll="paper"
        PaperProps={{
          sx: {
            m: { xs: 1, sm: 2 },
            width: 'calc(100% - 16px)',
            maxWidth: 420,
            borderRadius: { xs: 1, sm: 2 },
          },
        }}
      >
        <DialogTitle sx={{
          py: 1.5,
          px: { xs: 2, sm: 3 },
          fontSize: '1rem',
          bgcolor: '#f5f5f5',
        }}>
          {editing ? 'Edit Account' : 'Add Account'}
        </DialogTitle>

        <DialogContent sx={{ mt: 2, px: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <TextField
              label="Account Name"
              size="small"
              fullWidth
              value={form.label}
              onChange={event => setForm({ ...form, label: event.target.value })}
              placeholder="e.g. Primary"
              autoComplete="off"
            />
            <TextField
              label="IRCTC Username"
              size="small"
              fullWidth
              value={form.username}
              onChange={event => setForm({ ...form, username: event.target.value })}
              autoComplete="username"
            />
            <TextField
              label="Password"
              type="password"
              size="small"
              fullWidth
              value={form.password}
              onChange={event => setForm({ ...form, password: event.target.value })}
              autoComplete="current-password"
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{
          px: { xs: 2, sm: 3 },
          pb: 2,
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: { xs: 'stretch', sm: 'flex-end' },
        }}>
          <Button onClick={closeDialog} size="small" variant="outlined" sx={{ flex: { xs: 1, sm: 'none' } }}>
            Cancel
          </Button>
          <Button onClick={handleSave} size="small" variant="contained" color="primary" sx={{ flex: { xs: 1, sm: 'none' } }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
