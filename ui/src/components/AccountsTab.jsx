import React, { useState } from 'react'
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Chip, Stack, Tooltip
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AddIcon from '@mui/icons-material/Add'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined'
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
    const label = form.label.trim()
    const username = form.username.trim()

    if (!label || !username || !form.password) {
      toast.error('Account name, username and password are required')
      return
    }

    const duplicate = accounts.some(account =>
      account.username.trim().toLowerCase() === username.toLowerCase() &&
      account.id !== editing
    )
    if (duplicate) {
      toast.error('An account with this username already exists.')
      return
    }

    const safeAccount = {
      id: editing || Date.now().toString(),
      label,
      username,
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
    if (id === selectedAccountId) {
      toast.info('The selected account will switch to another saved account.')
    }
    onSave(accounts.filter(account => account.id !== id))
    toast.success('Account removed from this browser')
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
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
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          gap={1.5}
        >
          <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                bgcolor: 'primary.main',
                color: 'common.white',
              }}
            >
              <AccountCircleOutlinedIcon />
            </Box>
            <Box minWidth={0}>
              <Typography className="railx-kicker" sx={{ fontWeight: 800 }}>
                IRCTC Accounts
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {accounts.length === 0 ? 'No accounts saved yet' : accounts.length + ' saved account' + (accounts.length === 1 ? '' : 's')}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
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
              sx={{
                flex: { xs: 1, sm: 'none' },
                boxShadow: 'none',
                '&:hover': { boxShadow: 'none' },
              }}
            >
              Add account
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3 }}>
        <TableContainer className="railx-table-wrap" sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 620 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 800 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>Username</TableCell>
                <TableCell sx={{ fontWeight: 800, display: { xs: 'none', sm: 'table-cell' } }}>Password</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {accounts.map(account => {
                const selected = String(account.id) === String(selectedAccountId)
                return (
                  <TableRow key={account.id} hover>
                    <TableCell sx={{ maxWidth: 160 }}>
                      <Typography noWrap variant="body2" sx={{ fontWeight: 700 }}>
                        {account.label}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>
                      <Typography noWrap variant="body2">
                        {account.username}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', display: { xs: 'none', sm: 'table-cell' } }}>
                      {showPasswords ? account.password : '••••••••'}
                    </TableCell>
                    <TableCell>
                      {selected ? (
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Selected"
                          color="success"
                          size="small"
                          sx={{ height: 24, fontSize: '0.7rem' }}
                        />
                      ) : (
                        <Button size="small" onClick={() => onSelect(account.id)} sx={{ fontWeight: 700 }}>
                          Select
                        </Button>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleOpen(account)} aria-label="Edit account">
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(account.id)} aria-label="Delete account">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )
              })}

              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 7 }}>
                    <Stack alignItems="center" spacing={0.75}>
                      <AccountCircleOutlinedIcon sx={{ fontSize: 42, color: 'text.disabled' }} />
                      <Typography variant="body2" fontWeight={700}>No accounts saved</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Add an IRCTC account to enable automation.
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            px: { xs: 1.5, sm: 2 },
            py: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: { xs: 'space-between', sm: 'flex-end' },
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
            Password hidden
          </Typography>
          <Button
            size="small"
            startIcon={showPasswords ? <VisibilityOffIcon /> : <VisibilityIcon />}
            onClick={() => setShowPasswords(value => !value)}
          >
            {showPasswords ? 'Hide passwords' : 'Show passwords'}
          </Button>
        </Box>
      </Paper>

      <Dialog
        open={open}
        onClose={closeDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { m: { xs: 1, sm: 2 }, width: 'calc(100% - 16px)', maxWidth: 420, borderRadius: 3 } }}
      >
        <DialogTitle sx={{ py: 1.75, px: { xs: 2, sm: 3 }, fontWeight: 800 }}>
          {editing ? 'Edit account' : 'Add account'}
        </DialogTitle>

        <DialogContent sx={{ mt: 0.5, px: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <TextField
              label="Account name"
              fullWidth
              value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })}
              autoComplete="off"
            />
            <TextField
              label="IRCTC username"
              fullWidth
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              autoComplete="username"
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              autoComplete={editing ? 'current-password' : 'new-password'}
            />
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
