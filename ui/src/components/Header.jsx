import React from 'react'
import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'
import TrainIcon from '@mui/icons-material/Train'

export default function Header({ tab, setTab }) {
  const tabs = [
    { id: 'book', label: 'BOOK / AUTOMATION' },
    { id: 'accounts', label: 'ACCOUNTS' },
    { id: 'journeys', label: 'JOURNEYS' },
    { id: 'jobs', label: 'JOBS' },
  ]

  return (
    <AppBar
      position="sticky"
      color="primary"
      elevation={2}
      sx={{ top: 0, borderBottom: '1px solid #152b57', zIndex: 1200 }}
    >
      <Container maxWidth="lg" sx={{ px: { xs: 0.75, sm: 2 } }}>
        <Toolbar
          disableGutters
          sx={{
            minHeight: { xs: 54, sm: 50 },
            width: '100%',
            gap: { xs: 0.5, sm: 1 },
            overflow: 'hidden',
          }}
        >
          <TrainIcon sx={{ flexShrink: 0, fontSize: { xs: '1.35rem', sm: '1.5rem' } }} />

          <Typography
            component="div"
            sx={{
              display: { xs: 'none', sm: 'flex' },
              fontWeight: 700,
              letterSpacing: '.04rem',
              whiteSpace: 'nowrap',
              mr: 0.5,
            }}
          >
            IRCTC AUTOMATION
          </Typography>

          <Typography
            component="div"
            sx={{
              display: { xs: 'flex', sm: 'none' },
              fontWeight: 700,
              fontSize: '0.84rem',
              whiteSpace: 'nowrap',
              mr: 0.25,
            }}
          >
            IRCTC
          </Typography>

          <Box
            component="nav"
            aria-label="Primary navigation"
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              gap: { xs: 0.05, sm: 0.75 },
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {tabs.map(item => (
              <Button
                key={item.id}
                size="small"
                onClick={() => setTab(item.id)}
                sx={{
                  flexShrink: 0,
                  color: tab === item.id ? '#fb792b' : 'white',
                  borderBottom: tab === item.id ? '2px solid #fb792b' : '2px solid transparent',
                  borderRadius: 0,
                  px: { xs: 0.75, sm: 1.25 },
                  minWidth: 'auto',
                  minHeight: { xs: 48, sm: 42 },
                  whiteSpace: 'nowrap',
                  fontWeight: tab === item.id ? 'bold' : 'normal',
                  fontSize: { xs: '0.69rem', sm: '0.78rem' },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  )
}
