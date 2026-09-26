import React, { useState } from 'react'
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Stack, Tooltip
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined'
import { toast } from 'react-toastify'
import { exportBackup } from '../storage'
import { GlassPanel, StatusBadge } from './RailxPrimitives'

export default function AccountsTab({ accounts, selectedAccountId, onSave, onSelect }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showPasswords, setShowPasswords] = useState(false)
  const [form, setForm] = useState({ label: '', username: '', password: '' })

  const handleOpen = account => {
    if (account) {
      setEditing(account.id)
      setForm({ label: account.label || '', username: account.username || '', password: account.password || '' })
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
      account.username.trim().toLowerCase() === username.toLowerCase() && account.id !== editing
    )
    if (duplicate) {
      toast.error('An account with this username already exists.')
      return
    }

    const safeAccount = { id: editing || Date.now().toString(), label, username, password: form.password }
    const updated = editing
      ? accounts.map(account => account.id === editing ? safeAccount : account)
      : accounts.concat(safeAccount)

    onSave(updated)
    toast.success(editing ? 'Account updated' : 'Account saved locally')
    closeDialog()
  }

  const handleDelete = id => {
    if (id === selectedAccountId) toast.info('The selected account will switch to another saved account.')
    onSave(accounts.filter(account => account.id !== id))
    toast.success('Account removed from this browser')
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <GlassPanel className="railx-page-intro">
        <div className="railx-section-header" style={{ marginBottom: 0 }}>
          <Stack direction="row" spacing={1.1} alignItems="center" minWidth={0}>
            <Box className="railx-brand-mark" sx={{ color: 'primary.main', flexShrink: 0 }}>
              <AccountCircleOutlinedIcon />
            </Box>
            <Box minWidth={0}>
              <Typography className="railx-kicker">Accounts</Typography>
              <Typography component="h1" className="railx-section-title">IRCTC accounts</Typography>
              <Typography className="railx-section-copy">{accounts.length} saved account{accounts.length === 1 ? '' : 's'}.</Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={0.8} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button startIcon={<FileDownloadIcon />} variant="outlined" size="small" onClick={exportBackup} sx={{ flex: { xs: 1, sm: 'none' } }}>Backup</Button>
            <Button startIcon={<AddIcon />} variant="contained" color="primary" size="small" onClick={() => handleOpen()} sx={{ flex: { xs: 1, sm: 'none' } }}>Add account</Button>
          </Stack>
        </div>
      </GlassPanel>

      <section className="railx-section" aria-label="Saved accounts">
        {accounts.length > 0 ? (
          <div>
            {accounts.map(account => {
              const selected = String(account.id) === String(selectedAccountId)
              return (
                <div key={account.id} className="railx-account-row">
                  <div className="railx-account-grid">
                    <div>
                      <div className="railx-field-label">Name</div>
                      <div className="railx-field-value">{account.label}</div>
                    </div>
                    <div>
                      <div className="railx-field-label">Username</div>
                      <div className="railx-field-value">{account.username}</div>
                    </div>
                    <div>
                      <div className="railx-field-label">Status</div>
                      {selected ? <StatusBadge status="READY" compact /> : <Button size="small" onClick={() => onSelect(account.id)}>Select</Button>}
                    </div>
                    <div className="railx-row-actions">
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => handleOpen(account)} aria-label="Edit account"><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(account.id)} aria-label="Delete account"><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="railx-empty-state">
            <AccountCircleOutlinedIcon sx={{ fontSize: 42, opacity: 0.55 }} />
            <Typography variant="body2" fontWeight={750}>No accounts saved</Typography>
            <Typography variant="caption">Add an IRCTC account to enable automation.</Typography>
          </div>
        )}

        <Box sx={{ mt: 1.25, pt: 1.1, borderTop: accounts.length ? '1px solid' : 0, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">Password visibility</Typography>
          <Button size="small" startIcon={showPasswords ? <VisibilityOffIcon /> : <VisibilityIcon />} onClick={() => setShowPasswords(value => !value)}>
            {showPasswords ? 'Hide passwords' : 'Show passwords'}
          </Button>
        </Box>

        {showPasswords && accounts.length > 0 && (
          <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            {accounts.map(account => (
              <Box key={account.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.45, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">{account.label}</Typography>
                <Typography variant="caption" className="railx-mono" sx={{ overflowWrap: 'anywhere', textAlign: 'right' }}>{account.password}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </section>

      <Dialog open={open} onClose={closeDialog} maxWidth="xs" fullWidth
        PaperProps={{ sx: { m: { xs: 1, sm: 2 }, width: 'calc(100% - 16px)', maxWidth: 420 } }}>
        <DialogTitle sx={{ py: 1.7, px: { xs: 2, sm: 3 }, fontWeight: 800 }}>
          {editing ? 'Edit account' : 'Add account'}
        </DialogTitle>
        <DialogContent sx={{ mt: 0.3, px: { xs: 2, sm: 3 } }}>
          <Stack spacing={1.6}>
            <TextField label="Account name" fullWidth value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} autoComplete="off" />
            <TextField label="IRCTC username" fullWidth value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="username" />
            <TextField label="Password" type="password" fullWidth value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete={editing ? 'current-password' : 'new-password'} />
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
