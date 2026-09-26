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
        borderBottom: '1px solid rgba(152,169,194,0.14)',
        background: 'rgba(7,12,21,0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <Container maxWidth="xl" sx={{ px: { xs: 1.25, sm: 2.5 } }}>
        <Toolbar
          disableGutters
          sx={{
            minHeight: { xs: 60, sm: 66 },
            gap: 1,
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <IconButton
            aria-label="RAILX home"
            onClick={() => setTab('book')}
            sx={{
              color: 'primary.main',
              mr: 0.4,
              p: 0.75,
              bgcolor: 'rgba(98,217,255,0.07)',
              border: '1px solid rgba(98,217,255,0.16)',
            }}
          >
            <TrainIcon />
          </IconButton>

          <Box sx={{ minWidth: 0, mr: { xs: 0.5, sm: 2 } }}>
            <Typography
              component="div"
              sx={{
                fontWeight: 950,
                letterSpacing: '0.11em',
                lineHeight: 1,
                fontSize: { xs: '0.92rem', sm: '1rem' },
              }}
            >
              RAILX
            </Typography>
            <Typography
              component="div"
              sx={{
                display: { xs: 'none', md: 'block' },
                color: 'text.secondary',
                fontSize: '0.58rem',
                fontWeight: 700,
                letterSpacing: '0.11em',
                mt: 0.45,
                textTransform: 'uppercase',
              }}
            >
              Railway Automation Control Center
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              py: 0.55,
              border: '1px solid rgba(72,228,161,0.20)',
              borderRadius: 99,
              mr: { xs: 0.4, sm: 1.5 },
              flexShrink: 0,
            }}
          >
            <span className="railx-dot" aria-hidden="true" />
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 850, color: 'success.main', letterSpacing: '0.05em' }}>
              OPERATIONAL
            </Typography>
          </Box>

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
                    border: '0',
                    borderBottom: '2px solid',
                    borderColor: active ? 'primary.main' : 'transparent',
                    background: 'transparent',
                    color: active ? 'primary.main' : 'rgba(237,245,255,0.68)',
                    minHeight: { xs: 56, sm: 62 },
                    px: { xs: 0.85, sm: 1.25 },
                    fontSize: { xs: '0.68rem', sm: '0.77rem' },
                    fontWeight: active ? 900 : 700,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'color 120ms ease, border-color 120ms ease',
                    '&:hover': { color: 'text.primary' },
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
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
