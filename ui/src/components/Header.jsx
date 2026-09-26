import React from 'react'
import { Box, Typography } from '@mui/material'
import TrainIcon from '@mui/icons-material/Train'

export default function Header({ tab, setTab }) {
  const tabs = [
    { id: 'book', label: 'Book' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'journeys', label: 'Journeys' },
    { id: 'jobs', label: 'Jobs' },
  ]

  return (
    <header className="railx-header">
      <div className="railx-header-inner">
        <div className="railx-header-top">
          <Box
            component="button"
            type="button"
            onClick={() => setTab('book')}
            aria-label="RAILX home"
            className="railx-brand-mark"
            sx={{ color: 'primary.main', flexShrink: 0, cursor: 'pointer' }}
          >
            <TrainIcon fontSize="small" />
          </Box>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              component="div"
              sx={{ fontWeight: 850, letterSpacing: '0.10em', lineHeight: 1, fontSize: { xs: '0.96rem', sm: '1.02rem' } }}
            >
              RAILX
            </Typography>
            <Typography
              component="div"
              className="railx-brand-subtitle"
              sx={{ display: 'none', color: 'text.secondary', fontSize: '0.63rem', fontWeight: 650, letterSpacing: '0.08em', mt: 0.35 }}
            >
              Railway Automation
            </Typography>
          </Box>

          <div className="railx-header-status" aria-label="System status operational">
            <span className="railx-dot" aria-hidden="true" />
            OPERATIONAL
          </div>
        </div>

        <nav className="railx-nav" aria-label="Primary navigation">
          {tabs.map(item => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'railx-nav-button is-active' : 'railx-nav-button'}
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
