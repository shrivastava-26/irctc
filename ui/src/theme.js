import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: {
      main: '#213d77',
      dark: '#172b5d',
      light: '#4d68a0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#fb792b',
      dark: '#db5f16',
      light: '#ff9b61',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f6f8fc',
      paper: '#ffffff',
    },
    success: {
      main: '#2e7d32',
      light: '#e8f5e9',
      dark: '#1b5e20',
    },
    warning: {
      main: '#ed8b00',
      light: '#fff4df',
      dark: '#9a5b00',
    },
    error: {
      main: '#d32f2f',
    },
    info: {
      main: '#0288d1',
    },
    text: {
      primary: '#243047',
      secondary: '#68748b',
    },
    divider: 'rgba(35,48,71,0.10)',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    h1: { fontSize: '1.6rem', fontWeight: 800 },
    h2: { fontSize: '1.3rem', fontWeight: 800 },
    h3: { fontSize: '1.15rem', fontWeight: 800 },
    h4: { fontSize: '1rem', fontWeight: 800 },
    h5: { fontSize: '0.93rem', fontWeight: 800 },
    h6: { fontSize: '0.88rem', fontWeight: 800 },
    body1: { fontSize: '0.9rem' },
    body2: { fontSize: '0.81rem' },
    caption: { fontSize: '0.72rem' },
    button: {
      textTransform: 'none',
      fontWeight: 700,
      fontSize: '0.8rem',
    },
  },
  components: {
    MuiAppBar: {
      defaultProps: { color: 'primary' },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          minHeight: 38,
          transition: 'box-shadow 120ms ease, transform 120ms ease, background-color 120ms ease',
          '&:active': { transform: 'translateY(1px)' },
        },
        contained: {
          boxShadow: '0 4px 14px rgba(33,61,119,0.12)',
          '&:hover': { boxShadow: '0 7px 18px rgba(33,61,119,0.16)' },
        },
        containedSecondary: {
          color: '#ffffff',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 8px 26px rgba(31,48,79,0.08)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiSelect: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
  },
})
