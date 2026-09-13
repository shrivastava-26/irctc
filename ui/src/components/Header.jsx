import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Container } from '@mui/material';
import TrainIcon from '@mui/icons-material/Train';

export default function Header({ tab, setTab }) {
  const tabs = [
    { id: 'book', label: 'BOOK / AUTOMATION' },
    { id: 'accounts', label: 'ACCOUNTS' },
    { id: 'journeys', label: 'JOURNEYS' },
    { id: 'jobs', label: 'JOBS' }
  ];

  return (
    <AppBar position="static" color="primary" elevation={0} sx={{ borderBottom: '1px solid #152b57' }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters variant="dense" sx={{ minHeight: 48 }}>
          <TrainIcon sx={{ display: 'flex', mr: 1, fontSize: '1.5rem' }} />
          <Typography
            variant="subtitle1"
            noWrap
            component="div"
            sx={{ flexGrow: 1, display: 'flex', fontWeight: 700, letterSpacing: '.05rem' }}
          >
            IRCTC AUTOMATION
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {tabs.map(t => (
              <Button
                key={t.id}
                size="small"
                sx={{ 
                  color: tab === t.id ? '#fb792b' : 'white', 
                  borderBottom: tab === t.id ? '2px solid #fb792b' : '2px solid transparent', 
                  borderRadius: 0, 
                  px: 1.5,
                  minWidth: 'auto',
                  fontWeight: tab === t.id ? 'bold' : 'normal',
                  fontSize: '0.8rem'
                }}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
