import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#62d9ff',
      dark: '#1ca7d7',
      light: '#a4ecff',
      contrastText: '#051019',
    },
    secondary: {
      main: '#9f8cff',
      dark: '#7664df',
      light: '#c1b7ff',
      contrastText: '#0a0816',
    },
    background: {
      default: '#070c15',
      paper: '#0d1524',
    },
    success: {
      main: '#48e4a1',
      light: 'rgba(72,228,161,0.12)',
      dark: '#1cae73',
    },
    warning: {
      main: '#ffbf69',
      light: 'rgba(255,191,105,0.12)',
      dark: '#d89033',
    },
    error: {
      main: '#ff7185',
      light: 'rgba(255,113,133,0.12)',
      dark: '#d94861',
    },
    info: {
      main: '#75a9ff',
      light: 'rgba(117,169,255,0.12)',
      dark: '#4f80d9',
    },
    text: {
      primary: '#edf5ff',
      secondary: '#9aa9bf',
      disabled: '#637088',
    },
    divider: 'rgba(152,169,194,0.16)',
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    h1: { fontSize: '1.7rem', fontWeight: 850, letterSpacing: '-0.03em' },
    h2: { fontSize: '1.35rem', fontWeight: 850, letterSpacing: '-0.025em' },
    h3: { fontSize: '1.15rem', fontWeight: 850, letterSpacing: '-0.02em' },
    h4: { fontSize: '1rem', fontWeight: 850 },
    h5: { fontSize: '0.94rem', fontWeight: 800 },
    h6: { fontSize: '0.88rem', fontWeight: 850 },
    body1: { fontSize: '0.9rem' },
    body2: { fontSize: '0.81rem' },
    caption: { fontSize: '0.72rem' },
    button: {
      textTransform: 'none',
      fontWeight: 800,
      fontSize: '0.8rem',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#070c15',
          color: '#edf5ff',
        },
      },
    },
    MuiAppBar: {
      defaultProps: { color: 'transparent' },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          minHeight: 38,
          transition: 'transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease, border-color 120ms ease',
          '&:active': { transform: 'translateY(1px)' },
          '&:focus-visible': {
            outline: '2px solid #62d9ff',
            outlineOffset: 2,
          },
        },
        contained: {
          boxShadow: '0 8px 18px rgba(0,0,0,0.24)',
          '&:hover': { boxShadow: '0 10px 20px rgba(0,0,0,0.3)' },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          '&:focus-visible': {
            outline: '2px solid #62d9ff',
            outlineOffset: 2,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiSelect: {
      defaultProps: { size: 'small' },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 750 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(152,169,194,0.12)',
          color: '#edf5ff',
        },
        head: {
          color: '#9aa9bf',
          fontWeight: 800,
          background: '#0b1220',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: '#0b1321',
          border: '1px solid rgba(152,169,194,0.16)',
          borderRadius: 16,
          boxShadow: '0 24px 70px rgba(0,0,0,0.48)',
        },
      },
    },
  },
})
