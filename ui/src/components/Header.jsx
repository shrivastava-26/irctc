import React from 'react'
import { AppBar, Box, Container, IconButton, Toolbar, Typography } from '@mui/material'
import TrainIcon from '@mui/icons-material/Train'

export default function Header({ tab, setTab }) {
  const tabs = [
    { id: 'book', label: 'Book / Automation' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'journeys', label: 'Journeys' },
    { id: 'jobs', label: 'Jobs' },
  ]

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        zIndex: 1200,
        background: 'linear-gradient(135deg, #172b5d 0%, #213d77 60%, #284a8a 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <Container maxWidth="lg" sx={{ px: { xs: 1, sm: 2 } }}>
        <Toolbar
          disableGutters
          sx={{
            minHeight: { xs: 58, sm: 62 },
            gap: 1,
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <IconButton
            aria-label="SIVA home"
            onClick={() => setTab('book')}
            sx={{
              color: 'white',
              mr: { xs: 0, sm: 0.5 },
              p: 0.75,
              borderRadius: 2,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}
          >
            <TrainIcon />
          </IconButton>

          <Typography
            component="div"
            sx={{
              display: { xs: 'none', sm: 'flex' },
              fontWeight: 900,
              letterSpacing: '.05rem',
              whiteSpace: 'nowrap',
              mr: 0.5,
            }}
          >
            SIVA
          </Typography>

          <Box
            component="nav"
            aria-label="Primary navigation"
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              gap: { xs: 0.15, sm: 0.45 },
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {tabs.map(item => {
              const active = tab === item.id
              return (
                <Box
                  component="button"
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    flexShrink: 0,
                    appearance: 'none',
                    border: 0,
                    borderBottom: '2px solid',
                    borderColor: active ? 'secondary.main' : 'transparent',
                    background: 'transparent',
                    color: active ? 'secondary.main' : 'rgba(255,255,255,0.82)',
                    minHeight: { xs: 54, sm: 58 },
                    px: { xs: 0.85, sm: 1.25 },
                    fontSize: { xs: '0.72rem', sm: '0.8rem' },
                    fontWeight: active ? 800 : 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'color 120ms ease, border-color 120ms ease',
                    '&:hover': { color: 'white' },
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'secondary.main',
                      outlineOffset: -2,
                    },
                  }}
                >
                  {item.label}
                </Box>
              )
            })}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  )
}
